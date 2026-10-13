/**
 * Swaps from the vault. Every order first moves the input from `user:` to `hold:` (so it cannot be
 * spent twice), then the vault executes a Jupiter swap and the order settles from what the
 * transaction actually did to the vault's balances. Split orders reserve the whole amount and
 * schedule N parts at random times inside a window; parts run from the cron route and `after()`.
 *
 * Fee side: when SOL is the output of a sell, the fee comes out of the SOL received; otherwise it
 * comes off the input before quoting. Either way fees accrue mostly in SOL.
 */
import { randomUUID } from "node:crypto";
import { SOL_MINT, SPLIT, buybackShareBps, vaultKeypair } from "./config.ts";
import type { Db, Queryable } from "./db.ts";
import { HttpError } from "./errors.ts";
import { feeOn, splitFee } from "./fees.ts";
import { jupQuote, jupSwapTransaction, type JupQuote } from "./jupiter.ts";
import { acct, lockWallet, post, requireFunds, type Posting } from "./ledger.ts";
import { VersionedTransaction } from "@solana/web3.js";
import { fetchTx, settleStatus, signAndSend, swapOutcome, vaultDelta, type SendOutcome, type VaultDelta } from "./vaulttx.ts";

export const TRADING_CLOSED = "Trading opens soon.";

export type FeeSide = "in" | "out";

export interface OrderRow {
  id: string;
  wallet: string;
  parent_id: string | null;
  kind: "swap" | "split" | "part";
  in_mint: string;
  out_mint: string;
  in_amount: string;
  fee_bps: number;
  fee_side: FeeSide;
  slippage_bps: number;
  min_out: string | null;
  parts: number | null;
  status: "ready" | "scheduled" | "executing" | "unknown" | "filled" | "failed" | "cancelled" | "cancelling" | "open";
  scheduled_at: string;
  sig: string | null;
  last_valid_height: string | null;
  out_amount: string | null;
  fee_amount: string | null;
  error: string | null;
  created_at: string;
}

const COLUMNS = `id, wallet, parent_id, kind, in_mint, out_mint, in_amount::text, fee_bps, fee_side, slippage_bps, min_out::text, parts, status,
  scheduled_at::text, sig, last_valid_height::text, out_amount::text, fee_amount::text, error, created_at::text`;

export function feeSideFor(inMint: string, outMint: string): FeeSide {
  return outMint === SOL_MINT && inMint !== SOL_MINT ? "out" : "in";
}

/** What reaches the market for a gross input (fee taken off the input when the fee side is "in"). */
export function quoteAmountFor(gross: bigint, feeBps: number, side: FeeSide): bigint {
  return side === "in" ? gross - feeOn(gross, feeBps) : gross;
}

/** What the user receives from a market output (fee taken off the output when the fee side is "out"). */
export function userOutFor(marketOut: bigint, feeBps: number, side: FeeSide): bigint {
  return side === "out" ? marketOut - feeOn(marketOut, feeBps) : marketOut;
}

// ───────────────────────────── settlement (pure)

export interface Settlement {
  postings: Posting[];
  marketOut: bigint;
  userOut: bigint;
  fee: bigint;
  feeMint: string;
  gas: bigint;
}

