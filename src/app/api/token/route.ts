import { serverMint } from "@/config/solana";
import { json, route } from "@/server/api";
import { listBuybacks } from "@/server/buyback";
import { pumpCoin } from "@/server/chain";
import { baseFeeBps, buybackShareBps, feeTiers } from "@/server/config";
import { tokenMetas } from "@/server/jupiter";
import { acct, balances } from "@/server/ledger";

/** $BLINDSPOT: fee settings, buybacks (each with its transaction) and the treasury. */
export async function GET(request: Request) {
  return route(request, { name: "token", limit: 60 }, async ({ db }) => {
    const mint = serverMint();
    const [buybacks, pools, treasury, coin] = await Promise.all([
      listBuybacks(db),
      balances(db, acct.buyback),
      balances(db, acct.treasury),
      mint ? pumpCoin(mint) : Promise.resolve(null),
    ]);
    const metas = await tokenMetas([...pools.keys(), ...buybacks.map((b) => b.in_mint), ...(mint ? [mint] : [])]);
    const tokens = Object.fromEntries([...metas].map(([m, t]) => [m, { symbol: t.symbol, decimals: t.decimals }]));
    return json({
      mint,
      coin,
      feeBps: baseFeeBps(),
      buybackShareBps: buybackShareBps(),
      tiers: feeTiers(),
      buybacks,
      pools: [...pools].map(([m, amount]) => ({ mint: m, amount })),
      treasury: mint ? (treasury.get(mint) ?? BigInt(0)) : BigInt(0),
      tokens,
    });
  });
}
