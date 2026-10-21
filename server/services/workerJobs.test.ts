import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { createTestDb, seedPartnerAndClient, type TestDb } from '../test/testDb';
import type { db as productionDb } from '../db';
import * as s from '../../shared/schema';
import { JobRunner } from './jobRunner';
import { recurringInvoicesJob } from './recurringJob';
import { writeHeartbeat } from './workerHeartbeat';

// N1: activate-release.sh ждёт heartbeat воркера нового релиза, а не состояние бизнес-заданий.
let db: TestDb, close: () => Promise<void>;
const database = () => db as unknown as typeof productionDb;
beforeEach(async () => { ({ db, close } = await createTestDb()); });
afterEach(async () => { await close(); vi.restoreAllMocks(); });

it('a failing recurring template is reported in the job result and leaves the job idle', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const { partnerId, clientId } = await seedPartnerAndClient(db);
  const template = { clientId, partnerId, scheme: 'agency_30' as const, amount: '1000', nextInvoiceDate: '2026-01-01',
    createdBy: '00000000-0000-4000-8000-000000000001' };
  const [good] = await db.insert(s.recurringInvoices).values({ ...template, startDate: '2026-01-01' }).returning();
  // Дата выпуска раньше начала расписания: generateOccurrence отказывает этому шаблону.
  const [broken] = await db.insert(s.recurringInvoices).values({ ...template, startDate: '2026-06-01' }).returning();

  expect(await new JobRunner(database()).run(recurringInvoicesJob(database()))).toBe(true);

  const [job] = await db.select().from(s.scheduledJobs).where(eq(s.scheduledJobs.key, 'recurring-invoices'));
  expect(job.state).toBe('idle');
  expect(job.lastError).toBeNull();
  expect(job.result).toContain(broken.id);
  expect(job.result).not.toContain(good.id);
  expect(await db.select().from(s.invoices).where(eq(s.invoices.recurringInvoiceId, good.id))).toHaveLength(1);
});

it('activation accepts only a heartbeat of the new commit started after the switch', async () => {
  const script = readFileSync('deploy/activate-release.sh', 'utf8');
  const query = /worker_commit=\$\(sudo -u postgres psql -At -d finance_duck -c "([^"]+)"\)/.exec(script)?.[1];
  expect(query).toBeDefined();
  const activated = async (switchedAt: Date) => {
    const result = await db.execute(sql.raw(query!.replace('$switched_at', switchedAt.toISOString())));
    return (result.rows as Array<{ commit?: string }>).map(row => Object.values(row)[0]);
  };
  const previous = 'a'.repeat(40), next = 'b'.repeat(40);
  const switchedAt = new Date();
  // Строка воркера прошлого выпуска (тот же commit при повторном деплое) не доказывает запуск нового.
  await writeHeartbeat(database(), next, new Date(switchedAt.getTime() - 60_000));
  expect(await activated(switchedAt)).toEqual([]);
  await writeHeartbeat(database(), previous, new Date(switchedAt.getTime() + 1000));
  expect(await activated(switchedAt)).toEqual([previous]);
  await writeHeartbeat(database(), next, new Date(switchedAt.getTime() + 2000));
  expect(await activated(switchedAt)).toEqual([next]);
  // Строку heartbeat не забирает ни одно задание.
  const [row] = await db.select().from(s.scheduledJobs).where(eq(s.scheduledJobs.key, 'worker-heartbeat'));
  expect(row.nextRunAt.getUTCFullYear()).toBe(9999);
});
