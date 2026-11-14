import pg from 'pg';
import { config } from './config.js';

const { Pool, types } = pg;

// numeric -> JS number (prices and areas are well within double precision)
types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
// date -> 'YYYY-MM-DD' string (avoid timezone shifts)
types.setTypeParser(1082, (v) => v);

export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl ? { rejectUnauthorized: config.databaseSslStrict } : undefined,
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => console.error('[db] idle client error', err));

export function query(text, params) {
  return pool.query(text, params);
}

/** Run fn(client) inside a transaction. */
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
