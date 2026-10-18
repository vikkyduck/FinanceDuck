import { beforeAll, afterAll, it, expect } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createTestDb, seedPartnerAndClient, type TestDb } from './test/testDb';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { BackupService, validateBackup } from './backupService';
import { validateArchive } from './services/backupArchive';
import { JobRunner } from './services/jobRunner';
import * as s from '../shared/schema';
let db: TestDb, close: () => Promise<void>, directory: string, service: BackupService;
const database = () => db as unknown as typeof import('./db').db;
const originalSecret = process.env.ACCESS_CODE_SECRET;
beforeAll(async () => {
  ({ db, close } = await createTestDb()); await seedPartnerAndClient(db);
  directory = await mkdtemp(path.join(tmpdir(), 'archive-test-'));
  service = new BackupService(database(), directory);
  await db.insert(s.loginRateLimits).values({ code: 'BIGINT-TEST', attemptCount: 1, lastAttempt: Date.now(), lockedUntil: Date.now()+1000 });
});
afterAll(async () => { if(originalSecret === undefined) delete process.env.ACCESS_CODE_SECRET; else process.env.ACCESS_CODE_SECRET = originalSecret; await close(); await rm(directory,{recursive:true,force:true}); });
it('authenticates encrypted archives before any SQL mutation; rejects wrong keys, changed bytes and truncation', async () => {
  process.env.ACCESS_CODE_SECRET = 'archive-test-encryption-key';
  const info = await service.createBackup(); const file = path.join(directory,info.id);
  await expect(validateArchive(file)).resolves.toBeUndefined();
  const bytes = await readFile(file);
  expect(bytes.includes(Buffer.from('Тест-клиент'))).toBe(false);
  const before = await db.select().from(s.clients);
  process.env.ACCESS_CODE_SECRET = 'different-archive-test-key';
  expect((await service.restoreBackup(info.id)).success).toBe(false);
  process.env.ACCESS_CODE_SECRET = 'archive-test-encryption-key';
  const corrupt = Buffer.from(bytes); corrupt[corrupt.length-30] ^= 1;
  await writeFile(path.join(directory,'backup-manual-corrupt.fdb'),corrupt);
  expect((await service.restoreBackup('backup-manual-corrupt.fdb')).success).toBe(false);
  await writeFile(path.join(directory,'backup-manual-short.fdb'),bytes.subarray(0,bytes.length-20));
  expect((await service.restoreBackup('backup-manual-short.fdb')).success).toBe(false);
  expect(await db.select().from(s.clients)).toEqual(before);
});
it('refuses missing tables and incorrect row counts even in unencrypted development archives', async () => {
  delete process.env.ACCESS_CODE_SECRET;
  const info = await service.createBackup(); const bytes = await readFile(path.join(directory,info.id)); const offset = bytes.indexOf(10)+1;
  const lines = gunzipSync(bytes.subarray(offset)).toString().trimEnd().split('\n');
  const removed = lines.filter(line => JSON.parse(line).table !== 'clients').join('\n')+'\n';
  await writeFile(path.join(directory,'backup-manual-incomplete.fdb'),Buffer.concat([bytes.subarray(0,offset),gzipSync(removed)]));
  expect((await service.restoreBackup('backup-manual-incomplete.fdb')).success).toBe(false);
  const changed = lines.map(line => { const row=JSON.parse(line); if(row.kind==='end')row.count++; return JSON.stringify(row); }).join('\n')+'\n';
  await writeFile(path.join(directory,'backup-manual-count.fdb'),Buffer.concat([bytes.subarray(0,offset),gzipSync(changed)]));
  await expect(validateArchive(path.join(directory,'backup-manual-count.fdb'))).rejects.toThrow();
});
it('queues a durable manual backup, completes in the worker, and exposes truthful status', async () => {
  await service.queueManualBackup(); expect((await service.manualBackupStatus()).pending).toBe(true);
  await new JobRunner(database()).run({ key:'manual-backup', run:()=>service.createBackup(), nextRunAt:()=>new Date('9999-01-01') });
  expect(await service.manualBackupStatus()).toMatchObject({ state:'idle', pending:false, filename:expect.stringMatching(/\.fdb$/) });
});

it('restores schema 5 archives and legacy JSON, while schema 6 preserves archive dates and rejects missing fields', async () => {
  delete process.env.ACCESS_CODE_SECRET;
  const [partner] = await db.select().from(s.partners);
  const [client] = await db.select().from(s.clients);
  const [invoice] = await db.insert(s.invoices).values({ invoiceNumber: 'ARCHIVE-COMPAT', scheme: 'agency_30',
    partnerId: partner.id, clientId: client.id, createdBy: randomUUID(), clientBill: '1234.56',
    archivedAt: new Date('2026-10-18T12:00:00Z') }).returning();
  const info = await service.createBackup();
  const file = path.join(directory, info.id);
  const bytes = await readFile(file), offset = bytes.indexOf(10) + 1;
  const header = JSON.parse(bytes.subarray(0, offset).toString());
  expect(header.schema).toBe(6);
  await db.update(s.invoices).set({ archivedAt: null }).where(eq(s.invoices.id, invoice.id));
  expect((await service.restoreBackup(info.id)).success).toBe(true);
  expect((await db.select().from(s.invoices).where(eq(s.invoices.id, invoice.id)))[0]).toEqual(invoice);

  const json = (await service.downloadBackup(info.id))!;
  delete json.data.invoices[0].archivedAt;
  expect(validateBackup(json).data.invoices[0].archivedAt).toBe(null);
  const payload = gunzipSync(bytes.subarray(offset)).toString().trimEnd().split('\n').map(line => {
    const item = JSON.parse(line);
    if (item.kind === 'row' && item.table === 'invoices') delete item.row.archivedAt;
    return JSON.stringify(item);
  }).join('\n') + '\n';
  const legacyFile = 'backup-manual-schema5.fdb';
  await writeFile(path.join(directory, legacyFile), Buffer.concat([
    Buffer.from(JSON.stringify({ ...header, schema: 5 }) + '\n'), gzipSync(payload),
  ]));
  await expect(validateArchive(path.join(directory, legacyFile))).resolves.toBeUndefined();
  expect((await service.restoreBackup(legacyFile)).success).toBe(true);
  expect((await db.select().from(s.invoices).where(eq(s.invoices.id, invoice.id)))[0]).toEqual({ ...invoice, archivedAt: null });
  const malformed = path.join(directory, 'backup-manual-schema6-missing-field.fdb');
  await writeFile(malformed, Buffer.concat([bytes.subarray(0, offset), gzipSync(payload)]));
  await expect(validateArchive(malformed)).rejects.toThrow();
});
