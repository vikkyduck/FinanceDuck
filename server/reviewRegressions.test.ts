import { invoiceExportPages } from './repositories/exportRepo';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getTableName, is, Table, eq } from 'drizzle-orm';
import { createTestDb, seedPartnerAndClient, type TestDb } from './test/testDb';
import { BackupService, backupTables } from './backupService';
import * as s from '../shared/schema';
import * as invoices from './repositories/invoiceRepo';
import * as recurring from './repositories/recurringRepo';
import { nextOccurrence } from '../shared/recurringSchedule';
import { getInvoicesByMonth } from './repositories/reportsRepo';
import { getOverdueInvoicesDetailed } from './repositories/alertsRepo';
import { calculateInvoiceFinancials } from '../shared/financialEngine';
import { stripSensitiveFieldsFromList } from './permissions';
import { invoicePageSchema } from '../shared/invoiceContract';
import { consumeAttempt } from './rateLimiter';
import { InvoiceCommands } from './services/invoiceCommands';
import { deliverNotifications } from './services/outbox';
import type { db as productionDb } from './db';

let db: TestDb;
let close: () => Promise<void>;
let directory: string;
let partnerId: string;
let clientId: string;
let actorId: string;
let sequence = 0;
const database = () => db as unknown as typeof productionDb;
const invoice = (extra: Partial<s.InsertInvoice> = {}) => invoices.createInvoice(database(), {
  invoiceNumber: `REG-${++sequence}`, clientId, partnerId, createdBy: actorId, scheme: 'agency_30', clientBill: '1000', ...extra,
});

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  ({ partnerId, clientId } = await seedPartnerAndClient(db));
  const [actor] = await db.insert(s.accessTokens).values({ code: 'REGRESSION-ONLY', role: 'admin' }).returning();
  actorId = actor.id;
  directory = await mkdtemp(path.join(tmpdir(), 'finance-regression-'));
});
afterAll(async () => { await close(); await rm(directory, { recursive: true, force: true }); });

describe('Review financial regressions', () => {
  it('uses invoice terms even without a calculations payload', async () => {
    const created = await invoice();
    expect(Number((await invoices.getInvoice(database(), created.id))?.calculations?.clientBill)).toBe(1000);
  });
  it('preserves transfers and recorded expenses after editing any terms', async () => {
    const from = await invoice(); const to = await invoice();
    await invoices.createInvoiceExpense(database(), { invoiceId: from.id, description: 'cost', amount: '100', createdBy: actorId });
    expect((await invoices.createInvoiceTransfer(database(), { fromInvoiceId: from.id, toInvoiceId: to.id, amount: 100, createdBy: actorId })).ok).toBe(true);
    await invoices.updateInvoiceCalculations(database(), from.id, { executorExpensesTotal: '999999' });
    let result = await invoices.getInvoice(database(), from.id);
    expect(Number(result?.calculations?.clientRemaining)).toBe(500);
    expect(Number(result?.calculations?.clientSpent)).toBe(100);
    await invoices.updateInvoice(database(), from.id, { clientBill: '2000' });
    result = await invoices.getInvoice(database(), from.id);
    expect(Number(result?.calculations?.clientRemaining)).toBe(1200);
    expect(Number(result?.clientBill)).toBe(Number(result?.calculations?.clientBill));
  });
  it('synchronizes periodic price and clears fields from the previous scheme', async () => {
    const created = await invoice({ serviceType: 'periodic', pricePerPeriod: '100', totalPeriods: 10 });
    await invoices.updateInvoice(database(), created.id, { pricePerPeriod: '200' });
    const result = await invoices.getInvoice(database(), created.id);
    expect(Number(result?.clientBill)).toBe(2000);
    expect(Number(result?.calculations?.clientBill)).toBe(2000);
    await invoices.updateInvoice(database(), created.id, { scheme: 'partner_10' });
    expect((await invoices.getInvoice(database(), created.id))?.calculations?.agencyMargin).toBeNull();
  });
  it('never reuses an allocated invoice number after deletion', async () => {
    const first = await invoices.generateInvoiceNumber(database());
    const created = await invoice({ invoiceNumber: first });
    await invoices.deleteInvoice(database(), created.id);
    expect(await invoices.generateInvoiceNumber(database())).not.toBe(first);
  });
});

