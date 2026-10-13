import { serverMint } from "@/config/solana";
import { json, route } from "@/server/api";
import { DEPOSIT_ASSETS, SLIPPAGE, SPLIT, baseFeeBps, buybackShareBps, capsFor, feeTiers, vaultAddress } from "@/server/config";

/** Public settings: the vault address, what can be deposited, caps and fees. */
export async function GET(request: Request) {
  return route(request, { name: "vault", limit: 120 }, async () =>
    json({
      vault: vaultAddress(),
      mint: serverMint(),
      feeBps: baseFeeBps(),
      buybackShareBps: buybackShareBps(),
      tiers: feeTiers(),
      slippage: SLIPPAGE,
      split: SPLIT,
      assets: DEPOSIT_ASSETS.map((a) => ({ ...a, caps: capsFor(a.mint) })),
    }),
  );
}
