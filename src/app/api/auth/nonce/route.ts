import { isBase58Address } from "@/lib/format";
import { signInMessage } from "@/lib/signin-message";
import { route } from "@/server/api";
import { issueNonce } from "@/server/auth";
import { HttpError } from "@/server/errors";
import { readJson } from "@/server/http";
import { screen } from "@/server/sanctions";

export async function POST(request: Request) {
  return route(request, { name: "nonce", limit: 20, write: true }, async ({ db, host }) => {
    const { address } = await readJson<{ address?: string }>(request);
    if (!isBase58Address(address)) throw new HttpError(400, "Invalid wallet address.");
    if ((await screen(address)) === true) throw new HttpError(403, "This wallet can't use BLINDSPOT.");
    const issuedAt = new Date().toISOString();
    const nonce = await issueNonce(db);
    return Response.json({ nonce, issuedAt, message: signInMessage({ host, address, nonce, issuedAt }) });
  });
}
