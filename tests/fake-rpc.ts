/**
 * An in-process Solana JSON-RPC server with canned accounts, for tests and for scripts/play-ui.mjs.
 * Answers the methods the base uses, in the shapes @solana/web3.js 1.98 validates. Listens on an
 * OS-assigned port (0) so it never claims a fixed port.
 *
 *   node tests/fake-rpc.ts            -> prints {"url": "..."} and serves until killed
 */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import bs58 from "bs58";
import { Transaction } from "@solana/web3.js";

export interface FakeAccount {
  lamports: number;
  owner: string;
  data?: Buffer;
}

export interface FakeState {
  slot: number;
  blockhash: string;
  accounts: Map<string, FakeAccount>;
  largest: Map<string, { address: string; amount: bigint; decimals: number }[]>;
  supply: Map<string, { amount: bigint; decimals: number }>;
  sent: { signature: string; raw: Buffer }[];
  calls: string[];
  /** Landed legacy transactions (system transfers applied), served by getTransaction. */
  txs: Map<string, LandedTx>;
}

export interface LandedTx {
  signature: string;
  slot: number;
  blockTime: number;
  message: { accountKeys: string[]; header: { numRequiredSignatures: number; numReadonlySignedAccounts: number; numReadonlyUnsignedAccounts: number }; recentBlockhash: string; instructions: { programIdIndex: number; accounts: number[]; data: string }[] };
  meta: { err: null; fee: number; preBalances: number[]; postBalances: number[]; preTokenBalances: []; postTokenBalances: []; innerInstructions: []; logMessages: []; status: { Ok: null }; loadedAddresses: { writable: []; readonly: [] } };
}

export const SYSTEM = "11111111111111111111111111111111";

/** A 165-byte SPL token account: mint, owner, amount (offset 64). */
export function tokenAccountData(mint: string, owner: string, amount: bigint): Buffer {
  const b = Buffer.alloc(165);
  Buffer.from(bs58.decode(mint)).copy(b, 0);
  Buffer.from(bs58.decode(owner)).copy(b, 32);
  b.writeBigUInt64LE(amount, 64);
  b[108] = 1; // initialized
  return b;
}

/** An 82-byte mint account with `decimals` at offset 44. */
export function mintData(decimals: number, supply: bigint): Buffer {
  const b = Buffer.alloc(82);
  b.writeBigUInt64LE(supply, 36);
  b[44] = decimals;
  b[45] = 1;
  return b;
}

export function newState(): FakeState {
  return {
    slot: 1000,
    blockhash: "GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi",
    accounts: new Map(),
    largest: new Map(),
    supply: new Map(),
    sent: [],
    calls: [],
    txs: new Map(),
  };
}

function encodeAccount(a: FakeAccount | undefined) {
  if (!a) return null;
  const data = a.data ?? Buffer.alloc(0);
  return { data: [data.toString("base64"), "base64"], executable: false, lamports: a.lamports, owner: a.owner, rentEpoch: 0, space: data.length };
}

/** First signature of a wire transaction = its id. */
function signatureOf(raw: Buffer): string {
  return bs58.encode(raw.subarray(1, 65));
}

type Params = unknown[];

export function answer(state: FakeState, method: string, params: Params): { result?: unknown; error?: { code: number; message: string } } {
  state.calls.push(method);
  const context = { slot: state.slot, apiVersion: "2.2.0" };
  switch (method) {
    case "getHealth":
      return { result: "ok" };
    case "getSlot":
      return { result: state.slot };
    case "getBlockHeight":
      return { result: state.slot };
    case "getBalance":
      return { result: { context, value: state.accounts.get(String(params[0]))?.lamports ?? 0 } };
    case "getAccountInfo":
      return { result: { context, value: encodeAccount(state.accounts.get(String(params[0]))) } };
    case "getMultipleAccounts":
      return { result: { context, value: (params[0] as string[]).map((k) => encodeAccount(state.accounts.get(k))) } };
    case "getTokenAccountBalance": {
      const a = state.accounts.get(String(params[0]));
      if (!a?.data) return { error: { code: -32602, message: "Invalid param: could not find account" } };
      const amount = a.data.readBigUInt64LE(64);
      const mint = bs58.encode(a.data.subarray(0, 32));
      const decimals = state.supply.get(mint)?.decimals ?? 6;
      return { result: { context, value: { amount: amount.toString(), decimals, uiAmount: Number(amount) / 10 ** decimals, uiAmountString: String(Number(amount) / 10 ** decimals) } } };
    }
    case "getTokenSupply": {
      const s = state.supply.get(String(params[0]));
      if (!s) return { error: { code: -32602, message: "Invalid param: not a Token mint" } };
      return { result: { context, value: { amount: s.amount.toString(), decimals: s.decimals, uiAmount: Number(s.amount) / 10 ** s.decimals, uiAmountString: String(Number(s.amount) / 10 ** s.decimals) } } };
    }
    case "getTokenLargestAccounts": {
      const list = state.largest.get(String(params[0])) ?? [];
      return {
        result: {
          context,
          value: list.map((l) => ({ address: l.address, amount: l.amount.toString(), decimals: l.decimals, uiAmount: Number(l.amount) / 10 ** l.decimals, uiAmountString: String(Number(l.amount) / 10 ** l.decimals) })),
        },
      };
    }
    case "getTokenAccountsByOwner":
      return { result: { context, value: [] } };
    case "getLatestBlockhash":
      return { result: { context, value: { blockhash: state.blockhash, lastValidBlockHeight: state.slot + 150 } } };
    case "sendTransaction": {
      const raw = Buffer.from(String(params[0]), "base64");
      const signature = signatureOf(raw);
      const landed = applyLegacy(state, raw, signature);
      if ("error" in landed) return { error: { code: -32002, message: landed.error } };
      state.sent.push({ signature, raw });
      return { result: signature };
    }
    case "getTransaction": {
      const tx = state.txs.get(String(params[0]));
      return { result: tx ? { slot: tx.slot, blockTime: tx.blockTime, transaction: { signatures: [tx.signature], message: tx.message }, meta: tx.meta, version: "legacy" } : null };
    }
    case "getSignaturesForAddress": {
      const address = String(params[0]);
      const list = [...state.txs.values()].filter((t) => t.message.accountKeys.includes(address)).reverse();
      return { result: list.map((t) => ({ signature: t.signature, slot: t.slot, err: null, memo: null, blockTime: t.blockTime, confirmationStatus: "confirmed" })) };
    }
    case "getSignatureStatuses": {
      const sigs = params[0] as string[];
      return {
        result: {
          context,
          value: sigs.map((s) => (state.sent.some((t) => t.signature === s) ? { slot: state.slot, confirmations: 1, err: null, status: { Ok: null }, confirmationStatus: "confirmed" } : null)),
        },
      };
    }
    default:
      return { error: { code: -32601, message: `Method not found: ${method}` } };
  }
}

