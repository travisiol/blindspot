import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { intentMessage } from "../src/lib/intent-message.ts";
import { prepareIntent, verifyIntent } from "../src/server/auth.ts";
import { SOL_MINT, USDC_MINT, feeTiers } from "../src/server/config.ts";
import { openPglite, migrate, type Db } from "../src/server/db.ts";
import { creditDeposit, depositsInTx } from "../src/server/deposits.ts";
import { HttpError } from "../src/server/errors.ts";
import { feeForHolding } from "../src/server/fees.ts";
import { acct, assertBalanced, balance, post, totalsByMint } from "../src/server/ledger.ts";
import {
  cancelSplit,
  createSplitOrder,
  createSwapOrder,
  executeOrder,
  listOrders,
  runDueParts,
  settlementPostings,
  splitAmounts,
  type SwapDeps,
} from "../src/server/orders.ts";
import { setSanctionsList } from "../src/server/sanctions.ts";
import { processWithdrawal, requestWithdrawal, runWithdrawals, type WithdrawDeps } from "../src/server/withdrawals.ts";
import type { TxLike, VaultDelta } from "../src/server/vaulttx.ts";

const SOL = BigInt(1_000_000_000);
const BONK = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
const VAULT = Keypair.generate().publicKey.toBase58();
let database: Db;

beforeEach(async () => {
  database = await openPglite(null);
  await migrate(database);
  process.env["CAP_DEPOSIT_SOL"] = "25";
  process.env["CAP_ACCOUNT_SOL"] = "100";
  process.env["BUYBACK_SHARE_BPS"] = "5000";
});

const wallet = () => Keypair.generate().publicKey.toBase58();
const code = (p: Promise<unknown>) => p.then(() => 200, (e: HttpError) => e.status ?? 500);

/** A transfer of `lamports` from `from` (fee payer) to the vault. */
function solTransferTx(from: string, lamports: bigint, err: unknown = null): TxLike {
  return {
    accountKeys: [from, VAULT, "11111111111111111111111111111111"],
    meta: { err, fee: 5000, preBalances: [100e9, 1e9, 1], postBalances: [100e9 - Number(lamports) - 5000, 1e9 + Number(lamports), 1], preTokenBalances: [], postTokenBalances: [] },
  };
}

async function fund(w: string, mint: string, amount: bigint) {
  await post(database, { ref: `test-fund:${w}:${mint}:${amount}:${Math.random()}`, kind: "deposit", wallet: w, postings: [
    { account: acct.user(w), mint, amount },
    { account: acct.world, mint, amount: -amount },
  ] });
}

// ───────────────────────────── deposits

test("a deposit is credited once, however many times it is claimed", async () => {
  const w = wallet();
  const tx = solTransferTx(w, 2n * SOL);
  await creditDeposit(database, { wallet: w, sig: "sig1", tx, vault: VAULT, blocked: false });
  await creditDeposit(database, { wallet: w, sig: "sig1", tx, vault: VAULT, blocked: false });
  await Promise.all([1, 2, 3].map(() => creditDeposit(database, { wallet: w, sig: "sig1", tx, vault: VAULT, blocked: false })));
  assert.equal(await balance(database, acct.user(w), SOL_MINT), 2n * SOL);
});

test("a transfer paid by someone else, or a failed one, credits nothing", async () => {
  const w = wallet();
  assert.deepEqual(depositsInTx(solTransferTx(wallet(), SOL), w, VAULT), []);
  assert.deepEqual(depositsInTx(solTransferTx(w, SOL, { InstructionError: [0, "x"] }), w, VAULT), []);
  assert.equal(await code(creditDeposit(database, { wallet: w, sig: "s", tx: solTransferTx(wallet(), SOL), vault: VAULT, blocked: false })), 400);
});

