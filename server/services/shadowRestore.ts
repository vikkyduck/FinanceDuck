import { promises as fs, constants } from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as schema from '../../shared/schema';
import { BackupService } from '../backupService';
import { objectStore, type ObjectStore } from './objectStore';
import { verifyRestoredArchive } from './restoreVerification';

/** Only a newly created, empty database is accepted. The live URL is never changed here. */
export async function restoreShadowDatabase(archive: string, name: string, directory: string, objects: ObjectStore = objectStore) {
  if (!/^finance_restore_[a-z0-9_]+$/.test(name) || !path.isAbsolute(directory) || !path.isAbsolute(archive)) throw new Error('Invalid shadow restore target');
  const url = new URL(process.env.DATABASE_URL!);
  if (url.pathname === `/${name}`) throw new Error('Shadow target is the current database');
  url.pathname = `/${name}`;
  const pool = new Pool({ connectionString: url.toString(), max: 2 });
  const copy = path.join(directory, 'backup-source.fdb');
  let copied = false;
  try {
    const tables = await pool.query("SELECT 1 FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema') LIMIT 1");
    if (tables.rows.length) throw new Error('Shadow database must be empty');
    await fs.mkdir(directory, { mode: 0o700 });
    await fs.copyFile(archive, copy, constants.COPYFILE_EXCL | constants.COPYFILE_FICLONE);
    copied = true;
    await fs.chmod(copy, 0o600);
    const database = drizzle(pool, { schema });
    await migrate(database, { migrationsFolder: path.resolve('drizzle') });
    const restored = await new BackupService(database, directory, objects).restoreBackup('backup-source.fdb');
    if (!restored.success) throw new Error(restored.message);
    const proof = await verifyRestoredArchive(database, objects, copy, directory);
    await fs.writeFile(path.join(directory, 'verification.json'), JSON.stringify({ database: name, verifiedAt: new Date().toISOString(), tables: proof }, null, 2), { mode: 0o600, flag: 'wx' });
    return { database: name, tables: Object.keys(proof).length, rows: Object.values(proof).reduce((sum, table) => sum + table.rows, 0) };
  } finally { await pool.end(); if (copied) await fs.rm(copy, { force: true }); }
}
