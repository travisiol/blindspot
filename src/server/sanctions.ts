/**
 * Address screening against the OFAC SDN list of Solana addresses.
 * Source: `SANCTIONS_LIST_URL` (default: the daily extract of the SDN XML published at
 * github.com/0xB10C/ofac-sanctioned-digital-currency-addresses, branch `lists`), one address per
 * line, cached 6 h per instance. `EXTRA_BLOCKED_ADDRESSES` (comma-separated) is always added.
 *
 * `screen()` returns null when the list could not be loaded: callers fail closed for new money in
 * (deposits) and hold money out (withdrawals) until it loads.
 */
const DEFAULT_URL = "https://raw.githubusercontent.com/0xB10C/ofac-sanctioned-digital-currency-addresses/lists/sanctioned_addresses_SOL.txt";
const TTL_MS = 6 * 3600_000;

let cache: { at: number; set: Set<string> } | null = null;
let inflight: Promise<Set<string> | null> | null = null;

export function parseList(text: string): Set<string> {
  return new Set(
    text
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter((s) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s)),
  );
}

function extra(): Set<string> {
  return parseList(process.env["EXTRA_BLOCKED_ADDRESSES"] ?? "");
}

async function load(): Promise<Set<string> | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.set;
  if (!inflight) {
    inflight = (async () => {
      try {
        const url = process.env["SANCTIONS_LIST_URL"]?.trim() || DEFAULT_URL;
        const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const set = parseList(await response.text());
        cache = { at: Date.now(), set };
        return set;
      } catch (error) {
        console.error("[blindspot] sanctions list unavailable:", error instanceof Error ? error.message : "unknown");
        return cache?.set ?? null;
      } finally {
        inflight = null;
      }
    })();
  }
  return inflight;
}

/** true = blocked, false = clear, null = list unavailable (decide conservatively). */
export async function screen(address: string): Promise<boolean | null> {
  if (extra().has(address)) return true;
  const list = await load();
  if (!list) return null;
  return list.has(address);
}

/** Tests: preload a list. */
export function setSanctionsList(addresses: string[] | null) {
  cache = addresses ? { at: Date.now(), set: new Set(addresses) } : null;
}
