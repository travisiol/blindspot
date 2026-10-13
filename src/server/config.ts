/**
 * Vault settings, all from env (read at call time so tests and scripts can change them).
 * Amounts are whole units in env (SOL, USDC, tokens) and base units in code.
 */
import { WSOL_MINT } from "../config/solana.ts";
import { parseSecretKey } from "./keys.ts";

export const SOL_MINT = WSOL_MINT;
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

/** Assets a wallet can deposit. Anything bought inside the vault can be withdrawn. */
export const DEPOSIT_ASSETS = [
  { mint: SOL_MINT, symbol: "SOL", decimals: 9 },
  { mint: USDC_MINT, symbol: "USDC", decimals: 6 },
] as const;

function num(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

/** Whole units → base units without float drift ("1.5", 9 → 1500000000n). */
export function toBaseUnits(value: string | number, decimals: number): bigint {
  const text = typeof value === "number" ? value.toFixed(decimals) : value.trim();
  if (!/^\d+(\.\d+)?$/.test(text)) throw new Error("Not a decimal amount.");
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole) * BigInt(10) ** BigInt(decimals) + BigInt((fraction + "0".repeat(decimals)).slice(0, decimals) || "0");
}

export function vaultKeypair() {
  return parseSecretKey(process.env["VAULT_SECRET_KEY"]);
}

/** Public vault address, or null until VAULT_SECRET_KEY is set. Safe to show. */
export function vaultAddress(): string | null {
  return vaultKeypair()?.publicKey.toBase58() ?? null;
}

/** Base swap fee in basis points (default 50 = 0.5 %). */
export function baseFeeBps(): number {
  return Math.min(1000, Math.round(num("FEE_BPS", 50)));
}

export interface FeeTier {
  /** Whole $BLINDSPOT held (wallet + vault balance). */
  minTokens: number;
  feeBps: number;
}

/** `FEE_TIERS="1000000:40,10000000:30,50000000:20"` → sorted highest threshold first. */
export function feeTiers(raw = process.env["FEE_TIERS"] ?? "1000000:40,10000000:30,50000000:20"): FeeTier[] {
  return raw
    .split(",")
    .map((part) => part.split(":").map((s) => Number(s.trim())))
    .filter(([min, bps]) => Number.isFinite(min) && Number.isFinite(bps) && min > 0 && bps >= 0)
    .map(([minTokens, feeBps]) => ({ minTokens, feeBps: Math.round(feeBps) }))
    .sort((a, b) => b.minTokens - a.minTokens);
}

/** Share of every fee that buys $BLINDSPOT, in basis points (default 5000 = 50 %). */
export function buybackShareBps(): number {
  return Math.min(10_000, Math.round(num("BUYBACK_SHARE_BPS", 5000)));
}

/** A buyback swap runs once its pool is worth at least this much (USD). */
export function buybackMinUsd(): number {
  return num("BUYBACK_MIN_USD", 5);
}

export interface Caps {
  perDeposit: bigint;
  perAccount: bigint;
}

/** Deposit caps per asset: `CAP_DEPOSIT_SOL`, `CAP_ACCOUNT_SOL`, `CAP_DEPOSIT_USDC`, `CAP_ACCOUNT_USDC`. */
export function capsFor(mint: string): Caps | null {
  if (mint === SOL_MINT) return { perDeposit: toBaseUnits(num("CAP_DEPOSIT_SOL", 25), 9), perAccount: toBaseUnits(num("CAP_ACCOUNT_SOL", 100), 9) };
  if (mint === USDC_MINT) return { perDeposit: toBaseUnits(num("CAP_DEPOSIT_USDC", 2500), 6), perAccount: toBaseUnits(num("CAP_ACCOUNT_USDC", 10000), 6) };
  return null;
}

export const SLIPPAGE = { defaultBps: 100, maxBps: 1500 } as const;

export const SPLIT = { minParts: 2, maxParts: 10, minWindowMin: 5, maxWindowMin: 240 } as const;

/** Lamports a withdrawal costs the user when their token account must be created (SPL rent-exempt minimum). */
export const ATA_RENT_LAMPORTS = BigInt(2_039_280);

/** Minimum SOL withdrawal (avoids dust sends paid by the vault). */
export const MIN_WITHDRAW_LAMPORTS = BigInt(1_000_000);

/** Cron routes accept `Authorization: Bearer $CRON_SECRET`. */
export function cronSecret(): string | null {
  return process.env["CRON_SECRET"]?.trim() || null;
}
