import { afterAll, expect, it } from 'vitest';
import { createApp } from './app';
import { PaymentCommands } from './services/paymentCommands';
// Full production route registry, real sessions and isolated SQL fixtures for R1–R8.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { eq } from 'drizzle-orm';
import { createTestDb } from './test/testDb';
import type { db as productionDb } from './db';
import { createSession } from './repositories/userRepo';
import { createInvoice, createInvoiceExpense } from './repositories/invoiceRepo';
import * as s from '../shared/schema';

const { db, close } = await createTestDb();
const database = db as unknown as typeof productionDb;
const sessions: Record<string, Record<string, string>> = {};
const [partnerA, partnerB, roundingPartner] = await db.insert(s.partners).values([
  { name: 'SYNTHETIC Partner A' }, { name: 'SYNTHETIC Partner B' }, { name: 'SYNTHETIC Rounding' },
]).returning();
const [clientA, clientB] = await db.insert(s.clients).values([
  { name: 'SYNTHETIC Client A', partnerId: partnerA.id }, { name: 'SYNTHETIC Client B', partnerId: partnerB.id },
]).returning();
let actorId = '';
for (const [name, fields] of Object.entries({
  admin: { role: 'admin' }, assistant: { role: 'assistant' }, accountant: { role: 'accountant' },
  client: { role: 'client', clientId: clientA.id },
  partnerA: { role: 'partner', partnerId: partnerA.id },
  partnerB: { role: 'partner', partnerId: partnerB.id },
  unscopedPartner: { role: 'partner' },
} as const)) {
  const [token] = await db.insert(s.accessTokens).values({ code: `SYNTHETIC-REVIEW-${name}`, ...fields }).returning();
  if (name === 'admin') actorId = token.id;
  const session = await createSession(database, token.id);
  sessions[name] = { Cookie: `session_id=${encodeURIComponent(session.sessionId)}`, 'X-CSRF-Token': session.csrfToken, 'Content-Type': 'application/json' };
}
async function invoice(number: string, values: Partial<s.InsertInvoice> = {}) {
  return createInvoice(database, { partnerId: partnerA.id, clientId: clientA.id, createdBy: actorId,
    invoiceNumber: number, scheme: 'commission_based', status: 'sent', clientBill: '1000',
    partnerCommissionRate: '15', plannedExpenses: '200', ...values });
}
const privateCommission = await invoice('SYNTHETIC-CLOSED-COMMISSION');
await createInvoiceExpense(database, { invoiceId: privateCommission.id, description: 'SYNTHETIC internal expense', amount: '123.45', createdBy: actorId });
const hiddenAgency = await invoice('SYNTHETIC-HIDDEN-AGENCY', { scheme: 'agency_30', status: 'paid', hideFromAssistant: true, notes: 'SYNTHETIC PRIVATE NOTE' });
const hiddenPartner = await invoice('SYNTHETIC-HIDDEN-PARTNER', { hideFromAssistant: true });
const foreignInvoice = await invoice('SYNTHETIC-FOREIGN', { clientId: clientB.id, partnerId: partnerB.id });
await db.insert(s.invoiceExpenses).values(Array.from({ length: 25 }, (_, index) => ({ invoiceId: foreignInvoice.id, description: `SYNTHETIC foreign expense ${index}`, amount: '1', createdBy: actorId })));
await db.insert(s.invoiceMessages).values(Array.from({ length: 10 }, (_, index) => ({ invoiceId: foreignInvoice.id, authorRole: 'admin' as const, authorTokenId: actorId, body: `SYNTHETIC foreign message ${index}` })));
for (let i = 0; i < 2; i++) await invoice(`SYNTHETIC-ROUND-${i}`, { partnerId: roundingPartner.id, clientBill: '0.05', partnerCommissionRate: '10', plannedExpenses: '0.01' });

