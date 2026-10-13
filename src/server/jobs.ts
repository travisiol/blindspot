/**
 * Background work, serverless-style: nothing loops. The cron route and `after()` (on account
 * reads and writes) call `runJobs`, which does a bounded amount of work and returns.
 */
import { runBuyback } from "./buyback.ts";
import type { Db } from "./db.ts";
import { reconcileOrders, runDueParts } from "./orders.ts";
import { runWithdrawals } from "./withdrawals.ts";

const flag = globalThis as unknown as { __blindspotJobs?: boolean };

export interface JobReport {
  reconciled: number;
  parts: number;
  withdrawals: number;
  buybacks: number;
  skipped?: boolean;
}

export async function runJobs(database: Db, opts: { buyback?: boolean; budgetMs?: number } = {}): Promise<JobReport> {
  if (flag.__blindspotJobs) return { reconciled: 0, parts: 0, withdrawals: 0, buybacks: 0, skipped: true };
  flag.__blindspotJobs = true;
  const budget = opts.budgetMs ?? 40_000;
  const report: JobReport = { reconciled: 0, parts: 0, withdrawals: 0, buybacks: 0 };
  const step = async (name: keyof JobReport, fn: () => Promise<number>) => {
    try {
      (report[name] as number) = await fn();
    } catch (error) {
      console.error(`[blindspot] job ${name}:`, error instanceof Error ? error.message.slice(0, 160) : "unknown");
    }
  };
  try {
    await step("reconciled", () => reconcileOrders(database));
    await step("parts", () => runDueParts(database, undefined, budget / 2));
    await step("withdrawals", () => runWithdrawals(database, undefined, budget / 3));
    if (opts.buyback) await step("buybacks", () => runBuyback(database));
  } finally {
    flag.__blindspotJobs = false;
  }
  return report;
}
