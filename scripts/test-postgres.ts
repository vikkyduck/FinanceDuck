import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as schema from '../shared/schema';
import { eq, sql } from 'drizzle-orm';

// Creates and drops ONLY its own isolated database. Never runs against DATABASE_URL.
const address = new URL(process.env.TEST_POSTGRES_URL ?? 'postgres://postgres:postgres@127.0.0.1:5432/postgres');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(address.hostname)) throw new Error('Use an explicit local PostgreSQL test instance');
const name = `finance_test_${randomUUID().replaceAll('-', '')}`;
const control = new Pool({ connectionString: address.toString(), max: 1 });
let pool: Pool | undefined;
try {
  await control.query(`CREATE DATABASE "${name}"`);
  address.pathname = `/${name}`;
  process.env.DATABASE_URL = address.toString();
  pool = new Pool({ connectionString: address.toString(), max: 12, options: '-c statement_timeout=20000' });
  const db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: 'drizzle' });
  const repo = await import('../server/repositories/invoiceRepo');
  const { consumeAttempt } = await import('../server/rateLimiter');
  const recurring = await import('../server/repositories/recurringRepo');
  const { InvoiceCommands } = await import('../server/services/invoiceCommands');
  const [partner] = await db.insert(schema.partners).values({ name: 'Concurrency fixture' }).returning();
  const [client] = await db.insert(schema.clients).values({ name: 'Concurrency fixture' }).returning();
  const [actor] = await db.insert(schema.accessTokens).values({ code: randomUUID(), role: 'admin' }).returning();
  const input = { clientId: client.id, partnerId: partner.id, createdBy: actor.id, scheme: 'agency_30' as const, clientBill: '1000' };

  const numbers = await Promise.all(Array.from({ length: 30 }, () => repo.generateInvoiceNumber(db)));
  assert.equal(new Set(numbers).size, 30);
  console.log('PASS: 30 concurrent invoice numbers are unique');

  for (let round = 0; round < 3; round++) {
    const invoice = await repo.createInvoice(db, { ...input, invoiceNumber: `EXP-${round}` });
    await Promise.all(Array.from({ length: 20 }, (_, i) => repo.createInvoiceExpense(db, {
      invoiceId: invoice.id, amount: '10', description: `Concurrent expense ${i}`, createdBy: actor.id,
    })));
    const result = await repo.getInvoice(db, invoice.id);
    assert.equal(Number(result!.calculations!.executorExpensesTotal), 200);
    assert.equal(Number(result!.calculations!.clientRemaining), 500);
  }
  console.log('PASS: 60 expenses on independent connections retain the exact ledger total');

  const from = await repo.createInvoice(db, { ...input, invoiceNumber: 'TRANSFER-FROM' });
  const to = await repo.createInvoice(db, { ...input, invoiceNumber: 'TRANSFER-TO' });
  const transfers = await Promise.all(Array.from({ length: 12 }, () => repo.createInvoiceTransfer(db, {
    fromInvoiceId: from.id, toInvoiceId: to.id, amount: 100, createdBy: actor.id,
  })));
  assert.equal(transfers.filter(row => row.ok).length, 7);
  assert.equal(Number((await repo.getInvoice(db, from.id))!.calculations!.clientRemaining), 0);
  assert.equal(Number((await repo.getInvoice(db, to.id))!.calculations!.clientRemaining), 1400);
  console.log('PASS: concurrent transfers cannot spend the same remaining budget twice');

  const attempts = await Promise.all(Array.from({ length: 30 }, () => consumeAttempt(db, 'CONCURRENT-ONLY', 5)));
  assert.equal(attempts.filter(result => result.allowed).length, 5);
  console.log('PASS: atomic limiter permits exactly 5 of 30 concurrent attempts');

  const template = await recurring.createRecurringInvoice(db, { ...input, amount: '1000',
    startDate: '2026-01-31', nextInvoiceDate: '2026-01-31', dayOfMonth: '31', frequency: 'monthly' });
  const occurrences = await Promise.all(Array.from({ length: 12 }, () => recurring.createDraftFromRecurring(db, template.id, '2026-01-31')));
  assert.equal(new Set(occurrences.map(row => row.id)).size, 1);
  assert.equal((await recurring.getRecurringInvoice(db, template.id))!.nextInvoiceDate, '2026-02-28');
  console.log('PASS: 12 recurring workers create one occurrence and advance once');

  const commands = new InvoiceCommands(db);
  const repeated = await Promise.all(Array.from({ length: 12 }, () => commands.create({ role: 'admin', tokenId: actor.id, requestKey: 'same' }, { ...input, invoiceNumber: 'COMMAND-ONCE' })));
  assert.equal(new Set(repeated.map(row => row.id)).size, 1);
  const [logs] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(schema.assistantActionLogs).where(eq(schema.assistantActionLogs.entityId, repeated[0].id));
  assert.equal(logs.count, 1);
  console.log('PASS: concurrent retries commit one invoice and one audit event');

  const { JobRunner } = await import('../server/services/jobRunner');
  let executions = 0;
  const job = { key: 'concurrent-job', run: async () => { executions++; }, nextRunAt: () => new Date(Date.now() + 3600000) };
  const claimed = await Promise.all(Array.from({ length: 12 }, () => new JobRunner(db).run(job)));
  assert.equal(claimed.filter(Boolean).length, 1);
  assert.equal(executions, 1);
  console.log('PASS: 12 independent job runners execute one durable job');

  const expense = await commands.createExpense({ role: 'admin', tokenId: actor.id }, { invoiceId: repeated[0].id, description: 'delete concurrently', amount: '10' });
  const deleted = await Promise.all(Array.from({ length: 12 }, () => commands.deleteExpense({ role: 'admin', tokenId: actor.id, requestKey: 'delete-once' }, expense.id)));
  assert.equal(deleted.filter(result => result.success).length, 12);
  const [deleteLogs] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(schema.assistantActionLogs).where(eq(schema.assistantActionLogs.actionType, 'delete_expense'));
  assert.equal(deleteLogs.count, 1);
  console.log('PASS: 12 concurrent deletion retries commit one mutation and audit event');
} finally {
  await pool?.end();
  await control.query(`DROP DATABASE IF EXISTS "${name}"`);
  await control.end();
}
