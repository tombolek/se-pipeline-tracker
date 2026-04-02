/**
 * Production migration runner — compiled to dist/migrate.js
 *
 * Called by docker-compose.prod.yml before the server starts:
 *   node dist/migrate.js && node dist/index.js
 *
 * Reads SQL files from /app/migrations/ (one level up from /app/dist/)
 */
import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// In dev: loads ../../.env relative to src/. In prod: file won't exist — env
// vars are already set by docker-compose, so dotenv silently no-ops.
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function migrate() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log('[migrate] Connected to database');

  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id          SERIAL PRIMARY KEY,
      filename    TEXT UNIQUE NOT NULL,
      run_at      TIMESTAMPTZ DEFAULT now()
    )
  `);

  // __dirname is dist/ in production → ../migrations = /app/migrations
  const migrationsDir = path.join(__dirname, '../migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const { rows } = await client.query(
      'SELECT id FROM _migrations WHERE filename = $1',
      [file]
    );
    if (rows.length > 0) {
      console.log(`[migrate]   skip  ${file}`);
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await client.query(sql);
    await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
    console.log(`[migrate]   ran   ${file}`);
  }

  await client.end();
  console.log('[migrate] Done');
}

migrate().catch(err => {
  console.error('[migrate] Failed:', err.message);
  process.exit(1);
});
