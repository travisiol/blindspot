import { serverMint } from "../config/solana.ts";
import { baseFeeBps, feeTiers, type FeeTier } from "./config.ts";
import type { Queryable } from "./db.ts";
import { acct, balance } from "./ledger.ts";
import { mintInfo, tokenBalance } from "./chain.ts";

/** Fee for a holder of `tokens` whole $BLINDSPOT: the best tier reached, never above the base fee. */
export function feeForHolding(tokens: number, tiers: FeeTier[] = feeTiers(), base = baseFeeBps()): number {
  const tier = tiers.find((t) => tokens >= t.minTokens);
  return tier ? Math.min(base, tier.feeBps) : base;
}

export interface FeeQuote {
  feeBps: number;
  baseBps: number;
  heldTokens: number;
}

/** $BLINDSPOT counted: in the wallet (read on chain) plus held inside the vault account. */
export async function feeFor(q: Queryable, wallet: string | null): Promise<FeeQuote> {
  const base = baseFeeBps();
  const mint = serverMint();
  if (!wallet || !mint) return { feeBps: base, baseBps: base, heldTokens: 0 };
  try {
    const [{ decimals }, onChain, inVault] = await Promise.all([mintInfo(mint), tokenBalance(wallet, mint), balance(q, acct.user(wallet), mint)]);
    const heldTokens = Number(onChain.amount + inVault) / 10 ** decimals;
    return { feeBps: feeForHolding(heldTokens), baseBps: base, heldTokens };
  } catch {
    return { feeBps: base, baseBps: base, heldTokens: 0 };
  }
}

/** Splits a fee into the platform share and the buyback share (rounding favours the buyback). */
export function splitFee(fee: bigint, buybackBps: number): { keep: bigint; buyback: bigint } {
  const keep = (fee * BigInt(10_000 - buybackBps)) / BigInt(10_000);
  return { keep, buyback: fee - keep };
}

export function feeOn(amount: bigint, bps: number): bigint {
  return (amount * BigInt(bps)) / BigInt(10_000);
}
