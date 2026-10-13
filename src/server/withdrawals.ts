/**
 * Withdrawals go to the wallet that owns the account — never to another address. BLINDSPOT hides
 * which wallet made which trade; it does not break the link between the money that came in and
 * the money that goes out (that would make it a mixer).
 *
 * Queue: the amount moves from `user:` to `out:` at request time, then a worker claims the row
 * (queued → sending), stores the signature before sending, and settles on the chain's answer.
 */
import { randomUUID } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM } from "../config/solana.ts";
import { ATA_RENT_LAMPORTS, MIN_WITHDRAW_LAMPORTS, SOL_MINT, vaultKeypair } from "./config.ts";
import { ataAddress, connection, mintInfo } from "./chain.ts";
import type { Db, Queryable } from "./db.ts";
import { HttpError } from "./errors.ts";
import { acct, balance, lockWallet, post, requireFunds } from "./ledger.ts";
import { screen } from "./sanctions.ts";
import { createAtaIdempotentIx, transferCheckedIx } from "./spl.ts";
import { fetchTx, settleStatus, signAndSend, solTransferIx, vaultDelta, vaultTransaction, type SendOutcome } from "./vaulttx.ts";

export interface WithdrawalRow {
  id: string;
  wallet: string;
  mint: string;
  amount: string;
  dest: string;
  kind: "withdraw" | "refund";
  status: "queued" | "sending" | "sent" | "failed" | "held";
  sig: string | null;
  last_valid_height: string | null;
  error: string | null;
  created_at: string;
}

const COLUMNS = "id, wallet, mint, amount::text, dest, kind, status, sig, last_valid_height::text, error, created_at::text";

export interface WithdrawDeps {
  /** Whether `owner` already has a token account for `mint` (decides who pays its rent). */
  hasTokenAccount(owner: string, mint: string): Promise<boolean>;
  send(row: WithdrawalRow, beforeSend: (sig: string, lastValidBlockHeight: number) => Promise<void>): Promise<SendOutcome>;
  networkFee(sig: string): Promise<bigint | null>;
  status(sig: string, lastValidBlockHeight: number | null): Promise<"confirmed" | "failed" | "expired" | "unknown">;
  screen(address: string): Promise<boolean | null>;
}

export const chainWithdrawDeps: WithdrawDeps = {
  async hasTokenAccount(owner, mint) {
    if (mint === SOL_MINT) return true;
    const { program } = await mintInfo(mint);
    const info = await connection().getAccountInfo(ataAddress(new PublicKey(owner), new PublicKey(mint), new PublicKey(program || TOKEN_PROGRAM)), "confirmed");
    return Boolean(info);
  },
  async send(row, beforeSend) {
    const vault = vaultKeypair();
    if (!vault) throw new HttpError(503, "Withdrawals open soon.");
    const to = new PublicKey(row.dest);
    const amount = BigInt(row.amount);
    return signAndSend(
      vault,
      async () => {
        if (row.mint === SOL_MINT) return vaultTransaction(vault.publicKey, [solTransferIx(vault.publicKey, to, amount)]);
        const { program, decimals } = await mintInfo(row.mint);
        const tokenProgram = new PublicKey(program || TOKEN_PROGRAM);
        const m = new PublicKey(row.mint);
        const source = ataAddress(vault.publicKey, m, tokenProgram);
        const dest = ataAddress(to, m, tokenProgram);
        return vaultTransaction(vault.publicKey, [
          createAtaIdempotentIx(vault.publicKey, dest, to, m, tokenProgram),
          transferCheckedIx(source, m, dest, vault.publicKey, amount, decimals, tokenProgram),
        ]);
      },
      beforeSend,
    );
  },
  async networkFee(sig) {
    const vault = vaultKeypair();
    const tx = await fetchTx(sig);
    if (!tx || !vault) return null;
    const delta = vaultDelta(tx, vault.publicKey.toBase58());
    return delta ? delta.fee : null;
  },
  status: settleStatus,
  screen,
};

/**
 * Queues a withdrawal to the account's own wallet. When an SPL token account must be opened for
 * the wallet, its rent (0.00203928 SOL) is charged to the user's SOL balance, shown before signing.
 */
