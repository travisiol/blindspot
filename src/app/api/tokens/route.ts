import { json, route } from "@/server/api";
import { searchTokens } from "@/server/jupiter";

/** Token search (symbol, name or mint). */
export async function GET(request: Request) {
  return route(request, { name: "tokens", limit: 90 }, async () => {
    const q = new URL(request.url).searchParams.get("q") ?? "";
    return json({ tokens: await searchTokens(q) });
  });
}