export function settlementPostings(
  order: { wallet: string; inMint: string; outMint: string; gross: bigint; feeBps: number; feeSide: FeeSide },
  measured: { out: bigint; gas: bigint },
  buybackBps = buybackShareBps(),
): Settlement {
  const { wallet, inMint, outMint, gross, feeBps, feeSide } = order;
  const net = quoteAmountFor(gross, feeBps, feeSide);
  const fee = feeSide === "in" ? gross - net : feeOn(measured.out, feeBps);
  const feeMint = feeSide === "in" ? inMint : outMint;
  const userOut = feeSide === "in" ? measured.out : measured.out - fee;
  const { keep, buyback } = splitFee(fee, buybackBps);
  const postings: Posting[] = [
    { account: acct.hold(wallet), mint: inMint, amount: -gross },
    { account: acct.world, mint: inMint, amount: net },
    { account: acct.world, mint: outMint, amount: -measured.out },
    { account: acct.user(wallet), mint: outMint, amount: userOut },
    { account: acct.fees, mint: feeMint, amount: keep },
    { account: acct.buyback, mint: feeMint, amount: buyback },
    { account: acct.ops, mint: SOL_MINT, amount: -measured.gas },
    { account: acct.world, mint: SOL_MINT, amount: measured.gas },
  ];
  // Fee side "in": the fee never left the vault, so world only received `net`; hold paid `gross`.
  return { postings, marketOut: measured.out, userOut, fee, feeMint, gas: measured.gas };
}

/** Splits `total` into `parts` positive amounts with random weights (±35 %), summing exactly to `total`. */
export function splitAmounts(total: bigint, parts: number, rand: () => number = Math.random): bigint[] {
  if (parts < 1) throw new Error("parts must be ≥ 1");
  if (total < BigInt(parts)) throw new HttpError(400, "Amount too small to split that many times.");
  const weights = Array.from({ length: parts }, () => 0.65 + rand() * 0.7);
  const sum = weights.reduce((x, y) => x + y, 0);
  const scale = BigInt(1_000_000);
  const amounts = weights.slice(0, -1).map((w) => {
    const share = (total * BigInt(Math.floor((w / sum) * 1_000_000))) / scale;
    return share > BigInt(0) ? share : BigInt(1);
  });
  const rest = total - amounts.reduce((x, y) => x + y, BigInt(0));
  if (rest <= BigInt(0)) throw new HttpError(400, "Amount too small to split that many times.");
  return [...amounts, rest];
}

/** Random offsets (ms) inside the window, sorted; the first part leaves within the first slice. */
export function splitSchedule(parts: number, windowMs: number, rand: () => number = Math.random): number[] {
  const slice = windowMs / parts;
  return Array.from({ length: parts }, (_, i) => Math.round(i * slice + rand() * slice * 0.9));
}

// ───────────────────────────── execution deps (swappable in tests)

export interface SwapDeps {
  quote(input: { inputMint: string; outputMint: string; amount: bigint; slippageBps: number }): Promise<JupQuote>;
  execute(quote: JupQuote, beforeSend: (sig: string, lastValidBlockHeight: number) => Promise<void>): Promise<SendOutcome>;
  measure(sig: string): Promise<VaultDelta | null>;
  status(sig: string, lastValidBlockHeight: number | null): Promise<"confirmed" | "failed" | "expired" | "unknown">;
}

export const chainDeps: SwapDeps = {
  quote: jupQuote,
  async execute(quote, beforeSend) {
    const vault = vaultKeypair();
    if (!vault) throw new HttpError(503, TRADING_CLOSED);
    return signAndSend(
      vault,
      async () => {
        const { swapTransaction, lastValidBlockHeight } = await jupSwapTransaction(quote, vault.publicKey.toBase58());
        return { tx: VersionedTransaction.deserialize(Buffer.from(swapTransaction, "base64")), lastValidBlockHeight };
      },
      beforeSend,
    );
  },
  async measure(sig) {
    const vault = vaultKeypair();
    const tx = await fetchTx(sig);
    return tx && vault ? vaultDelta(tx, vault.publicKey.toBase58()) : null;
  },
  status: settleStatus,
};

// ───────────────────────────── creating orders

export interface SwapInput {
  inMint: string;
  outMint: string;
  amount: bigint;
  slippageBps: number;
  minOut?: bigint | null;
}

