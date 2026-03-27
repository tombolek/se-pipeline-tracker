import { Pool } from 'pg';

// Pool is created lazily on first use so that dotenv has already loaded
// DATABASE_URL before pg tries to connect.
let _pool: Pool | null = null;

function getPool(): Pool {
  if (!_pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set. Check your .env file.');
    }
    _pool = new Pool({ connectionString: process.env.DATABASE_URL });
    _pool.on('error', (err) => {
      console.error('Unexpected DB pool error:', err.message);
    });
  }
  return _pool;
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const { rows } = await getPool().query(sql, params);
  return rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

export default { query, queryOne };
