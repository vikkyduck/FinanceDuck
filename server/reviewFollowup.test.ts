import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createTestDb, seedPartnerAndClient, type TestDb } from './test/testDb';
import type { db as productionDb } from './db';
import * as s from '../shared/schema';
import * as recurring from './repositories/recurringRepo';
import { InvoiceCommands } from './services/invoiceCommands';
import { BackupService, validateBackup } from './backupService';
import { JobRunner, nextDailyBackup, type Job } from './services/jobRunner';
import { pruneExpiredLoginAttempts } from './rateLimiter';
import { generateOccurrence } from './services/recurringCommands';
import express from 'express';
import { once } from 'node:events';
import { DatabaseStorage } from './storage';
import { createInvoicesRouter } from './routes/invoices';
import { createRecurringRouter } from './routes/recurring';
import type { AuthMiddleware } from './middleware';

let db: TestDb;
let close: () => Promise<void>;
let clientId: string;
let partnerId: string;
let actorId: string;
let directory: string;
const database = () => db as unknown as typeof productionDb;
const template = () => recurring.createRecurringInvoice(database(), {
  clientId, partnerId, createdBy: actorId, scheme: 'agency_30', amount: '1000',
  frequency: 'monthly', dayOfMonth: '31', startDate: '2026-01-31', nextInvoiceDate: '2026-01-31',
});
beforeAll(async () => {
  ({ db, close } = await createTestDb());
  ({ clientId, partnerId } = await seedPartnerAndClient(db));
  const [actor] = await db.insert(s.accessTokens).values({ code: 'FOLLOWUP-ONLY', role: 'assistant' }).returning();
  actorId = actor.id;
  directory = await mkdtemp(path.join(tmpdir(), 'finance-followup-'));
});
afterAll(async () => { await close(); await rm(directory, { recursive: true, force: true }); });

it('rechecks invoice visibility before replaying a completed command', async () => {
  const commands = new InvoiceCommands(database());
  const actor = { role: 'assistant' as const, tokenId: actorId, requestKey: 'visibility-replay' };
  const input = { invoiceNumber: 'REPLAY-PRIVATE', clientId, partnerId, createdBy: actorId, scheme: 'agency_30' as const, clientBill: '1000' };
  const created = await commands.create(actor, input);
  await db.update(s.invoices).set({ hideFromAssistant: true }).where(eq(s.invoices.id, created.id));
  await expect(commands.create(actor, input)).rejects.toMatchObject({ status: 404 });
});

it('advances a stale schedule when its occurrence already exists', async () => {
  const recurringTemplate = await template();
  const created = await recurring.createDraftFromRecurring(database(), recurringTemplate.id);
  await db.update(s.recurringInvoices).set({ nextInvoiceDate: '2026-01-31' }).where(eq(s.recurringInvoices.id, recurringTemplate.id));
  expect((await recurring.createDraftFromRecurring(database(), recurringTemplate.id)).id).toBe(created.id);
  expect((await recurring.getRecurringInvoice(database(), recurringTemplate.id))?.nextInvoiceDate).toBe('2026-02-28');
});

it('does not expose an existing hidden occurrence through a visible template', async () => {
  const recurringTemplate = await template();
  const created = await recurring.createDraftFromRecurring(database(), recurringTemplate.id);
  await db.update(s.invoices).set({ hideFromAssistant: true }).where(eq(s.invoices.id, created.id));
  await expect(recurring.createDraftFromRecurring(database(), recurringTemplate.id, '2026-01-31', 'assistant')).rejects.toThrow('not found');
});

it('does not confuse an edited issue date with a different recurring occurrence', async () => {
  const recurringTemplate = await template();
  const january = await recurring.createDraftFromRecurring(database(), recurringTemplate.id);
  await db.update(s.invoices).set({ issueDate: '2026-02-28' }).where(eq(s.invoices.id, january.id));
  const february = await recurring.createDraftFromRecurring(database(), recurringTemplate.id);
  expect(february.id).not.toBe(january.id);
  expect(february.recurringOccurrenceKey).toBe(`${recurringTemplate.id}:2026-02-28`);
});

