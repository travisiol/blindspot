import { json, route } from "@/server/api";
import { SLIPPAGE } from "@/server/config";
import { feeFor, feeOn } from "@/server/fees";
import { parseAmount, tokenRef } from "@/server/intents";
import { jupQuote } from "@/server/jupiter";
import { feeSideFor, quoteAmountFor, userOutFor } from "@/server/orders";
import { currentAddress } from "@/server/session";

/** A live quote with BLINDSPOT's fee applied: what you sell, pay, and receive at minimum. */
export async function GET(request: Request) {
  return route(request, { name: "quote", limit: 60 }, async ({ db }) => {
    const url = new URL(request.url);
    const [tin, tout] = await Promise.all([tokenRef(url.searchParams.get("in")), tokenRef(url.searchParams.get("out"))]);
    const gross = parseAmount(url.searchParams.get("amount") ?? "", tin.decimals);
    const slippageBps = Math.min(SLIPPAGE.maxBps, Math.max(10, Number(url.searchParams.get("slippageBps")) || SLIPPAGE.defaultBps));
    const { feeBps, baseBps } = await feeFor(db, await currentAddress());
    const side = feeSideFor(tin.mint, tout.mint);
    const net = quoteAmountFor(gross, feeBps, side);
    const q = await jupQuote({ inputMint: tin.mint, outputMint: tout.mint, amount: net, slippageBps });
    const marketOut = BigInt(q.outAmount);
    const userOut = userOutFor(marketOut, feeBps, side);
    return json({
      in: tin,
      out: tout,
      gross,
      net,
      feeBps,
      baseFeeBps: baseBps,
      feeSide: side,
      fee: side === "in" ? gross - net : feeOn(marketOut, feeBps),
      feeToken: side === "in" ? tin : tout,
      userOut,
      minOut: userOutFor(BigInt(q.otherAmountThreshold), feeBps, side),
      slippageBps,
      priceImpactPct: Number(q.priceImpactPct) * 100,
      usdValue: q.swapUsdValue ? Number(q.swapUsdValue) : null,
      route: q.routePlan.map((r) => r.swapInfo.label).filter(Boolean),
    });
  });
}
