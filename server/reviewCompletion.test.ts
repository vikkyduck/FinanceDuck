import { createDocumentStatusRouter } from './routes/documentStatus';
import { documentGroupsSchema, documentRowsSchema } from '../shared/documentStatusContract';
import { createMyInvoicesRouter } from './routes/myInvoices';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { once } from 'node:events';
import type { Server } from 'node:http';
import express from 'express';
import { eq } from 'drizzle-orm';
import { createTestDb, seedPartnerAndClient, type TestDb } from './test/testDb';
import type { db as productionDb } from './db';
import { DatabaseStorage } from './storage';
import { InvoiceCommands } from './services/invoiceCommands';
import { createInvoicesRouter } from './routes/invoices';
import { createAssistantRouter } from './routes/assistant';
import type { AuthMiddleware } from './middleware';
import * as s from '../shared/schema';
import { invoicePageSchema, clientBalancesSchema, partnerInvoiceSummarySchema } from '../shared/invoiceContract';
import { assistantSummarySchema, assistantGroupsSchema } from '../shared/assistantContract';
import { applyTransferOverrides, derivePeriodicClientBill, applyPeriodicOverrides } from './repositories/invoiceRepo';
import { calculateBookedFinancials } from '../shared/financialEngine';
import { MAX_MONEY } from '../shared/money';
import { createLoginAttemptLimiter } from './rateLimiter';

let db: TestDb, close: () => Promise<void>, server: Server, url: string, clientId: string, partnerId: string, actorId: string;
const database = () => db as unknown as typeof productionDb;
const headers = (role: s.UserRole = 'admin') => ({ 'x-test-role': role, 'content-type': 'application/json' });
beforeAll(async () => {
  ({ db, close } = await createTestDb());
  ({ clientId, partnerId } = await seedPartnerAndClient(db));
  const [token] = await db.insert(s.accessTokens).values({ code: 'COMPLETION-TEST', role: 'admin' }).returning(); actorId = token.id;
  const rows = await db.insert(s.invoices).values(Array.from({ length: 205 }, (_, i) => ({
    invoiceNumber: `COMPLETE-${String(i).padStart(3, '0')}`, clientId, partnerId, createdBy: actorId,
    scheme: 'partner_10' as const, status: 'paid' as const, clientBill: '100.00', hideFromAssistant: i >= 203,
    paymentDate: i === 0 ? null : '2026-01-10', actualPaymentDate: '2026-01-10', createdAt: new Date('2026-01-01T00:00:00Z'),
  }))).returning();
  await db.insert(s.invoiceCalculations).values(rows.map(row => ({ invoiceId: row.id, clientBill: '100.00', commissionAmount: '10.00', executorExpensesTotal: '20.00', clientRemaining: '80.00' })));
  await db.insert(s.invoiceExpenses).values(rows.map(row => ({ invoiceId: row.id, description: 'Export expense', amount: '20.00', createdBy: actorId })));
  const auth: AuthMiddleware = (req, _res, next) => {
    req.user = { role: req.get('x-test-role') as s.UserRole || 'admin', partnerId, clientId, token };
    next();
  };
  const app = express(); app.use(express.json(), createInvoicesRouter(new DatabaseStorage(database()), auth, database(), new InvoiceCommands(database())), createAssistantRouter(auth, database()), createDocumentStatusRouter(auth, database()), createMyInvoicesRouter(new DatabaseStorage(database()), auth));
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No port');
  url = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await close(); });

