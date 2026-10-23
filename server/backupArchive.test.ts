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

it('restores schema 5 archives and legacy JSON, while schema 9 preserves archive dates and rejects missing fields', async () => {
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
  expect(header.schema).toBe(9);
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
  const malformed = path.join(directory, 'backup-manual-schema9-missing-field.fdb');
  await writeFile(malformed, Buffer.concat([bytes.subarray(0, offset), gzipSync(payload)]));
  await expect(validateArchive(malformed)).rejects.toThrow();
});
it('fills directToOwner=false for partners from schema 6 archives and rejects it missing in schema 7', async () => {
  delete process.env.ACCESS_CODE_SECRET;
  const [partner] = await db.select().from(s.partners);
  await db.update(s.partners).set({ directToOwner: true }).where(eq(s.partners.id, partner.id));
  const info = await service.createBackup();
  const bytes = await readFile(path.join(directory, info.id)), offset = bytes.indexOf(10) + 1;
  const header = JSON.parse(bytes.subarray(0, offset).toString());
  const payload = gunzipSync(bytes.subarray(offset)).toString().trimEnd().split('\n').map(line => {
    const item = JSON.parse(line);
    if (item.kind === 'row' && item.table === 'partners') delete item.row.directToOwner;
    return JSON.stringify(item);
  }).join('\n') + '\n';
  const schema6 = 'backup-manual-schema6-partners.fdb';
  await writeFile(path.join(directory, schema6), Buffer.concat([
    Buffer.from(JSON.stringify({ ...header, schema: 6 }) + '\n'), gzipSync(payload),
  ]));
  expect((await service.restoreBackup(schema6)).success).toBe(true);
  expect((await db.select().from(s.partners).where(eq(s.partners.id, partner.id)))[0].directToOwner).toBe(false);
  const schema7 = path.join(directory, 'backup-manual-schema7-missing-flag.fdb');
  await writeFile(schema7, Buffer.concat([bytes.subarray(0, offset), gzipSync(payload)]));
  await expect(validateArchive(schema7)).rejects.toThrow();
});
it('settles schema 7 expenses on their own date, restores an empty owner ledger, and rejects missing paidAt in schema 8', async () => {
  delete process.env.ACCESS_CODE_SECRET;
  const [partner] = await db.select().from(s.partners);
  const [client] = await db.select().from(s.clients);
  const [invoice] = await db.insert(s.invoices).values({ invoiceNumber: 'ARCHIVE-EXPENSE', scheme: 'partner_10',
    partnerId: partner.id, clientId: client.id, createdBy: randomUUID(), clientBill: '1000' }).returning();
  const [expense] = await db.insert(s.invoiceExpenses).values({ invoiceId: invoice.id, description: 'Исполнитель',
    amount: '300', date: '2026-09-15', paidAt: null, createdBy: randomUUID() }).returning();
  await db.insert(s.ownerTransfers).values({ owner: 'kot', kind: 'opening', amount: '0', transferDate: '2026-10-01', createdBy: randomUUID() });
  const info = await service.createBackup();
  const json = (await service.downloadBackup(info.id))!;
  delete (json.data as Partial<typeof json.data>).ownerTransfers;
  for (const row of json.data.invoiceExpenses) delete row.paidAt;
  const legacy = validateBackup(json);
  expect(legacy.data.ownerTransfers).toEqual([]);
  expect(legacy.data.invoiceExpenses.find(row => row.id === expense.id)?.paidAt).toBe('2026-09-15');

  const bytes = await readFile(path.join(directory, info.id)), offset = bytes.indexOf(10) + 1;
  const header = JSON.parse(bytes.subarray(0, offset).toString());
  const lines = gunzipSync(bytes.subarray(offset)).toString().trimEnd().split('\n').map(line => JSON.parse(line));
  const withoutPaidAt = lines.map(item => {
    if (item.kind === 'row' && item.table === 'invoiceExpenses') delete item.row.paidAt;
    return item;
  });
  const encode = (items: unknown[]) => gzipSync(items.map(item => JSON.stringify(item)).join('\n') + '\n');
  const schema7 = 'backup-manual-schema7-expenses.fdb';
  await writeFile(path.join(directory, schema7), Buffer.concat([
    Buffer.from(JSON.stringify({ ...header, schema: 7 }) + '\n'),
    encode(withoutPaidAt.filter(item => item.table !== 'ownerTransfers')),
  ]));
  await expect(validateArchive(path.join(directory, schema7))).resolves.toBeUndefined();
  expect((await service.restoreBackup(schema7)).success).toBe(true);
  expect((await db.select().from(s.invoiceExpenses).where(eq(s.invoiceExpenses.id, expense.id)))[0].paidAt).toBe('2026-09-15');
  expect(await db.select().from(s.ownerTransfers)).toEqual([]);

  const schema8 = path.join(directory, 'backup-manual-schema8-missing-paid.fdb');
  await writeFile(schema8, Buffer.concat([bytes.subarray(0, offset), encode(withoutPaidAt)]));
  await expect(validateArchive(schema8)).rejects.toThrow();
});
it('restores schema 8 archives without document packages and rejects a missing package link in schema 9', async () => {
  delete process.env.ACCESS_CODE_SECRET;
  const [partner] = await db.select().from(s.partners);
  const [client] = await db.select().from(s.clients);
  const [invoice] = await db.insert(s.invoices).values({ invoiceNumber: 'ARCHIVE-PACKAGE', scheme: 'partner_10',
    partnerId: partner.id, clientId: client.id, createdBy: randomUUID(), clientBill: '1000' }).returning();
  const [pkg] = await db.insert(s.documentPackages).values({ invoiceId: invoice.id, side: 'executor', executorName: 'Иван Петров' }).returning();
  const [act] = await db.insert(s.signedActs).values({ invoiceId: invoice.id, actType: 'executor', fileName: 'Акт.pdf',
    isLink: true, url: 'https://example.com/act', uploadedBy: randomUUID(), packageId: pkg.id }).returning();
  const info = await service.createBackup();
  await db.delete(s.documentPackages).where(eq(s.documentPackages.id, pkg.id));
  expect((await service.restoreBackup(info.id)).success).toBe(true);
  expect(await db.select().from(s.documentPackages).where(eq(s.documentPackages.id, pkg.id))).toEqual([pkg]);
  expect((await db.select().from(s.signedActs).where(eq(s.signedActs.id, act.id)))[0].packageId).toBe(pkg.id);

  const bytes = await readFile(path.join(directory, info.id)), offset = bytes.indexOf(10) + 1;
  const header = JSON.parse(bytes.subarray(0, offset).toString());
  const withoutLink = gunzipSync(bytes.subarray(offset)).toString().trimEnd().split('\n').map(line => {
    const item = JSON.parse(line);
    if (item.kind === 'row' && item.table === 'signedActs') delete item.row.packageId;
    return item;
  });
  const encode = (items: unknown[]) => gzipSync(items.map(item => JSON.stringify(item)).join('\n') + '\n');
  const schema8 = 'backup-manual-schema8-packages.fdb';
  await writeFile(path.join(directory, schema8), Buffer.concat([
    Buffer.from(JSON.stringify({ ...header, schema: 8 }) + '\n'),
    encode(withoutLink.filter(item => item.table !== 'documentPackages')),
  ]));
  await expect(validateArchive(path.join(directory, schema8))).resolves.toBeUndefined();
  expect((await service.restoreBackup(schema8)).success).toBe(true);
  expect((await db.select().from(s.signedActs).where(eq(s.signedActs.id, act.id)))[0].packageId).toBe(null);
  expect(await db.select().from(s.documentPackages)).toEqual([]);

  const schema9 = path.join(directory, 'backup-manual-schema9-missing-link.fdb');
  await writeFile(schema9, Buffer.concat([bytes.subarray(0, offset), encode(withoutLink)]));
  await expect(validateArchive(schema9)).rejects.toThrow();
});
