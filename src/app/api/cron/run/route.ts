import { cronSecret } from "@/server/config";
import { db } from "@/server/db";
import { runJobs } from "@/server/jobs";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Scheduled work: split parts that are due, queued withdrawals, unconfirmed orders, buybacks.
 * Call every minute with `Authorization: Bearer $CRON_SECRET` (Vercel Cron on Pro, or any external
 * cron on Hobby — see README).
 */
export async function GET(request: Request) {
  const secret = cronSecret();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized." }, { status: 401 });
  const report = await runJobs(await db(), { buyback: true, budgetMs: 45_000 });
  return Response.json(report, { headers: { "cache-control": "no-store" } });
}
