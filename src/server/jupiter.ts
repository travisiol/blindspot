/**
 * Jupiter: quotes, swap transactions, token metadata and prices.
 * `JUPITER_API_URL` (default https://lite-api.jup.ag, keyless) and optional `JUPITER_API_KEY`
 * (sent as x-api-key, for https://api.jup.ag). Verified live on 2026-10-13:
 * /swap/v1/quote, /tokens/v2/search (comma-separated mints), /price/v3.
 */
import { cached } from "./chain.ts";
import { HttpError } from "./errors.ts";

const BASE = () => (process.env["JUPITER_API_URL"]?.trim() || "https://lite-api.jup.ag").replace(/\/$/, "");

function headers(json = false): Record<string, string> {
  const h: Record<string, string> = { accept: "application/json" };
  const key = process.env["JUPITER_API_KEY"]?.trim();
  if (key) h["x-api-key"] = key;
  if (json) h["content-type"] = "application/json";
  return h;
}

async function call<T>(path: string, init?: RequestInit, timeoutMs = 12_000): Promise<T> {
  let response = await fetchOnce(path, init, timeoutMs);
  // One retry on a transient upstream error (502/503/504 happen under load).
  if (response.status >= 502 && response.status <= 504) {
    await new Promise((r) => setTimeout(r, 600));
    response = await fetchOnce(path, init, timeoutMs);
  }
  return readBody<T>(path, response);
}

function fetchOnce(path: string, init: RequestInit | undefined, timeoutMs: number) {
  return fetch(`${BASE()}${path}`, { ...init, headers: { ...headers(), ...(init?.headers as Record<string, string> | undefined) }, signal: AbortSignal.timeout(timeoutMs) });
}

async function readBody<T>(path: string, response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as (T & { error?: string; errorCode?: string }) | null;
  if (!response.ok || !body || (body as { error?: string }).error) {
    const code = (body as { errorCode?: string } | null)?.errorCode ?? `HTTP_${response.status}`;
    console.error("[blindspot] jupiter", path.split("?")[0], code);
    if (code === "TOKEN_NOT_TRADABLE") throw new HttpError(400, "That token can't be traded right now.");
    if (code === "COULD_NOT_FIND_ANY_ROUTE" || code === "NO_ROUTES_FOUND") throw new HttpError(400, "No route for this pair right now.");
    if (response.status === 429) throw new HttpError(429, "Too many requests right now. Try again in a few seconds.");
    throw new HttpError(502, "Quotes are unavailable for a moment. Try again.");
  }
  return body;
}

export interface JupQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: { swapInfo: { label?: string } }[];
  swapUsdValue?: string;
  [key: string]: unknown;
}

export async function jupQuote(input: { inputMint: string; outputMint: string; amount: bigint; slippageBps: number }): Promise<JupQuote> {
  if (input.amount <= BigInt(0)) throw new HttpError(400, "Enter an amount above zero.");
  const qs = new URLSearchParams({
    inputMint: input.inputMint,
    outputMint: input.outputMint,
    amount: input.amount.toString(),
    slippageBps: String(input.slippageBps),
    swapMode: "ExactIn",
  });
  return call<JupQuote>(`/swap/v1/quote?${qs}`);
}

/** Serialized (base64) versioned transaction that swaps for `userPublicKey`; it signs as fee payer. */
export async function jupSwapTransaction(quote: JupQuote, userPublicKey: string): Promise<{ swapTransaction: string; lastValidBlockHeight: number }> {
  return call(`/swap/v1/swap`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: 300_000, priorityLevel: "high" } },
    }),
  }, 15_000);
}

export interface TokenMeta {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  icon: string | null;
  program: string | null;
  usdPrice: number | null;
  mcap: number | null;
  verified: boolean;
}

type RawToken = { id: string; symbol?: string; name?: string; decimals?: number; icon?: string; tokenProgram?: string; usdPrice?: number; mcap?: number; isVerified?: boolean };

function toMeta(t: RawToken): TokenMeta {
  return {
    mint: t.id,
    symbol: t.symbol || t.id.slice(0, 4),
    name: t.name || "",
    decimals: Number(t.decimals ?? 0),
    icon: t.icon || null,
    program: t.tokenProgram || null,
    usdPrice: typeof t.usdPrice === "number" ? t.usdPrice : null,
    mcap: typeof t.mcap === "number" ? t.mcap : null,
    verified: Boolean(t.isVerified),
  };
}

export async function searchTokens(query: string): Promise<TokenMeta[]> {
  const q = query.trim().slice(0, 64);
  if (!q) return [];
  return cached(`jup-search:${q.toLowerCase()}`, 30_000, async () => {
    const rows = await call<RawToken[]>(`/tokens/v2/search?query=${encodeURIComponent(q)}`);
    return rows.slice(0, 12).map(toMeta);
  });
}

const metaCache = new Map<string, { at: number; meta: TokenMeta }>();
const META_TTL = 10 * 60_000;

/** Metadata for up to ~50 mints (cached 10 min; prices inside are informational only). */
export async function tokenMetas(mints: string[]): Promise<Map<string, TokenMeta>> {
  const out = new Map<string, TokenMeta>();
  const missing: string[] = [];
  for (const mint of new Set(mints)) {
    const hit = metaCache.get(mint);
    if (hit && Date.now() - hit.at < META_TTL) out.set(mint, hit.meta);
    else missing.push(mint);
  }
  for (let i = 0; i < missing.length; i += 50) {
    const chunk = missing.slice(i, i + 50);
    try {
      const rows = await call<RawToken[]>(`/tokens/v2/search?query=${chunk.join(",")}`);
      for (const row of rows) {
        const meta = toMeta(row);
        metaCache.set(meta.mint, { at: Date.now(), meta });
        out.set(meta.mint, meta);
      }
    } catch {
      // unknown tokens fall back to the on-chain decimals where the caller needs them
    }
  }
  return out;
}

export async function tokenMeta(mint: string): Promise<TokenMeta | null> {
  return (await tokenMetas([mint])).get(mint) ?? null;
}

/** USD prices (cached 30 s). Missing mints are absent from the map — never guessed. */
export async function usdPrices(mints: string[]): Promise<Map<string, number>> {
  const unique = [...new Set(mints)].sort();
  if (unique.length === 0) return new Map();
  return cached(`jup-price:${unique.join(",")}`, 30_000, async () => {
    const out = new Map<string, number>();
    for (let i = 0; i < unique.length; i += 50) {
      const chunk = unique.slice(i, i + 50);
      try {
        const rows = await call<Record<string, { usdPrice?: number }>>(`/price/v3?ids=${chunk.join(",")}`);
        for (const [mint, row] of Object.entries(rows)) if (typeof row?.usdPrice === "number") out.set(mint, row.usdPrice);
      } catch {
        // no price: the UI shows a dash
      }
    }
    return out;
  });
}