export async function requestWithdrawal(
  database: Db,
  wallet: string,
  input: { mint: string; amount: bigint },
  deps: Pick<WithdrawDeps, "hasTokenAccount"> = chainWithdrawDeps,
): Promise<{ id: string; rent: bigint }> {
  if (input.mint === SOL_MINT && input.amount < MIN_WITHDRAW_LAMPORTS) throw new HttpError(400, "The minimum SOL withdrawal is 0.001 SOL.");
  const rent = (await deps.hasTokenAccount(wallet, input.mint)) ? BigInt(0) : ATA_RENT_LAMPORTS;
  const id = randomUUID();
  await database.tx(async (q) => {
    await lockWallet(q, wallet);
    await requireFunds(q, acct.user(wallet), input.mint, input.amount);
    if (rent > BigInt(0)) {
      const sol = await balance(q, acct.user(wallet), SOL_MINT);
      if (sol < rent) throw new HttpError(400, "Keep 0.0021 SOL in your vault balance: your wallet needs a token account for this coin.");
    }
    await post(q, { ref: `withdraw:${id}:queue`, kind: "withdraw_queue", wallet, postings: [
      { account: acct.user(wallet), mint: input.mint, amount: -input.amount },
      { account: acct.out(wallet), mint: input.mint, amount: input.amount },
      // The rent becomes the vault's cost when it opens the account (ops pays it at send time).
      { account: acct.user(wallet), mint: SOL_MINT, amount: -rent },
      { account: acct.ops, mint: SOL_MINT, amount: rent },
    ] });
    await q.query("INSERT INTO withdrawals (id, wallet, mint, amount, dest, kind, status) VALUES ($1, $2, $3, $4::numeric, $2, 'withdraw', 'queued')", [
      id,
      wallet,
      input.mint,
      input.amount.toString(),
    ]);
  });
  return { id, rent };
}

async function finishSent(database: Db, row: WithdrawalRow, fee: bigint, rentPaid: bigint) {
  await database.tx(async (q) => {
    const amount = BigInt(row.amount);
    await post(q, { ref: `withdraw:${row.id}:sent`, kind: "withdraw_sent", wallet: row.wallet, memo: { sig: row.sig }, postings: [
      { account: acct.out(row.wallet), mint: row.mint, amount: -amount },
      { account: acct.world, mint: row.mint, amount },
      { account: acct.ops, mint: SOL_MINT, amount: -(fee + rentPaid) },
      { account: acct.world, mint: SOL_MINT, amount: fee + rentPaid },
    ] });
    await q.query("UPDATE withdrawals SET status = 'sent', error = NULL, updated_at = now() WHERE id = $1", [row.id]);
  });
}

async function refundWithdrawal(database: Db, row: WithdrawalRow, reason: string) {
  await database.tx(async (q) => {
    await lockWallet(q, row.wallet);
    const amount = BigInt(row.amount);
    const rent = await rentFor(row, q);
    await post(q, { ref: `withdraw:${row.id}:refund`, kind: "withdraw_refund", wallet: row.wallet, postings: [
      { account: acct.out(row.wallet), mint: row.mint, amount: -amount },
      { account: acct.user(row.wallet), mint: row.mint, amount },
      { account: acct.ops, mint: SOL_MINT, amount: -rent },
      { account: acct.user(row.wallet), mint: SOL_MINT, amount: rent },
    ] });
    await q.query("UPDATE withdrawals SET status = 'failed', error = $2, updated_at = now() WHERE id = $1", [row.id, reason]);
  });
}

/** Rent the vault paid for the destination token account in this send (0 for SOL or an existing account). */
async function rentFor(row: WithdrawalRow, q: Queryable): Promise<bigint> {
  if (row.mint === SOL_MINT || row.kind === "refund") return BigInt(0);
  const [entry] = await q.query<{ amount: string }>(
    "SELECT p.amount::text FROM postings p JOIN journal j ON j.id = p.journal_id WHERE j.ref = $1 AND p.account = 'ops'",
    [`withdraw:${row.id}:queue`],
  );
  return entry ? BigInt(entry.amount) : BigInt(0);
}

