import { readFileSync } from 'node:fs';
import path from 'node:path';
import { db } from '../db';
import { scheduledJobs } from '../../shared/schema';

const KEY = 'worker-heartbeat';

/** deploy/activate-release.sh writes release.json into the release root before starting the worker. */
export function releaseCommit(root: string): string {
  try { return String(JSON.parse(readFileSync(path.join(root, 'release.json'), 'utf8')).commit); }
  catch { return 'unknown'; }
}

/**
 * Not a job: never due, so no runner claims it. last_started_at is the worker start,
 * last_finished_at the latest beat; activate-release.sh waits for its commit.
 */
export async function writeHeartbeat(database: typeof db, commit: string, startedAt: Date) {
  const row = { state: 'idle', nextRunAt: new Date('9999-01-01'), lastStartedAt: startedAt, lastFinishedAt: new Date(), result: JSON.stringify({ commit }) };
  await database.insert(scheduledJobs).values({ key: KEY, ...row }).onConflictDoUpdate({ target: scheduledJobs.key, set: row });
}
