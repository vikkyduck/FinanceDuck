/**
 * userRepo — auth, sessions, access tokens
 * All methods take the Drizzle db instance directly (no this binding).
 */
import { randomBytes } from "crypto";
import { eq, and, desc, gte } from "drizzle-orm";
import {
  accessTokens, userSessions, partners, clients,
  AccessToken, UserRole,
} from "../../shared/schema";
import type { db as _db } from "../db";

export type Db = typeof _db;

// ─── Session ──────────────────────────────────────────────────────────────────

export async function verifyAccessCode(db: Db, code: string): Promise<AccessToken | null> {
  const [token] = await db
    .select()
    .from(accessTokens)
    .where(and(eq(accessTokens.code, code), eq(accessTokens.isActive, true)))
    .limit(1);

  if (token) {
    await db.update(accessTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(accessTokens.id, token.id));
  }
  return token ?? null;
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
  const [created] = await db
    .insert(accessTokens)
    .values({ code, role, partnerId, clientId })
    .returning();
  return created;
}

export async function deleteAccessToken(db: Db, id: string): Promise<void> {
  await db.delete(accessTokens).where(eq(accessTokens.id, id));
}
