import { createApp } from './app';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { once } from 'node:events';
import type { Server } from 'node:http';
import express from 'express';
import cookieParser from 'cookie-parser';
import { eq } from 'drizzle-orm';
import { createTestDb, type TestDb } from './test/testDb';
import type { db as productionDb } from './db';
import { DatabaseStorage } from './storage';
import { createAuthMiddleware } from './middleware';
import { createSession } from './repositories/userRepo';
import { createInvoice, createInvoiceExpense } from './repositories/invoiceRepo';
import { InvoiceCommands } from './services/invoiceCommands';
import { createInvoicesRouter } from './routes/invoices';
import { createActsRouter } from './routes/acts';
import { createMessagesRouter } from './routes/messages';
import { createDashboardRouter } from './routes/dashboard';
import { createExportRouter } from './routes/export';
import * as s from '../shared/schema';

// Real sessions, middleware, routes, commands and SQL. Expectations below are
// deliberately independent of invoiceScope / the production permission tables.
const roles = ['admin', 'assistant', 'accountant', 'partner', 'client'] as const;
const schemes = ['agency_30', 'agency_40', 'agency', 'partner_10', 'partner_15', 'commission_based'] as const;
let db: TestDb, close: () => Promise<void>, server: Server, base: string;
const database = () => db as unknown as typeof productionDb;
const sessions: Record<string, Record<string, string>> = {};
const fixtures: Array<{ id: string; owner: number; hidden: boolean; scheme: s.InvoiceScheme; expenseId: string; companyId: string; executorId: string }> = [];
const allowed = (role: s.UserRole, row: typeof fixtures[number]) => role === 'admin' || (role === 'assistant' ? !row.hidden : role === 'accountant' ? row.hidden : row.owner === 0);
const request = (role: string, path: string, method = 'GET', body?: unknown) => fetch(base + path, { method, headers: sessions[role], ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  const owners: Array<{ clientId: string; partnerId: string }> = [];
  for (let owner = 0; owner < 2; owner++) {
    const [p] = await db.insert(s.partners).values({ name: `Owner ${owner}` }).returning();
    const [c] = await db.insert(s.clients).values({ name: `Customer ${owner}`, partnerId: p.id }).returning();
    owners.push({ clientId: c.id, partnerId: p.id });
  }
  let actorId = '';
  for (const role of [...roles, 'partner-unscoped', 'client-unscoped']) {
    const [token] = await db.insert(s.accessTokens).values({ code: `AUDIT-${role}`, role: role.split('-')[0] as s.UserRole,
      ...(role === 'partner' ? { partnerId: owners[0].partnerId } : role === 'client' ? { clientId: owners[0].clientId } : {}) }).returning();
    if (role === 'admin') actorId = token.id;
    const session = await createSession(database(), token.id);
    sessions[role] = { Cookie: `session_id=${encodeURIComponent(session.sessionId)}`, 'X-CSRF-Token': session.csrfToken, 'Content-Type': 'application/json' };
  }
  for (const [owner, scope] of owners.entries()) for (const hidden of [false, true]) for (const scheme of schemes) {
    const inv = await createInvoice(database(), { ...scope, createdBy: actorId, invoiceNumber: `AC-${owner}-${hidden}-${scheme}`, scheme,
      hideFromAssistant: hidden, clientBill: '1000', partnerCommissionRate: '15', status: 'sent', paymentDate: '2020-01-01' }, { commissionRate: '40' });
    const expense = await createInvoiceExpense(database(), { invoiceId: inv.id, description: 'AC expense', amount: '123.45', createdBy: actorId });
    const acts = await db.insert(s.signedActs).values(['company', 'executor'].map(actType => ({ invoiceId: inv.id, actType: actType as 'company' | 'executor', fileName: 'test.txt', fileData: Buffer.from('document').toString('base64'), mimeType: 'text/plain', uploadedBy: actorId }))).returning();
    await db.insert(s.invoiceMessages).values({ invoiceId: inv.id, expenseId: expense.id, authorRole: 'admin', authorTokenId: actorId, body: 'AC message' });
    fixtures.push({ id: inv.id, owner, hidden, scheme, expenseId: expense.id, companyId: acts[0].id, executorId: acts[1].id });
  }
  const app = createApp({ database: database() });
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing server');
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await close(); });

