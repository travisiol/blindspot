/**
 * Deposits. The wallet signs a plain transfer to the vault (built here, sent by the wallet), then
 * the server reads that transaction back and credits what the vault actually received.
 * Idempotent: the transaction signature is the primary key and the journal ref.
 */
import { randomUUID } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM } from "../config/solana.ts";
import { DEPOSIT_ASSETS, SOL_MINT, capsFor, vaultAddress } from "./config.ts";
import { ataAddress, connection, mintInfo } from "./chain.ts";
import type { Db, Queryable } from "./db.ts";
import { HttpError } from "./errors.ts";
import { acct, balance, lockWallet, post } from "./ledger.ts";
import { createAtaIdempotentIx, transferCheckedIx } from "./spl.ts";
import { screen } from "./sanctions.ts";
import { fetchTx, solTransferIx, vaultDelta, type TxLike } from "./vaulttx.ts";

export const DEPOSITS_CLOSED = "Deposits open soon.";

export function depositAsset(mint: string) {
  return DEPOSIT_ASSETS.find((a) => a.mint === mint) ?? null;
}

/** Everything the wallet owns of `mint` inside the vault (spendable + reserved + queued out). */
export async function heldInVault(q: Queryable, wallet: string, mint: string): Promise<bigint> {
  const [a, b, c] = await Promise.all([balance(q, acct.user(wallet), mint), balance(q, acct.hold(wallet), mint), balance(q, acct.out(wallet), mint)]);
  return a + b + c;
}

/** How much more of `mint` this wallet may deposit right now. */
export async function depositRoom(q: Queryable, wallet: string, mint: string): Promise<{ perDeposit: bigint; room: bigint }> {
  const caps = capsFor(mint);
  if (!caps) throw new HttpError(400, "Deposit SOL or USDC.");
  const held = await heldInVault(q, wallet, mint);
  const accountRoom = caps.perAccount > held ? caps.perAccount - held : BigInt(0);
  return { perDeposit: caps.perDeposit, room: accountRoom < caps.perDeposit ? accountRoom : caps.perDeposit };
}

/** Screens the wallet and the caps, then builds the unsigned transfer the wallet will sign and send. */
export async function prepareDeposit(q: Queryable, wallet: string, mint: string, amount: bigint): Promise<{ transaction: string; vault: string }> {
  const vault = vaultAddress();
  if (!vault) throw new HttpError(503, DEPOSITS_CLOSED);
  const asset = depositAsset(mint);
  if (!asset) throw new HttpError(400, "Deposit SOL or USDC.");
  if (amount <= BigInt(0)) throw new HttpError(400, "Enter an amount above zero.");
  const verdict = await screen(wallet);
  if (verdict === null) throw new HttpError(503, "Deposits are paused for a moment. Try again shortly.");
  if (verdict) throw new HttpError(403, "This wallet can't use BLINDSPOT.");
  const { room } = await depositRoom(q, wallet, mint);
  if (amount > room) throw new HttpError(400, room > BigInt(0) ? "That is above your deposit limit. Lower the amount." : "Your account is at its deposit limit.");

  const from = new PublicKey(wallet);
  const to = new PublicKey(vault);
  const instructions =
    mint === SOL_MINT
      ? [solTransferIx(from, to, amount)]
      : await (async () => {
          const { program, decimals } = await mintInfo(mint);
          const tokenProgram = new PublicKey(program || TOKEN_PROGRAM);
          const m = new PublicKey(mint);
          const source = ataAddress(from, m, tokenProgram);
          const dest = ataAddress(to, m, tokenProgram);
          return [createAtaIdempotentIx(from, dest, to, m, tokenProgram), transferCheckedIx(source, m, dest, from, amount, decimals, tokenProgram)];
        })();
  const { Transaction } = await import("@solana/web3.js");
  const { blockhash, lastValidBlockHeight } = await connection().getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: from, blockhash, lastValidBlockHeight }).add(...instructions);
  return { transaction: Buffer.from(tx.serialize({ requireAllSignatures: false, verifySignatures: false })).toString("base64"), vault };
}

export interface DepositCredit {
  mint: string;
  amount: bigint;
  credited: bigint;
  refunded: bigint;
  status: "credited" | "frozen";
}

/** What a transaction deposited for `wallet`: positive vault deltas of deposit assets, sent and paid by `wallet`. */
export function depositsInTx(tx: TxLike, wallet: string, vault: string): { mint: string; amount: bigint }[] {
  const delta = vaultDelta(tx, vault);
  if (!delta || !delta.ok) return [];
  if (delta.feePayer !== wallet || wallet === vault) return [];
  const found: { mint: string; amount: bigint }[] = [];
  if (delta.sol > BigInt(0)) found.push({ mint: SOL_MINT, amount: delta.sol });
  for (const [mint, amount] of delta.tokens) if (amount > BigInt(0) && depositAsset(mint)) found.push({ mint, amount });
  return found;
}

