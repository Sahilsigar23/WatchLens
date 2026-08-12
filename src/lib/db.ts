import { Pool, type QueryResultRow } from 'pg';

/**
 * A single shared Postgres pool.
 *
 * `max: 2` is deliberate. On Vercel every warm serverless instance keeps its own
 * pool, so a generous max multiplied by the number of instances exhausts the
 * database's connection limit long before it helps throughput. Point
 * DATABASE_URL at your provider's *pooled* endpoint (Neon `-pooler`, Supabase
 * port 6543) and let that do the real pooling.
 */

declare global {
  // eslint-disable-next-line no-var
  var __watchlensPool: Pool | undefined;
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local.');
  }

  return new Pool({
    connectionString,
    ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
    max: 2,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
}

/** Reused across hot reloads in dev so `next dev` does not leak a pool per edit. */
export function getPool(): Pool {
  if (!global.__watchlensPool) global.__watchlensPool = createPool();
  return global.__watchlensPool;
}

/**
 * Errors that mean "the connection died", not "the query was bad". Poolers
 * (pgbouncer, Neon, Supabase) close idle connections, and a request that picks
 * one up a moment later fails on a socket that was already gone. Retrying once
 * gets a fresh connection; retrying a genuine SQL error would just fail twice.
 */
const RETRYABLE = new Set(['ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'ECONNREFUSED', '57P01']);

function isRetryable(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return typeof code === 'string' && RETRYABLE.has(code);
}

export async function query<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  try {
    const result = await getPool().query<T>(text, params);
    return result.rows;
  } catch (error) {
    if (!isRetryable(error)) throw error;
    const result = await getPool().query<T>(text, params);
    return result.rows;
  }
}

/** Convenience for queries that must return exactly one row. */
export async function queryOne<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