it.each(roles)('%s: preserves invoice scope, money visibility and child-resource access for all six schemes', async role => {
  const list = await request(role, '/api/invoices').then(r => r.json());
  expect(list.total).toBe(role === 'admin' ? 24 : 12);
  expect(list.invoices.map((r: { id: string }) => r.id).sort()).toEqual(fixtures.filter(r => allowed(role, r)).map(r => r.id).sort());
  for (const row of fixtures) {
    const visible = allowed(role, row), status = visible ? 200 : 404;
    const response = await request(role, `/api/invoices/${row.id}`); expect(response.status).toBe(status);
    if (visible) {
      const invoice = await response.json();
      if (role !== 'admin') for (const key of ['netProfitAdmin', 'adminShare50', 'catShare50']) expect(invoice.calculations?.[key]).toBeUndefined();
      if (role === 'assistant' || role === 'accountant' || role === 'client') for (const key of ['commissionRate', 'commissionAmount', 'partnerShareFromMargin', 'adminShareFromMargin']) expect(invoice.calculations?.[key]).toBeUndefined();
      if (role === 'client' && !row.scheme.startsWith('agency')) expect(invoice.calculations).toBeUndefined();
      if (role === 'client' && row.scheme.startsWith('agency')) expect(invoice.calculations.executorExpensesTotal).toBe('123.45');
    }
    const expenses = await request(role, `/api/invoices/${row.id}/expenses`); expect(expenses.status).toBe(status);
    if (visible) {
      const [expense] = await expenses.json();
      expect(expense.amount).toBe(role === 'client' && !row.scheme.startsWith('agency') ? undefined : '123.45');
    }
    const acts = await request(role, `/api/invoices/${row.id}/acts`); expect(acts.status).toBe(status);
    if (visible) expect((await acts.json()).length).toBe(['partner', 'client'].includes(role) ? 1 : 2);
    expect((await request(role, `/api/acts/${row.companyId}/content`)).status).toBe(status);
    expect((await request(role, `/api/acts/${row.executorId}/content`)).status).toBe(visible && !['partner', 'client'].includes(role) ? 200 : 404);
    expect((await request(role, `/api/invoices/${row.id}/transfers`)).status).toBe(status);
    expect((await request(role, `/api/messages?invoiceId=${row.id}`)).status).toBe(['partner', 'accountant'].includes(role) ? 403 : status);
  }
});

it.each(roles)('%s: write operations retain role and parent-invoice restrictions', async role => {
  for (const row of fixtures.filter(r => r.scheme === 'agency_30')) {
    const staff = ['admin', 'assistant', 'accountant'].includes(role);
    const status = !staff ? 403 : allowed(role, row) ? 200 : 404;
    expect((await request(role, `/api/invoices/${row.id}`, 'PATCH', { notes: 'Verified' })).status).toBe(status);
    expect((await request(role, `/api/expenses/${row.expenseId}`, 'PATCH', { description: 'AC expense verified' })).status).toBe(status);
    const created = await request(role, `/api/invoices/${row.id}/expenses`, 'POST', { description: 'temporary', amount: '0.01' });
    expect(created.status).toBe(status === 200 ? 201 : status);
    if (created.status === 201) expect((await request(role, `/api/expenses/${(await created.json()).id}`, 'DELETE')).status).toBe(200);
    if (role !== 'admin') {
      expect((await request(role, `/api/invoices/${row.id}`, 'DELETE')).status).toBe(403);
      expect((await request(role, '/api/invoices/transfer', 'POST', {})).status).toBe(403);
      expect((await request(role, '/api/admin/recalculate-invoices', 'POST', {})).status).toBe(403);
    }
  }
});

