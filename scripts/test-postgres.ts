import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
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
// pool.end() resolves before idle sockets finish closing, and the database switch test
// terminates those backends (57P01). Without a listener that pool 'error' crashes the run.
const tolerateTermination = (target: Pool) => target.on('error', error => { if ((error as { code?: string }).code !== '57P01') throw error; });
let pool: Pool | undefined;
const restoreNames: string[] = [];
try {
  await control.query(`CREATE DATABASE "${name}"`);
  address.pathname = `/${name}`;
  process.env.DATABASE_URL = address.toString();
  pool = new Pool({ connectionString: address.toString(), max: 12, options: '-c statement_timeout=20000' });
  tolerateTermination(pool);
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

  const { PaymentCommands } = await import('../server/services/paymentCommands');
  const payments = new PaymentCommands(db);
  const paymentInvoice = await repo.createInvoice(db, { ...input, invoiceNumber: 'PAYMENT-CONCURRENT' });
  const paymentInput = { partnerId: partner.id, invoiceId: paymentInvoice.id, amount: '100.01', paymentDate: '2026-10-18' };
  const paid = await Promise.all(Array.from({ length: 12 }, () => payments.record({ role: 'admin', tokenId: actor.id, requestKey: 'payment-once' }, paymentInput)));
  assert.equal(new Set(paid.map(row => row.id)).size, 1);
  const [paymentLogs] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(schema.assistantActionLogs).where(eq(schema.assistantActionLogs.entityId, paid[0].id));
  assert.equal(paymentLogs.count, 1);
  console.log('PASS: 12 concurrent payment retries commit one payment and one audit event');

  const [newPartner] = await db.insert(schema.partners).values({ name: 'Different payer' }).returning();
  for (let round = 0; round < 3; round++) {
    const inv = await repo.createInvoice(db, { ...input, invoiceNumber: `PAYMENT-OWNER-RACE-${round}` });
    const results = await Promise.allSettled([
      payments.record({ role: 'admin', tokenId: actor.id }, { ...paymentInput, invoiceId: inv.id }),
      commands.update({ role: 'admin', tokenId: actor.id }, inv.id, { partnerId: newPartner.id }),
    ]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    const [recorded] = await db.select().from(schema.partnerPayments).where(eq(schema.partnerPayments.invoiceId, inv.id));
    const current = await repo.getInvoice(db, inv.id);
    if (recorded) assert.equal(recorded.partnerId, current!.partnerId);
  }
  console.log('PASS: concurrent payment/reassignment cannot commit mismatched owners');

  for (let round = 0; round < 3; round++) {
    const inv = await repo.createInvoice(db, { ...input, invoiceNumber: `PAYMENT-DELETE-RACE-${round}` });
    const results = await Promise.allSettled([
      payments.record({ role: 'admin', tokenId: actor.id }, { ...paymentInput, invoiceId: inv.id }),
      commands.delete({ role: 'admin', tokenId: actor.id }, inv.id),
    ]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    const [recorded] = await db.select().from(schema.partnerPayments).where(eq(schema.partnerPayments.invoiceId, inv.id));
    const current = await repo.getInvoice(db, inv.id);
    assert.equal(Boolean(recorded), Boolean(current));
  }
  console.log('PASS: concurrent payment/deletion either preserves both records or rejects the payment');

  await Promise.all(Array.from({ length: 12 }, () => payments.cancel({ role: 'admin', tokenId: actor.id, requestKey: 'payment-cancel-once' }, paid[0].id)));
  const paymentAudit = await db.select().from(schema.assistantActionLogs).where(eq(schema.assistantActionLogs.entityId, paid[0].id));
  assert.equal(paymentAudit.length, 2);
  assert.equal(paymentAudit.map(row => JSON.parse(row.details!)).find(row => row.command === 'cancel').before.amount, '100.01');
  console.log('PASS: concurrent payment cancellations retain one durable audit snapshot');

  const periodic = await commands.create({ role: 'admin', tokenId: actor.id }, { ...input, invoiceNumber: 'PERIOD-CONCURRENT', serviceType: 'periodic', totalPeriods: 3, pricePerPeriod: '100' });
  const closes = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => commands.setPeriod({ role: 'admin', tokenId: actor.id, requestKey: `period-${i}` }, periodic.id, 1, true)));
  assert.equal(closes.filter(row => row.status === 'fulfilled').length, 1);
  assert.equal((await repo.getInvoice(db, periodic.id))!.periodsUsed, 1);
  const opens = await Promise.all(Array.from({ length: 12 }, () => commands.setPeriod({ role: 'admin', tokenId: actor.id, requestKey: 'reopen-once' }, periodic.id, 1, false)));
  assert.equal(opens.length, 12);
  assert.equal((await repo.getInvoice(db, periodic.id))!.periodsUsed, 0);
  console.log('PASS: simultaneous period closures consume exactly one unit; cancellation retries are idempotent');

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
  const { BackupService } = await import('../server/backupService');
  const backupDirectory = await mkdtemp(path.join(tmpdir(), 'finance-pg-backup-'));
  try {
    process.env.ACCESS_CODE_SECRET = 'postgres-test-backup-secret';
    const service = new BackupService(db, backupDirectory);
    const info = await service.createBackup();
    const snapshot = await service.downloadBackup(info.id);
    const result = await service.restoreBackup(info.id);
    assert.equal(result.success, true, result.message);
    const restored = await service.downloadBackup((await service.createBackup()).id);
    for (const table of Object.keys(snapshot!.data) as (keyof typeof snapshot.data)[]) {
      assert.deepEqual(restored!.data[table].map(row => JSON.stringify(row)).sort(), snapshot!.data[table].map(row => JSON.stringify(row)).sort(), table);
    }
    console.log('PASS: encrypted PostgreSQL cursor backup round trip preserves all rows, bigints and dates');
    const { restoreShadowDatabase } = await import('../server/services/shadowRestore');
    const { verifyRestoredArchive } = await import('../server/services/restoreVerification');
    const { objectStore } = await import('../server/services/objectStore');
    const suffix = randomUUID().replaceAll('-', '');
    const shadow = `finance_restore_${suffix}`, retained = `finance_retained_${suffix}`, failed = `finance_failed_${suffix}`;
    restoreNames.push(shadow, retained, failed);
    await control.query(`CREATE DATABASE "${shadow}"`);
    const proof = await restoreShadowDatabase(path.join(backupDirectory, info.id), shadow, path.join(backupDirectory, 'shadow-proof'));
    assert.equal(proof.tables, 23);
    const shadowAddress = new URL(address); shadowAddress.pathname = `/${shadow}`;
    const shadowPool = new Pool({ connectionString: shadowAddress.toString() });
    tolerateTermination(shadowPool);
    try {
      const shadowDb = drizzle(shadowPool, { schema });
      await shadowPool.query("UPDATE invoice_calculations SET client_bill = client_bill + 0.01 WHERE invoice_id = $1", [from.id]);
      await assert.rejects(verifyRestoredArchive(shadowDb, objectStore, path.join(backupDirectory, info.id), backupDirectory), /verification failed: invoiceCalculations/);
      await shadowPool.query("UPDATE invoice_calculations SET client_bill = client_bill - 0.01 WHERE invoice_id = $1", [from.id]);
    } finally { await shadowPool.end(); }
    console.log('PASS: shadow restore verifies all 23 tables and rejects a one-kopeck difference');
    await pool.query("INSERT INTO clients (name) VALUES ('LIVE-AFTER-SNAPSHOT')");
    await pool.end(); pool = undefined;
    const switchSource = await readFile('deploy/swap-databases.sql', 'utf8');
    const transaction = switchSource.slice(switchSource.indexOf('BEGIN;'), switchSource.indexOf('COMMIT;') + 7);
    const switchDatabases = async (replacement: string, archiveName: string, injectFailure = false) => {
      const names = { live: name, replacement, retained: archiveName };
      let query = transaction.replace(/:"(live|replacement|retained)"/g, (_, key: keyof typeof names) => `"${names[key]}"`)
        .replace(/:'(live|replacement|retained)'/g, (_, key: keyof typeof names) => `'${names[key]}'`);
      if (injectFailure) query = query.replace(`ALTER DATABASE "${replacement}" RENAME`, `SELECT 1/0; ALTER DATABASE "${replacement}" RENAME`);
      try { await control.query(query); } catch (error) { await control.query('ROLLBACK'); throw error; }
    };
    await assert.rejects(switchDatabases(shadow, retained, true), /division by zero/);
    const states = await control.query('SELECT datname, datallowconn FROM pg_database WHERE datname = ANY($1)', [[name, shadow, retained]]);
    assert.equal(states.rows.length, 2); assert(states.rows.every(row => row.datallowconn));
    console.log('PASS: interruption between database renames rolls back both names and connection policy');
    await switchDatabases(shadow, retained);
    let readback = new Pool({ connectionString: address.toString() });
    tolerateTermination(readback);
    try { assert.equal((await readback.query("SELECT count(*)::int AS n FROM clients WHERE name='LIVE-AFTER-SNAPSHOT'")).rows[0].n, 0); }
    finally { await readback.end(); }
    await switchDatabases(retained, failed);
    readback = new Pool({ connectionString: address.toString() });
    tolerateTermination(readback);
    try { assert.equal((await readback.query("SELECT count(*)::int AS n FROM clients WHERE name='LIVE-AFTER-SNAPSHOT'")).rows[0].n, 1); }
    finally { await readback.end(); }
    console.log('PASS: verified database switch and reverse switch preserve the original live database');

  } finally { await rm(backupDirectory, { recursive: true, force: true }); }

} finally {
  await pool?.end();
  for (const restoredName of restoreNames) await control.query(`DROP DATABASE IF EXISTS "${restoredName}" WITH (FORCE)`);
  await control.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await control.end();
}
