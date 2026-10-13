import { after } from "next/server";
import { json, route } from "@/server/api";
import { verifyIntent, type SignedIntent } from "@/server/auth";
import { HttpError } from "@/server/errors";
import { readJson } from "@/server/http";
import { parseWithdraw, withdrawFields } from "@/server/intents";
import { screen } from "@/server/sanctions";
import { requireSession } from "@/server/session";
import { processWithdrawal, requestWithdrawal } from "@/server/withdrawals";

export const maxDuration = 60;

/** Queues a withdrawal to the connected wallet and starts sending it right after the response. */
export async function POST(request: Request) {
  return route(request, { name: "withdraw", limit: 15, write: true }, async ({ db, host }) => {
    const wallet = await requireSession();
    const body = await readJson<SignedIntent & { params?: Record<string, unknown> }>(request);
    const parsed = await parseWithdraw(body.params ?? {});
    await verifyIntent(db, { host, action: "withdraw", wallet, fields: withdrawFields(parsed, wallet), ...body });
    if ((await screen(wallet)) === true) throw new HttpError(403, "This wallet can't use BLINDSPOT.");
    const { id, rent } = await requestWithdrawal(db, wallet, { mint: parsed.token.mint, amount: parsed.amount });
    after(() => processWithdrawal(db, id));
    return json({ id, status: "queued", rent });
  });
}
