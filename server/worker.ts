import { db, pool } from './db';
import { backupService } from './backupService';
import { processAllDueRecurringInvoices } from './repositories/recurringRepo';
import { pruneExpiredLoginAttempts } from './rateLimiter';
import { JobRunner, nextDailyBackup, type Job } from './services/jobRunner';
import { startOutboxWorker } from './services/outbox';

const runner = new JobRunner(db);
const hourly = (now: Date) => new Date(now.getTime() + 60 * 60_000);
const jobs: Job[] = [
  { key: 'recurring-invoices', nextRunAt: hourly, run: async () => {
    const result = await processAllDueRecurringInvoices(db);
    if (result.errors.length) throw new Error(result.errors.join('; '));
    return result;
  } },
  { key: 'daily-backup', initialRunAt: nextDailyBackup(new Date()), nextRunAt: nextDailyBackup,
    run: () => backupService.createBackup('auto') },
  { key: 'login-limit-cleanup', nextRunAt: hourly, run: async () => ({ deleted: await pruneExpiredLoginAttempts(db) }) },
];

let active: Promise<void> | undefined;
let stopping = false;
const tick = () => {
  if (active || stopping) return;
  active = Promise.all(jobs.map(job => runner.run(job).catch(() => console.error('[jobs] Database unavailable', job.key))))
    .then(() => undefined).finally(() => { active = undefined; });
};
const timer = setInterval(tick, 10_000);
const stopOutbox = startOutboxWorker();
tick();
console.log('[jobs] Worker started');
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => {
  stopping = true;
  clearInterval(timer);
  void (async () => { await stopOutbox(); await active; await pool.end(); })();
});
