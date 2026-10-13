/**
 * Public reads: the reserves check (on-chain vault balances vs the ledger) and the vault's own
 * on-chain activity — what any tracker sees.
 */
import { PublicKey } from "@solana/web3.js";
import { DEPOSIT_ASSETS, SOL_MINT, vaultAddress } from "./config.ts";
import { cached, connection, solBalance, tokenBalance } from "./chain.ts";
import type { Db } from "./db.ts";
import { totalsByMint } from "./ledger.ts";
import { tokenMetas } from "./jupiter.ts";
import { fetchTx, vaultDelta } from "./vaulttx.ts";

export interface ReserveRow {
  mint: string;
  symbol: string;
  decimals: number;
  icon: string | null;
  onChain: string;
  owed: string;
  platform: string;
  expected: string;
  /** onChain − owed: ≥ 0 means every user balance is covered. */
  surplus: string;
}

export interface Reserves {
  vault: string | null;
  rows: ReserveRow[];
  checkedAt: string;
}

export async function reserves(database: Db): Promise<Reserves> {
  const vault = vaultAddress();
  const totals = await totalsByMint(database);
  const mints = [...new Set([SOL_MINT, ...DEPOSIT_ASSETS.map((a) => a.mint), ...totals.map((t) => t.mint)])];
  const metas = await tokenMetas(mints);
  const rows = await Promise.all(
    mints.map(async (mint) => {
      const t = totals.find((x) => x.mint === mint);
      const owed = t?.liabilities ?? BigInt(0);
      const platform = (t?.fees ?? BigInt(0)) + (t?.buyback ?? BigInt(0)) + (t?.treasury ?? BigInt(0)) + (t?.ops ?? BigInt(0));
      let onChain = BigInt(0);
      if (vault) onChain = mint === SOL_MINT ? await solBalance(vault) : (await tokenBalance(vault, mint)).amount;
      const meta = metas.get(mint);
      const asset = DEPOSIT_ASSETS.find((a) => a.mint === mint);
      return {
        mint,
        symbol: meta?.symbol ?? asset?.symbol ?? mint.slice(0, 4),
        decimals: meta?.decimals ?? asset?.decimals ?? 0,
        icon: meta?.icon ?? null,
        onChain: onChain.toString(),
        owed: owed.toString(),
        platform: platform.toString(),
        expected: (t?.expected ?? BigInt(0)).toString(),
        surplus: (onChain - owed).toString(),
      };
    }),
  );
  return { vault, rows, checkedAt: new Date().toISOString() };
}

export interface ActivityLeg {
  mint: string;
  amount: string;
}

export interface ActivityItem {
  sig: string;
  time: number | null;
  kind: "swap" | "in" | "out" | "other";
  legs: ActivityLeg[];
}

/** The vault's latest transactions as a tracker reads them: every swap is the vault's. */
export async function vaultActivity(limit = 10): Promise<{ vault: string | null; items: ActivityItem[] }> {
  const vault = vaultAddress();
  if (!vault) return { vault: null, items: [] };
  return cached(`activity:${vault}:${limit}`, 30_000, async () => {
    const sigs = await connection().getSignaturesForAddress(new PublicKey(vault), { limit }, "confirmed");
    const items: ActivityItem[] = [];
    for (const s of sigs) {
      if (s.err) continue;
      const tx = await fetchTx(s.signature).catch(() => null);
      const d = tx ? vaultDelta(tx, vault) : null;
      if (!d) continue;
      const legs: ActivityLeg[] = [];
      const ownTx = d.feePayer === vault;
      // The vault's own SOL movement, net of what the transaction itself cost it.
      const sol = ownTx ? d.sol + d.fee + d.rent : d.sol;
      if (sol !== BigInt(0)) legs.push({ mint: SOL_MINT, amount: sol.toString() });
      for (const [mint, amount] of d.tokens) legs.push({ mint, amount: amount.toString() });
      const neg = legs.some((l) => l.amount.startsWith("-"));
      const pos = legs.some((l) => !l.amount.startsWith("-"));
      const kind: ActivityItem["kind"] = neg && pos ? "swap" : pos && !ownTx ? "in" : neg ? "out" : "other";
      items.push({ sig: s.signature, time: s.blockTime ?? d.blockTime, kind, legs });
    }
    return { vault, items };
  });
}
