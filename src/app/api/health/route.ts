import { SITE } from "@/config/site";
import { serverCluster, serverMint } from "@/config/solana";
import { vaultAddress } from "@/server/config";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const database = await db();
  return Response.json(
    {
      ok: true,
      name: SITE.name,
      cluster: serverCluster(),
      mint: serverMint(),
      vault: vaultAddress(),
      storage: database.kind === "postgres" ? "postgres" : database.persistent ? "pglite-disk" : "pglite-memory",
      at: new Date().toISOString(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
