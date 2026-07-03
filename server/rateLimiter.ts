/**
 * Persistent login rate limiter backed by PostgreSQL.
 * Survives server restarts — unlike the previous in-memory Map approach.
 *
 * Table: login_rate_limits (code PK, attempt_count, last_attempt BIGINT, locked_until BIGINT)
 */
import { db } from "./db";
import { sql } from "drizzle-orm";

const MAX_LOGIN_ATTEMPTS   = 5;
// Порог по IP выше, чем по коду: ловим «распыление» многих кодов с одного IP,
// не наказывая легитимного пользователя, разок опечатавшегося в своём коде.
const MAX_IP_ATTEMPTS      = 30;
const LOCKOUT_DURATION_MS  = 15 * 60 * 1000; // 15 min
const ATTEMPT_WINDOW_MS    = 60 * 60 * 1000; // 1 hr reset window

// Ключ для IP хранится в той же таблице с неймспейс-префиксом (без коллизий
// с реальными кодами, без изменения схемы).
const ipKey = (ip: string) => `IPLOCK:${ip}`;

interface RateLimitRow {
  attempt_count: number;
  last_attempt: string;
  locked_until: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getRow(key: string): Promise<RateLimitRow | null> {
  const rows = await db.execute<RateLimitRow>(
    sql`SELECT attempt_count, last_attempt, locked_until
        FROM login_rate_limits
        WHERE code = ${key.toUpperCase()}`,
  );
  return rows.rows[0] ?? null;
}

// ─── Generic core (по любому ключу: код или IP) ────────────────────────────────

export interface AttemptStatus {
  isLocked: boolean;
  attemptsRemaining: number;
  lockedUntil?: number;
}

async function statusForKey(key: string, max: number): Promise<AttemptStatus> {
  const now = Date.now();
  const row = await getRow(key);

  if (!row) return { isLocked: false, attemptsRemaining: max };

  const lastAttempt = Number(row.last_attempt);
  const lockedUntil = row.locked_until ? Number(row.locked_until) : null;

  if (lockedUntil && now < lockedUntil) {
    return { isLocked: true, attemptsRemaining: 0, lockedUntil };
  }

  if ((lockedUntil && now >= lockedUntil) || now - lastAttempt > ATTEMPT_WINDOW_MS) {
    await db.execute(sql`DELETE FROM login_rate_limits WHERE code = ${key.toUpperCase()}`);
    return { isLocked: false, attemptsRemaining: max };
  }

  return { isLocked: false, attemptsRemaining: Math.max(0, max - row.attempt_count) };
}

async function recordFailForKey(
  key: string, max: number,
): Promise<{ attemptsRemaining: number; lockedUntil?: number }> {
  const upper = key.toUpperCase();
  const now   = Date.now();
  const row   = await getRow(upper);

  let newCount = 1;
  let lockedUntil: number | null = null;
  if (row) {
    const lastAttempt = Number(row.last_attempt);
    newCount = now - lastAttempt > ATTEMPT_WINDOW_MS ? 1 : row.attempt_count + 1;
  }
  if (newCount >= max) lockedUntil = now + LOCKOUT_DURATION_MS;

  await db.execute(
    sql`INSERT INTO login_rate_limits (code, attempt_count, last_attempt, locked_until)
        VALUES (${upper}, ${newCount}, ${now}, ${lockedUntil})
        ON CONFLICT (code) DO UPDATE SET
          attempt_count = ${newCount},
          last_attempt  = ${now},
          locked_until  = ${lockedUntil}`,
  );

  return { attemptsRemaining: Math.max(0, max - newCount), lockedUntil: lockedUntil ?? undefined };
}

// ─── Public API — по коду ───────────────────────────────────────────────────────

export function getLoginAttemptStatus(code: string): Promise<AttemptStatus> {
  return statusForKey(code, MAX_LOGIN_ATTEMPTS);
}

export function recordFailedLogin(code: string) {
  return recordFailForKey(code, MAX_LOGIN_ATTEMPTS);
}

// ─── Public API — по IP (защита от перебора многих кодов с одного адреса) ────────

export function getIpAttemptStatus(ip: string): Promise<AttemptStatus> {
  return statusForKey(ipKey(ip), MAX_IP_ATTEMPTS);
}

export function recordFailedLoginIp(ip: string) {
  return recordFailForKey(ipKey(ip), MAX_IP_ATTEMPTS);
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
        WHERE locked_until IS NOT NULL AND locked_until > ${now}
          AND code NOT LIKE 'IPLOCK:%'`,
  );
  return rows.rows.map(r => ({
    code:        r.code,
    lockedUntil: Number(r.locked_until),
    attempts:    r.attempt_count,
  }));
}
