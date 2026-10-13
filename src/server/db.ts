/**
 * Postgres. `DATABASE_URL` (Neon, Supabase, Vercel Postgres…) in production; without it, PGlite
 * (Postgres compiled to WASM) in `./data/pglite`, or in memory when the disk is read-only.
 * The ledger needs durable storage: on Vercel, DATABASE_URL is required (see README).
 *
 * Every amount is NUMERIC(40,0) in base units and is read back as text, then BigInt.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";

export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface Db extends Queryable {
  /** Runs `fn` inside BEGIN … COMMIT (ROLLBACK on throw). */
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  kind: "postgres" | "pglite";
  persistent: boolean;
  close(): Promise<void>;
}

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS nonces (
  nonce text PRIMARY KEY,
  created_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS journal (
  id bigserial PRIMARY KEY,
  ref text NOT NULL UNIQUE,
  kind text NOT NULL,
  wallet text,
  memo jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS postings (
  id bigserial PRIMARY KEY,
  journal_id bigint NOT NULL REFERENCES journal(id),
  account text NOT NULL,
  mint text NOT NULL,
  amount numeric(40,0) NOT NULL
);
CREATE INDEX IF NOT EXISTS postings_account_mint ON postings(account, mint);
CREATE TABLE IF NOT EXISTS deposits (
  sig text NOT NULL,
  wallet text NOT NULL,
  mint text NOT NULL,
  amount numeric(40,0) NOT NULL,
  credited numeric(40,0) NOT NULL,
  refunded numeric(40,0) NOT NULL DEFAULT 0,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sig, mint)
);
CREATE INDEX IF NOT EXISTS deposits_wallet ON deposits(wallet, created_at DESC);
CREATE TABLE IF NOT EXISTS orders (
  id text PRIMARY KEY,
  wallet text NOT NULL,
  parent_id text,
  kind text NOT NULL,
  in_mint text NOT NULL,
  out_mint text NOT NULL,
  in_amount numeric(40,0) NOT NULL,
  fee_bps integer NOT NULL,
  fee_side text NOT NULL,
  slippage_bps integer NOT NULL,
  min_out numeric(40,0),
  parts integer,
  status text NOT NULL,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  sig text,
  last_valid_height bigint,
  out_amount numeric(40,0),
  fee_amount numeric(40,0),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_wallet ON orders(wallet, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_due ON orders(status, scheduled_at);
CREATE TABLE IF NOT EXISTS withdrawals (
  id text PRIMARY KEY,
  wallet text NOT NULL,
  mint text NOT NULL,
  amount numeric(40,0) NOT NULL,
  dest text NOT NULL,
  kind text NOT NULL DEFAULT 'withdraw',
  status text NOT NULL,
  sig text,
  last_valid_height bigint,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS withdrawals_status ON withdrawals(status, created_at);
CREATE INDEX IF NOT EXISTS withdrawals_wallet ON withdrawals(wallet, created_at DESC);
CREATE TABLE IF NOT EXISTS buybacks (
  id text PRIMARY KEY,
  in_mint text NOT NULL,
  in_amount numeric(40,0) NOT NULL,
  out_amount numeric(40,0),
  status text NOT NULL,
  sig text,
  last_valid_height bigint,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS rate_hits (
  key text NOT NULL,
  window_start bigint NOT NULL,
  count integer NOT NULL,
  PRIMARY KEY (key, window_start)
);
`;

// ───────────────────────────── adapters

async function openPostgres(url: string): Promise<Db> {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: url, max: 5, ssl: /sslmode=disable|localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false } });
  const run = async <T>(client: { query: (s: string, p?: unknown[]) => Promise<{ rows: unknown[] }> }, sql: string, params?: unknown[]) =>
    (await client.query(sql, params)).rows as T[];
  return {
    kind: "postgres",
    persistent: true,
    query: (sql, params) => run(pool, sql, params),
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const out = await fn({ query: (sql, params) => run(client, sql, params) });
        await client.query("COMMIT");
        return out;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

/** PGlite: in memory when `dir` is null (tests, read-only disks). */
export async function openPglite(dir: string | null): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = dir ? new PGlite(dir) : new PGlite();
  await pg.waitReady;
  return {
    kind: "pglite",
    persistent: Boolean(dir) && !process.env["VERCEL"],
    query: async (sql, params) => (await pg.query(sql, params)).rows as never[],
    tx: (fn) => pg.transaction((t) => fn({ query: async (sql, params) => (await t.query(sql, params)).rows as never[] })),
    close: () => pg.close(),
  };
}

function localDir(): string | null {
  const explicit = process.env["PGLITE_DIR"]?.trim();
  if (explicit === ":memory:") return null;
  if (process.env["VERCEL"]) return null;
  const dir = explicit || join(process.cwd(), "data", "pglite");
  try {
    mkdirSync(/* turbopackIgnore: true */ dir, { recursive: true });
    return dir;
  } catch {
    return null;
  }
}

export async function openDb(): Promise<Db> {
  const url = process.env["DATABASE_URL"]?.trim();
  const database = url ? await openPostgres(url) : await openPglite(localDir());
  await migrate(database);
  return database;
}

export async function migrate(database: Db) {
  for (const statement of SCHEMA.split(";").map((s) => s.trim()).filter(Boolean)) {
    await database.query(statement);
  }
}

const holder = globalThis as unknown as { __blindspotDb?: Promise<Db> };

/** The process-wide database (survives dev hot reloads). */
export function db(): Promise<Db> {
  if (!holder.__blindspotDb) {
    holder.__blindspotDb = openDb();
    holder.__blindspotDb.catch(() => {
      holder.__blindspotDb = undefined;
    });
  }
  return holder.__blindspotDb;
}

/** Tests: swap in a database of their own. */
export function setDb(database: Db | null) {
  holder.__blindspotDb = database ? Promise.resolve(database) : undefined;
}
