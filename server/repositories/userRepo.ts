/**
 * userRepo — auth, sessions, access tokens
 * All methods take the Drizzle db instance directly (no this binding).
 */
import { randomBytes } from "crypto";
import { eq, and, or, desc, gte } from "drizzle-orm";
import {
  accessTokens, userSessions, partners, clients,
  AccessToken, UserRole,
} from "../../shared/schema";
import type { db as _db } from "../db";
import {
  accessCodeCryptoEnabled, lookupHash, encryptCode, codeForDisplay, isLookupHash,
} from "../lib/accessCode";

export type Db = typeof _db;

/** Просрочен ли токен (C2 — раньше expiresAt не проверялся вообще). */
function isExpired(token: { expiresAt?: Date | null }): boolean {
  return !!token.expiresAt && new Date(token.expiresAt).getTime() <= Date.now();
}

// Абсолютный потолок жизни сессии: даже при непрерывной активности сессия живёт
// не дольше этого срока от момента создания (скользящее окно 30 мин продлевает
// только В ПРЕДЕЛАХ потолка). Ограничивает время жизни украденной сессии.
const ABSOLUTE_SESSION_MS = 12 * 60 * 60 * 1000; // 12 часов
const absoluteCutoff = () => new Date(Date.now() - ABSOLUTE_SESSION_MS);

/**
 * Разовая идемпотентная миграция всех кодов «в сейф». Вызывается на старте.
 * Ничего не делает, если крипта выключена; трогает только строки, которые
 * ещё не отпечаток. Вход работает независимо от её успеха (dual-lookup +
 * ленивая миграция на логине), поэтому запускаем fire-and-forget.
 */
export async function migrateAccessCodesAtRest(db: Db): Promise<number> {
  if (!accessCodeCryptoEnabled) return 0;
  const rows = await db.select().from(accessTokens);
  let migrated = 0;
  for (const row of rows) {
    if (isLookupHash(row.code)) continue; // уже в сейфе
    await db.update(accessTokens)
      .set({ code: lookupHash(row.code), codeEnc: encryptCode(row.code) })
      .where(eq(accessTokens.id, row.id));
    migrated++;
  }
  return migrated;
}

// ─── Session ──────────────────────────────────────────────────────────────────

export async function verifyAccessCode(db: Db, code: string): Promise<AccessToken | null> {
  let token: AccessToken | undefined;

  if (accessCodeCryptoEnabled) {
    // Ищем и по отпечатку (мигрированные строки), и по открытому тексту
    // (легаси, ещё не мигрированные) — это и даёт нулевой риск локаута.
    const lh = lookupHash(code);
    [token] = await db
      .select()
      .from(accessTokens)
      .where(and(
        or(eq(accessTokens.code, lh), eq(accessTokens.code, code)),
        eq(accessTokens.isActive, true),
      ))
      .limit(1);

    // Ленивая миграция: нашли по открытому тексту → кладём в «сейф».
    if (token && token.code === code) {
      await db.update(accessTokens)
        .set({ code: lh, codeEnc: encryptCode(code) })
        .where(eq(accessTokens.id, token.id));
    }
  } else {
    [token] = await db
      .select()
      .from(accessTokens)
      .where(and(eq(accessTokens.code, code), eq(accessTokens.isActive, true)))
      .limit(1);
  }

  if (!token) return null;
  if (isExpired(token)) return null; // C2: истёкший код больше не пускаем

  await db.update(accessTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(accessTokens.id, token.id));
  return token;
}

export async function createSession(
  db: Db,
  tokenId: string,
  ipAddress?: string,
  userAgent?: string,
): Promise<{ sessionId: string; csrfToken: string; expiresAt: Date }> {
  const sessionId  = randomBytes(32).toString("base64");
  const csrfToken  = randomBytes(32).toString("base64");
  const expiresAt  = new Date(Date.now() + 30 * 60 * 1000);

  await db.insert(userSessions).values({
    sessionId, accessTokenId: tokenId, csrfToken, ipAddress, userAgent, expiresAt,
  });
  return { sessionId, csrfToken, expiresAt };
}

export async function validateSession(
  db: Db,
  sessionId: string,
  csrfToken?: string,
): Promise<{ isValid: boolean; token?: AccessToken } | null> {
  const [session] = await db
    .select()
    .from(userSessions)
    .where(and(
      eq(userSessions.sessionId, sessionId),
      eq(userSessions.revoked, false),
      gte(userSessions.expiresAt, new Date()),
      gte(userSessions.createdAt, absoluteCutoff()), // абсолютный потолок жизни сессии
    ))
    .limit(1);

  if (!session) return { isValid: false };
  if (csrfToken && session.csrfToken !== csrfToken) return { isValid: false };

  await db.update(userSessions)
    .set({ lastActivity: new Date() })
    .where(eq(userSessions.id, session.id));

  const [token] = await db
    .select()
    .from(accessTokens)
    .where(and(eq(accessTokens.id, session.accessTokenId), eq(accessTokens.isActive, true)))
    .limit(1);

  if (!token) return { isValid: false };
  if (isExpired(token)) return { isValid: false }; // C2: истёкший код рвёт сессию
  return { isValid: true, token };
}

export async function refreshSession(db: Db, sessionId: string): Promise<Date | null> {
  const newExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const result = await db.update(userSessions)
    .set({ expiresAt: newExpiresAt, lastActivity: new Date() })
    .where(and(
      eq(userSessions.sessionId, sessionId),
      eq(userSessions.revoked, false),
      gte(userSessions.expiresAt, new Date()),
      gte(userSessions.createdAt, absoluteCutoff()), // абсолютный потолок жизни сессии
    ))
    .returning();
  return result.length > 0 ? newExpiresAt : null;
}

export async function revokeSession(db: Db, sessionId: string): Promise<void> {
  await db.update(userSessions)
    .set({ revoked: true })
    .where(eq(userSessions.sessionId, sessionId));
}

// ─── Access tokens ────────────────────────────────────────────────────────────

export async function getAccessTokens(
  db: Db,
): Promise<(AccessToken & { partnerName?: string; clientName?: string })[]> {
  const results = await db
    .select({ token: accessTokens, partnerName: partners.name, clientName: clients.name })
    .from(accessTokens)
    .leftJoin(partners, eq(accessTokens.partnerId, partners.id))
    .leftJoin(clients, eq(accessTokens.clientId, clients.id))
    .orderBy(desc(accessTokens.createdAt));

  return results.map(r => ({
    ...r.token,
    code: codeForDisplay(r.token), // расшифрованный код для показа админу
    partnerName: r.partnerName ?? undefined,
    clientName:  r.clientName  ?? undefined,
  }));
}

export async function createAccessToken(
  db: Db,
  code: string,
  role: UserRole,
  partnerId?: string,
  clientId?: string,
): Promise<AccessToken> {
  const storedCode = accessCodeCryptoEnabled ? lookupHash(code) : code;
  const codeEnc    = accessCodeCryptoEnabled ? encryptCode(code) : null;
  const [created] = await db
    .insert(accessTokens)
    .values({ code: storedCode, codeEnc, role, partnerId, clientId })
    .returning();
  // Возвращаем открытый код, чтобы фронт показал его сразу после создания
  // (в БД он уже в «сейфе»).
  return { ...created, code };
}

export async function deleteAccessToken(db: Db, id: string): Promise<void> {
  await db.delete(accessTokens).where(eq(accessTokens.id, id));
}
