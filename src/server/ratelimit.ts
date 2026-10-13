import type { Queryable } from "./db.ts";
import { HttpError } from "./errors.ts";

/** Fixed-window limit kept in Postgres, so it holds across serverless instances. */
export async function rateLimit(q: Queryable, key: string, limit: number, windowMs = 60_000, now = Date.now()) {
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const [row] = await q.query<{ count: number }>(
    `INSERT INTO rate_hits (key, window_start, count) VALUES ($1, $2, 1)
     ON CONFLICT (key, window_start) DO UPDATE SET count = rate_hits.count + 1
     RETURNING count`,
    [key, windowStart],
  );
  if (Math.random() < 0.02) await q.query("DELETE FROM rate_hits WHERE window_start < $1", [windowStart - 10 * windowMs]);
  if (Number(row?.count ?? 0) > limit) throw new HttpError(429, "Too many requests right now. Try again in a minute.");
}

export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
}
