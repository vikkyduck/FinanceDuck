/**
 * Persistent login rate limiter backed by PostgreSQL.
 * Survives server restarts — unlike the previous in-memory Map approach.
 *
 * Table: login_rate_limits (code PK, attempt_count, last_attempt BIGINT, locked_until BIGINT)
 */
import { db } from "./db";
import { sql } from "drizzle-orm";

const MAX_LOGIN_ATTEMPTS   = 5;
const LOCKOUT_DURATION_MS  = 15 * 60 * 1000; // 15 min
const ATTEMPT_WINDOW_MS    = 60 * 60 * 1000; // 1 hr reset window

interface RateLimitRow {
  attempt_count: number;
  last_attempt: string;
  locked_until: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getRow(code: string): Promise<RateLimitRow | null> {
  const rows = await db.execute<RateLimitRow>(
    sql`SELECT attempt_count, last_attempt, locked_until
        FROM login_rate_limits
        WHERE code = ${code.toUpperCase()}`,
  );
  return rows.rows[0] ?? null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface AttemptStatus {
  isLocked: boolean;
  attemptsRemaining: number;
  lockedUntil?: number;
}

export async function getLoginAttemptStatus(code: string): Promise<AttemptStatus> {
  const now = Date.now();
  const row = await getRow(code);

  if (!row) {
    return { isLocked: false, attemptsRemaining: MAX_LOGIN_ATTEMPTS };
  }

  const lastAttempt  = Number(row.last_attempt);
  const lockedUntil  = row.locked_until ? Number(row.locked_until) : null;

  // Lock window still active
  if (lockedUntil && now < lockedUntil) {
    return { isLocked: true, attemptsRemaining: 0, lockedUntil };
  }

  // Attempt window or lock expired — clean up stale row
  if (lockedUntil && now >= lockedUntil || now - lastAttempt > ATTEMPT_WINDOW_MS) {
    await db.execute(sql`DELETE FROM login_rate_limits WHERE code = ${code.toUpperCase()}`);
    return { isLocked: false, attemptsRemaining: MAX_LOGIN_ATTEMPTS };
  }

  return {
    isLocked: false,
    attemptsRemaining: Math.max(0, MAX_LOGIN_ATTEMPTS - row.attempt_count),
  };
}

export async function recordFailedLogin(
  code: string,
): Promise<{ attemptsRemaining: number; lockedUntil?: number }> {
  const upper = code.toUpperCase();
  const now   = Date.now();
  const row   = await getRow(upper);

  let newCount   = 1;
  let lockedUntil: number | null = null;

  if (row) {
    const lastAttempt = Number(row.last_attempt);
    // If outside the window, start fresh
    newCount = now - lastAttempt > ATTEMPT_WINDOW_MS ? 1 : row.attempt_count + 1;
  }

  if (newCount >= MAX_LOGIN_ATTEMPTS) {
    lockedUntil = now + LOCKOUT_DURATION_MS;
  }

  await db.execute(
    sql`INSERT INTO login_rate_limits (code, attempt_count, last_attempt, locked_until)
        VALUES (${upper}, ${newCount}, ${now}, ${lockedUntil})
        ON CONFLICT (code) DO UPDATE SET
          attempt_count = ${newCount},
          last_attempt  = ${now},
          locked_until  = ${lockedUntil}`,
  );

  return {
    attemptsRemaining: Math.max(0, MAX_LOGIN_ATTEMPTS - newCount),
    lockedUntil: lockedUntil ?? undefined,
  };
}

export async function clearLoginAttempts(code: string): Promise<boolean> {
  const result = await db.execute(
    sql`DELETE FROM login_rate_limits WHERE code = ${code.toUpperCase()}`,
  );
  return (result.rowCount ?? 0) > 0;
}

export async function clearAllLoginAttempts(): Promise<number> {
  const result = await db.execute(sql`DELETE FROM login_rate_limits`);
  return result.rowCount ?? 0;
}

export async function getLockedCodes(): Promise<
  { code: string; lockedUntil: number; attempts: number }[]
> {
  const now = Date.now();
  const rows = await db.execute<{ code: string; locked_until: string; attempt_count: number }>(
    sql`SELECT code, locked_until, attempt_count
        FROM login_rate_limits
        WHERE locked_until IS NOT NULL AND locked_until > ${now}`,
  );
  return rows.rows.map(r => ({
    code:        r.code,
    lockedUntil: Number(r.locked_until),
    attempts:    r.attempt_count,
  }));
}