it('always bounds the HTTP list and exposes the last matching invoice through search/pages', async () => {
  const first = invoicePageSchema.parse(await fetch(`${url}/api/invoices`, { headers: headers() }).then(r => r.json()));
  expect(first.invoices).toHaveLength(100); expect(first.total).toBe(205); expect(first.pages).toBe(3);
  const last = invoicePageSchema.parse(await fetch(`${url}/api/invoices?page=3`, { headers: headers() }).then(r => r.json()));
  expect(last.invoices).toHaveLength(5);
  expect(new Set([...first.invoices, ...last.invoices].map(row => row.id)).size).toBe(105);
  const searched = invoicePageSchema.parse(await fetch(`${url}/api/invoices?search=COMPLETE-204`, { headers: headers() }).then(r => r.json()));
  expect(searched.total).toBe(1); expect(searched.invoices[0].invoiceNumber).toBe('COMPLETE-204');
  for (const name of ['Тест-клиент', 'Тест-партнёр']) {
    const result = invoicePageSchema.parse(await fetch(`${url}/api/invoices?search=${encodeURIComponent(name)}`, { headers: headers('assistant') }).then(r => r.json()));
    expect(result.total).toBe(203); expect(result.invoices).toHaveLength(100);
  }
  const wildcard = invoicePageSchema.parse(await fetch(`${url}/api/invoices?search=%25`, { headers: headers() }).then(r => r.json()));
  expect(wildcard.total).toBe(0);
  expect((await fetch(`${url}/api/invoices?page=101`, { headers: headers() })).status).toBe(400);
  expect((await fetch(`${url}/api/invoices?limit=201`, { headers: headers() })).status).toBe(400);
});

it('calculates balances over every matching record, respects role/date filters and preserves zero balances', async () => {
  const get = async (role: s.UserRole, query = '') => clientBalancesSchema.parse(await fetch(`${url}/api/invoices/client-balances${query}`, { headers: headers(role) }).then(r => r.json()));
  const admin = await get('admin'); expect(admin.summary).toMatchObject({ invoices: 205, totalBudget: '20500.00', totalSpent: '4100.00', totalRemaining: '16400.00' });
  expect((await get('assistant')).summary.invoices).toBe(203);
  expect((await get('accountant')).summary.invoices).toBe(2);
  expect((await get('admin', '?dateFrom=2026-01-01')).summary.invoices).toBe(204);
  expect((await get('admin', '?dateFrom=2026-01-01&includeUndated=true')).summary.invoices).toBe(205);
  expect((await get('admin', '?search=absent')).summary.invoices).toBe(0);
  for (const role of ['partner', 'client'] as const) expect((await fetch(`${url}/api/invoices/client-balances`, { headers: headers(role) })).status).toBe(403);
  const [row] = await db.select().from(s.invoices).where(eq(s.invoices.invoiceNumber, 'COMPLETE-204'));
  await db.update(s.invoiceCalculations).set({ clientRemaining: '0.00' }).where(eq(s.invoiceCalculations.invoiceId, row.id));
  expect((await get('accountant')).summary.totalRemaining).toBe('80.00');
  const positive = invoicePageSchema.parse(await fetch(`${url}/api/invoices?positiveBalance=true`, { headers: headers('accountant') }).then(r => r.json()));
  expect(positive.total).toBe(1);
});

it('returns scoped annual aggregates without transporting individual invoices', async () => {
  const partner = partnerInvoiceSummarySchema.parse(await fetch(`${url}/api/invoices/partner-summary?year=2026`, { headers: headers('partner') }).then(r => r.json()));
  expect(partner).toMatchObject({ totalPaidInvoices: 205, yearlyCommission: '2050.00' });
  const summary = assistantSummarySchema.parse(await fetch(`${url}/api/assistant/invoice-summary?year=2026`, { headers: headers('assistant') }).then(r => r.json()));
  expect(summary).toMatchObject({ count: 203, total: '20300.00', totalExpenses: '4060.00', monthly: [{ month: 0, total: '20300.00' }] });
  const groups = assistantGroupsSchema.parse(await fetch(`${url}/api/assistant/invoice-groups?year=2026&limit=1`, { headers: headers('assistant') }).then(r => r.json()));
  expect(groups.rows).toHaveLength(1); expect(groups.rows[0]).toMatchObject({ id: partnerId, invoiceCount: 203, clientCount: 1 });
  expect((await fetch(`${url}/api/assistant/invoice-summary?year=2026`, { headers: headers('client') })).status).toBe(403);
});

