import { json, route } from "@/server/api";
import { verifyIntent, type SignedIntent } from "@/server/auth";
import { readJson } from "@/server/http";
import { cancelFields } from "@/server/intents";
import { cancelSplit } from "@/server/orders";
import { requireSession } from "@/server/session";

/** Cancels the parts of a split order that have not run yet. */
export async function POST(request: Request) {
  return route(request, { name: "cancel", limit: 20, write: true }, async ({ db, host }) => {
    const wallet = await requireSession();
    const body = await readJson<SignedIntent & { params?: { orderId?: string } }>(request);
    const orderId = body.params?.orderId;
    await verifyIntent(db, { host, action: "cancel", wallet, fields: cancelFields(orderId), ...body });
    return json({ cancelled: await cancelSplit(db, wallet, orderId!) });
  });
}
