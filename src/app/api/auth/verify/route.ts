import { route } from "@/server/api";
import { verifySignIn } from "@/server/auth";
import { readJson } from "@/server/http";
import { startSession } from "@/server/session";

interface Body {
  address?: string;
  nonce?: string;
  issuedAt?: string;
  signature?: string;
}

export async function POST(request: Request) {
  return route(request, { name: "verify", limit: 20, write: true }, async ({ db, host }) => {
    const body = await readJson<Body>(request);
    // The message is rebuilt on the server: the client cannot choose what was signed.
    const address = await verifySignIn(db, { ...body, host });
    await startSession(address);
    return Response.json({ address });
  });
}
