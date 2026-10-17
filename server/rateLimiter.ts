/**
 * Persistent login rate limiter backed by PostgreSQL.
 * Survives server restarts — unlike the previous in-memory Map approach.
 *
 * Table: login_rate_limits (code PK, attempt_count, last_attempt BIGINT, locked_until BIGINT)
 */
import type { db } from "./db";
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

interface RateLimitRow extends Record<string, unknown> {
  attempt_count: number;
  last_attempt: string;
  locked_until: string | null;
}

export interface AttemptStatus {
  isLocked: boolean;
  attemptsRemaining: number;
  lockedUntil?: number;
}

/** Reserve BEFORE checking credentials; a single SQL statement serializes contenders. */
export async function consumeAttempt(database: typeof db, key: string, max: number, now = Date.now()): Promise<AttemptStatus & { allowed: boolean }> {
  const reset = sql`(login_rate_limits.locked_until <= ${now} OR login_rate_limits.last_attempt < ${now - ATTEMPT_WINDOW_MS})`;
  const count = sql`CASE WHEN ${reset} THEN 1 ELSE login_rate_limits.attempt_count + 1 END`;
  const result = await database.execute<RateLimitRow>(sql`
    INSERT INTO login_rate_limits (code, attempt_count, last_attempt, locked_until)
    VALUES (${key.toUpperCase()}, 1, ${now}, NULL)
    ON CONFLICT (code) DO UPDATE SET
      attempt_count = ${count}, last_attempt = ${now},
      locked_until = CASE WHEN (${count}) >= ${max} THEN ${now + LOCKOUT_DURATION_MS}::bigint ELSE NULL END
    WHERE login_rate_limits.locked_until IS NULL OR login_rate_limits.locked_until <= ${now}
    RETURNING attempt_count, last_attempt, locked_until
  `);
  const row = result.rows[0];
  if (!row) return { allowed: false, isLocked: true, attemptsRemaining: 0, lockedUntil: now + LOCKOUT_DURATION_MS };
  return { allowed: true, isLocked: false, attemptsRemaining: Math.max(0, max - row.attempt_count), lockedUntil: row.locked_until ? Number(row.locked_until) : undefined };
}

/** Bounded retention; never removes a current attempt window or active lock. */
export async function pruneExpiredLoginAttempts(database: typeof db, now = Date.now(), batchSize = 5000): Promise<number> {
  const result = await database.execute(sql`
    DELETE FROM login_rate_limits WHERE code IN (
      SELECT code FROM login_rate_limits
      WHERE last_attempt < ${now - ATTEMPT_WINDOW_MS}
        AND (locked_until IS NULL OR locked_until <= ${now})
      ORDER BY last_attempt LIMIT ${batchSize} FOR UPDATE SKIP LOCKED
    ) RETURNING code`);
  return result.rows.length;
}

export function createLoginAttemptLimiter(database: typeof db) {
  return {
    reserveLoginAttempt: (code: string) => consumeAttempt(database, code, MAX_LOGIN_ATTEMPTS),
    reserveIpAttempt: (ip: string) => consumeAttempt(database, ipKey(ip), MAX_IP_ATTEMPTS),
    async clearLoginAttempts(code: string) {
      const result = await database.execute(sql`DELETE FROM login_rate_limits WHERE code = ${code.toUpperCase()} RETURNING code`);
      return result.rows.length > 0;
    },
    async clearAllLoginAttempts() {
      const result = await database.execute(sql`DELETE FROM login_rate_limits RETURNING code`);
      return result.rows.length;
    },
    async getLockedCodes() {
      const rows = await database.execute<{ code: string; locked_until: string; attempt_count: number }>(sql`
        SELECT code, locked_until, attempt_count FROM login_rate_limits
        WHERE locked_until > ${Date.now()} AND code NOT LIKE 'IPLOCK:%'`);
      return rows.rows.map(row => ({ code: row.code, lockedUntil: Number(row.locked_until), attempts: row.attempt_count }));
    },
  };
}
export type LoginAttemptLimiter = ReturnType<typeof createLoginAttemptLimiter>;