/**
 * Lands a legacy transaction: applies System `Transfer` instructions and the 5000-lamport fee, like
 * a validator would for a plain transfer. Versioned (v0) transactions are rejected the way an
 * unfunded payer is at preflight.
 */
function applyLegacy(state: FakeState, raw: Buffer, signature: string): { ok: true } | { error: string } {
  if ((raw[1 + raw[0] * 64] & 0x80) !== 0) return { error: "Transaction simulation failed: Attempt to debit an account but found no record of a prior credit." };
  let tx: Transaction;
  try {
    tx = Transaction.from(raw);
  } catch {
    return { error: "failed to deserialize transaction" };
  }
  const message = tx.compileMessage();
  const keys = message.accountKeys.map((k) => k.toBase58());
  const pre = keys.map((k) => state.accounts.get(k)?.lamports ?? 0);
  const post = [...pre];
  const fee = 5000;
  post[0] -= fee;
  for (const ix of message.instructions) {
    if (keys[ix.programIdIndex] !== SYSTEM) continue;
    const data = Buffer.from(bs58.decode(ix.data));
    if (data.readUInt32LE(0) !== 2) continue;
    const lamports = Number(data.readBigUInt64LE(4));
    post[ix.accounts[0]] -= lamports;
    post[ix.accounts[1]] += lamports;
  }
  if (post.some((v) => v < 0)) return { error: "Transaction simulation failed: Attempt to debit an account but found no record of a prior credit." };
  keys.forEach((k, i) => {
    if (post[i] !== pre[i]) state.accounts.set(k, { ...(state.accounts.get(k) ?? { owner: SYSTEM }), lamports: post[i] });
  });
  state.slot += 1;
  state.txs.set(signature, {
    signature,
    slot: state.slot,
    blockTime: Math.floor(Date.now() / 1000),
    message: {
      accountKeys: keys,
      header: message.header,
      recentBlockhash: message.recentBlockhash,
      instructions: message.instructions.map((ix) => ({ programIdIndex: ix.programIdIndex, accounts: ix.accounts, data: ix.data })),
    },
    meta: { err: null, fee, preBalances: pre, postBalances: post, preTokenBalances: [], postTokenBalances: [], innerInstructions: [], logMessages: [], status: { Ok: null }, loadedAddresses: { writable: [], readonly: [] } },
  });
  return { ok: true };
}

export async function startFakeRpc(state: FakeState = newState()): Promise<{ url: string; state: FakeState; close: () => Promise<void> }> {
  const server = createServer((req, res) => {
    // The stub wallet sends from the page (another origin).
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("access-control-allow-headers", "content-type, solana-client");
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        res.writeHead(400).end();
        return;
      }
      const one = (call: { id?: unknown; method: string; params?: Params }) => ({ jsonrpc: "2.0", id: call.id ?? null, ...answer(state, call.method, call.params ?? []) });
      const out = Array.isArray(parsed) ? parsed.map(one) : one(parsed as { method: string });
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(out));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    state,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

// Standalone mode for scripts/play-ui.mjs: seeds a wallet balance given as FAKE_WALLET (+ FAKE_LAMPORTS).
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop() ?? "")) {
  const state = newState();
  const wallet = process.env.FAKE_WALLET;
  if (wallet) state.accounts.set(wallet, { lamports: Number(process.env.FAKE_LAMPORTS ?? 2_500_000_000), owner: SYSTEM });
  const { url } = await startFakeRpc(state);
  console.log(JSON.stringify({ url }));
}