/** Claims one queued withdrawal and sends it. */
export async function processWithdrawal(database: Db, id: string, deps: WithdrawDeps = chainWithdrawDeps): Promise<WithdrawalRow | null> {
  const [row] = await database.query<WithdrawalRow>(
    `UPDATE withdrawals SET status = 'sending', updated_at = now() WHERE id = $1 AND status = 'queued' RETURNING ${COLUMNS}`,
    [id],
  );
  if (!row) return (await database.query<WithdrawalRow>(`SELECT ${COLUMNS} FROM withdrawals WHERE id = $1`, [id]))[0] ?? null;
  const verdict = await deps.screen(row.dest);
  if (verdict !== false) {
    // Blocked or list unavailable: nothing is sent. Unavailable rows go back to the queue.
    await database.query("UPDATE withdrawals SET status = $2, error = $3, updated_at = now() WHERE id = $1", [
      id,
      verdict === null ? "queued" : "held",
      verdict === null ? null : "This withdrawal is on hold. Contact support.",
    ]);
    return { ...row, status: verdict === null ? "queued" : "held" };
  }
  let sent: SendOutcome;
  try {
    sent = await deps.send(row, async (sig, lastValidBlockHeight) => {
      await database.query("UPDATE withdrawals SET sig = $2, last_valid_height = $3, updated_at = now() WHERE id = $1", [id, sig, lastValidBlockHeight]);
      row.sig = sig;
    });
  } catch (error) {
    console.error("[blindspot] withdrawal", id, error instanceof Error ? error.message.slice(0, 160) : "unknown");
    await database.query("UPDATE withdrawals SET status = 'queued', updated_at = now() WHERE id = $1 AND sig IS NULL", [id]);
    return { ...row, status: "queued" };
  }
  if (sent.status === "rejected") {
    await database.query("UPDATE withdrawals SET sig = NULL WHERE id = $1", [id]);
    await refundWithdrawal(database, { ...row, sig: null }, "The network rejected the transfer. Your balance was restored.");
  } else if (sent.status === "failed") await refundWithdrawal(database, row, "The transfer failed on chain. Your balance was restored.");
  else if (sent.status !== "pending") await finishSent(database, row, (await deps.networkFee(sent.sig)) ?? BigInt(5000), await rentFor(row, database));
  return (await database.query<WithdrawalRow>(`SELECT ${COLUMNS} FROM withdrawals WHERE id = $1`, [id]))[0] ?? null;
}

/** Sends queued withdrawals and settles the ones left in flight. */
export async function runWithdrawals(database: Db, deps: WithdrawDeps = chainWithdrawDeps, budgetMs = 30_000, max = 8): Promise<number> {
  const started = Date.now();
  let done = 0;
  const inflight = await database.query<WithdrawalRow>(
    `SELECT ${COLUMNS} FROM withdrawals WHERE status = 'sending' AND updated_at < now() - interval '90 seconds' LIMIT 10`,
  );
  for (const row of inflight) {
    if (!row.sig) {
      await database.query("UPDATE withdrawals SET status = 'queued', updated_at = now() WHERE id = $1 AND sig IS NULL", [row.id]);
      continue;
    }
    const verdict = await deps.status(row.sig, row.last_valid_height ? Number(row.last_valid_height) : null);
    if (verdict === "confirmed") await finishSent(database, row, (await deps.networkFee(row.sig)) ?? BigInt(5000), await rentFor(row, database));
    else if (verdict === "failed" || verdict === "expired") await refundWithdrawal(database, row, "The transfer did not land. Your balance was restored.");
    else continue;
    done += 1;
  }
  const queued = await database.query<{ id: string }>("SELECT id FROM withdrawals WHERE status = 'queued' ORDER BY created_at LIMIT $1", [max]);
  for (const { id } of queued) {
    if (Date.now() - started > budgetMs) break;
    await processWithdrawal(database, id, deps);
    done += 1;
  }
  return done;
}

export async function listWithdrawals(q: Queryable, wallet: string, limit = 30): Promise<WithdrawalRow[]> {
  return q.query<WithdrawalRow>(`SELECT ${COLUMNS} FROM withdrawals WHERE wallet = $1 ORDER BY created_at DESC LIMIT $2`, [wallet, limit]);
}
