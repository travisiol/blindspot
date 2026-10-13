import { json, route } from "@/server/api";
import { tokenMetas } from "@/server/jupiter";
import { vaultActivity } from "@/server/public-data";

export const maxDuration = 30;

/** The vault's latest on-chain activity: exactly what GMGN, Bubblemaps or a copytrade bot can read. */
export async function GET(request: Request) {
  return route(request, { name: "activity", limit: 60 }, async () => {
    const { vault, items } = await vaultActivity(10).catch(() => ({ vault: null, items: [] }));
    const metas = await tokenMetas(items.flatMap((i) => i.legs.map((l) => l.mint)));
    const tokens = Object.fromEntries([...metas].map(([m, t]) => [m, { symbol: t.symbol, decimals: t.decimals, icon: t.icon }]));
    return json({ vault, items, tokens });
  });
}
