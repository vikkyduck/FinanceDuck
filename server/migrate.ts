import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'node:path';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for migrations');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  const { rows } = await pool.query(`SELECT to_regclass('public.invoices') AS invoices,
    to_regclass('drizzle.__drizzle_migrations') AS journal`);
  if (rows[0].invoices && !rows[0].journal) {
    throw new Error('Existing database has no migration journal. Verify and baseline its schema before running versioned migrations; see docs/architecture-review-remediation.md.');
  }
  await migrate(drizzle(pool), { migrationsFolder: path.resolve('drizzle') });
  console.log('Database migrations applied');
} finally {
  await pool.end();
}