/**
 * Credits the deposits found in `sig` once. Over-cap excess is credited then queued straight back
 * to the sender as a refund; a sanctioned sender's deposit is frozen, not credited.
 */
export async function creditDeposit(
  database: Db,
  input: { wallet: string; sig: string; tx: TxLike; vault: string; blocked: boolean | null },
): Promise<DepositCredit[]> {
  const found = depositsInTx(input.tx, input.wallet, input.vault);
  if (found.length === 0) throw new HttpError(400, "No deposit to the vault from your wallet in that transaction.");
  return database.tx(async (q) => {
    await lockWallet(q, input.wallet);
    const existing = await q.query<{ mint: string; amount: string; credited: string; refunded: string; status: string }>(
      "SELECT mint, amount::text, credited::text, refunded::text, status FROM deposits WHERE sig = $1",
      [input.sig],
    );
    if (existing.length > 0) {
      return existing.map((r) => ({ mint: r.mint, amount: BigInt(r.amount), credited: BigInt(r.credited), refunded: BigInt(r.refunded), status: r.status as DepositCredit["status"] }));
    }
    const credits: DepositCredit[] = [];
    for (const { mint, amount } of found) {
      const ref = `deposit:${input.sig}:${mint}`;
      if (input.blocked) {
        await post(q, { ref, kind: "deposit_frozen", wallet: input.wallet, postings: [
          { account: acct.frozen(input.wallet), mint, amount },
          { account: acct.world, mint, amount: -amount },
        ] });
        credits.push({ mint, amount, credited: BigInt(0), refunded: BigInt(0), status: "frozen" });
        continue;
      }
      const { room } = await depositRoom(q, input.wallet, mint);
      const credited = amount < room ? amount : room;
      const refunded = amount - credited;
      await post(q, { ref, kind: "deposit", wallet: input.wallet, memo: { sig: input.sig }, postings: [
        { account: acct.user(input.wallet), mint, amount },
        { account: acct.world, mint, amount: -amount },
      ] });
      if (refunded > BigInt(0)) {
        const id = randomUUID();
        await post(q, { ref: `withdraw:${id}:queue`, kind: "refund_queue", wallet: input.wallet, postings: [
          { account: acct.user(input.wallet), mint, amount: -refunded },
          { account: acct.out(input.wallet), mint, amount: refunded },
        ] });
        await q.query("INSERT INTO withdrawals (id, wallet, mint, amount, dest, kind, status) VALUES ($1, $2, $3, $4::numeric, $2, 'refund', 'queued')", [id, input.wallet, mint, refunded.toString()]);
      }
      credits.push({ mint, amount, credited, refunded, status: "credited" });
    }
    for (const c of credits) {
      await q.query(
        "INSERT INTO deposits (sig, wallet, mint, amount, credited, refunded, status) VALUES ($1, $2, $3, $4::numeric, $5::numeric, $6::numeric, $7) ON CONFLICT DO NOTHING",
        [input.sig, input.wallet, c.mint, c.amount.toString(), c.credited.toString(), c.refunded.toString(), c.status],
      );
    }
    return credits;
  });
}

/** Reads `sig` from chain and credits it. 202-style error while the transaction is not visible yet. */
export async function claimDeposit(database: Db, wallet: string, sig: string): Promise<DepositCredit[]> {
  const vault = vaultAddress();
  if (!vault) throw new HttpError(503, DEPOSITS_CLOSED);
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(sig)) throw new HttpError(400, "That is not a transaction signature.");
  const tx = await fetchTx(sig);
  if (!tx) throw new HttpError(409, "Not confirmed yet. It usually takes a few seconds.");
  if (tx.meta?.err) throw new HttpError(400, "That transaction failed on chain. Nothing was deposited.");
  const blocked = await screen(wallet);
  return creditDeposit(database, { wallet, sig, tx, vault, blocked });
}

/** Looks through the vault's recent transactions for transfers this wallet sent but never claimed. */
export async function scanDeposits(database: Db, wallet: string, limit = 40): Promise<number> {
  const vault = vaultAddress();
  if (!vault) return 0;
  const sigs = await connection().getSignaturesForAddress(new PublicKey(vault), { limit }, "confirmed");
  const candidates = sigs.filter((s) => !s.err).map((s) => s.signature);
  if (candidates.length === 0) return 0;
  const known = new Set(
    (await database.query<{ sig: string }>("SELECT sig FROM deposits WHERE sig = ANY($1::text[])", [candidates])).map((r) => r.sig),
  );
  let credited = 0;
  for (const sig of candidates) {
    if (known.has(sig)) continue;
    const tx = await fetchTx(sig).catch(() => null);
    if (!tx || depositsInTx(tx, wallet, vault).length === 0) continue;
    await creditDeposit(database, { wallet, sig, tx, vault, blocked: await screen(wallet) });
    credited += 1;
  }
  return credited;
}
