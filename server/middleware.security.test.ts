import { once } from 'node:events';
import type { Server } from 'node:http';
import express from 'express';
import cookieParser from 'cookie-parser';
import { beforeAll, afterAll, beforeEach, it, expect, vi } from 'vitest';

const sessions = vi.hoisted(() => ({ validateSession: vi.fn(), refreshSession: vi.fn(), revokeSession: vi.fn(), getRecurringInvoices: vi.fn(), getRecurringInvoice: vi.fn(), getDueRecurringInvoices: vi.fn(), getActiveRecurringInvoicesForCashFlow: vi.fn(), updateRecurringInvoice: vi.fn(), createRecurringInvoice: vi.fn(), createDraftFromRecurring: vi.fn() }));
import { createAuthMiddleware } from './middleware';
import { originPolicy } from './originPolicy';
import { createAuthRouter } from './routes/auth';
import { createRecurringRouter } from './routes/recurring';

const authMiddleware = createAuthMiddleware(sessions);
const authRouter = createAuthRouter(sessions, authMiddleware);
const recurringRouter = createRecurringRouter(sessions, authMiddleware);
let server: Server; let url: string;
beforeAll(async () => {
  const app = express();
  app.use(originPolicy(new Set(['https://trusted.test'])), cookieParser(), express.json());
  app.all('/write', authMiddleware, (_req, res) => res.json({ ok: true }));
  app.use(authRouter, recurringRouter);
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing server');
  url = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
beforeEach(() => {
  vi.clearAllMocks();
  sessions.validateSession.mockResolvedValue({ isValid: true, csrfToken: 'expected', token: { id: 'test', role: 'admin' } });
  sessions.refreshSession.mockResolvedValue(new Date());
});
it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('rejects missing, empty and incorrect CSRF on %s without clearing a valid session', async method => {
  for (const token of [undefined, '', 'wrong']) {
    const response = await fetch(`${url}/write`, { method, headers: { Cookie: 'session_id=test', ...(token !== undefined ? { 'X-CSRF-Token': token } : {}) } });
    expect(response.status).toBe(403);
    expect(response.headers.get('set-cookie')).toBeNull();
  }
  expect((await fetch(`${url}/write`, { method, headers: { Cookie: 'session_id=test', 'X-CSRF-Token': 'expected' } })).status).toBe(200);
});
it('protects refresh and logout, permits read validation and rejects hostile origins', async () => {
  for (const endpoint of ['refresh', 'logout']) {
    expect((await fetch(`${url}/api/auth/${endpoint}`, { method: 'POST', headers: { Cookie: 'session_id=test' } })).status).toBe(403);
  }
  expect(sessions.refreshSession).not.toHaveBeenCalled(); expect(sessions.revokeSession).not.toHaveBeenCalled();
  expect((await fetch(`${url}/api/auth/validate`, { headers: { Cookie: 'session_id=test' } }).then(r => r.json())).csrfToken).toBe('expected');
  expect((await fetch(`${url}/api/auth/login`, { method: 'POST', headers: { Origin: 'https://hostile.test' } })).status).toBe(403);
});

it('enforces recurring HTTP scope and rejects role escalation or mass assignment', async () => {
  const headers = { Cookie: 'session_id=test', 'X-CSRF-Token': 'expected', 'Content-Type': 'application/json' };
  const id = '00000000-0000-0000-0000-000000000001';
  const template = { clientId: id, partnerId: id, scheme: 'agency_30', amount: '1000', startDate: '2026-01-31', dayOfMonth: 31 };
  sessions.validateSession.mockResolvedValue({ isValid: true, csrfToken: 'expected', token: { id, role: 'assistant' } });
  sessions.getRecurringInvoices.mockResolvedValue([]);
  sessions.getDueRecurringInvoices.mockResolvedValue([]);
  sessions.getActiveRecurringInvoicesForCashFlow.mockResolvedValue([]);
  sessions.getRecurringInvoice.mockResolvedValue(null);
  for (const suffix of ['', '/due', '/cashflow']) expect((await fetch(`${url}/api/recurring-invoices${suffix}`, { headers })).status).toBe(200);
  expect(sessions.getRecurringInvoices).toHaveBeenCalledWith('assistant');
  expect(sessions.getDueRecurringInvoices).toHaveBeenCalledWith(undefined, 'assistant');
  expect(sessions.getActiveRecurringInvoicesForCashFlow).toHaveBeenCalledWith('assistant');
  for (const [suffix, method] of [[`/${id}`, 'PATCH'], [`/${id}/create-draft`, 'POST']]) {
    expect((await fetch(`${url}/api/recurring-invoices${suffix}`, { method, headers, body: '{}' })).status).toBe(404);
  }
  expect(sessions.updateRecurringInvoice).not.toHaveBeenCalled(); expect(sessions.createDraftFromRecurring).not.toHaveBeenCalled();
  expect((await fetch(`${url}/api/recurring-invoices`, { method: 'POST', headers, body: JSON.stringify({ ...template, createdBy: id }) })).status).toBe(400);
  sessions.createRecurringInvoice.mockImplementation(async data => data);
  expect((await fetch(`${url}/api/recurring-invoices`, { method: 'POST', headers, body: JSON.stringify({ ...template, hideFromAssistant: true }) })).status).toBe(201);
  expect(sessions.createRecurringInvoice).toHaveBeenCalledWith(expect.objectContaining({ hideFromAssistant: false, createdBy: id }));
  sessions.getRecurringInvoice.mockResolvedValue(template);
  sessions.createDraftFromRecurring.mockResolvedValue({ ...template, id, invoiceNumber: 'TEST', status: 'draft', partnerCommissionRate: '20', hideFromAssistant: false });
  const projected = await fetch(`${url}/api/recurring-invoices/${id}/create-draft`, { method: 'POST', headers, body: '{}' }).then(r => r.json());
  expect(projected.partnerCommissionRate).toBeUndefined(); expect(projected.hideFromAssistant).toBeUndefined();
  sessions.validateSession.mockResolvedValue({ isValid: true, csrfToken: 'expected', token: { id, role: 'accountant' } });
  for (const [suffix, method] of [['', 'GET'], ['/due', 'GET'], ['/cashflow', 'GET'], ['', 'POST'], [`/${id}`, 'PATCH'], [`/${id}/create-draft`, 'POST'], [`/${id}/backdate`, 'POST'], [`/${id}`, 'DELETE'], ['/process', 'POST']]) {
    expect((await fetch(`${url}/api/recurring-invoices${suffix}`, { method, headers, ...(method !== 'GET' ? { body: '{}' } : {}) })).status).toBe(403);
  }
});