describe('Recurring schedule and authorization', () => {
  it('clamps to February and restores the configured month-end anchor', () => {
    expect(nextOccurrence('2026-01-31', 'monthly', 31)).toBe('2026-02-28');
    expect(nextOccurrence('2026-02-28', 'monthly', 31)).toBe('2026-03-31');
    expect(nextOccurrence('2024-02-29', 'yearly', 29)).toBe('2025-02-28');
  });
  it('hides templates and denies their mutation/generation, with idempotent admin generation', async () => {
    const template = await recurring.createRecurringInvoice(database(), {
      clientId, partnerId, createdBy: actorId, scheme: 'commission_based', partnerCommissionRate: '20',
      amount: '1000', defaultExpenses: '50', frequency: 'monthly', dayOfMonth: '31',
      startDate: '2026-01-31', nextInvoiceDate: '2026-01-31', hideFromAssistant: true,
    });
    expect(await recurring.getRecurringInvoices(database(), 'assistant')).toEqual([]);
    expect(await recurring.getDueRecurringInvoices(database(), new Date('2026-12-01'), 'assistant')).toEqual([]);
    expect(await recurring.getActiveRecurringInvoicesForCashFlow(database(), 'assistant')).toEqual([]);
    expect(await recurring.updateRecurringInvoice(database(), template.id, { amount: '2' }, 'assistant')).toBeNull();
    await expect(recurring.createDraftFromRecurring(database(), template.id, undefined, 'assistant')).rejects.toThrow('not found');
    const generated = await recurring.createDraftFromRecurring(database(), template.id, '2026-01-31');
    const again = await recurring.createDraftFromRecurring(database(), template.id, '2026-01-31');
    expect(again.id).toBe(generated.id);
    await invoices.updateInvoice(database(), generated.id, { issueDate: "2026-02-01" });
    expect((await recurring.createDraftFromRecurring(database(), template.id, "2026-01-31")).id).toBe(generated.id);
    const result = await invoices.getInvoice(database(), generated.id);
    expect(Number(result?.calculations?.commissionAmount)).toBe(200);
    expect(Number(result?.calculations?.executorExpensesTotal)).toBe(50);
    expect((await invoices.getInvoiceExpenses(database(), generated.id)).map(expense => expense.paidAt)).toEqual([null]);
    expect((await recurring.getRecurringInvoice(database(), template.id))?.nextInvoiceDate).toBe('2026-02-28');
  });
});

it('reserves only 5 attempts, rejects the rest and resets expired locks', async () => {
  const attempts = await Promise.all(Array.from({ length: 20 }, () => consumeAttempt(database(), 'LIMIT-TEST', 5, 1000000)));
  expect(attempts.filter(r => r.allowed)).toHaveLength(5);
  expect((await consumeAttempt(database(), 'LIMIT-TEST', 5, 1000000 + 900001)).allowed).toBe(true);
});