it('accepts complete version 2 backups from before occurrence keys and object storage', async () => {
  const service = new BackupService(database(), directory);
  const snapshot = await service.downloadBackup((await service.createBackup()).id);
  const legacy = JSON.parse(JSON.stringify(snapshot));
  legacy.version = '2.0';
  delete legacy.objects;
  delete legacy.data.scheduledJobs;
  for (const row of legacy.data.invoices) delete row.recurringOccurrenceKey;
  for (const row of legacy.data.signedActs) delete row.objectKey;
  expect(() => validateBackup(legacy)).not.toThrow();
  await writeFile(path.join(directory, 'backup-manual-v2.json'), JSON.stringify(legacy));
  expect(await service.restoreBackup('backup-manual-v2.json')).toMatchObject({ success: true });
  expect(await db.select().from(s.invoices)).toHaveLength(legacy.data.invoices.length);
  // Version 3 keeps the original immutable keys, including intentionally null legacy duplicates.
  const version3 = JSON.parse(JSON.stringify(await service.downloadBackup((await service.createBackup()).id)));
  version3.version = '3.0'; delete version3.data.scheduledJobs;
  await writeFile(path.join(directory, 'backup-manual-v3.json'), JSON.stringify(version3));
  expect(await service.restoreBackup('backup-manual-v3.json')).toMatchObject({ success: true });
});

it('records one audit and one outbox event per recurring occurrence, with atomic rollback', async () => {
  const recurringTemplate = await template();
  const created = await recurring.createDraftFromRecurring(database(), recurringTemplate.id, undefined, 'all', actorId);
  await recurring.createDraftFromRecurring(database(), recurringTemplate.id, '2026-01-31', 'all', actorId);
  expect(await db.select().from(s.assistantActionLogs).where(eq(s.assistantActionLogs.entityId, created.id))).toHaveLength(1);
  const events = await db.select().from(s.notificationOutbox);
  expect(events.filter(row => row.body.includes(created.invoiceNumber))).toHaveLength(1);
  const before = await recurring.getRecurringInvoice(database(), recurringTemplate.id);
  await expect(recurring.createDraftFromRecurring(database(), recurringTemplate.id, undefined, 'all', '00000000-0000-0000-0000-000000000001')).rejects.toThrow();
  expect(await recurring.getRecurringInvoice(database(), recurringTemplate.id)).toEqual(before);
});

it('replays a removed expense without another mutation, but rechecks parent access', async () => {
  const commands = new InvoiceCommands(database());
  const actor = { role: 'assistant' as const, tokenId: actorId };
  const created = await commands.create(actor, { invoiceNumber: 'DELETE-RETRY', clientId, partnerId, createdBy: actorId, scheme: 'agency_30', clientBill: '1000' });
  const expense = await commands.createExpense(actor, { invoiceId: created.id, description: 'cost', amount: '10', createdBy: actorId });
  const deletion = { ...actor, requestKey: 'delete-expense' };
  expect(await commands.deleteExpense(deletion, expense.id)).toEqual({ success: true });
  expect(await commands.deleteExpense(deletion, expense.id)).toEqual({ success: true });
  await db.update(s.invoices).set({ hideFromAssistant: true }).where(eq(s.invoices.id, created.id));
  await expect(commands.deleteExpense(deletion, expense.id)).rejects.toMatchObject({ status: 404 });
});

it('prunes expired login records in bounded batches while preserving current protection', async () => {
  const now = Date.now();
  await db.insert(s.loginRateLimits).values([
    { code: 'OLD-1', lastAttempt: now - 4_000_000 }, { code: 'OLD-2', lastAttempt: now - 4_000_000 },
    { code: 'CURRENT', lastAttempt: now }, { code: 'LOCKED', lastAttempt: now - 4_000_000, lockedUntil: now + 60_000 },
  ]);
  expect(await pruneExpiredLoginAttempts(database(), now, 1)).toBe(1);
  expect(await pruneExpiredLoginAttempts(database(), now, 1)).toBe(1);
  expect((await db.select().from(s.loginRateLimits)).map(row => row.code).sort()).toEqual(['CURRENT', 'LOCKED']);
});

