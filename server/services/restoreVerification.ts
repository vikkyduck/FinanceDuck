import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import Decimal from 'decimal.js';
import { getTableColumns } from 'drizzle-orm';
import type { db } from '../db';
import { backupTables, type TableKey } from './backupTables';
import { readArchive, writeArchive, validateArchive } from './backupArchive';
import type { ObjectStore } from './objectStore';

type TableProof = { rows: number; digest: string; numericTotals: Record<string, string> };
const modulus = 1n << 256n;
// numeric(15,2) multiplied by even a bigint-sized row count stays below 50 digits.
const ExactTotal = Decimal.clone({ precision: 50 });

/** Order-independent SHA-256 multiset fingerprint plus exact numeric totals; bounded by schema size. */
export async function archiveProof(filename: string, revokeSessions = false) {
  await validateArchive(filename);
  const proofs = {} as Record<TableKey, TableProof>;
  for await (const item of readArchive(filename)) {
    if (item.kind === 'table') proofs[item.table] = { rows: 0, digest: '0', numericTotals: {} };
    if (item.kind !== 'row') continue;
    const proof = proofs[item.table];
    const row = { ...item.row };
    if (revokeSessions && item.table === 'userSessions') row.revoked = true;
    for (const [name, column] of Object.entries(getTableColumns(backupTables[item.table]))) {
      const value = row[name];
      if (value == null) continue;
      if (column.getSQLType().startsWith('numeric')) {
        row[name] = new Decimal(String(value)).toString();
        proof.numericTotals[name] = new ExactTotal(proof.numericTotals[name] ?? 0).plus(String(value)).toString();
      } else if (column.dataType === 'date') {
        const raw = String(value);
        // Keep PostgreSQL microseconds, while normalizing equivalent timezone spellings.
        const fraction = raw.match(/\.(\d{1,6})/)?.[1] ?? '';
        row[name] = `${new Date(raw).toISOString().slice(0, 19)}.${fraction.padEnd(6, '0')}Z`;
      }
    }
    const canonical = JSON.stringify(Object.fromEntries(Object.entries(row).sort(([a], [b]) => a.localeCompare(b))));
    const hash = BigInt(`0x${createHash('sha256').update(canonical).digest('hex')}`);
    proof.digest = ((BigInt(`0x${proof.digest}`) + hash) % modulus).toString(16);
    proof.rows++;
  }
  for (const proof of Object.values(proofs)) proof.numericTotals = Object.fromEntries(Object.entries(proof.numericTotals).sort(([a], [b]) => a.localeCompare(b)));
  return proofs;
}

export async function verifyRestoredArchive(database: typeof db, objects: ObjectStore, source: string, directory: string) {
  const verification = path.join(directory, 'restore-verification.fdb');
  try {
    const expected = await archiveProof(source, true);
    // Also reads every restored document from the destination object store.
    await writeArchive(database, objects, verification, { type: 'manual', createdAt: new Date().toISOString() });
    const actual = await archiveProof(verification);
    for (const key of Object.keys(backupTables) as TableKey[]) {
      if (JSON.stringify(expected[key]) !== JSON.stringify(actual[key])) throw new Error(`Restored database verification failed: ${key}`);
    }
    return actual;
  } finally { await fs.rm(verification, { force: true }); }
}
