/**
 * Double-entry ledger. Every movement is one journal row (unique `ref` = idempotency key: a
 * transaction signature, an order id…) and two or more postings whose amounts sum to zero per mint.
 *
 * Accounts
 *   user:<wallet>     spendable balance owed to that wallet
 *   hold:<wallet>     reserved for scheduled split parts
 *   out:<wallet>      queued withdrawals (left the user, not yet on chain)
 *   frozen:<wallet>   deposits that could not be credited (sanctions screen)
 *   fees              platform share of swap fees
 *   buyback           share of swap fees waiting to buy $BLINDSPOT
 *   treasury          $BLINDSPOT bought back
 *   ops               network fees and rent paid by the vault (goes negative; topped up by the owner)
 *   world             the outside: everything that entered or left the vault on chain
 *
 * So for any mint: tokens the vault should hold on chain = −balance(world).
 */
import type { Queryable } from "./db.ts";
import { HttpError } from "./errors.ts";

export const acct = {
  user: (wallet: string) => `user:${wallet}`,
  hold: (wallet: string) => `hold:${wallet}`,
  out: (wallet: string) => `out:${wallet}`,
  frozen: (wallet: string) => `frozen:${wallet}`,
  fees: "fees",
  buyback: "buyback",
  treasury: "treasury",
  ops: "ops",
  world: "world",
} as const;

/** Accounts whose balances are owed to users (counted as liabilities on /reserves). */
export const LIABILITY_PREFIXES = ["user:", "hold:", "out:", "frozen:"] as const;

export interface Posting {
  account: string;
  mint: string;
  amount: bigint;
}

export function assertBalanced(postings: Posting[]) {
  if (postings.length < 2) throw new Error("A journal entry needs at least two postings.");
  const sums = new Map<string, bigint>();
  for (const p of postings) sums.set(p.mint, (sums.get(p.mint) ?? BigInt(0)) + p.amount);
  for (const [mint, sum] of sums) if (sum !== BigInt(0)) throw new Error(`Unbalanced entry for ${mint}: ${sum}`);
}

export interface Entry {
  ref: string;
  kind: string;
  wallet?: string | null;
  memo?: Record<string, unknown> | null;
  postings: Posting[];
}

/** Writes the entry once. Returns false (and writes nothing) when `ref` was already posted. */
export async function post(q: Queryable, entry: Entry): Promise<boolean> {
  const postings = entry.postings.filter((p) => p.amount !== BigInt(0));
  if (postings.length === 0) {
    const rows = await q.query<{ id: string }>(
      "INSERT INTO journal (ref, kind, wallet, memo) VALUES ($1, $2, $3, $4) ON CONFLICT (ref) DO NOTHING RETURNING id",
      [entry.ref, entry.kind, entry.wallet ?? null, entry.memo ? JSON.stringify(entry.memo) : null],
    );
    return rows.length > 0;
  }
  assertBalanced(postings);
  const rows = await q.query<{ id: string }>(
    "INSERT INTO journal (ref, kind, wallet, memo) VALUES ($1, $2, $3, $4) ON CONFLICT (ref) DO NOTHING RETURNING id",
    [entry.ref, entry.kind, entry.wallet ?? null, entry.memo ? JSON.stringify(entry.memo) : null],
  );
  if (rows.length === 0) return false;
  const id = rows[0].id;
  const values: string[] = [];
  const params: unknown[] = [];
  postings.forEach((p, i) => {
    values.push(`($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4}::numeric)`);
    params.push(id, p.account, p.mint, p.amount.toString());
  });
  await q.query(`INSERT INTO postings (journal_id, account, mint, amount) VALUES ${values.join(", ")}`, params);
  return true;
}

export async function balance(q: Queryable, account: string, mint: string): Promise<bigint> {
  const [row] = await q.query<{ total: string | null }>("SELECT sum(amount)::text AS total FROM postings WHERE account = $1 AND mint = $2", [account, mint]);
  return BigInt(row?.total ?? "0");
}

/** Non-zero balances of one account, by mint. */
export async function balances(q: Queryable, account: string): Promise<Map<string, bigint>> {
  const rows = await q.query<{ mint: string; total: string }>(
    "SELECT mint, sum(amount)::text AS total FROM postings WHERE account = $1 GROUP BY mint HAVING sum(amount) <> 0",
    [account],
  );
  return new Map(rows.map((r) => [r.mint, BigInt(r.total)]));
}

/** Serialises every write of one wallet for the rest of the transaction. */
export async function lockWallet(q: Queryable, wallet: string) {
  await q.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`wallet:${wallet}`]);
}

export async function lockKey(q: Queryable, key: string) {
  await q.query("SELECT pg_advisory_xact_lock(hashtext($1))", [key]);
}

/** Debit guard: throws a visitor-safe error when `account` holds less than `amount`. */
export async function requireFunds(q: Queryable, account: string, mint: string, amount: bigint) {
  if (amount <= BigInt(0)) throw new HttpError(400, "Enter an amount above zero.");
  const available = await balance(q, account, mint);
  if (available < amount) throw new HttpError(400, "Not enough balance in your vault account.");
}

export interface MintTotals {
  mint: string;
  liabilities: bigint;
  fees: bigint;
  buyback: bigint;
  treasury: bigint;
  ops: bigint;
  /** What the vault should hold on chain: −world. */
  expected: bigint;
}

/** Ledger totals per mint for /reserves. */
export async function totalsByMint(q: Queryable): Promise<MintTotals[]> {
  const rows = await q.query<{ mint: string; bucket: string; total: string }>(
    `SELECT mint,
            CASE WHEN account LIKE 'user:%' OR account LIKE 'hold:%' OR account LIKE 'out:%' OR account LIKE 'frozen:%' THEN 'liabilities' ELSE account END AS bucket,
            sum(amount)::text AS total
       FROM postings GROUP BY 1, 2`,
  );
  const map = new Map<string, MintTotals>();
  for (const r of rows) {
    const t = map.get(r.mint) ?? { mint: r.mint, liabilities: BigInt(0), fees: BigInt(0), buyback: BigInt(0), treasury: BigInt(0), ops: BigInt(0), expected: BigInt(0) };
    const v = BigInt(r.total);
    if (r.bucket === "liabilities") t.liabilities += v;
    else if (r.bucket === "fees") t.fees += v;
    else if (r.bucket === "buyback") t.buyback += v;
    else if (r.bucket === "treasury") t.treasury += v;
    else if (r.bucket === "ops") t.ops += v;
    else if (r.bucket === "world") t.expected = -v;
    map.set(r.mint, t);
  }
  return [...map.values()].filter((t) => t.expected !== BigInt(0) || t.liabilities !== BigInt(0));
}