it('persists job failure/backoff across runners, prevents overlap, and recovers a crashed lease', async () => {
  let clock = new Date('2026-10-17T00:00:00Z');
  const runner = new JobRunner(database(), () => clock);
  let calls = 0;
  const job: Job = { key: 'test-retry', run: async () => { calls++; if (calls === 1) throw new Error('transient'); return { ok: true }; }, nextRunAt: now => new Date(now.getTime() + 3_600_000) };
  expect(await runner.run(job)).toBe(true);
  let [state] = await db.select().from(s.scheduledJobs).where(eq(s.scheduledJobs.key, job.key));
  expect(state).toMatchObject({ state: 'failed', attempts: 1, lastError: 'transient' });
  const restarted = new JobRunner(database(), () => clock);
  expect(await restarted.run(job)).toBe(false);
  clock = new Date(clock.getTime() + 60_001);
  expect(await restarted.run(job)).toBe(true);
  [state] = await db.select().from(s.scheduledJobs).where(eq(s.scheduledJobs.key, job.key));
  expect(state).toMatchObject({ state: 'idle', attempts: 0, lastError: null });
  let release!: () => void;
  let started!: () => void;
  const began = new Promise<void>(resolve => { started = resolve; });
  const pending = new Promise<void>(resolve => { release = resolve; });
  const held: Job = { ...job, key: 'held', run: async () => { started(); await pending; } };
  const first = runner.run(held);
  await began;
  expect(await restarted.run(held)).toBe(false);
  release(); await first;
  await db.insert(s.scheduledJobs).values({ key: 'crashed', state: 'running', leaseToken: crypto.randomUUID(), leaseUntil: new Date(clock.getTime() - 1), nextRunAt: clock });
  expect(await restarted.run({ ...job, key: 'crashed' })).toBe(true);
});

it('schedules the next daily backup independently of host timezone', () => {
  expect(nextDailyBackup(new Date('2026-10-17T02:59:00Z')).toISOString()).toBe('2026-10-17T03:00:00.000Z');
  expect(nextDailyBackup(new Date('2026-10-17T03:00:00Z')).toISOString()).toBe('2026-10-18T03:00:00.000Z');
});

it('validates financial commands even without an HTTP route and strips server-owned fields', async () => {
  const commands = new InvoiceCommands(database());
  const actor = { role: 'admin' as const, tokenId: actorId };
  const input = { invoiceNumber: 'BOUNDARY', clientId, partnerId, scheme: 'commission_based' as const, clientBill: '1000' };
  await expect(async () => commands.create(actor, { ...input, partnerCommissionRate: '101' })).rejects.toMatchObject({ status: 400 });
  await expect(async () => commands.create(actor, { ...input, serviceType: 'periodic' })).rejects.toMatchObject({ status: 400 });
  const forged = { ...input, id: crypto.randomUUID(), createdBy: crypto.randomUUID(), recurringOccurrenceKey: 'forged', clientBill: '1000,50' };
  const created = await commands.create(actor, forged);
  expect(created.id).not.toBe(forged.id);
  expect(created.createdBy).toBe(actorId);
  expect(created.recurringOccurrenceKey).toBeNull();
  expect(created.clientBill).toBe('1000.50');
});

it('returns HTTP 404 for a hidden invoice through both replay and recurring generation', async () => {
  const storage = new DatabaseStorage(database());
  const commands = new InvoiceCommands(database());
  const auth: AuthMiddleware = async (req, _res, next) => {
    req.user = { role: 'assistant', token: { id: actorId, role: 'assistant' } as never }; next();
  };
  const app = express(); app.use(express.json(), createInvoicesRouter(storage, auth, database(), commands), createRecurringRouter(storage, auth));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing address');
  const url = `http://127.0.0.1:${address.port}`;
  const options = { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'http-replay' }, body: JSON.stringify({ clientId, partnerId, scheme: 'agency_30', invoiceNumber: 'HTTP-PRIVATE', clientBill: '1000' }) };
  try {
    const first = await fetch(`${url}/api/invoices`, options);
    expect(first.status).toBe(201);
    const created = await first.json();
    await db.update(s.invoices).set({ hideFromAssistant: true }).where(eq(s.invoices.id, created.id));
    expect((await fetch(`${url}/api/invoices`, options)).status).toBe(404);
    const recurringTemplate = await template();
    const occurrence = await recurring.createDraftFromRecurring(database(), recurringTemplate.id);
    await db.update(s.invoices).set({ hideFromAssistant: true }).where(eq(s.invoices.id, occurrence.id));
    expect((await fetch(`${url}/api/recurring-invoices/${recurringTemplate.id}/create-draft`, { ...options, body: JSON.stringify({ invoiceDate: '2026-01-31' }) })).status).toBe(404);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

it('never reactivates a paused template through backdating or a stale scheduler selection', async () => {
  const recurringTemplate = await template();
  await recurring.updateRecurringInvoice(database(), recurringTemplate.id, { isActive: false });
  await expect(generateOccurrence(database(), recurringTemplate.id, '2026-01-31', 'all', undefined, true)).rejects.toMatchObject({ status: 409 });
  await recurring.createDraftFromRecurring(database(), recurringTemplate.id, '2026-01-31', 'all', actorId);
  expect((await recurring.getRecurringInvoice(database(), recurringTemplate.id))?.isActive).toBe(false);
});
