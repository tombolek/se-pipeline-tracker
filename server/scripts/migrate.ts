import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function migrate() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log('Connected to database');

  // Create tracking table if it doesn't exist
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id          SERIAL PRIMARY KEY,
      filename    TEXT UNIQUE NOT NULL,
      run_at      TIMESTAMPTZ DEFAULT now()
    )
  `);

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
      console.log(`  skip  ${file}`);
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await client.query(sql);
    await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
    console.log(`  ran   ${file}`);
  }

  await client.end();
  console.log('Migrations complete');
}

migrate().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