test("over the per-deposit cap: the excess is credited then queued back to the sender", async () => {
  const w = wallet();
  const [credit] = await creditDeposit(database, { wallet: w, sig: "big", tx: solTransferTx(w, 30n * SOL), vault: VAULT, blocked: false });
  assert.equal(credit.credited, 25n * SOL);
  assert.equal(credit.refunded, 5n * SOL);
  assert.equal(await balance(database, acct.user(w), SOL_MINT), 25n * SOL);
  assert.equal(await balance(database, acct.out(w), SOL_MINT), 5n * SOL);
  const [refund] = await database.query<{ dest: string; kind: string }>("SELECT dest, kind FROM withdrawals WHERE wallet = $1", [w]);
  assert.deepEqual(refund, { dest: w, kind: "refund" });
});

test("a sanctioned sender's deposit is frozen, never spendable", async () => {
  const w = wallet();
  const [credit] = await creditDeposit(database, { wallet: w, sig: "bad", tx: solTransferTx(w, SOL), vault: VAULT, blocked: true });
  assert.equal(credit.status, "frozen");
  assert.equal(await balance(database, acct.user(w), SOL_MINT), 0n);
  assert.equal(await balance(database, acct.frozen(w), SOL_MINT), SOL);
});

// ───────────────────────────── ledger invariants

test("unbalanced entries are refused", () => {
  assert.throws(() => assertBalanced([{ account: "a", mint: "m", amount: 1n }, { account: "b", mint: "m", amount: -2n }]));
  assert.doesNotThrow(() => assertBalanced([{ account: "a", mint: "m", amount: 1n }, { account: "b", mint: "m", amount: -1n }]));
});

test("swap settlement: fee off the input, half to buyback, every mint balances", () => {
  const s = settlementPostings({ wallet: "W", inMint: SOL_MINT, outMint: BONK, gross: 1000000n, feeBps: 50, feeSide: "in" }, { out: 777n, gas: 9000n }, 5000);
  assertBalanced(s.postings);
  assert.equal(s.fee, 5000n);
  assert.equal(s.userOut, 777n);
  const get = (a: string, m: string) => s.postings.filter((p) => p.account === a && p.mint === m).reduce((x, p) => x + p.amount, 0n);
  assert.equal(get(acct.fees, SOL_MINT), 2500n);
  assert.equal(get(acct.buyback, SOL_MINT), 2500n);
  assert.equal(get(acct.world, SOL_MINT), 995000n + 9000n);
});

test("swap settlement: selling into SOL takes the fee from the SOL received", () => {
  const s = settlementPostings({ wallet: "W", inMint: BONK, outMint: SOL_MINT, gross: 500n, feeBps: 40, feeSide: "out" }, { out: 2_000_000n, gas: 5000n }, 5000);
  assertBalanced(s.postings);
  assert.equal(s.fee, 8000n);
  assert.equal(s.userOut, 1_992_000n);
  assert.equal(s.feeMint, SOL_MINT);
});

// ───────────────────────────── orders

function fakeDeps(opts: { out?: bigint; fail?: "quote" | "chain" | "rejected" | "pending"; quoteOut?: bigint } = {}): SwapDeps & { sent: number } {
  const deps = {
    sent: 0,
    async quote(i: { inputMint: string; outputMint: string; amount: bigint }) {
      if (opts.fail === "quote") throw new HttpError(400, "No route for this pair right now.");
      return { inputMint: i.inputMint, outputMint: i.outputMint, inAmount: i.amount.toString(), outAmount: String(opts.quoteOut ?? opts.out ?? 1000n), otherAmountThreshold: "0", swapMode: "ExactIn", slippageBps: 100, priceImpactPct: "0", routePlan: [] };
    },
    async execute(_q: unknown, beforeSend: (sig: string, h: number) => Promise<void>) {
      deps.sent += 1;
      const sig = `tx${deps.sent}${Math.random().toString(36).slice(2)}`;
      await beforeSend(sig, 100);
      return { sig, lastValidBlockHeight: 100, status: opts.fail === "chain" ? ("failed" as const) : opts.fail === "rejected" ? ("rejected" as const) : opts.fail === "pending" ? ("pending" as const) : ("confirmed" as const) };
    },
    async measure(): Promise<VaultDelta> {
      return { ok: true, feePayer: VAULT, fee: 5000n, sol: -1n, tokens: new Map([[BONK, opts.out ?? 1000n]]), rent: 0n, blockTime: null };
    },
    async status() {
      return "confirmed" as const;
    },
  };
  return deps;
}

