import { Pool, PoolClient } from 'pg';

/**
 * PostgreSQL / TimescaleDB connection layer (OPTIONAL production backend).
 *
 * The app keeps running on SQLite in development. Postgres is only used when
 * `USE_POSTGRES=true` is set in the environment AND a `DATABASE_URL` is
 * provided. Nothing connects until `getPgPool()` is first called, so importing
 * this module never touches the network in SQLite mode.
 */

const USE_POSTGRES = process.env.USE_POSTGRES === 'true';
const DATABASE_URL = process.env.DATABASE_URL;

let pool: Pool | null = null;

export function isPostgresEnabled(): boolean {
  return USE_POSTGRES && !!DATABASE_URL;
}

/**
 * Returns a lazily-created shared connection pool, or throws if Postgres is
 * not enabled. Callers should guard with `isPostgresEnabled()`.
 */
export function getPgPool(): Pool {
  if (!DATABASE_URL) {
    throw new Error('[postgres] DATABASE_URL is not set.');
  }
  if (!pool) {
    pool = new Pool({
      connectionString: DATABASE_URL,
      max: Number(process.env.PG_POOL_MAX ?? 20),
      idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS ?? 30000),
      connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS ?? 10000),
      ssl:
        process.env.PG_SSL === 'true'
          ? { rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED !== 'false' }
          : undefined,
    });

    pool.on('error', (err) => {
      console.error('[postgres] Unexpected pool error:', err);
    });

    console.log('[postgres] Connection pool initialized.');
  }
  return pool;
}

/** Runs `fn` inside a transaction and returns its result. */
export async function withPg<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPgPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Closes the pool. Safe to call in SQLite mode (no-op). */
export async function closePgPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
