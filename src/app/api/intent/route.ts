import { json, route } from "@/server/api";
import { prepareIntent } from "@/server/auth";
import { HttpError } from "@/server/errors";
import { readJson } from "@/server/http";
import { fieldsFor } from "@/server/intents";
import { requireSession } from "@/server/session";
import type { IntentAction } from "@/lib/intent-message";

const ACTIONS = new Set<IntentAction>(["swap", "split", "withdraw", "cancel"]);

/** Returns the exact message the wallet must sign for one action (fresh nonce, 2-minute expiry). */
export async function POST(request: Request) {
  return route(request, { name: "intent", limit: 40, write: true }, async ({ db, host }) => {
    const wallet = await requireSession();
    const { action, params } = await readJson<{ action?: IntentAction; params?: Record<string, unknown> }>(request);
    if (!action || !ACTIONS.has(action)) throw new HttpError(400, "Unknown action.");
    const fields = await fieldsFor(action, params ?? {}, wallet);
    return json(await prepareIntent(db, { host, action, wallet, fields }));
  });
}