test("a swap settles from what the vault received; the input leaves the balance once", async () => {
  const w = wallet();
  await fund(w, SOL_MINT, SOL);
  const id = await createSwapOrder(database, w, { inMint: SOL_MINT, outMint: BONK, amount: SOL / 2n, slippageBps: 100 }, 50);
  const deps = fakeDeps({ out: 123456n });
  const order = await executeOrder(database, id, deps);
  await executeOrder(database, id, deps); // second call: already claimed, nothing sent
  assert.equal(order?.status, "filled");
  assert.equal(deps.sent, 1);
  assert.equal(await balance(database, acct.user(w), SOL_MINT), SOL / 2n);
  assert.equal(await balance(database, acct.hold(w), SOL_MINT), 0n);
  assert.equal(await balance(database, acct.user(w), BONK), 123456n);
  assert.equal(await balance(database, acct.buyback, SOL_MINT), (SOL / 2n) * 50n / 10000n / 2n);
});

test("a swap above the balance is refused before anything is sent", async () => {
  const w = wallet();
  await fund(w, SOL_MINT, SOL);
  assert.equal(await code(createSwapOrder(database, w, { inMint: SOL_MINT, outMint: BONK, amount: 2n * SOL, slippageBps: 100 }, 50)), 400);
});

test("a failed swap (route or chain) gives the input back", async () => {
  const w = wallet();
  await fund(w, SOL_MINT, SOL);
  for (const fail of ["quote", "chain", "rejected"] as const) {
    const id = await createSwapOrder(database, w, { inMint: SOL_MINT, outMint: BONK, amount: SOL / 4n, slippageBps: 100 }, 50);
    const order = await executeOrder(database, id, fakeDeps({ fail }));
    assert.equal(order?.status, "failed");
    // A transaction refused at preflight never existed on chain: no link to it.
    if (fail === "rejected") assert.equal(order?.sig, null);
  }
  assert.equal(await balance(database, acct.user(w), SOL_MINT), SOL);
  assert.equal(await balance(database, acct.hold(w), SOL_MINT), 0n);
});

test("a quote below the signed minimum is not executed", async () => {
  const w = wallet();
  await fund(w, SOL_MINT, SOL);
  const id = await createSwapOrder(database, w, { inMint: SOL_MINT, outMint: BONK, amount: SOL / 4n, slippageBps: 100, minOut: 5000n }, 50);
  const deps = fakeDeps({ quoteOut: 4000n });
  const order = await executeOrder(database, id, deps);
  assert.equal(order?.status, "failed");
  assert.equal(deps.sent, 0);
  assert.equal(await balance(database, acct.user(w), SOL_MINT), SOL);
});

test("split: parts sum exactly to the order; due parts run; cancel returns the rest", async () => {
  for (const [total, parts] of [[1000003n, 7], [10n, 10], [SOL, 3]] as const) {
    const amounts = splitAmounts(total, parts);
    assert.equal(amounts.length, parts);
    assert.equal(amounts.reduce((a, b) => a + b, 0n), total);
    assert.ok(amounts.every((a) => a > 0n));
  }
  const w = wallet();
  await fund(w, SOL_MINT, SOL);
  const parentId = await createSplitOrder(database, w, { inMint: SOL_MINT, outMint: BONK, amount: SOL / 2n, slippageBps: 100, parts: 4, windowMin: 60 }, 50, Math.random, Date.now() - 3600_000);
  assert.equal(await balance(database, acct.hold(w), SOL_MINT), SOL / 2n);
  // Run two of the four parts, then cancel.
  await runDueParts(database, fakeDeps({ out: 10n }), 40_000, 2);
  const cancelled = await cancelSplit(database, w, parentId);
  assert.equal(cancelled, 2);
  assert.equal(await balance(database, acct.hold(w), SOL_MINT), 0n);
  assert.equal(await balance(database, acct.user(w), BONK), 20n);
  const [view] = await listOrders(database, w);
  assert.equal(view.children?.length, 4);
  assert.equal(await code(cancelSplit(database, wallet(), parentId)), 404);
});

