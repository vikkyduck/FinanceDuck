import path from 'node:path';
import { db, pool } from './db';
import { backupService } from './backupService';
import { pruneExpiredLoginAttempts } from './rateLimiter';
import { JobRunner, hourly, nextDailyBackup, type Job } from './services/jobRunner';
import { startOutboxWorker } from './services/outbox';
import { recurringInvoicesJob } from './services/recurringJob';
import { releaseCommit, writeHeartbeat } from './services/workerHeartbeat';

const runner = new JobRunner(db);
const jobs: Job[] = [
  recurringInvoicesJob(db),
  { key: 'manual-backup', initialRunAt: new Date('9999-01-01'), nextRunAt: () => new Date('9999-01-01'), run: () => backupService.createBackup('manual') },
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
const commit = releaseCommit(path.resolve(import.meta.dirname, '..'));
const startedAt = new Date();
const beat = () => { void writeHeartbeat(db, commit, startedAt).catch(() => console.error('[jobs] Heartbeat failed')); };
const heartbeat = setInterval(beat, 30_000);
beat();
tick();
console.log('[jobs] Worker started');
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => {
  stopping = true;
  clearInterval(timer);
  clearInterval(heartbeat);
  void (async () => { await stopOutbox(); await active; await pool.end(); })();
});
