/**
 * Applies db/schema.sql to DATABASE_URL.
 *
 *   npm run db:migrate
 *
 * Every statement in schema.sql is IF NOT EXISTS, so this is safe to re-run.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env.local first.');
  process.exit(1);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

try {
  await client.connect();
  await client.query(readFileSync(join(here, 'schema.sql'), 'utf8'));
  console.log('Migration applied.');
} catch (err) {
  console.error('Migration failed:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
