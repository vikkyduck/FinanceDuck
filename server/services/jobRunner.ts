import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { scheduledJobs } from '../../shared/schema';

const LEASE_MS = 5 * 60_000;
export const hourly = (now: Date) => new Date(now.getTime() + 60 * 60_000);
export interface Job {
  key: string;
  initialRunAt?: Date;
  run: () => Promise<unknown>;
  nextRunAt: (finishedAt: Date) => Date;
}

/** Claim/renew/complete use an ownership token, including after a crashed worker's lease expires. */
export class JobRunner {
  constructor(private readonly database = db, private readonly now = () => new Date()) {}

  async run(job: Job): Promise<boolean> {
    const now = this.now();
    await this.database.insert(scheduledJobs).values({ key: job.key, nextRunAt: job.initialRunAt ?? now }).onConflictDoNothing();
    const token = randomUUID();
    const [claimed] = await this.database.update(scheduledJobs).set({
      state: 'running', leaseToken: token, leaseUntil: new Date(now.getTime() + LEASE_MS),
      lastStartedAt: now, attempts: sql`${scheduledJobs.attempts} + 1`,
    }).where(and(eq(scheduledJobs.key, job.key), sql`${scheduledJobs.nextRunAt} <= ${now}`,
      sql`(${scheduledJobs.leaseUntil} IS NULL OR ${scheduledJobs.leaseUntil} <= ${now})`)).returning();
    if (!claimed) return false;
    const owner = and(eq(scheduledJobs.key, job.key), eq(scheduledJobs.leaseToken, token));
    const heartbeat = setInterval(() => {
      void this.database.update(scheduledJobs).set({ leaseUntil: new Date(this.now().getTime() + LEASE_MS) })
        .where(owner).catch(() => console.error('[jobs] Lease renewal failed', job.key));
    }, 30_000);
    heartbeat.unref();
    try {
      const result = await job.run();
      const finished = this.now();
      await this.database.update(scheduledJobs).set({ state: 'idle', leaseToken: null, leaseUntil: null,
        attempts: 0, lastError: null, lastFinishedAt: finished, nextRunAt: job.nextRunAt(finished),
        result: JSON.stringify(result ?? null),
      }).where(owner);
    } catch (error) {
      const delay = Math.min(60 * 60_000, 60_000 * 2 ** Math.min(claimed.attempts - 1, 6));
      await this.database.update(scheduledJobs).set({ state: 'failed', leaseToken: null, leaseUntil: null,
        lastError: (error instanceof Error ? error.message : 'Job failed').slice(0, 1000),
        lastFinishedAt: this.now(), nextRunAt: new Date(this.now().getTime() + delay),
      }).where(owner);
      console.error('[jobs] Retry scheduled', job.key);
    } finally { clearInterval(heartbeat); }
    return true;
  }
}

/** UTC makes the daily schedule independent of host time-zone configuration. */
export function nextDailyBackup(now: Date): Date {
  const next = new Date(now);
  next.setUTCHours(3, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}