it.each(roles)('%s: expense payment status is staff-only, owner money is admin-only', async role => {
  const row = fixtures.find(r => allowed(role, r) && r.scheme === 'agency_30')!;
  const [expense] = await request(role, `/api/invoices/${row.id}/expenses`).then(r => r.json());
  if (role === 'partner' || role === 'client') expect(expense).not.toHaveProperty('paidAt');
  else expect(expense).toHaveProperty('paidAt');
  const admin = role === 'admin';
  expect((await request(role, '/api/admin/payables')).status).toBe(admin ? 200 : 403);
  expect((await request(role, '/api/admin/owner-ledger')).status).toBe(admin ? 200 : 403);
  expect((await request(role, '/api/admin/owner-ledger/start', 'PUT', { since: '2026-10-01', kot: '-100.5', krya: '0' })).status).toBe(admin ? 200 : 403);
  const created = await request(role, '/api/admin/owner-transfers', 'POST', { owner: 'kot', amount: '1500,5', transferDate: '2026-10-02' });
  expect(created.status).toBe(admin ? 201 : 403);
  if (!admin) return;
  const transfer = await created.json();
  expect(transfer).toMatchObject({ owner: 'kot', kind: 'payout', amount: '1500.50', notes: null });
  for (const body of [{ owner: 'kot', amount: '0.001', transferDate: '2026-10-02' }, { owner: 'boss', amount: '1', transferDate: '2026-10-02' },
    { owner: 'kot', amount: '1', transferDate: '2026-02-30' }, { owner: 'kot', amount: '1', transferDate: '2026-10-02', kind: 'opening' }]) {
    expect((await request(role, '/api/admin/owner-transfers', 'POST', body)).status).toBe(400);
  }
  const ledger = await request(role, '/api/admin/owner-ledger').then(r => r.json());
  expect(ledger.kot).toMatchObject({ since: '2026-10-01', opening: -100.5, paidOut: 1500.5 });
  expect((await request(role, '/api/admin/owner-transfers/not-a-uuid', 'DELETE')).status).toBe(404);
  expect((await request(role, `/api/admin/owner-transfers/${transfer.id}`, 'DELETE')).status).toBe(200);
  expect((await request(role, `/api/admin/owner-transfers/${transfer.id}`, 'DELETE')).status).toBe(404);
});

