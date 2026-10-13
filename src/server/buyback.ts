/**
 * Buybacks: the `buyback` share of swap fees is swapped for $BLINDSPOT by the vault, on market,
 * through Jupiter. Each pool (one per fee mint) runs once it is worth `BUYBACK_MIN_USD`. Bought
 * tokens sit in the `treasury` account (inside the vault wallet). Every run is listed with its tx.
 */
import { randomUUID } from "node:crypto";
import { serverMint } from "../config/solana.ts";
import { SOL_MINT, buybackMinUsd } from "./config.ts";
import type { Db, Queryable } from "./db.ts";
import { acct, balances, post } from "./ledger.ts";
import { chainDeps, type SwapDeps } from "./orders.ts";
import { swapOutcome, type VaultDelta } from "./vaulttx.ts";

export interface BuybackRow {
  id: string;
  in_mint: string;
  in_amount: string;
  out_amount: string | null;
  status: "executing" | "unknown" | "done" | "failed";
  sig: string | null;
  last_valid_height: string | null;
  error: string | null;
  created_at: string;
}

const COLUMNS = "id, in_mint, in_amount::text, out_amount::text, status, sig, last_valid_height::text, error, created_at::text";

async function settleBuyback(database: Db, row: BuybackRow, tokenMint: string, delta: VaultDelta) {
  const amount = BigInt(row.in_amount);
  const { out, gas } = swapOutcome(delta, { inMint: row.in_mint, outMint: tokenMint, inNet: amount });
  await database.tx(async (q) => {
    await post(q, { ref: `buyback:${row.id}:settle`, kind: "buyback", memo: { sig: row.sig }, postings: [
      { account: acct.buyback, mint: row.in_mint, amount: -amount },
      { account: acct.world, mint: row.in_mint, amount },
      { account: acct.world, mint: tokenMint, amount: -out },
      { account: acct.treasury, mint: tokenMint, amount: out },
      { account: acct.ops, mint: SOL_MINT, amount: -gas },
      { account: acct.world, mint: SOL_MINT, amount: gas },
    ] });
    await q.query("UPDATE buybacks SET status = 'done', out_amount = $2::numeric, updated_at = now() WHERE id = $1", [row.id, out.toString()]);
  });
}

/** One pass: settles buybacks left in flight, then buys with every pool worth the minimum. */
export async function runBuyback(database: Db, deps: SwapDeps = chainDeps): Promise<number> {
  const tokenMint = serverMint();
  if (!tokenMint) return 0;
  let done = 0;

  const inflight = await database.query<BuybackRow>(`SELECT ${COLUMNS} FROM buybacks WHERE status IN ('executing', 'unknown') ORDER BY created_at`);
  for (const row of inflight) {
    if (!row.sig) {
      await database.query("UPDATE buybacks SET status = 'failed', error = 'not sent' WHERE id = $1 AND updated_at < now() - interval '2 minutes'", [row.id]);
      continue;
    }
    const verdict = await deps.status(row.sig, row.last_valid_height ? Number(row.last_valid_height) : null);
    if (verdict === "confirmed") {
      const delta = await deps.measure(row.sig);
      if (delta?.ok) await settleBuyback(database, row, tokenMint, delta);
    } else if (verdict === "failed" || verdict === "expired") {
      await database.query("UPDATE buybacks SET status = 'failed', error = 'did not land', updated_at = now() WHERE id = $1", [row.id]);
    }
  }
  if ((await database.query(`SELECT 1 FROM buybacks WHERE status IN ('executing', 'unknown')`)).length > 0) return done;

  const pools = await balances(database, acct.buyback);
  for (const [mint, amount] of pools) {
    if (amount <= BigInt(0)) continue;
    if (mint === tokenMint) {
      // Fees already paid in $BLINDSPOT go straight to the treasury, no swap.
      await post(database, { ref: `buyback:direct:${randomUUID()}`, kind: "buyback_direct", postings: [
        { account: acct.buyback, mint, amount: -amount },
        { account: acct.treasury, mint, amount },
      ] });
      continue;
    }
    let quote;
    try {
      quote = await deps.quote({ inputMint: mint, outputMint: tokenMint, amount, slippageBps: 300 });
    } catch {
      continue;
    }
    if (Number(quote.swapUsdValue ?? 0) < buybackMinUsd()) continue;
    const id = randomUUID();
    await database.query("INSERT INTO buybacks (id, in_mint, in_amount, status) VALUES ($1, $2, $3::numeric, 'executing')", [id, mint, amount.toString()]);
    const row = (await database.query<BuybackRow>(`SELECT ${COLUMNS} FROM buybacks WHERE id = $1`, [id]))[0];
    try {
      const sent = await deps.execute(quote, async (sig, lvh) => {
        await database.query("UPDATE buybacks SET sig = $2, last_valid_height = $3, updated_at = now() WHERE id = $1", [id, sig, lvh]);
        row.sig = sig;
      });
      if (sent.status === "rejected") await database.query("UPDATE buybacks SET status = 'failed', sig = NULL, error = 'rejected', updated_at = now() WHERE id = $1", [id]);
      else if (sent.status === "failed") await database.query("UPDATE buybacks SET status = 'failed', error = 'failed on chain', updated_at = now() WHERE id = $1", [id]);
      else if (sent.status === "pending") await database.query("UPDATE buybacks SET status = 'unknown', updated_at = now() WHERE id = $1", [id]);
      else {
        const delta = await deps.measure(sent.sig);
        if (delta?.ok) await settleBuyback(database, row, tokenMint, delta);
        else await database.query("UPDATE buybacks SET status = 'unknown', updated_at = now() WHERE id = $1", [id]);
      }
      done += 1;
    } catch (error) {
      console.error("[blindspot] buyback", error instanceof Error ? error.message.slice(0, 160) : "unknown");
      await database.query("UPDATE buybacks SET status = 'failed', error = 'not sent', updated_at = now() WHERE id = $1 AND sig IS NULL", [id]);
    }
    break; // one swap per pass keeps each invocation short
  }
  return done;
}

export async function listBuybacks(q: Queryable, limit = 30): Promise<BuybackRow[]> {
  return q.query<BuybackRow>(`SELECT ${COLUMNS} FROM buybacks WHERE status = 'done' ORDER BY created_at DESC LIMIT $1`, [limit]);
}