// ───────────────────────────── withdrawals

function fakeWithdraw(opts: { status?: "confirmed" | "failed"; blocked?: boolean | null; hasAta?: boolean } = {}): WithdrawDeps & { sent: number } {
  const deps = {
    sent: 0,
    async hasTokenAccount() {
      return opts.hasAta ?? true;
    },
    async send(_row: unknown, beforeSend: (sig: string, h: number) => Promise<void>) {
      deps.sent += 1;
      const sig = `w${deps.sent}${Math.random().toString(36).slice(2)}`;
      await beforeSend(sig, 1);
      return { sig, lastValidBlockHeight: 1, status: opts.status ?? ("confirmed" as const) };
    },
    async networkFee() {
      return 5000n;
    },
    async status() {
      return "confirmed" as const;
    },
    async screen() {
      return opts.blocked === undefined ? false : opts.blocked;
    },
  };
  return deps;
}

test("withdrawals above the balance are refused; two racing withdrawals cannot overdraw", async () => {
  const w = wallet();
  await fund(w, SOL_MINT, SOL);
  assert.equal(await code(requestWithdrawal(database, w, { mint: SOL_MINT, amount: 2n * SOL })), 400);
  const results = await Promise.all([0, 1, 2].map(() => code(requestWithdrawal(database, w, { mint: SOL_MINT, amount: (SOL * 6n) / 10n }, fakeWithdraw()))));
  assert.deepEqual(results.sort(), [200, 400, 400]);
  assert.equal(await balance(database, acct.user(w), SOL_MINT), (SOL * 4n) / 10n);
});

test("a withdrawal goes to the account's own wallet, once", async () => {
  const w = wallet();
  await fund(w, SOL_MINT, SOL);
  const { id } = await requestWithdrawal(database, w, { mint: SOL_MINT, amount: SOL / 2n }, fakeWithdraw());
  const deps = fakeWithdraw();
  const row = await processWithdrawal(database, id, deps);
  await processWithdrawal(database, id, deps);
  assert.equal(row?.status, "sent");
  assert.equal(row?.dest, w);
  assert.equal(deps.sent, 1);
  assert.equal(await balance(database, acct.out(w), SOL_MINT), 0n);
});

test("a failed send restores the balance (and the token-account rent)", async () => {
  const w = wallet();
  await fund(w, SOL_MINT, SOL);
  await fund(w, BONK, 500n);
  const { id, rent } = await requestWithdrawal(database, w, { mint: BONK, amount: 500n }, fakeWithdraw({ hasAta: false }));
  assert.equal(rent, 2_039_280n);
  assert.equal(await balance(database, acct.user(w), SOL_MINT), SOL - rent);
  await processWithdrawal(database, id, fakeWithdraw({ status: "failed" }));
  assert.equal(await balance(database, acct.user(w), BONK), 500n);
  assert.equal(await balance(database, acct.user(w), SOL_MINT), SOL);
});

test("screening: a blocked wallet is held, an unavailable list leaves the row queued", async () => {
  const w = wallet();
  await fund(w, SOL_MINT, SOL);
  const { id } = await requestWithdrawal(database, w, { mint: SOL_MINT, amount: SOL / 2n }, fakeWithdraw());
  assert.equal((await processWithdrawal(database, id, fakeWithdraw({ blocked: null })))?.status, "queued");
  assert.equal((await processWithdrawal(database, id, fakeWithdraw({ blocked: true })))?.status, "held");
  assert.equal(await runWithdrawals(database, fakeWithdraw()), 0);
});

// ───────────────────────────── reserves