it('unscoped partner/client sessions and forged role headers cannot gain access', async () => {
  for (const role of ['partner-unscoped', 'client-unscoped']) {
    const result = await request(role, '/api/invoices').then(r => r.json());
    expect(result.total).toBe(0); expect(result.invoices).toEqual([]);
    expect((await request(role, `/api/invoices/${fixtures[0].id}`)).status).toBe(404);
  }
  expect((await fetch(base + '/api/invoices', { headers: { 'X-Test-Role': 'admin' } })).status).toBe(401);
  expect((await fetch(base + `/api/invoices/${fixtures[0].id}`, { method: 'PATCH', headers: { Cookie: sessions.admin.Cookie, 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(403);
});

it('assistant search, priority actions and overdue lists exclude hidden invoices and children', async () => {
  for (const path of ['/api/search?q=AC', '/api/priority-actions', '/api/overdue-invoices']) {
    const response = await request('assistant', path); expect(response.status).toBe(200);
    const body = JSON.stringify(await response.json());
    for (const row of fixtures.filter(r => r.hidden)) { expect(body).not.toContain(row.id); expect(body).not.toContain(row.expenseId); }
    expect(body).not.toBe('[]');
  }
});

it('message threads retain allowed descriptions but never disclose closed-scheme expense amounts to clients', async () => {
  const threads = await request('client', '/api/messages/threads').then(r => r.json());
  expect(threads).toHaveLength(12);
  for (const thread of threads) {
    const invoice = fixtures.find(r => r.id === thread.invoice_id)!;
    expect(invoice.owner).toBe(0);
    expect(thread.expense_description).toContain('AC expense');
    expect(thread.expense_amount).toBe(invoice.scheme.startsWith('agency') ? '123.45' : null);
  }
});

it('alert counts include only the authenticated scope, including missing tenant identities', async () => {
  const ids = fixtures.filter(row => row.scheme === 'partner_10').map(row => row.id);
  for (const id of ids) await db.update(s.invoices).set({ status: 'draft' }).where(eq(s.invoices.id, id));
  for (const role of [...roles, 'partner-unscoped', 'client-unscoped']) {
    const counts = await request(role, '/api/alert-counts').then(r => r.json());
    expect(counts.pendingInvoices).toBe(role.includes('unscoped') ? 0 : role === 'admin' ? 4 : 2);
  }
  for (const id of ids) await db.update(s.invoices).set({ status: 'sent' }).where(eq(s.invoices.id, id));
});

it.each(roles)('%s: report and document permissions match the invoice scope', async role => {
  for (const row of fixtures.filter(r => r.scheme === 'agency_30')) {
    const preview = await request(role, '/api/admin/export/client-report/preview', 'POST', { invoiceId: row.id });
    if (role === 'assistant' || role === 'accountant') expect(preview.status).toBe(403);
    else { expect(preview.status).toBe(200); expect((await preview.json()).count).toBe(allowed(role, row) ? 1 : 0); }
    const doc = await request(role, `/api/invoices/${row.id}/acts`, 'POST', { actType: 'company', fileName: 'allowed.pdf', isLink: true, url: 'https://example.test/act' });
    expect(doc.status).toBe(['partner', 'client'].includes(role) ? 403 : allowed(role, row) ? 201 : 404);
    if (doc.status === 201) expect((await request(role, `/api/acts/${(await doc.json()).id}`, 'DELETE')).status).toBe(200);
  }
});

it.each(roles)('%s: creation and manual period closure preserve staff scope without consuming periods for expenses', async role => {
  const [template] = await db.select().from(s.invoices).where(eq(s.invoices.id, fixtures[0].id));
  const response = await request(role, '/api/invoices', 'POST', { invoiceNumber: `PERIOD-${role}`, clientId: template.clientId, partnerId: template.partnerId,
    scheme: 'partner_10', hideFromAssistant: role === 'assistant', serviceType: 'periodic', periodUnit: 'month', pricePerPeriod: '100', totalPeriods: 3 });
  if (role === 'partner' || role === 'client') { expect(response.status).toBe(403); return; }
  expect(response.status).toBe(201); const created = await response.json();
  const [stored] = await db.select().from(s.invoices).where(eq(s.invoices.id, created.id));
  expect(stored.hideFromAssistant).toBe(role === 'accountant');
  expect((await request(role, `/api/invoices/${created.id}/expenses`, 'POST', { description: 'Cost is not usage', amount: '25' })).status).toBe(201);
  expect((await request(role, `/api/invoices/${created.id}`).then(r => r.json())).periodsUsed).toBe(0);
  expect(await request(role, `/api/invoices/${created.id}/periods`, 'POST', { period: 1, closed: true }).then(r => r.json())).toMatchObject({ periodsUsed: 1 });
  expect((await request(role, `/api/invoices/${created.id}`).then(r => r.json())).calculations.clientRemaining).toBe('200.00');
  for (const outsider of ['partner', 'client']) expect((await request(outsider, `/api/invoices/${created.id}/periods`, 'POST', { period: 2, closed: true })).status).toBe(403);
  const opposite = role === 'accountant' ? 'assistant' : 'accountant';
  expect((await request(opposite, `/api/invoices/${created.id}/periods`, 'POST', { period: 2, closed: true })).status).toBe(404);
  expect(await request(role, `/api/invoices/${created.id}/periods`, 'POST', { period: 1, closed: false }).then(r => r.json())).toMatchObject({ periodsUsed: 0 });
});

it('closing-document updates return the same safe fields as the accountant invoice view', async () => {
  const row = fixtures.find(r => r.hidden)!;
  const response = await request('accountant', `/api/invoices/${row.id}/closing-document`, 'PATCH', { closingDocumentUrl: 'https://example.test/closing.pdf' });
  expect(response.status).toBe(200); const invoice = await response.json();
  expect(invoice.closingDocumentUrl).toBe('https://example.test/closing.pdf');
  for (const field of ['partnerId', 'partnerCommissionRate', 'hideFromAssistant']) expect(invoice[field]).toBeUndefined();
});
