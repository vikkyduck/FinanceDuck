import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { personalDataExport } from '../services/personalDataExport';
import type { AuthMiddleware } from "../middleware";
/**
 * «Безопасность и данные» для текущего пользователя.
 *
 * Endpoints:
 *   GET  /api/me/access-info        — последний вход + кто из компании имеет доступ
 *   GET  /api/me/sessions           — список моих активных сессий
 *   POST /api/me/sessions/revoke-all — отозвать все мои сессии кроме текущей
 *   POST /api/me/sessions/:id/revoke — отозвать конкретную сессию
 *   GET  /api/me/data-export        — выгрузить все мои данные в JSON
 *
 * Доступ: только клиент (sessions/access-info/data-export) — и опционально
 * другие роли для безопасности кабинета. По умолчанию открыт всем
 * авторизованным юзерам.
 */
import { Router, Response } from "express";
import type { db as Database } from "../db";
import { and, eq, ne, desc } from "drizzle-orm";
import { accessTokens, userSessions } from "../../shared/schema";
import { AuthenticatedRequest, SESSION_COOKIE } from "../middleware";
import type { MeStore } from "../routeStores";
import { codeForDisplay } from "../lib/accessCode";

export function createMeRouter(storage: MeStore, authMiddleware: AuthMiddleware, db: typeof Database) {
const meRouter = Router();

// ─── helpers ────────────────────────────────────────────────────────────

const truncateUA = (ua: string | null | undefined): string => {
  if (!ua) return "—";
  // Простая категоризация для отображения, без полного парсинга.
  const s = ua.toLowerCase();
  let device = "Браузер";
  if (/iphone|ipad|ipod/.test(s)) device = "iPhone/iPad";
  else if (/android/.test(s))     device = "Android";
  else if (/mac os x|macintosh/.test(s)) device = "Mac";
  else if (/windows/.test(s))     device = "Windows";
  else if (/linux/.test(s))       device = "Linux";
  let browser = "—";
  if (/chrome\//.test(s) && !/edg\//.test(s)) browser = "Chrome";
  else if (/safari\//.test(s) && !/chrome\//.test(s)) browser = "Safari";
  else if (/firefox\//.test(s)) browser = "Firefox";
  else if (/edg\//.test(s))     browser = "Edge";
  return `${device} · ${browser}`;
};

// ─── GET /api/me/access-info ────────────────────────────────────────────
meRouter.get("/api/me/access-info", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const me = req.user!;
    const currentTokenId = me.token.id;

    // Кто из компании имеет доступ. Для роли client — все access_tokens
    // с тем же clientId. Для partner — с тем же partnerId. Для остальных
    // ролей вернём «только вы».
    let peers: typeof accessTokens.$inferSelect[] = [];
    if (me.role === "client" && me.clientId) {
      peers = await db.select().from(accessTokens).where(eq(accessTokens.clientId, me.clientId));
    } else if (me.role === "partner" && me.partnerId) {
      peers = await db.select().from(accessTokens).where(eq(accessTokens.partnerId, me.partnerId));
    } else {
      peers = [me.token];
    }

    // Маскируем «code» (никогда не светим полный код в API).
    const peersOut = peers.map(p => ({
      id: p.id,
      role: p.role,
      codeMask: (() => { const c = codeForDisplay(p); return c && c !== "—" ? `${c.slice(0, 2)}••••${c.slice(-2)}` : "—"; })(),
      isActive: p.isActive,
      lastUsedAt: p.lastUsedAt,
      createdAt: p.createdAt,
      expiresAt: p.expiresAt,
      isYou: p.id === currentTokenId,
    }));

    // Последний вход (моя самая свежая сессия не равная текущей).
    const sessions = await db.select().from(userSessions)
      .where(eq(userSessions.accessTokenId, currentTokenId))
      .orderBy(desc(userSessions.lastActivity));

    const lastLogin = sessions[0] ? {
      at: sessions[0].lastActivity,
      ipAddress: sessions[0].ipAddress,
      userAgent: truncateUA(sessions[0].userAgent),
    } : null;

    res.json({
      role: me.role,
      lastLogin,
      peers: peersOut,
    });
  } catch (error) {
    console.error("[me/access-info]", error);
    res.status(500).json({ error: "Failed to load access info" });
  }
});

// ─── GET /api/me/sessions ───────────────────────────────────────────────
meRouter.get("/api/me/sessions", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tokenId = req.user!.token.id;
    const currentSessionId = req.cookies?.[SESSION_COOKIE] || null;
    const rows = await db.select().from(userSessions)
      .where(and(eq(userSessions.accessTokenId, tokenId), eq(userSessions.revoked, false)))
      .orderBy(desc(userSessions.lastActivity));
    const now = Date.now();
    const out = rows
      .filter(r => new Date(r.expiresAt).getTime() > now)
      .map(r => ({
        id: r.id,
        ipAddress: r.ipAddress,
        userAgent: truncateUA(r.userAgent),
        createdAt: r.createdAt,
        lastActivity: r.lastActivity,
        expiresAt: r.expiresAt,
        isCurrent: !!currentSessionId && r.sessionId === currentSessionId,
      }));
    res.json(out);
  } catch (error) {
    console.error("[me/sessions]", error);
    res.status(500).json({ error: "Failed to load sessions" });
  }
});

// ─── POST /api/me/sessions/revoke-all ──────────────────────────────────
meRouter.post("/api/me/sessions/revoke-all", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tokenId = req.user!.token.id;
    const currentSessionId = req.cookies?.[SESSION_COOKIE] || null;
    const result = await db.update(userSessions)
      .set({ revoked: true })
      .where(and(
        eq(userSessions.accessTokenId, tokenId),
        eq(userSessions.revoked, false),
        currentSessionId ? ne(userSessions.sessionId, currentSessionId) : eq(userSessions.id, ""),
      ));
    res.json({ ok: true, revoked: result.rowCount ?? null });
  } catch (error) {
    console.error("[me/sessions/revoke-all]", error);
    res.status(500).json({ error: "Failed to revoke sessions" });
  }
});

// ─── POST /api/me/sessions/:id/revoke ──────────────────────────────────
meRouter.post("/api/me/sessions/:id/revoke", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tokenId = req.user!.token.id;
    const { id } = req.params;
    const [row] = await db.select().from(userSessions).where(eq(userSessions.id, id)).limit(1);
    if (!row || row.accessTokenId !== tokenId) {
      return res.status(404).json({ error: "Session not found" });
    }
    await db.update(userSessions).set({ revoked: true }).where(eq(userSessions.id, id));
    res.json({ ok: true });
  } catch (error) {
    console.error("[me/sessions/:id/revoke]", error);
    res.status(500).json({ error: "Failed to revoke session" });
  }
});

// Personal exports share the invoice projection and stream bounded, scoped queries.
meRouter.get("/api/me/data-export", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const generatedAt = new Date().toISOString();
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="my-data-${req.user!.role}-${generatedAt.slice(0, 10)}.json"`);
    res.setHeader('Cache-Control', 'no-store');
    await pipeline(Readable.from(personalDataExport(db, { ...req.user!, tokenId: req.user!.token.id }, generatedAt)), res);
  } catch (error) {
    if (res.destroyed) return;
    console.error("[me/data-export]", error);
    if (res.headersSent) res.destroy(); else res.status(500).json({ error: "Failed to export data" });
  }
});

void storage; // явный ref на storage чтобы avoid unused import warning, если хотим его подсасывать

return meRouter;
}