test("reserves: what the vault should hold equals what users, fees and ops account for", async () => {
  const w = wallet();
  await creditDeposit(database, { wallet: w, sig: "d1", tx: solTransferTx(w, 3n * SOL), vault: VAULT, blocked: false });
  const id = await createSwapOrder(database, w, { inMint: SOL_MINT, outMint: BONK, amount: SOL, slippageBps: 100 }, 50);
  await executeOrder(database, id, fakeDeps({ out: 999n }));
  const sol = (await totalsByMint(database)).find((t) => t.mint === SOL_MINT)!;
  assert.equal(sol.liabilities, 2n * SOL);
  assert.equal(sol.expected, sol.liabilities + sol.fees + sol.buyback + sol.treasury + sol.ops);
});

// ───────────────────────────── intents and fees

test("an intent signature works once, for exactly the fields signed", async () => {
  const kp = Keypair.generate();
  const w = kp.publicKey.toBase58();
  const host = "localhost:3709";
  const fields: [string, string][] = [["Sell", "1 SOL"], ["Buy", "BONK"]];
  const sign = (message: string) => bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), kp.secretKey));
  const prepared = await prepareIntent(database, { host, action: "swap", wallet: w, fields });
  const signature = sign(prepared.message);
  const base = { host, action: "swap" as const, wallet: w, nonce: prepared.nonce, expiresAt: prepared.expiresAt, signature };
  assert.equal(await code(verifyIntent(database, { ...base, fields: [["Sell", "100 SOL"], ["Buy", "BONK"]] })), 401);
  // The failed attempt above spent the nonce: even the right fields are now refused.
  assert.equal(await code(verifyIntent(database, { ...base, fields })), 401);
  const fresh = await prepareIntent(database, { host, action: "swap", wallet: w, fields });
  const ok = { ...base, nonce: fresh.nonce, expiresAt: fresh.expiresAt, signature: sign(fresh.message), fields };
  assert.equal(await code(verifyIntent(database, ok)), 200);
  assert.equal(await code(verifyIntent(database, ok)), 401);
  const late = await prepareIntent(database, { host, action: "swap", wallet: w, fields }, Date.now() - 5 * 60_000);
  const lateMsg = intentMessage({ host, action: "swap", wallet: w, fields, nonce: late.nonce, expiresAt: late.expiresAt });
  assert.equal(await code(verifyIntent(database, { ...base, nonce: late.nonce, expiresAt: late.expiresAt, signature: sign(lateMsg), fields })), 401);
});

test("fee tiers: the best tier reached, never above the base fee", () => {
  const tiers = feeTiers("1000000:40,10000000:30,50000000:20");
  assert.equal(feeForHolding(0, tiers, 50), 50);
  assert.equal(feeForHolding(1_000_000, tiers, 50), 40);
  assert.equal(feeForHolding(20_000_000, tiers, 50), 30);
  assert.equal(feeForHolding(1e9, tiers, 50), 20);
  assert.equal(feeForHolding(1e9, feeTiers("10:90"), 50), 50);
});

test("sanctions list parsing keeps only Solana addresses", async () => {
  const { parseList, screen } = await import("../src/server/sanctions.ts");
  const w = wallet();
  assert.deepEqual([...parseList(`${w}\n0xdeadbeef\n\n`)], [w]);
  setSanctionsList([w]);
  assert.equal(await screen(w), true);
  assert.equal(await screen(wallet()), false);
  setSanctionsList(null);
});

test("USDC deposits are read from the vault's token balance change", () => {
  const w = wallet();
  const tx: TxLike = {
    accountKeys: [w, "src", "dst"],
    meta: {
      err: null, fee: 5000, preBalances: [1e9, 2e6, 2e6], postBalances: [1e9 - 5000, 2e6, 2e6],
      preTokenBalances: [{ accountIndex: 2, mint: USDC_MINT, owner: VAULT, uiTokenAmount: { amount: "0" } }],
      postTokenBalances: [{ accountIndex: 2, mint: USDC_MINT, owner: VAULT, uiTokenAmount: { amount: "25000000" } }],
    },
  };
  assert.deepEqual(depositsInTx(tx, w, VAULT), [{ mint: USDC_MINT, amount: 25_000_000n }]);
});