describe('Complete backup and safe restore', () => {
  it('registers every table, preserves all rows and text dates, revokes restored sessions', async () => {
    expect(Object.values(s).filter(value => is(value, Table)).map(value => getTableName(value as Table)).sort())
      .toEqual(Object.values(backupTables).map(getTableName).sort());
    const created = await invoice();
    await db.insert(s.clientPartners).values({ clientId, partnerId });
    const [pkg] = await db.insert(s.documentPackages).values({ invoiceId: created.id, side: 'client', status: 'accepted', reviewComment: '2026-10-17', reviewedBy: actorId, reviewedAt: new Date(), acceptedAt: new Date() }).returning();
    await db.insert(s.signedActs).values({ invoiceId: created.id, actType: 'company', fileName: 'proof.txt', fileData: 'YQ==', uploadedBy: actorId, packageId: pkg.id });
    await db.insert(s.invoiceMessages).values({ invoiceId: created.id, authorRole: 'admin', authorTokenId: actorId, body: '2026-10-17T00:00:00.000Z' });
    await db.insert(s.assistantBonusPayments).values({ amount: '12', paymentDate: '2026-10-17', paidBy: actorId });
    await db.insert(s.monthlyFinancialPlans).values({ year: '2026', month: '10', salesTarget: '1000' });
    await db.insert(s.assistantActionLogs).values({ accessTokenId: actorId, actionType: 'other', description: 'backup proof' });
    await db.insert(s.partnerPayments).values({ partnerId, invoiceId: created.id, amount: '100', paymentDate: '2026-10-17', createdBy: actorId });
    await db.insert(s.userSessions).values({ sessionId: 'test', csrfToken: 'test', accessTokenId: actorId, expiresAt: new Date(Date.now() + 100000) });
    await db.insert(s.notificationOutbox).values({ clientId, body: 'round trip', deliveredAt: new Date() });
    await db.insert(s.commandReceipts).values({ key: 'round-trip', fingerprint: 'fixture', result: '{}' });
    await db.insert(s.scheduledJobs).values({ key: 'round-trip', state: 'idle' });
    await db.insert(s.serviceUsage).values({ invoiceId: created.id, period: 1, closed: false });
    await db.insert(s.ownerTransfers).values({ owner: 'kot', kind: 'payout', amount: '100', transferDate: '2026-10-17', notes: '2026-10-17', createdBy: actorId });
    const service = new BackupService(database(), directory);
    const info = await service.createBackup();
    const before = await service.downloadBackup(info.id);
    await db.update(s.clients).set({ name: 'Changed after snapshot' }).where(eq(s.clients.id, clientId));
    expect(await service.restoreBackup(info.id)).toMatchObject({ success: true });
    const after = await service.downloadBackup((await service.createBackup()).id);
    for (const key of Object.keys(backupTables) as (keyof typeof backupTables)[]) {
      expect(after!.data[key].length, key).toBeGreaterThan(0);
      const expected = key === 'userSessions' ? before!.data[key].map(row => ({ ...row, revoked: true })) : before!.data[key];
      expect(after!.data[key], key).toEqual(expected);
    }
  });
  it('rejects incomplete legacy backups without modifying any table', async () => {
    const service = new BackupService(database(), directory);
    const before = await db.select().from(s.invoices);
    await writeFile(path.join(directory, 'backup-manual-legacy.json'), JSON.stringify({ version: '1.0', data: {} }));
    expect(await service.restoreBackup('backup-manual-legacy.json')).toMatchObject({ success: false });
    expect(await db.select().from(s.invoices)).toEqual(before);
  });
});

describe('Application transaction and outbox', () => {
  it('rolls back the financial write when audit cannot be persisted', async () => {
    const commands = new InvoiceCommands(database());
    const before = (await db.select().from(s.invoices)).length;
    await expect(commands.create({ role: 'admin', tokenId: '00000000-0000-0000-0000-000000000001' }, {
      invoiceNumber: 'AUDIT-ROLLBACK', clientId, partnerId, createdBy: actorId, scheme: 'agency_30', clientBill: '1000',
    })).rejects.toThrow();
    expect((await db.select().from(s.invoices)).length).toBe(before);
  });
  it('deduplicates a retried command, rejects reuse for another payload and retries delivery', async () => {
    const commands = new InvoiceCommands(database());
    const actor = { role: 'admin' as const, tokenId: actorId, requestKey: 'same-create' };
    const input = { invoiceNumber: 'IDEMPOTENT', clientId, partnerId, createdBy: actorId, scheme: 'agency_30' as const, clientBill: '1000' };
    const first = await commands.create(actor, input);
    expect((await commands.create(actor, input)).id).toBe(first.id);
    await expect(commands.create(actor, { ...input, clientBill: '2000' })).rejects.toThrow('another command');
    const events = await db.select().from(s.notificationOutbox).where(eq(s.notificationOutbox.clientId, clientId));
    const event = events.find(row => row.body.includes('IDEMPOTENT'))!;
    expect(events.filter(row => row.body.includes('IDEMPOTENT'))).toHaveLength(1);
    await db.update(s.clients).set({ tgChatId: 'test-chat', tgBotToken: 'test-token' }).where(eq(s.clients.id, clientId));
    await deliverNotifications(database(), async () => { throw new Error('offline'); });
    let [pending] = await db.select().from(s.notificationOutbox).where(eq(s.notificationOutbox.id, event.id));
    expect(pending.deliveredAt).toBeNull(); expect(pending.attempts).toBe(1);
    await db.update(s.notificationOutbox).set({ nextAttemptAt: new Date(0) }).where(eq(s.notificationOutbox.id, event.id));
    let delivered = 0;
    await deliverNotifications(database(), async () => { delivered++; });
    [pending] = await db.select().from(s.notificationOutbox).where(eq(s.notificationOutbox.id, event.id));
    expect(delivered).toBe(1); expect(pending.deliveredAt).not.toBeNull();
  });
});