it('uses decimal strings for transfers, recurring totals, half-up rounding and range checks', async () => {
  expect(applyTransferOverrides('0.2', { clientRemaining: '0.1' }).clientRemaining).toBe('0.30');
  expect(derivePeriodicClientBill({ serviceType: 'periodic', pricePerPeriod: '0.29', totalPeriods: 100 })).toBe('29.00');
  expect(applyPeriodicOverrides({ serviceType: 'periodic', pricePerPeriod: '0.29', totalPeriods: 100, periodsUsed: 3 }, {})).toMatchObject({ clientSpent: '0.87', clientRemaining: '28.13' });
  const booked = calculateBookedFinancials({ scheme: 'commission_based', clientBill: '0.01' });
  expect(booked.adminShare50).toBe('0.01'); expect(booked.catShare50).toBe('0.00');
  expect(calculateBookedFinancials({ scheme: 'partner_10', clientBill: MAX_MONEY }).clientBill).toBe(MAX_MONEY);
  const body = { invoiceNumber: 'RANGE', clientId, partnerId, scheme: 'partner_10', serviceType: 'periodic', pricePerPeriod: MAX_MONEY, totalPeriods: 2 };
  const failed = await fetch(`${url}/api/invoices`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
  expect(failed.status).toBe(400); expect(await db.select().from(s.invoices).where(eq(s.invoices.invoiceNumber, 'RANGE'))).toHaveLength(0);
  expect((await fetch(`${url}/api/invoices`, { method: 'POST', headers: headers(), body: JSON.stringify({ ...body, serviceType: 'one_time', clientBill: '9999999999999.9999' }) })).status).toBe(400);
});

it('injects the persistent login limiter without a global database connection', async () => {
  const limiter = createLoginAttemptLimiter(database());
  for (let i = 0; i < 5; i++) expect((await limiter.reserveLoginAttempt('LIMITER-TEST')).allowed).toBe(true);
  expect((await limiter.reserveLoginAttempt('LIMITER-TEST')).allowed).toBe(false);
  expect(await limiter.clearLoginAttempts('LIMITER-TEST')).toBe(true);
  expect((await limiter.reserveLoginAttempt('LIMITER-TEST')).allowed).toBe(true);
});

it('paginates document details and aggregates the full scope without per-invoice reads', async () => {
  const summary = documentGroupsSchema.parse(await fetch(`${url}/api/clients/acts-status`, { headers: headers('assistant') }).then(r => r.json()));
  expect(summary.summary.totalInvoices).toBe(203); expect(summary.summary.withoutActs).toBe(203);
  const [withActs] = await db.select().from(s.invoices).where(eq(s.invoices.invoiceNumber, 'COMPLETE-000'));
  await db.insert(s.signedActs).values(['company', 'company', 'executor'].map(actType => ({ invoiceId: withActs.id,
    actType: actType as 'company' | 'executor', fileName: 'linked act', isLink: true, url: 'https://example.test/act', uploadedBy: actorId })));
  const updated = documentGroupsSchema.parse(await fetch(`${url}/api/clients/acts-status`, { headers: headers('assistant') }).then(r => r.json()));
  expect(updated.summary).toMatchObject({ totalInvoices: 203, withCompanyAct: 1, withExecutorAct: 1, withBothActs: 1, withoutActs: 202 });
  const details = documentRowsSchema.parse(await fetch(`${url}/api/clients/acts-status?clientId=${clientId}&limit=25&page=9`, { headers: headers('assistant') }).then(r => r.json()));
  expect(details.invoices).toHaveLength(3); expect(details.total).toBe(203);
  const accountant = documentGroupsSchema.parse(await fetch(`${url}/api/clients/acts-status`, { headers: headers('accountant') }).then(r => r.json()));
  expect(accountant.summary.totalInvoices).toBe(2);
  const closing = documentGroupsSchema.parse(await fetch(`${url}/api/closing-docs-status`, { headers: headers() }).then(r => r.json()));
  expect(closing.summary.totalInvoices).toBe(2);
  expect((await fetch(`${url}/api/closing-docs-status`, { headers: headers('assistant') })).status).toBe(403);
  expect((await fetch(`${url}/api/clients/acts-status`, { headers: headers('client') })).status).toBe(403);
});
it('streams every scoped invoice in the secondary Excel export', async () => {
  const ExcelJS = (await import('exceljs')).default;
  for (const [role, count] of [['admin', 205], ['assistant', 203], ['accountant', 2]] as const) {
    const response = await fetch(`${url}/api/my-invoices/export`, { method: 'POST', headers: headers(role) });
    expect(response.status).toBe(200);
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()));
    expect(workbook.getWorksheet('Счета')!.rowCount).toBe(count + 1);
    expect(workbook.getWorksheet('Расходы')!.rowCount).toBe(count + 1);
  }
});
