"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: path_1.default.join(__dirname, '../../.env') });
async function migrate() {
    const client = new pg_1.Client({ connectionString: process.env.DATABASE_URL });
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
    const migrationsDir = path_1.default.join(__dirname, '../migrations');
    const files = fs_1.default
        .readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort();
    for (const file of files) {
        const { rows } = await client.query('SELECT id FROM _migrations WHERE filename = $1', [file]);
        if (rows.length > 0) {
            console.log(`  skip  ${file}`);
            continue;
        }
        const sql = fs_1.default.readFileSync(path_1.default.join(migrationsDir, file), 'utf8');
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