const app = createApp({ database });
const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
const address = server.address(); assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;
async function request(role: string, path: string, method = 'GET', body?: unknown, headers = {}) {
  const response = await fetch(base + path, { method, headers: { ...sessions[role], ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await close(); });

it('R1: personal export uses the same client field projection for every scheme and periodic usage', async () => {
  for (const scheme of ['agency_30', 'agency_40', 'agency', 'partner_10', 'partner_15', 'commission_based'] as const) {
    for (const periodic of [false, true]) {
      const inv = await invoice(`PROJECTION-${scheme}-${periodic}`, { scheme, ...(periodic ? { serviceType: 'periodic', pricePerPeriod: '500', totalPeriods: 2 } : {}) });
      const normal = await request('client', `/api/invoices/${inv.id}`);
      const exported = await request('client', '/api/me/data-export');
      expect(normal.status).toBe(200); expect(exported.status).toBe(200);
      const actual = exported.body.invoices.find((row: { id: string }) => row.id === inv.id);
      expect(actual).toEqual(normal.body);
      for (const key of ['commissionRate', 'commissionAmount', 'netProfitAdmin', 'adminShare50', 'catShare50']) expect(actual.calculations?.[key]).toBeUndefined();
    }
  }
});

it('R2: reports obey assistant visibility and partner ownership, and fail closed without a partner ID', async () => {
  expect((await request('assistant', `/api/invoices/${hiddenAgency.id}`)).status).toBe(404);
  for (const path of ['/api/do-not-spend', '/api/do-not-spend/partner-schemes']) {
    const response = await request('assistant', path);
    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).not.toContain(hiddenAgency.id);
    expect(JSON.stringify(response.body)).not.toContain(hiddenPartner.id);
    expect(JSON.stringify(response.body)).not.toContain('SYNTHETIC PRIVATE NOTE');
  }
  for (const path of ['/api/do-not-spend', '/api/do-not-spend/partner-schemes', '/api/expected-commission']) {
    const unscoped = await request('unscopedPartner', path);
    expect(unscoped.status).toBe(200); expect(unscoped.body).toEqual([]);
    const own = await request('partnerA', path);
    expect(own.status).toBe(200); expect(JSON.stringify(own.body)).not.toContain(foreignInvoice.id);
    expect((await request('client', path)).status).toBe(403);
  }
});

it('R3: blocks reassignment with payments and never gives a new invoice owner another partner payment', async () => {
  const inv = await invoice('PAYMENT-OWNER-GUARD');
  const payment = await request('admin', '/api/partner-payments', 'POST', { partnerId: partnerA.id, invoiceId: inv.id, amount: '100', paymentDate: '2026-10-18' });
  expect(payment.status).toBe(201);
  expect((await request('admin', `/api/invoices/${inv.id}`, 'PATCH', { partnerId: partnerB.id })).status).toBe(409);
  expect((await request('admin', `/api/invoices/${inv.id}`, 'PATCH', { clientId: clientB.id })).status).toBe(409);
  const mismatched = await request('admin', '/api/partner-payments', 'POST', { partnerId: partnerA.id, invoiceId: foreignInvoice.id, amount: '200', paymentDate: '2026-10-18' });
  expect(mismatched.status).toBe(409);
  // Old inconsistencies must remain available to their recorded payer, without leaking to B.
  const [legacy] = await db.insert(s.partnerPayments).values({ partnerId: partnerA.id, invoiceId: foreignInvoice.id, amount: '50', paymentDate: '2026-10-18', notes: 'legacy-owner-A', createdBy: actorId }).returning();
  expect((await request('partnerA', '/api/partner-payments')).body.some((p: { id: string; partnerId: string }) => p.id === legacy.id)).toBe(true);
  expect((await request('partnerB', '/api/partner-payments')).body.some((p: { id: string; partnerId: string }) => p.id === legacy.id)).toBe(false);
  const [unchanged] = await db.select().from(s.partnerPayments).where(eq(s.partnerPayments.id, legacy.id));
  expect(unchanged.partnerId).toBe(partnerA.id); expect(unchanged.amount).toBe('50.00');
  const free = await invoice('REASSIGN-WITHOUT-PAYMENTS');
  expect((await request('admin', `/api/invoices/${free.id}`, 'PATCH', { partnerId: partnerB.id })).status).toBe(200);
});

it('R4: rejects invoice deletion with a payment at both HTTP and FK boundaries', async () => {
  const inv = await invoice('PAYMENT-HISTORY-KEEP', { status: 'paid' });
  const payment = await request('admin', '/api/partner-payments', 'POST', { partnerId: partnerA.id, invoiceId: inv.id, amount: '100', paymentDate: '2026-10-18' });
  expect(payment.status).toBe(201);
  const removed = await request('admin', `/api/invoices/${inv.id}`, 'DELETE'); expect(removed.status).toBe(409);
  await expect(db.delete(s.invoices).where(eq(s.invoices.id, inv.id))).rejects.toThrow();
  expect(await db.select().from(s.partnerPayments).where(eq(s.partnerPayments.id, payment.body.id))).toHaveLength(1);
  expect((await request('admin', `/api/invoices/${inv.id}`)).status).toBe(200);
});

it('archives and restores paid invoices without changing money, transfers, usage, payment history or role access', async () => {
  const source = await invoice('ARCHIVE-SOURCE', { scheme: 'agency_30', status: 'paid' });
  const target = await invoice('ARCHIVE-TARGET', { scheme: 'agency_30', status: 'paid', serviceType: 'periodic', pricePerPeriod: '500', totalPeriods: 2 });
  await request('admin', '/api/invoices/transfer', 'POST', { fromInvoiceId: source.id, toInvoiceId: target.id, amount: '100.01' });
  await request('admin', `/api/invoices/${target.id}/periods`, 'POST', { period: 1, closed: true });
  await request('admin', '/api/partner-payments', 'POST', { invoiceId: target.id, partnerId: partnerA.id, amount: '80', paymentDate: '2026-10-18' });
  const calculations = await db.select().from(s.invoiceCalculations);
  const transfers = await db.select().from(s.invoiceTransfers);
  const usage = await db.select().from(s.serviceUsage);
  const payments = await db.select().from(s.partnerPayments);
  const before = (await request('admin', `/api/invoices/${target.id}`)).body;
  const reportBefore = (await request('admin', '/api/do-not-spend')).body;
  const headers = { 'Idempotency-Key': 'archive-once' };
  const result = await request('admin', `/api/invoices/${target.id}/archive`, 'POST', { archived: true }, headers);
  expect(result.status).toBe(200); expect(result.body.archivedAt).toBeTruthy();
  expect((await request('admin', `/api/invoices/${target.id}/archive`, 'POST', { archived: true }, headers)).body).toEqual(result.body);
  expect((await request('admin', `/api/invoices/${target.id}/archive`, 'POST', { archived: false }, headers)).status).toBe(409);
  expect((await request('admin', '/api/invoices?archive=active&search=ARCHIVE-TARGET')).body.total).toBe(0);
  const archivedPage = (await request('admin', '/api/invoices?archive=archived&search=ARCHIVE-TARGET')).body;
  expect(archivedPage.total).toBe(1);
  expect(archivedPage.statusCounts).toMatchObject({ all: 1, paid: 1 });
  expect((await request('admin', '/api/invoices?search=ARCHIVE-TARGET')).body.total).toBe(1);
  for (const role of ['client', 'partnerA', 'assistant']) {
    expect((await request(role, `/api/invoices/${target.id}`)).status).toBe(200);
    expect((await request(role, '/api/invoices?search=ARCHIVE-TARGET')).body.total).toBe(1);
    expect((await request(role, `/api/invoices/${target.id}/archive`, 'POST', { archived: false })).status).toBe(403);
    expect((await request(role, '/api/invoices?archive=archived')).status).toBe(403);
  }
  expect((await request('accountant', `/api/invoices/${target.id}`)).status).toBe(404);
  expect((await request('accountant', `/api/invoices/${target.id}/archive`, 'POST', { archived: true })).status).toBe(403);
  expect((await request('accountant', '/api/invoices?archive=archived')).status).toBe(403);
  const hiddenBefore = (await request('accountant', `/api/invoices/${hiddenAgency.id}`)).body;
  expect((await request('admin', `/api/invoices/${hiddenAgency.id}/archive`, 'POST', { archived: true })).status).toBe(200);
  expect((await request('accountant', `/api/invoices/${hiddenAgency.id}`)).body).toEqual(hiddenBefore);
  expect((await request('assistant', `/api/invoices/${hiddenAgency.id}`)).status).toBe(404);
  await request('admin', `/api/invoices/${hiddenAgency.id}/archive`, 'POST', { archived: false });
  expect((await request('admin', `/api/invoices/${target.id}/archive`, 'POST', { archived: true, clientBill: '1' })).status).toBe(400);
  expect((await request('admin', `/api/invoices/${target.id}`, 'DELETE')).status).toBe(409);
  expect((await request('admin', '/api/do-not-spend')).body).toEqual(reportBefore);
  expect(await db.select().from(s.invoiceCalculations)).toEqual(calculations);
  expect(await db.select().from(s.invoiceTransfers)).toEqual(transfers);
  expect(await db.select().from(s.serviceUsage)).toEqual(usage);
  expect(await db.select().from(s.partnerPayments)).toEqual(payments);
  const after = (await request('admin', `/api/invoices/${target.id}`)).body;
  expect({ ...after, archivedAt: null }).toEqual(before);
  const audit = await db.select().from(s.assistantActionLogs).where(eq(s.assistantActionLogs.entityId, target.id));
  expect(audit.filter(row => JSON.parse(row.details!).operation === 'archive')).toHaveLength(1);
  expect((await request('admin', `/api/invoices/${target.id}/archive`, 'POST', { archived: false })).status).toBe(200);
  expect((await request('admin', '/api/invoices?archive=active&search=ARCHIVE-TARGET')).body.total).toBe(1);
  expect((await request('admin', `/api/invoices/${target.id}`)).body).toEqual(before);
});

it('preserves many-to-one balance consolidation, original bills/commissions, and independent transfer cancellation', async () => {
  const sources = await Promise.all(['100.10', '200.20', '300.30'].map((clientBill, index) =>
    invoice(`CONSOLIDATE-${index}`, { scheme: 'agency_30', clientBill })));
  const target = await invoice('CONSOLIDATE-TARGET', { scheme: 'agency_30', clientBill: '400.40' });
  const original = await Promise.all([...sources, target].map(inv => request('admin', `/api/invoices/${inv.id}`)));
  const totalBefore = original.reduce((sum, response) => sum + Math.round(Number(response.body.calculations.clientRemaining) * 100), 0);
  const ids: string[] = [];
  for (const [index, source] of sources.entries()) {
    const transfer = await request('admin', '/api/invoices/transfer', 'POST', {
      fromInvoiceId: source.id, toInvoiceId: target.id, amount: original[index].body.calculations.clientRemaining,
    });
    expect(transfer.status).toBe(201); ids.push(transfer.body.id);
  }
  for (const source of sources) expect((await request('admin', `/api/invoices/${source.id}`)).body.calculations.clientRemaining).toBe('0.00');
  expect(Math.round(Number((await request('admin', `/api/invoices/${target.id}`)).body.calculations.clientRemaining) * 100)).toBe(totalBefore);
  expect((await request('admin', `/api/invoices/${target.id}`, 'DELETE')).status).toBe(409);
  expect((await request('admin', `/api/invoices/${target.id}`, 'PATCH', { notes: 'Preserve consolidation' })).status).toBe(200);
  for (const [index, inv] of [...sources, target].entries()) {
    const now = (await request('admin', `/api/invoices/${inv.id}`)).body;
    for (const field of ['clientBill', 'commissionAmount', 'agencyMargin', 'partnerShareFromMargin', 'adminShareFromMargin'])
      expect(now.calculations[field]).toEqual(original[index].body.calculations[field]);
  }
  expect((await request('admin', `/api/transfers/${ids[1]}`, 'DELETE')).status).toBe(200);
  expect((await request('admin', `/api/invoices/${sources[1].id}`)).body.calculations.clientRemaining).toBe(original[1].body.calculations.clientRemaining);
  const all = await Promise.all([...sources, target].map(inv => request('admin', `/api/invoices/${inv.id}`)));
  expect(all.reduce((sum, response) => sum + Math.round(Number(response.body.calculations.clientRemaining) * 100), 0)).toBe(totalBefore);
});

it('R5: report commission is the sum of booked, individually rounded values', async () => {
  const report = await request('admin', '/api/do-not-spend/partner-schemes');
  const summary = report.body.find((p: { id: string; partnerId: string }) => p.partnerId === roundingPartner.id);
  expect(summary.totalCommission).toBe(0.02);
  expect(summary.invoices.map((i: { commission: number }) => i.commission)).toEqual([0.01, 0.01]);
});

it('R6: large personal export reads scoped batches of at most 200 rows and remains valid JSON', async () => {
  const own = await invoice('PAGED-PERSONAL-EXPORT', { scheme: 'agency_30' });
  await db.insert(s.invoiceExpenses).values(Array.from({ length: 451 }, (_, index) => ({ invoiceId: own.id, description: `Own ${index}`, amount: '1', createdBy: actorId })));
  await db.insert(s.invoiceMessages).values(Array.from({ length: 451 }, (_, index) => ({ invoiceId: own.id, authorRole: 'admin' as const, authorTokenId: actorId, body: `Own ${index}` })));
  const traced: Array<{ query: string; rows: number }> = [];
  const pglite = db.$client, original = pglite.query.bind(pglite);
  pglite.query = async <T>(...args: Parameters<typeof original>) => { const result = await original<T>(...args); traced.push({ query: args[0], rows: result.rows.length }); return result; };
  let exported: Awaited<ReturnType<typeof request>>;
  try { exported = await request('client', '/api/me/data-export'); } finally { pglite.query = original; }
  expect(exported.status).toBe(200);
  expect(exported.body.expenses.filter((e: { invoiceId: string }) => e.invoiceId === own.id)).toHaveLength(451);
  expect(exported.body.messages.filter((e: { invoiceId: string }) => e.invoiceId === own.id)).toHaveLength(451);
  expect(JSON.stringify(exported.body)).not.toContain(foreignInvoice.id);
  const childQueries = traced.filter(row => /from "invoice_(expenses|messages)"/.test(row.query));
  expect(childQueries.length).toBeGreaterThanOrEqual(6);
  for (const q of childQueries) { expect(q.query).toMatch(/where/i); expect(q.query).toMatch(/limit/i); expect(q.rows).toBeLessThanOrEqual(200); }
  expect(childQueries.reduce((total, q) => total + q.rows, 0)).toBe(exported.body.expenses.length + exported.body.messages.length);
});

it('R8: repeated payment commands are idempotent, conflicts fail, corrections/cancellations retain audit', async () => {
  const inv = await invoice('IDEMPOTENT-PAYMENT');
  const body = { partnerId: partnerA.id, invoiceId: inv.id, amount: '100,50', paymentDate: '2026-10-18', notes: 'Original' };
  const headers = { 'Idempotency-Key': 'payment-record-regression' };
  const first = await request('admin', '/api/partner-payments', 'POST', body, headers);
  const repeat = await request('admin', '/api/partner-payments', 'POST', body, headers);
  expect(first.status).toBe(201); expect(repeat.body).toEqual(first.body); expect(first.body.amount).toBe('100.50');
  expect((await request('admin', '/api/partner-payments', 'POST', { ...body, amount: '200' }, headers)).status).toBe(409);
  for (const role of ['client', 'assistant', 'partnerA']) {
    expect((await request(role, '/api/partner-payments', 'POST', body)).status).toBe(403);
    expect((await request(role, `/api/partner-payments/${first.body.id}`, 'PUT', body)).status).toBe(403);
    expect((await request(role, `/api/partner-payments/${first.body.id}`, 'DELETE')).status).toBe(403);
  }
  const updateHeaders = { 'Idempotency-Key': 'payment-correct-regression' };
  const correction = { amount: '90.01', paymentDate: '2026-10-18', notes: 'Corrected', partnerId: partnerB.id };
  const corrected = await request('admin', `/api/partner-payments/${first.body.id}`, 'PUT', correction, updateHeaders);
  expect(corrected.status).toBe(200); expect(corrected.body.partnerId).toBe(partnerA.id);
  expect((await request('admin', `/api/partner-payments/${first.body.id}`, 'PUT', correction, updateHeaders)).body).toEqual(corrected.body);
  const cancelHeaders = { 'Idempotency-Key': 'payment-cancel-regression' };
  expect((await request('admin', `/api/partner-payments/${first.body.id}`, 'DELETE', undefined, cancelHeaders)).status).toBe(204);
  expect((await request('admin', `/api/partner-payments/${first.body.id}`, 'DELETE', undefined, cancelHeaders)).status).toBe(204);
  const audit = await db.select().from(s.assistantActionLogs).where(eq(s.assistantActionLogs.entityId, first.body.id));
  expect(audit).toHaveLength(3);
  const records = audit.map(row => JSON.parse(row.details!));
  expect(records.find(row => row.command === 'record').after.amount).toBe('100.50');
  expect(records.find(row => row.command === 'correct').before.amount).toBe('100.50');
  expect(records.find(row => row.command === 'cancel').before.amount).toBe('90.01');
  expect(records.find(row => row.command === 'cancel').after).toBeNull();
});

it('R8: failed audit rolls back payment and command receipt together; dates and tiny/invalid money are rejected', async () => {
  const inv = await invoice('PAYMENT-ROLLBACK');
  const commands = new PaymentCommands(database);
  await expect(commands.record({ role: 'admin', tokenId: '00000000-0000-4000-8000-000000000000', requestKey: 'rollback' },
    { partnerId: partnerA.id, invoiceId: inv.id, amount: '100', paymentDate: '2026-10-18' })).rejects.toThrow();
  expect(await db.select().from(s.partnerPayments).where(eq(s.partnerPayments.invoiceId, inv.id))).toHaveLength(0);
  expect(await db.select().from(s.commandReceipts).where(eq(s.commandReceipts.key, '00000000-0000-4000-8000-000000000000:payment:rollback'))).toHaveLength(0);
  for (const change of [{ amount: '-1' }, { amount: '0.001' }, { amount: 'invalid' }, { paymentDate: '2026-02-30' }]) {
    expect((await request('admin', '/api/partner-payments', 'POST', { partnerId: partnerA.id, amount: '1', paymentDate: '2026-10-18', ...change })).status).toBe(400);
  }
});
