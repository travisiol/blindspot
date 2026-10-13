/**
 * What a transaction did to the vault, read from its own metadata (pre/post balances), plus the
 * send path the vault uses: sign, hand the signature to the caller *before* sending (so a crash
 * mid-flight leaves a signature to reconcile), send, poll.
 */
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import bs58 from "bs58";
import { SOL_MINT } from "./config.ts";
import { confirmTx, connection, type TxStatus } from "./chain.ts";

export interface TokenBalanceRow {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount: { amount: string };
}

/** The subset of `getTransaction` output this module reads (legacy and v0). */
export interface TxLike {
  meta: {
    err: unknown;
    fee: number;
    preBalances: number[];
    postBalances: number[];
    preTokenBalances?: TokenBalanceRow[] | null;
    postTokenBalances?: TokenBalanceRow[] | null;
    loadedAddresses?: { writable: (string | PublicKey)[]; readonly: (string | PublicKey)[] } | null;
  } | null;
  /** Account keys in order: static keys, then loaded writable, then loaded readonly. */
  accountKeys: string[];
  blockTime?: number | null;
}

export interface VaultDelta {
  ok: boolean;
  feePayer: string;
  /** Network fee of the tx (lamports), paid by the fee payer. */
  fee: bigint;
  /** Change of the vault's own lamports. */
  sol: bigint;
  /** Change of the vault's token holdings per mint (all its token accounts summed). */
  tokens: Map<string, bigint>;
  /** Lamports that moved into (or out of) the vault's token accounts: rent of accounts it opened. */
  rent: bigint;
  blockTime: number | null;
}

export function vaultDelta(tx: TxLike, vault: string): VaultDelta | null {
  if (!tx.meta) return null;
  const keys = tx.accountKeys;
  const index = keys.indexOf(vault);
  const sol = index >= 0 ? BigInt(tx.meta.postBalances[index] ?? 0) - BigInt(tx.meta.preBalances[index] ?? 0) : BigInt(0);
  const tokens = new Map<string, bigint>();
  const vaultTokenAccounts = new Set<number>();
  const add = (rows: TokenBalanceRow[] | null | undefined, sign: bigint) => {
    for (const row of rows ?? []) {
      if (row.owner !== vault) continue;
      vaultTokenAccounts.add(row.accountIndex);
      tokens.set(row.mint, (tokens.get(row.mint) ?? BigInt(0)) + sign * BigInt(row.uiTokenAmount.amount));
    }
  };
  add(tx.meta.preTokenBalances, BigInt(-1));
  add(tx.meta.postTokenBalances, BigInt(1));
  let rent = BigInt(0);
  for (const i of vaultTokenAccounts) rent += BigInt(tx.meta.postBalances[i] ?? 0) - BigInt(tx.meta.preBalances[i] ?? 0);
  for (const [mint, amount] of tokens) if (amount === BigInt(0)) tokens.delete(mint);
  // Wrapped SOL that passed through a temporary account is native SOL for the ledger.
  tokens.delete(SOL_MINT);
  return { ok: tx.meta.err == null, feePayer: keys[0], fee: BigInt(tx.meta.fee), sol, tokens, rent, blockTime: tx.blockTime ?? null };
}

/** Fetches a confirmed transaction and flattens its account keys. Null when not found yet. */
export async function fetchTx(sig: string): Promise<TxLike | null> {
  const tx = await connection().getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
  if (!tx) return null;
  const message = tx.transaction.message;
  const statics = message.staticAccountKeys.map((k) => k.toBase58());
  const loaded = tx.meta?.loadedAddresses;
  const accountKeys = [...statics, ...(loaded?.writable ?? []).map(String), ...(loaded?.readonly ?? []).map(String)];
  return {
    meta: tx.meta
      ? {
          err: tx.meta.err,
          fee: tx.meta.fee,
          preBalances: tx.meta.preBalances,
          postBalances: tx.meta.postBalances,
          preTokenBalances: tx.meta.preTokenBalances as TokenBalanceRow[] | null | undefined,
          postTokenBalances: tx.meta.postTokenBalances as TokenBalanceRow[] | null | undefined,
        }
      : null,
    accountKeys,
    blockTime: tx.blockTime ?? null,
  };
}

/**
 * Swap result from the vault's point of view. `inNet` is what the quote sold (ExactIn).
 * Output: tokens credited, or for SOL the lamport gain plus what the tx itself cost the vault.
 * Gas: network fee + rent of token accounts the vault opened.
 */
export function swapOutcome(delta: VaultDelta, input: { inMint: string; outMint: string; inNet: bigint }): { out: bigint; gas: bigint } {
  const gas = delta.fee + delta.rent;
  if (input.outMint === SOL_MINT) return { out: delta.sol + gas, gas };
  const out = delta.tokens.get(input.outMint) ?? BigInt(0);
  return { out, gas };
}

/** "rejected": refused at preflight, never reached the chain (the signature does not exist on chain). */
export type SendOutcome = { sig: string; lastValidBlockHeight: number; status: TxStatus | "rejected" };

/**
 * Signs `tx` with the vault, calls `beforeSend(sig, lastValidBlockHeight)` (persist it), sends and
 * polls. A preflight rejection returns status "rejected" — nothing reached the chain.
 */
export async function signAndSend(
  vault: Keypair,
  build: () => Promise<{ tx: VersionedTransaction | Transaction; lastValidBlockHeight: number }>,
  beforeSend: (sig: string, lastValidBlockHeight: number) => Promise<void>,
): Promise<SendOutcome> {
  const { tx, lastValidBlockHeight } = await build();
  let raw: Uint8Array;
  let sig: string;
  if (tx instanceof VersionedTransaction) {
    tx.sign([vault]);
    raw = tx.serialize();
    sig = bs58.encode(tx.signatures[0]);
  } else {
    tx.sign(vault);
    raw = tx.serialize();
    sig = bs58.encode(tx.signature!);
  }
  await beforeSend(sig, lastValidBlockHeight);
  try {
    await connection().sendRawTransaction(raw, { skipPreflight: false, maxRetries: 3 });
  } catch (error) {
    console.error("[blindspot] send rejected:", error instanceof Error ? error.message.slice(0, 160) : "unknown");
    return { sig, lastValidBlockHeight, status: "rejected" };
  }
  return { sig, lastValidBlockHeight, status: await confirmTx(sig, 40_000) };
}

/** Legacy transaction paid by the vault. */
export async function vaultTransaction(vault: PublicKey, instructions: TransactionInstruction[]) {
  const { blockhash, lastValidBlockHeight } = await connection().getLatestBlockhash("confirmed");
  return { tx: new Transaction({ feePayer: vault, blockhash, lastValidBlockHeight }).add(...instructions), lastValidBlockHeight };
}

export function solTransferIx(from: PublicKey, to: PublicKey, lamports: bigint) {
  return SystemProgram.transfer({ fromPubkey: from, toPubkey: to, lamports });
}

/**
 * Where a signature stands after the fact: landed (ok / failed) or expired (its blockhash can no
 * longer land), else still unknown.
 */
export async function settleStatus(sig: string, lastValidBlockHeight: number | null): Promise<"confirmed" | "failed" | "expired" | "unknown"> {
  const conn = connection();
  const status = (await conn.getSignatureStatuses([sig], { searchTransactionHistory: true })).value[0];
  if (status?.err) return "failed";
  if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") return "confirmed";
  if (lastValidBlockHeight != null) {
    const height = await conn.getBlockHeight("confirmed");
    if (height > lastValidBlockHeight + 10) return "expired";
  }
  return "unknown";
}
