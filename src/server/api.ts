import { db, type Db } from "./db.ts";
import { assertSameOrigin, handle } from "./http.ts";
import { clientIp, rateLimit } from "./ratelimit.ts";

export interface Ctx {
  db: Db;
  ip: string;
  host: string;
}

/**
 * Every route goes through here: JSON errors, a per-IP limit per route (kept in Postgres), and for
 * writes a same-origin check.
 */
export function route(request: Request, opts: { name: string; limit: number; write?: boolean }, fn: (ctx: Ctx) => Promise<Response>) {
  return handle(async () => {
    if (opts.write) assertSameOrigin(request);
    const database = await db();
    const ip = clientIp(request);
    await rateLimit(database, `${opts.name}:${ip}`, opts.limit);
    return fn({ db: database, ip, host: request.headers.get("host") ?? "" });
  });
}

export const noStore = { "cache-control": "no-store" } as const;

/** JSON with bigint values written as strings. */
export function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v)), {
    ...init,
    headers: { "content-type": "application/json", ...noStore, ...(init?.headers ?? {}) },
  });
}