export async function createSwapOrder(database: Db, wallet: string, input: SwapInput, feeBps: number): Promise<string> {
  if (input.inMint === input.outMint) throw new HttpError(400, "Pick two different tokens.");
  const id = randomUUID();
  await database.tx(async (q) => {
    await lockWallet(q, wallet);
    await requireFunds(q, acct.user(wallet), input.inMint, input.amount);
    await q.query(
      `INSERT INTO orders (id, wallet, kind, in_mint, out_mint, in_amount, fee_bps, fee_side, slippage_bps, min_out, status)
       VALUES ($1, $2, 'swap', $3, $4, $5::numeric, $6, $7, $8, $9::numeric, 'ready')`,
      [id, wallet, input.inMint, input.outMint, input.amount.toString(), feeBps, feeSideFor(input.inMint, input.outMint), input.slippageBps, input.minOut?.toString() ?? null],
    );
    await post(q, { ref: `order:${id}:reserve`, kind: "order_reserve", wallet, postings: [
      { account: acct.user(wallet), mint: input.inMint, amount: -input.amount },
      { account: acct.hold(wallet), mint: input.inMint, amount: input.amount },
    ] });
  });
  return id;
}

export async function createSplitOrder(
  database: Db,
  wallet: string,
  input: SwapInput & { parts: number; windowMin: number },
  feeBps: number,
  rand: () => number = Math.random,
  now = Date.now(),
): Promise<string> {
  if (input.inMint === input.outMint) throw new HttpError(400, "Pick two different tokens.");
  if (!Number.isInteger(input.parts) || input.parts < SPLIT.minParts || input.parts > SPLIT.maxParts) throw new HttpError(400, `Split into ${SPLIT.minParts} to ${SPLIT.maxParts} parts.`);
  if (!(input.windowMin >= SPLIT.minWindowMin && input.windowMin <= SPLIT.maxWindowMin)) throw new HttpError(400, `Pick a window of ${SPLIT.minWindowMin} to ${SPLIT.maxWindowMin} minutes.`);
  const amounts = splitAmounts(input.amount, input.parts, rand);
  const offsets = splitSchedule(input.parts, input.windowMin * 60_000, rand);
  const parentId = randomUUID();
  const side = feeSideFor(input.inMint, input.outMint);
  await database.tx(async (q) => {
    await lockWallet(q, wallet);
    await requireFunds(q, acct.user(wallet), input.inMint, input.amount);
    await q.query(
      `INSERT INTO orders (id, wallet, kind, in_mint, out_mint, in_amount, fee_bps, fee_side, slippage_bps, parts, status, scheduled_at)
       VALUES ($1, $2, 'split', $3, $4, $5::numeric, $6, $7, $8, $9, 'open', to_timestamp($10 / 1000.0))`,
      [parentId, wallet, input.inMint, input.outMint, input.amount.toString(), feeBps, side, input.slippageBps, input.parts, now],
    );
    for (let i = 0; i < amounts.length; i++) {
      await q.query(
        `INSERT INTO orders (id, wallet, parent_id, kind, in_mint, out_mint, in_amount, fee_bps, fee_side, slippage_bps, status, scheduled_at)
         VALUES ($1, $2, $3, 'part', $4, $5, $6::numeric, $7, $8, $9, 'scheduled', to_timestamp($10 / 1000.0))`,
        [`${parentId}.${i + 1}`, wallet, parentId, input.inMint, input.outMint, amounts[i].toString(), feeBps, side, input.slippageBps, now + offsets[i]],
      );
    }
    await post(q, { ref: `order:${parentId}:reserve`, kind: "order_reserve", wallet, postings: [
      { account: acct.user(wallet), mint: input.inMint, amount: -input.amount },
      { account: acct.hold(wallet), mint: input.inMint, amount: input.amount },
    ] });
  });
  return parentId;
}

// ───────────────────────────── running orders

export async function getOrder(q: Queryable, id: string): Promise<OrderRow | null> {
  return (await q.query<OrderRow>(`SELECT ${COLUMNS} FROM orders WHERE id = $1`, [id]))[0] ?? null;
}