describe('Scoped queries and report contracts', () => {
  it('filters and paginates in the tenant scope, including options and counters', async () => {
    const [other] = await db.insert(s.clients).values({ name: 'Other tenant' }).returning();
    const a = await invoice({ clientId: other.id, invoiceNumber: 'PAGE-AAA', clientBill: '100' });
    const b = await invoice({ clientId: other.id, invoiceNumber: 'PAGE-BBB', clientBill: '200' });
    await invoice({ invoiceNumber: 'PAGE-PRIVATE' });
    const actor = { role: 'client' as const, clientId: other.id };
    const query = { page: 1, limit: 1, search: 'PAGE-', sort: 'amount-desc' as const };
    const first = await invoices.getInvoices(database(), 'client', undefined, other.id, query);
    const second = await invoices.getInvoices(database(), 'client', undefined, other.id, { ...query, page: 2 });
    expect(first.map(row => row.id)).toEqual([b.id]); expect(second.map(row => row.id)).toEqual([a.id]);
    const metadata = await invoices.getInvoiceListMetadata(database(), actor, query);
    expect(metadata.total).toBe(2); expect(metadata.statusCounts.all).toBe(2);
    expect(metadata.clients.map(row => row.id)).toEqual([other.id]); expect(metadata.partners).toEqual([]);
    const response = JSON.parse(JSON.stringify({ invoices: stripSensitiveFieldsFromList(first, 'client'), ...metadata, page: 1, pages: 2 }));
    expect(invoicePageSchema.safeParse(response).success).toBe(true);
    expect(await invoices.getInvoices(database(), 'client', undefined, undefined, query)).toEqual([]);
    await invoices.createInvoiceExpense(database(), { invoiceId: a.id, description: 'Scoped export', amount: '50', createdBy: actorId });
    expect((await invoices.getAllExpenses(database(), [a.id])).map(row => row.invoiceId)).toEqual([a.id]);
    expect(await invoices.getAllExpenses(database(), [])).toEqual([]);
  });
  it('uses real schema columns for forecast and overdue reports', async () => {
    const created = await invoice({ status: 'sent', issueDate: '2020-01-15', paymentDate: '2020-01-20' });
    expect((await getInvoicesByMonth(database(), 1, 2020, 'forecast')).some(row => row.id === created.id)).toBe(true);
    expect((await getOverdueInvoicesDetailed(database(), { role: 'admin' })).find(row => row.id === created.id)).toMatchObject({ priority_level: 'high', client_bill: 1000 });
  });
  it('keeps money conserved when half a kopeck must be rounded', () => {
    const result = calculateInvoiceFinancials({ scheme: 'commission_based', clientBill: 0.01 });
    expect(result.adminShare50).toBe(0.01); expect(result.catShare50).toBe(0);
    expect(result.adminShare50 + result.catShare50).toBe(result.netProfitAdmin);
  });
  it('rolls back the entire restore when a snapshot contains a broken foreign key', async () => {
    const service = new BackupService(database(), directory);
    const snapshot = await service.downloadBackup((await service.createBackup()).id);
    const before = await db.select().from(s.invoices);
    snapshot!.data.invoiceExpenses[0].invoiceId = '00000000-0000-0000-0000-000000000099';
    await writeFile(path.join(directory, 'backup-manual-invalid-fk.json'), JSON.stringify(snapshot));
    expect(await service.restoreBackup('backup-manual-invalid-fk.json')).toMatchObject({ success: false });
    expect(await db.select().from(s.invoices)).toEqual(before);
  });
});

it('exports scoped invoices with bounded keyset pages and no duplicates', async () => {
  const [client] = await db.insert(s.clients).values({ name: 'Export scope' }).returning();
  await db.insert(s.invoices).values(Array.from({ length: 205 }, (_, i) => ({ invoiceNumber: `EXPORT-${i}`, clientId: client.id, partnerId, scheme: 'agency_30' as const, createdBy: actorId })));
  const ids = new Set<string>(); const sizes: number[] = [];
  for await (const page of invoiceExportPages(database(), { role: 'client', clientId: client.id }, {})) {
    sizes.push(page.length);
    for (const row of page) { expect(row.clientId).toBe(client.id); expect(ids.has(row.id)).toBe(false); ids.add(row.id); }
  }
  expect(sizes).toEqual([200, 5]); expect(ids.size).toBe(205);
});
