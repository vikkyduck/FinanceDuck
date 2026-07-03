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
import { db } from "../db";
import { and, eq, ne, desc } from "drizzle-orm";
import { accessTokens, userSessions, invoices, invoiceCalculations, invoiceExpenses, invoiceMessages, clients, partners } from "../../shared/schema";
import { AuthenticatedRequest, authMiddleware, SESSION_COOKIE } from "../middleware";
import { storage } from "../storage";
import { codeForDisplay } from "../lib/accessCode";

export const meRouter = Router();

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
    res.json({ ok: true, revoked: (result as any).rowCount ?? null });
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

// ─── GET /api/me/data-export ────────────────────────────────────────────
// Полная выгрузка всех моих данных в JSON. Для клиента — счета, расчёты,
// затраты (по agency 30/40), сообщения, peer-access. Для partner/staff
// возвращается минимум (можно расширить отдельно).
meRouter.get("/api/me/data-export", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const me = req.user!;
    const generatedAt = new Date().toISOString();
    const payload: any = { generatedAt, role: me.role };

    if (me.role === "client" && me.clientId) {
      // Профиль клиента.
      const [client] = await db.select().from(clients).where(eq(clients.id, me.clientId));
      payload.client = client ? {
        id: client.id, name: client.name, email: client.email, phone: client.phone, telegram: client.telegram,
        createdAt: client.createdAt,
      } : null;

      // Счета + расчёты.
      const invRows = await db.select({ inv: invoices, calc: invoiceCalculations })
        .from(invoices)
        .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
        .where(eq(invoices.clientId, me.clientId));
      payload.invoices = invRows.map(r => ({
        id: r.inv.id,
        invoiceNumber: r.inv.invoiceNumber,
        scheme: r.inv.scheme,
        status: r.inv.status,
        clientBill: r.inv.clientBill,
        clientTitle: r.inv.clientTitle,
        paymentDate: r.inv.paymentDate,
        actualPaymentDate: r.inv.actualPaymentDate,
        issueDate: r.inv.issueDate,
        serviceType: r.inv.serviceType,
        periodUnit: r.inv.periodUnit,
        pricePerPeriod: r.inv.pricePerPeriod,
        totalPeriods: r.inv.totalPeriods,
        periodsUsed: r.inv.periodsUsed,
        createdAt: r.inv.createdAt,
        updatedAt: r.inv.updatedAt,
        calculations: r.calc ? {
          clientBill: r.calc.clientBill,
          commissionRate: r.calc.commissionRate,
          commissionAmount: r.calc.commissionAmount,
          agencyMargin: r.calc.agencyMargin,
          clientBaseAfterMargin: r.calc.clientBaseAfterMargin,
          clientSpent: r.calc.clientSpent,
          clientRemaining: r.calc.clientRemaining,
          executorExpensesTotal: r.calc.executorExpensesTotal,
        } : null,
      }));

      // Затраты по агентским счетам (та же проекция, что и в обзоре).
      const agencyIds = invRows
        .filter(r => r.inv.scheme === "agency_30" || r.inv.scheme === "agency_40")
        .map(r => r.inv.id);
      if (agencyIds.length > 0) {
        const exp = await db.select().from(invoiceExpenses).where(
          // inArray импортирован в storage; здесь используем простое OR через or-helper.
          // Чтобы не тянуть зависимостей — фильтруем JS-ом, расходов обычно немного.
          eq(invoiceExpenses.invoiceId, agencyIds[0])
        );
        // Простой path: грузим все и фильтруем — у клиентов обычно <500 расходов.
        const all = await db.select().from(invoiceExpenses);
        payload.expenses = all
          .filter(e => agencyIds.includes(e.invoiceId))
          .map(e => ({
            id: e.id,
            invoiceId: e.invoiceId,
            description: e.description,
            amount: e.amount,
            date: e.date,
          }));
        void exp; // линт-успокоитель: первый запрос только проверяет схему
      } else {
        payload.expenses = [];
      }

      // Сообщения по моим счетам.
      const allMsg = await db.select().from(invoiceMessages);
      const myInvIds = new Set(invRows.map(r => r.inv.id));
      payload.messages = allMsg
        .filter(m => myInvIds.has(m.invoiceId))
        .map(m => ({
          id: m.id,
          invoiceId: m.invoiceId,
          expenseId: m.expenseId,
          authorRole: m.authorRole,
          body: m.body,
          createdAt: m.createdAt,
        }));
    }

    // Peer-доступ (общий блок для всех ролей).
    const peers = me.role === "client" && me.clientId
      ? await db.select().from(accessTokens).where(eq(accessTokens.clientId, me.clientId))
      : me.role === "partner" && me.partnerId
        ? await db.select().from(accessTokens).where(eq(accessTokens.partnerId, me.partnerId))
        : [me.token];
    payload.accessTokens = peers.map(p => ({
      id: p.id,
      role: p.role,
      isActive: p.isActive,
      createdAt: p.createdAt,
      lastUsedAt: p.lastUsedAt,
      expiresAt: p.expiresAt,
    }));

    // Имя файла с роли + датой для удобства архива.
    const dateSuffix = generatedAt.split("T")[0];
    const filename = `my-data-${me.role}-${dateSuffix}.json`;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(JSON.stringify(payload, null, 2));
  } catch (error) {
    console.error("[me/data-export]", error);
    res.status(500).json({ error: "Failed to export data" });
  }
});

void storage; // явный ref на storage чтобы avoid unused import warning, если хотим его подсасывать
