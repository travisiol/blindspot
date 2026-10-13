/**
 * Parses action parameters from the client and turns them into the lines the wallet signs.
 * Built on the server both when the message is issued and when the signature is checked.
 */
import { formatUnits, isBase58Address } from "../lib/format.ts";
import type { IntentAction } from "../lib/intent-message.ts";
import { DEPOSIT_ASSETS, SLIPPAGE, SPLIT, toBaseUnits } from "./config.ts";
import { mintInfo } from "./chain.ts";
import { HttpError } from "./errors.ts";
import { tokenMeta } from "./jupiter.ts";

export interface TokenRef {
  mint: string;
  symbol: string;
  decimals: number;
}

export async function tokenRef(mint: unknown): Promise<TokenRef> {
  if (!isBase58Address(mint)) throw new HttpError(400, "Unknown token.");
  const known = DEPOSIT_ASSETS.find((a) => a.mint === mint);
  if (known) return { mint, symbol: known.symbol, decimals: known.decimals };
  const meta = await tokenMeta(mint).catch(() => null);
  if (meta) return { mint, symbol: meta.symbol, decimals: meta.decimals };
  try {
    const { decimals } = await mintInfo(mint);
    return { mint, symbol: mint.slice(0, 4), decimals };
  } catch {
    throw new HttpError(400, "Unknown token.");
  }
}

export function parseAmount(value: unknown, decimals: number): bigint {
  if (typeof value !== "string" && typeof value !== "number") throw new HttpError(400, "Enter an amount.");
  const text = String(value).trim();
  if (!/^\d+(\.\d+)?$/.test(text)) throw new HttpError(400, "Enter a valid amount.");
  const [, fraction = ""] = text.split(".");
  if (fraction.length > decimals) throw new HttpError(400, `This token has ${decimals} decimals at most.`);
  const amount = toBaseUnits(text, decimals);
  if (amount <= BigInt(0)) throw new HttpError(400, "Enter an amount above zero.");
  return amount;
}

function parseInt10(value: unknown, min: number, max: number, label: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `${label} must be between ${min} and ${max}.`);
  return n;
}

const fmt = (amount: bigint, t: TokenRef) => `${formatUnits(amount, t.decimals, t.decimals)} ${t.symbol}`;

export interface ParsedSwap {
  tin: TokenRef;
  tout: TokenRef;
  amount: bigint;
  slippageBps: number;
  minOut: bigint | null;
  parts?: number;
  windowMin?: number;
}

export async function parseSwap(params: Record<string, unknown>, split: boolean): Promise<ParsedSwap> {
  const [tin, tout] = await Promise.all([tokenRef(params.inMint), tokenRef(params.outMint)]);
  if (tin.mint === tout.mint) throw new HttpError(400, "Pick two different tokens.");
  const amount = parseAmount(params.amount, tin.decimals);
  const slippageBps = parseInt10(params.slippageBps ?? SLIPPAGE.defaultBps, 10, SLIPPAGE.maxBps, "Slippage (bps)");
  let minOut: bigint | null = null;
  if (!split) {
    if (typeof params.minOut !== "string" || !/^\d+$/.test(params.minOut)) throw new HttpError(400, "Get a quote first.");
    minOut = BigInt(params.minOut);
  }
  const out: ParsedSwap = { tin, tout, amount, slippageBps, minOut };
  if (split) {
    out.parts = parseInt10(params.parts, SPLIT.minParts, SPLIT.maxParts, "Parts");
    out.windowMin = parseInt10(params.windowMin, SPLIT.minWindowMin, SPLIT.maxWindowMin, "Window (minutes)");
  }
  return out;
}

export function swapFields(p: ParsedSwap): [string, string][] {
  const fields: [string, string][] = [
    ["Sell", `${fmt(p.amount, p.tin)} (${p.tin.mint})`],
    ["Buy", `${p.tout.symbol} (${p.tout.mint})`],
  ];
  if (p.minOut != null) fields.push(["Minimum received", fmt(p.minOut, p.tout)]);
  fields.push(["Max slippage", `${(p.slippageBps / 100).toFixed(2)}%`]);
  if (p.parts) fields.push(["Parts", String(p.parts)], ["Window", `${p.windowMin} minutes`]);
  return fields;
}

export interface ParsedWithdraw {
  token: TokenRef;
  amount: bigint;
}

export async function parseWithdraw(params: Record<string, unknown>): Promise<ParsedWithdraw> {
  const token = await tokenRef(params.mint);
  return { token, amount: parseAmount(params.amount, token.decimals) };
}

export function withdrawFields(p: ParsedWithdraw, wallet: string): [string, string][] {
  return [
    ["Amount", `${fmt(p.amount, p.token)} (${p.token.mint})`],
    ["To", `${wallet} (your connected wallet)`],
  ];
}

export function cancelFields(orderId: unknown): [string, string][] {
  if (typeof orderId !== "string" || !/^[0-9a-f-]{36}$/.test(orderId)) throw new HttpError(400, "Order not found.");
  return [["Order", orderId]];
}

/** The fields of any action, from raw params. */
export async function fieldsFor(action: IntentAction, params: Record<string, unknown>, wallet: string): Promise<[string, string][]> {
  if (action === "swap") return swapFields(await parseSwap(params, false));
  if (action === "split") return swapFields(await parseSwap(params, true));
  if (action === "withdraw") return withdrawFields(await parseWithdraw(params), wallet);
  return cancelFields(params.orderId);
}