async function refund(database: Db, order: OrderRow, reason: string, status: "failed" | "cancelled" = "failed") {
  await database.tx(async (q) => {
    await lockWallet(q, order.wallet);
    const amount = BigInt(order.in_amount);
    await post(q, { ref: `order:${order.id}:refund`, kind: "order_refund", wallet: order.wallet, postings: [
      { account: acct.hold(order.wallet), mint: order.in_mint, amount: -amount },
      { account: acct.user(order.wallet), mint: order.in_mint, amount },
    ] });
    await q.query("UPDATE orders SET status = $2, error = $3, updated_at = now() WHERE id = $1", [order.id, status, reason]);
  });
}

async function settle(database: Db, order: OrderRow, delta: VaultDelta) {
  const gross = BigInt(order.in_amount);
  const net = quoteAmountFor(gross, order.fee_bps, order.fee_side);
  const measured = swapOutcome(delta, { inMint: order.in_mint, outMint: order.out_mint, inNet: net });
  const s = settlementPostings({ wallet: order.wallet, inMint: order.in_mint, outMint: order.out_mint, gross, feeBps: order.fee_bps, feeSide: order.fee_side }, measured);
  await database.tx(async (q) => {
    await lockWallet(q, order.wallet);
    await post(q, { ref: `order:${order.id}:settle`, kind: "swap", wallet: order.wallet, memo: { sig: order.sig }, postings: s.postings });
    await q.query("UPDATE orders SET status = 'filled', out_amount = $2::numeric, fee_amount = $3::numeric, error = NULL, updated_at = now() WHERE id = $1", [
      order.id,
      s.userOut.toString(),
      s.fee.toString(),
    ]);
  });
}

/** Claims and runs one order. Safe to call twice: only one caller wins the claim. */
export async function executeOrder(database: Db, id: string, deps: SwapDeps = chainDeps): Promise<OrderRow | null> {
  const [order] = await database.query<OrderRow>(
    `UPDATE orders SET status = 'executing', updated_at = now()
      WHERE id = $1 AND status IN ('ready', 'scheduled') AND scheduled_at <= now()
      RETURNING ${COLUMNS}`,
    [id],
  );
  if (!order) return getOrder(database, id);
  const gross = BigInt(order.in_amount);
  const net = quoteAmountFor(gross, order.fee_bps, order.fee_side);
  let sent: SendOutcome;
  try {
    if (net <= BigInt(0)) throw new HttpError(400, "Amount too small after the fee.");
    const quote = await deps.quote({ inputMint: order.in_mint, outputMint: order.out_mint, amount: net, slippageBps: order.slippage_bps });
    if (order.min_out) {
      const expected = userOutFor(BigInt(quote.outAmount), order.fee_bps, order.fee_side);
      if (expected < BigInt(order.min_out)) throw new HttpError(409, "The price moved past your minimum. Get a new quote.");
    }
    sent = await deps.execute(quote, async (sig, lastValidBlockHeight) => {
      await database.query("UPDATE orders SET sig = $2, last_valid_height = $3, updated_at = now() WHERE id = $1", [id, sig, lastValidBlockHeight]);
      order.sig = sig;
    });
  } catch (error) {
    const reason = error instanceof HttpError ? error.message : "The swap could not be sent. Your balance was restored.";
    if (!(error instanceof HttpError)) console.error("[blindspot] order", id, error instanceof Error ? error.message.slice(0, 160) : "unknown");
    await refund(database, order, reason);
    return getOrder(database, id);
  }
  if (sent.status === "rejected") {
    await database.query("UPDATE orders SET sig = NULL WHERE id = $1", [id]);
    await refund(database, order, "The network rejected the swap (price moved or route closed). Your balance was restored.");
  } else if (sent.status === "failed") {
    await refund(database, order, "The swap failed on chain. Your balance was restored.");
  } else if (sent.status === "pending") {
    await database.query("UPDATE orders SET status = 'unknown', updated_at = now() WHERE id = $1", [id]);
  } else {
    const delta = await deps.measure(sent.sig);
    if (!delta) await database.query("UPDATE orders SET status = 'unknown', updated_at = now() WHERE id = $1", [id]);
    else if (!delta.ok) await refund(database, order, "The swap failed on chain. Your balance was restored.");
    else await settle(database, order, delta);
  }
  return getOrder(database, id);
}

