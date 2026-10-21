import { createApp } from './app';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { createTestDb, seedPartnerAndClient, type TestDb } from './test/testDb';
import type { db as productionDb } from './db';
import { createSession } from './repositories/userRepo';
import * as s from '../shared/schema';

// В шаблоне периодики нет колонки маржи: счёт по живой схеме 'agency' вышел бы с маржой 0 (N4).
let db: TestDb, close: () => Promise<void>, server: Server, base: string;
let headers: Record<string, string>, template: Record<string, string>;
const send = (method: string, path: string, body: unknown) => fetch(base + path, { method, headers, body: JSON.stringify(body) });

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  const database = db as unknown as typeof productionDb;
  const { partnerId, clientId } = await seedPartnerAndClient(db);
  const [token] = await db.insert(s.accessTokens).values({ code: 'N4-admin', role: 'admin' }).returning();
  const session = await createSession(database, token.id);
  headers = { Cookie: `session_id=${encodeURIComponent(session.sessionId)}`, 'X-CSRF-Token': session.csrfToken, 'Content-Type': 'application/json' };
  template = { clientId, partnerId, amount: '100000', partnerCommissionRate: '15', startDate: '2026-11-01' };
  server = createApp({ database }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing server');
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await close(); });

it('rejects the agency scheme for recurring templates on create and update', async () => {
  expect((await send('POST', '/api/recurring-invoices', { ...template, scheme: 'agency' })).status).toBe(400);
  const created = await send('POST', '/api/recurring-invoices', { ...template, scheme: 'agency_30' });
  expect(created.status).toBe(201);
  const { id } = await created.json();
  expect((await send('PATCH', `/api/recurring-invoices/${id}`, { scheme: 'agency' })).status).toBe(400);
  expect((await db.select({ scheme: s.recurringInvoices.scheme }).from(s.recurringInvoices)).map(row => row.scheme)).toEqual(['agency_30']);
});
