import { beforeAll, afterAll, it, expect } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { readFile } from 'node:fs/promises';
import { createTestDb, seedPartnerAndClient, type TestDb } from '../test/testDb';
import * as repo from './invoiceRepo';
import * as s from '../../shared/schema';
import { InvoiceCommands } from '../services/invoiceCommands';
let db: TestDb, close: () => Promise<void>, partnerId: string, clientId: string, actorId: string;
const database = () => db as unknown as typeof import('../db').db;
let sequence = 0;
beforeAll(async () => {
  ({ db, close } = await createTestDb());
  ({ partnerId, clientId } = await seedPartnerAndClient(db));
  [actorId] = (await db.insert(s.accessTokens).values({ code: 'PERIOD-TEST', role: 'admin' }).returning()).map(row => row.id);
});
afterAll(async () => { await close(); });
const make = () => repo.createInvoice(database(), { invoiceNumber: `P-${++sequence}`, clientId, partnerId, createdBy: actorId,
  scheme: 'commission_based', serviceType: 'periodic', periodUnit: 'month', pricePerPeriod: '100', totalPeriods: 3 });
const actor = () => ({ tokenId: actorId, role: 'admin' as const });
it('expenses never consume or reopen service periods; financial projections follow the separate ledger', async () => {
  const inv = await make(), commands = new InvoiceCommands(database());
  const expense = await commands.createExpense(actor(), { invoiceId: inv.id, description: 'Payment', amount: '25' });
  expect((await repo.getInvoice(database(), inv.id))!.periodsUsed).toBe(0);
  await commands.setPeriod(actor(), inv.id, 1, true);
  await commands.deleteExpense(actor(), expense.id);
  const result = (await repo.getInvoice(database(), inv.id))!;
  expect(result.periodsUsed).toBe(1);
  expect(Number(result.calculations!.clientSpent)).toBe(100);
  expect(Number(result.calculations!.clientRemaining)).toBe(200);
  expect(Number(result.calculations!.executorExpensesTotal)).toBe(0);
});
it('retries are idempotent, stale requests conflict, and reopening retains an audit trail', async () => {
  const inv = await make(), commands = new InvoiceCommands(database());
  const keyed = { ...actor(), requestKey: 'period-once' };
  expect(await commands.setPeriod(keyed, inv.id, 1, true)).toEqual(await commands.setPeriod(keyed, inv.id, 1, true));
  await expect(commands.setPeriod(actor(), inv.id, 1, true)).rejects.toMatchObject({ status: 409 });
  await commands.setPeriod(actor(), inv.id, 2, true);
  await expect(commands.setPeriod(actor(), inv.id, 1, false)).rejects.toMatchObject({ status: 409 });
  await commands.setPeriod(actor(), inv.id, 2, false);
  expect((await repo.getInvoice(database(), inv.id))!.periodsUsed).toBe(1);
  expect(await db.select().from(s.serviceUsage).where(eq(s.serviceUsage.invoiceId, inv.id))).toHaveLength(2);
  expect(await db.select().from(s.assistantActionLogs).where(eq(s.assistantActionLogs.entityId, inv.id))).toHaveLength(3);
});
it('rejects arbitrary counter writes, invalid terms, overuse and cancelled invoices', async () => {
  const inv = await make(), commands = new InvoiceCommands(database());
  await commands.setPeriod(actor(), inv.id, 1, true);
  await expect(repo.updateInvoice(database(), inv.id, { periodsUsed: 0 })).rejects.toMatchObject({ status: 400 });
  await expect(commands.update(actor(), inv.id, { serviceType: 'one_time' })).rejects.toMatchObject({ status: 409 });
  await expect(commands.update(actor(), inv.id, { periodUnit: 'hour' })).rejects.toMatchObject({ status: 409 });
  await commands.setPeriod(actor(), inv.id, 2, true);
  await expect(commands.update(actor(), inv.id, { totalPeriods: 1 })).rejects.toMatchObject({ status: 400 });
  await commands.setPeriod(actor(), inv.id, 3, true);
  await expect(commands.setPeriod(actor(), inv.id, 4, true)).rejects.toMatchObject({ status: 409 });
  await commands.update(actor(), inv.id, { status: 'cancelled' });
  await expect(commands.setPeriod(actor(), inv.id, 3, false)).rejects.toMatchObject({ status: 400 });
});
it('uses centralized role policy on closing, reopening and receipt replay', async () => {
  const inv = await make(), commands = new InvoiceCommands(database());
  await expect(commands.setPeriod({ ...actor(), role: 'client', clientId }, inv.id, 1, true)).rejects.toMatchObject({ status: 403 });
  const assistant = { ...actor(), role: 'assistant' as const, requestKey: 'assistant-period' };
  await commands.setPeriod(assistant, inv.id, 1, true);
  await db.update(s.invoices).set({ hideFromAssistant: true }).where(eq(s.invoices.id, inv.id));
  await expect(commands.setPeriod(assistant, inv.id, 1, true)).rejects.toMatchObject({ status: 404 });
  await expect(commands.setPeriod(assistant, inv.id, 1, false)).rejects.toMatchObject({ status: 409 });
  await commands.setPeriod({ ...actor(), role: 'accountant' }, inv.id, 1, false);
});
it('migration preserves historical counters exactly and does not invent closing dates', async () => {
  const inv = await make();
  await db.update(s.invoices).set({ periodsUsed: 2 }).where(eq(s.invoices.id, inv.id));
  const migration = await readFile('drizzle/0005_certain_ricochet.sql', 'utf8');
  await db.execute(sql.raw(migration.slice(migration.indexOf('INSERT INTO service_usage'))));
  const rows = await db.select().from(s.serviceUsage).where(eq(s.serviceUsage.invoiceId, inv.id));
  expect(rows.map(row => row.period).sort()).toEqual([1, 2]);
  expect(rows.every(row => row.source === 'legacy' && row.closedAt === null)).toBe(true);
  await repo.updateInvoiceCalculations(database(), inv.id, {});
  expect((await repo.getInvoice(database(), inv.id))!.periodsUsed).toBe(2);
});
it('audit failure rolls back the usage entry, projection and notification', async () => {
  const inv = await make(), commands = new InvoiceCommands(database());
  await expect(commands.setPeriod({ ...actor(), tokenId: '00000000-0000-0000-0000-000000000001' }, inv.id, 1, true)).rejects.toThrow();
  expect((await repo.getInvoice(database(), inv.id))!.periodsUsed).toBe(0);
  expect(await db.select().from(s.serviceUsage).where(eq(s.serviceUsage.invoiceId, inv.id))).toHaveLength(0);
});
