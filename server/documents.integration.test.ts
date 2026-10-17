import { beforeAll, afterAll, it, expect } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { eq } from 'drizzle-orm';
import { FileObjectStore, decodeDocument, DocumentInputError } from './services/objectStore';
import { createTestDb, seedPartnerAndClient, type TestDb } from './test/testDb';
import * as schema from '../shared/schema';
import * as acts from './repositories/actsRepo';
import { BackupService } from './backupService';
import type { db as productionDb } from './db';
let db: TestDb, close: () => Promise<void>, directory: string, invoiceId: string, actorId: string, objects: FileObjectStore;
const database = () => db as unknown as typeof productionDb;
beforeAll(async () => {
  ({ db, close } = await createTestDb());
  directory = await mkdtemp(path.join(tmpdir(), 'finance-documents-')); objects = new FileObjectStore(path.join(directory, 'objects'));
  const { partnerId, clientId } = await seedPartnerAndClient(db);
  const [token] = await db.insert(schema.accessTokens).values({ code: 'DOCUMENT-TEST', role: 'admin' }).returning(); actorId = token.id;
  const [invoice] = await db.insert(schema.invoices).values({ invoiceNumber: 'DOC-1', clientId, partnerId, createdBy: actorId, scheme: 'agency_30' }).returning(); invoiceId = invoice.id;
});
afterAll(async () => { await close(); await rm(directory, { recursive: true, force: true }); });
it('stores content outside SQL, streams the original bytes and rejects traversal', async () => {
  const created = await acts.createSignedAct(database(), { invoiceId, uploadedBy: actorId, actType: 'company', fileName: 'Акт.pdf', mimeType: 'application/pdf', fileData: 'data:application/pdf;base64,JVBERi10ZXN0' }, objects);
  expect(created.fileData).toBeNull(); expect(created.objectKey).toMatch(/^[a-f0-9]{64}$/);
  const file = await acts.openSignedActFile(database(), created.id, objects); const chunks: Buffer[] = [];
  for await (const chunk of file!.stream) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString()).toBe('%PDF-test');
  await expect(objects.get('../secrets')).rejects.toThrow('Invalid document object key');
});
it('migrates legacy data URLs idempotently without losing bytes', async () => {
  const [legacy] = await db.insert(schema.signedActs).values({ invoiceId, uploadedBy: actorId, actType: 'company', fileName: 'legacy.txt', fileData: 'data:text/plain;base64,bGVnYWN5' }).returning();
  expect(await acts.migrateDocumentObjects(database(), objects)).toEqual({ migrated: 1 });
  expect(await acts.migrateDocumentObjects(database(), objects)).toEqual({ migrated: 0 });
  const migrated = await acts.getSignedAct(database(), legacy.id);
  expect(migrated!.fileData).toBeNull(); expect((await objects.get(migrated!.objectKey!)).toString()).toBe('legacy');
});
it('restores referenced objects on an empty volume and refuses missing objects before changing SQL', async () => {
  const backups = path.join(directory, 'backups'); const service = new BackupService(database(), backups, objects);
  const backup = await service.createBackup(); const snapshot = (await service.downloadBackup(backup.id))!;
  expect(Object.keys(snapshot.objects)).toHaveLength(2);
  const broken = { ...snapshot, objects: {} }; await writeFile(path.join(backups, 'backup-manual-missing.json'), JSON.stringify(broken));
  expect((await service.restoreBackup('backup-manual-missing.json')).success).toBe(false);
  expect(await db.select().from(schema.signedActs)).toHaveLength(2);
  // The database survives while the document volume is lost. Recovery must still work.
  await rm(path.join(directory, 'objects'), { recursive: true });
  expect((await service.restoreBackup(backup.id)).success).toBe(true);
  for (const act of await db.select().from(schema.signedActs)) expect((await objects.get(act.objectKey!)).length).toBeGreaterThan(0);
});

it('rejects malformed and oversized document content with an input error', () => {
  for (const value of ['***', '', Buffer.alloc(10 * 1024 * 1024 + 1).toString('base64')]) expect(() => decodeDocument(value)).toThrow(DocumentInputError);
});
