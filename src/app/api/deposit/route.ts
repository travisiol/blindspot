import { json, route } from "@/server/api";
import { depositAsset, prepareDeposit } from "@/server/deposits";
import { HttpError } from "@/server/errors";
import { readJson } from "@/server/http";
import { parseAmount } from "@/server/intents";
import { requireSession } from "@/server/session";

/** Builds the unsigned transfer to the vault. The wallet signs and sends it itself. */
export async function POST(request: Request) {
  return route(request, { name: "deposit", limit: 20, write: true }, async ({ db }) => {
    const wallet = await requireSession();
    const { mint, amount } = await readJson<{ mint?: string; amount?: string }>(request);
    const asset = depositAsset(String(mint));
    if (!asset) throw new HttpError(400, "Deposit SOL or USDC.");
    return json(await prepareDeposit(db, wallet, asset.mint, parseAmount(amount, asset.decimals)));
  });
}
