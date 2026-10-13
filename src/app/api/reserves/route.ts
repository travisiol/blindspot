import { cached } from "@/server/chain";
import { json, route } from "@/server/api";
import { reserves } from "@/server/public-data";

/** On-chain vault balances next to what the ledger owes, token by token. */
export async function GET(request: Request) {
  return route(request, { name: "reserves", limit: 60 }, async ({ db }) => json(await cached("reserves", 10_000, () => reserves(db))));
}
