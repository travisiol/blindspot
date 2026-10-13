import { json, route } from "@/server/api";
import { claimDeposit, scanDeposits } from "@/server/deposits";
import { readJson } from "@/server/http";
import { requireSession } from "@/server/session";

export const maxDuration = 30;

/** Credits a deposit by its signature, or (no signature) looks for unclaimed ones from this wallet. */
export async function POST(request: Request) {
  return route(request, { name: "claim", limit: 30, write: true }, async ({ db }) => {
    const wallet = await requireSession();
    const { signature } = await readJson<{ signature?: string }>(request);
    if (!signature) return json({ found: await scanDeposits(db, wallet) });
    return json({ credits: await claimDeposit(db, wallet, signature) });
  });
}
