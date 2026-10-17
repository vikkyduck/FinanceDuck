import path from 'node:path';
import { BackupService } from './backupService';
import { validateArchive } from './services/backupArchive';
import { db, pool } from './db';

const [command, filename] = process.argv.slice(2);
try {
  if (command === 'create') console.log(JSON.stringify(await new BackupService().createBackup('manual')));
  else if (filename && path.isAbsolute(filename) && command === 'verify') {
    await validateArchive(filename); console.log('Archive authentication, schema, row counts and document hashes verified');
  } else if (filename && path.isAbsolute(filename) && command === 'restore' && process.env.FINANCE_RESTORE_MAINTENANCE === '1') {
    const result = await new BackupService(db, path.dirname(filename)).restoreBackup(path.basename(filename));
    if (!result.success) throw new Error(result.message);
    console.log(result.message);
  } else throw new Error('Usage: backupCli.js create | verify /absolute/backup.fdb | restore /absolute/backup.fdb (FINANCE_RESTORE_MAINTENANCE=1)');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Backup operation failed'); process.exitCode = 1;
} finally { await pool.end(); }
