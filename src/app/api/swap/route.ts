import { after } from "next/server";
import { json, route } from "@/server/api";
import { verifyIntent, type SignedIntent } from "@/server/auth";
import { feeFor } from "@/server/fees";
import { readJson } from "@/server/http";
import { parseSwap, swapFields } from "@/server/intents";
import { runJobs } from "@/server/jobs";
import { createSplitOrder, createSwapOrder, executeOrder, runDueParts } from "@/server/orders";
import { requireSession } from "@/server/session";

export const maxDuration = 60;

/** Swap (or split swap) from the vault, authorised by a fresh signed message. */
export async function POST(request: Request) {
  return route(request, { name: "swap", limit: 20, write: true }, async ({ db, host }) => {
    const wallet = await requireSession();
    const body = await readJson<SignedIntent & { split?: boolean; params?: Record<string, unknown> }>(request);
    const split = Boolean(body.split);
    const parsed = await parseSwap(body.params ?? {}, split);
    await verifyIntent(db, { host, action: split ? "split" : "swap", wallet, fields: swapFields(parsed), ...body });
    const { feeBps } = await feeFor(db, wallet);
    const input = { inMint: parsed.tin.mint, outMint: parsed.tout.mint, amount: parsed.amount, slippageBps: parsed.slippageBps, minOut: parsed.minOut };
    if (split) {
      const id = await createSplitOrder(db, wallet, { ...input, parts: parsed.parts!, windowMin: parsed.windowMin! }, feeBps);
      // The first part may already be due.
      after(() => runDueParts(db, undefined, 40_000, 2));
      return json({ id, status: "open" });
    }
    const id = await createSwapOrder(db, wallet, input, feeBps);
    const order = await executeOrder(db, id);
    after(() => runJobs(db, { budgetMs: 20_000 }));
    return json({ id, status: order?.status, sig: order?.sig, error: order?.error, outAmount: order?.out_amount });
  });
}