/** Orders whose outcome was not known when they ran: settle, refund or leave for the next pass. */
export async function reconcileOrders(database: Db, deps: SwapDeps = chainDeps): Promise<number> {
  const rows = await database.query<OrderRow>(
    `SELECT ${COLUMNS} FROM orders WHERE (status = 'unknown') OR (status = 'executing' AND updated_at < now() - interval '2 minutes') LIMIT 20`,
  );
  let done = 0;
  for (const order of rows) {
    if (!order.sig) {
      // Signature is stored before sending: no signature means nothing was sent.
      await refund(database, order, "The swap was not sent. Your balance was restored.");
      done += 1;
      continue;
    }
    const verdict = await deps.status(order.sig, order.last_valid_height ? Number(order.last_valid_height) : null);
    if (verdict === "confirmed") {
      const delta = await deps.measure(order.sig);
      if (delta?.ok) await settle(database, order, delta);
      else if (delta) await refund(database, order, "The swap failed on chain. Your balance was restored.");
      else continue;
    } else if (verdict === "failed" || verdict === "expired") {
      await refund(database, order, "The swap did not land. Your balance was restored.");
    } else continue;
    done += 1;
  }
  return done;
}

/** Runs split parts that are due, oldest first, within a time budget. */
export async function runDueParts(database: Db, deps: SwapDeps = chainDeps, budgetMs = 40_000, max = 6): Promise<number> {
  const started = Date.now();
  const due = await database.query<{ id: string }>(
    "SELECT id FROM orders WHERE kind = 'part' AND status = 'scheduled' AND scheduled_at <= now() ORDER BY scheduled_at LIMIT $1",
    [max],
  );
  let ran = 0;
  for (const { id } of due) {
    if (Date.now() - started > budgetMs) break;
    await executeOrder(database, id, deps);
    ran += 1;
  }
  return ran;
}

/** Cancels every part of a split that has not started; their amounts go back to the balance. */
export async function cancelSplit(database: Db, wallet: string, parentId: string): Promise<number> {
  const parent = await getOrder(database, parentId);
  if (!parent || parent.wallet !== wallet || parent.kind !== "split") throw new HttpError(404, "Order not found.");
  const parts = await database.query<OrderRow>(
    `UPDATE orders SET status = 'cancelling', updated_at = now() WHERE parent_id = $1 AND status = 'scheduled' RETURNING ${COLUMNS}`,
    [parentId],
  );
  for (const part of parts) await refund(database, part, "Cancelled.", "cancelled");
  return parts.length;
}

export interface OrderView extends OrderRow {
  children?: OrderRow[];
}

/** A wallet's orders, newest first, split parts nested under their parent. */
export async function listOrders(q: Queryable, wallet: string, limit = 40): Promise<OrderView[]> {
  const rows = await q.query<OrderRow>(`SELECT ${COLUMNS} FROM orders WHERE wallet = $1 ORDER BY created_at DESC, id LIMIT $2`, [wallet, limit * 6]);
  const parents: OrderView[] = rows.filter((r) => r.kind !== "part").slice(0, limit);
  const byParent = new Map<string, OrderRow[]>();
  for (const r of rows) if (r.parent_id) byParent.set(r.parent_id, [...(byParent.get(r.parent_id) ?? []), r]);
  for (const p of parents) {
    if (p.kind !== "split") continue;
    p.children = (byParent.get(p.id) ?? []).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
    const states = p.children.map((c) => c.status);
    if (states.length && states.every((s) => s === "filled" || s === "failed" || s === "cancelled")) p.status = states.includes("filled") ? "filled" : (states.every((s) => s === "cancelled") ? "cancelled" : "failed");
  }
  return parents;
}
