import { Router, Response } from "express";
import { db } from "../db";
import { and, desc, eq, inArray, isNull, isNotNull, or, sql } from "drizzle-orm";
import { invoiceMessages, invoices, invoiceExpenses, clients } from "../../shared/schema";
import { AuthenticatedRequest, authMiddleware, requireRole } from "../middleware";
import { resolveTelegramTarget, sendTelegramMessage, escapeHtml, publicUrl } from "../lib/telegram";

// «Сторона» треда: клиент — одна, admin+assistant — другая. Мы храним
// read_at симметрично, и помечаем «прочитано» с противоположной стороны.
type Side = 'client' | 'staff';
const sideOfRole = (role?: string): Side | null => {
  if (role === 'client') return 'client';
  if (role === 'admin' || role === 'assistant') return 'staff';
  return null;
};

export const messagesRouter = Router();

/**
 * Список тредов для текущей роли.
 * Тред = (invoice_id, expense_id?). Возвращаем счёт, expense (если есть),
 * последнее сообщение и количество сообщений в треде.
 */
messagesRouter.get("/api/messages/threads", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role || "client";
    const clientId = req.user?.clientId;

    // Узкий срез по доступным счетам (для client — только свои).
    let invoiceFilter;
    if (role === "client") {
      if (!clientId) return res.status(403).json({ error: "Клиент не идентифицирован" });
      invoiceFilter = eq(invoices.clientId, clientId);
    } else if (role === "admin" || role === "assistant") {
      invoiceFilter = undefined;
    } else {
      return res.status(403).json({ error: "Forbidden" });
    }

    // Группировка тредов по (invoice_id, expense_id).
    // Берём для каждого треда последнее сообщение через distinct on.
    const rows = await db.execute(sql`
      SELECT
        im.invoice_id            AS invoice_id,
        im.expense_id            AS expense_id,
        i.invoice_number         AS invoice_number,
        i.client_id              AS client_id,
        c.name                   AS client_name,
        ie.description           AS expense_description,
        ie.amount                AS expense_amount,
        COUNT(*)::int            AS message_count,
        MAX(im.created_at)       AS last_message_at,
        (
          SELECT im2.body
            FROM invoice_messages im2
           WHERE im2.invoice_id = im.invoice_id
             AND (im2.expense_id IS NOT DISTINCT FROM im.expense_id)
           ORDER BY im2.created_at DESC
           LIMIT 1
        ) AS last_message_body,
        (
          SELECT im2.author_role
            FROM invoice_messages im2
           WHERE im2.invoice_id = im.invoice_id
             AND (im2.expense_id IS NOT DISTINCT FROM im.expense_id)
           ORDER BY im2.created_at DESC
           LIMIT 1
        ) AS last_message_role
        FROM invoice_messages im
        JOIN invoices i ON i.id = im.invoice_id
        JOIN clients  c ON c.id = i.client_id
        LEFT JOIN invoice_expenses ie ON ie.id = im.expense_id
       ${role === "client" ? sql`WHERE i.client_id = ${clientId}` : sql``}
       GROUP BY im.invoice_id, im.expense_id, i.invoice_number, i.client_id, c.name, ie.description, ie.amount
       ORDER BY MAX(im.created_at) DESC
    `);

    res.json(rows.rows ?? rows);
  } catch (error) {
    console.error("Get threads error:", error);
    res.status(500).json({ error: "Failed to load threads" });
  }
});

/** Сообщения одного треда (по invoiceId + опционально expenseId). */
messagesRouter.get("/api/messages", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role || "client";
    const invoiceId = String(req.query.invoiceId || "");
    const expenseId = req.query.expenseId ? String(req.query.expenseId) : null;
    if (!invoiceId) return res.status(400).json({ error: "invoiceId обязателен" });

    // Проверка доступа: client видит только свои счета.
    const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
    if (!inv) return res.status(404).json({ error: "Invoice not found" });
    if (role === "client") {
      if (!req.user?.clientId || inv.clientId !== req.user.clientId) {
        return res.status(404).json({ error: "Invoice not found" });
      }
    } else if (role !== "admin" && role !== "assistant") {
      return res.status(403).json({ error: "Forbidden" });
    }

    const whereExp = expenseId
      ? eq(invoiceMessages.expenseId, expenseId)
      : isNull(invoiceMessages.expenseId);
    const rows = await db
      .select()
      .from(invoiceMessages)
      .where(and(eq(invoiceMessages.invoiceId, invoiceId), whereExp))
      .orderBy(invoiceMessages.createdAt);

    res.json(rows);
  } catch (error) {
    console.error("Get messages error:", error);
    res.status(500).json({ error: "Failed to load messages" });
  }
});

/**
 * Пометить тред прочитанным от лица текущей роли. Помечается «другая
 * сторона»: клиент закрывает непрочитанные от staff, staff — от клиента.
 * Body: { invoiceId, expenseId?: string | null }.
 */
messagesRouter.post("/api/messages/mark-read", authMiddleware, requireRole("client", "admin", "assistant"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user!.role;
    const side = sideOfRole(role);
    if (!side) return res.status(403).json({ error: "Forbidden" });
    const invoiceId = req.body?.invoiceId;
    const expenseId: string | null = req.body?.expenseId ?? null;
    if (!invoiceId || typeof invoiceId !== "string") return res.status(400).json({ error: "invoiceId обязателен" });

    // Доступ: клиент может пометить только свои счета.
    const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
    if (!inv) return res.status(404).json({ error: "Invoice not found" });
    if (role === "client" && (!req.user?.clientId || inv.clientId !== req.user.clientId)) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    const whereExp = expenseId ? eq(invoiceMessages.expenseId, expenseId) : isNull(invoiceMessages.expenseId);
    const now = new Date();
    if (side === 'client') {
      // Клиент пометил прочитанным то, что писал staff (или сам — на всякий случай).
      await db.update(invoiceMessages)
        .set({ clientReadAt: now })
        .where(and(eq(invoiceMessages.invoiceId, invoiceId), whereExp, isNull(invoiceMessages.clientReadAt)));
    } else {
      await db.update(invoiceMessages)
        .set({ staffReadAt: now })
        .where(and(eq(invoiceMessages.invoiceId, invoiceId), whereExp, isNull(invoiceMessages.staffReadAt)));
    }
    res.json({ ok: true });
  } catch (error) {
    console.error("Mark-read error:", error);
    res.status(500).json({ error: "Failed to mark read" });
  }
});

/**
 * Сколько у меня непрочитанных. Возвращает totalUnread (для бейджа в меню)
 * и by-invoice (для дотиков на конкретных счетах).
 */
messagesRouter.get("/api/messages/unread-summary", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role;
    const side = sideOfRole(role);
    if (!side) return res.json({ totalUnread: 0, byInvoice: {} });

    // Для клиента непрочитано = сообщения other-side, где clientReadAt IS NULL,
    // и счёт принадлежит ему. Для staff — staffReadAt IS NULL.
    const filterAccess = role === 'client'
      ? sql`AND i.client_id = ${req.user!.clientId}`
      : sql``;
    const readField = side === 'client' ? sql`im.client_read_at` : sql`im.staff_read_at`;
    const senderFilter = side === 'client'
      ? sql`im.author_role IN ('admin','assistant')`
      : sql`im.author_role = 'client'`;

    const rows = await db.execute(sql`
      SELECT im.invoice_id AS invoice_id, COUNT(*)::int AS cnt
        FROM invoice_messages im
        JOIN invoices i ON i.id = im.invoice_id
       WHERE ${readField} IS NULL
         AND ${senderFilter}
         ${filterAccess}
       GROUP BY im.invoice_id
    `);
    const list = (rows.rows ?? rows) as Array<{ invoice_id: string; cnt: number }>;
    const byInvoice: Record<string, number> = {};
    let totalUnread = 0;
    for (const r of list) {
      const n = Number(r.cnt) || 0;
      byInvoice[r.invoice_id] = n;
      totalUnread += n;
    }
    res.json({ totalUnread, byInvoice });
  } catch (error) {
    console.error("Unread summary error:", error);
    res.status(500).json({ error: "Failed to load unread summary" });
  }
});

/** Удалить сообщение. Только админ. Жёсткое удаление (cascade с тредом не нужно). */
messagesRouter.delete("/api/messages/:id", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const [msg] = await db.select().from(invoiceMessages).where(eq(invoiceMessages.id, id)).limit(1);
    if (!msg) return res.status(404).json({ error: "Message not found" });
    await db.delete(invoiceMessages).where(eq(invoiceMessages.id, id));
    res.json({ ok: true });
  } catch (error) {
    console.error("Delete message error:", error);
    res.status(500).json({ error: "Failed to delete message" });
  }
});

/** Отправить сообщение. Доступно client/admin/assistant. */
messagesRouter.post("/api/messages", authMiddleware, requireRole("client", "admin", "assistant"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user!.role;
    const { invoiceId, expenseId, body } = req.body || {};
    if (!invoiceId || typeof invoiceId !== "string") return res.status(400).json({ error: "invoiceId обязателен" });
    const text = typeof body === "string" ? body.trim() : "";
    if (!text) return res.status(400).json({ error: "Сообщение не может быть пустым" });
    if (text.length > 4000) return res.status(400).json({ error: "Сообщение слишком длинное" });

    const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
    if (!inv) return res.status(404).json({ error: "Invoice not found" });
    if (role === "client") {
      if (!req.user?.clientId || inv.clientId !== req.user.clientId) {
        return res.status(404).json({ error: "Invoice not found" });
      }
    }

    let expIdSafe: string | null = null;
    if (expenseId) {
      const [exp] = await db.select().from(invoiceExpenses).where(eq(invoiceExpenses.id, expenseId)).limit(1);
      if (!exp || exp.invoiceId !== invoiceId) {
        return res.status(400).json({ error: "Списание не относится к этому счёту" });
      }
      expIdSafe = exp.id;
    }

    // Своя сторона видит сообщение сразу — помечаем как прочитанное автором.
    const authorSide = sideOfRole(role);
    const now = new Date();
    const [created] = await db.insert(invoiceMessages).values({
      invoiceId,
      expenseId: expIdSafe,
      authorRole: role,
      authorTokenId: req.user!.token.id,
      body: text,
      clientReadAt: authorSide === 'client' ? now : null,
      staffReadAt:  authorSide === 'staff'  ? now : null,
    }).returning();

    // ── Telegram-нотификация (асинхронно, не блокирует ответ) ─────────
    // В чат клиента (если настроен) уходит уведомление о новом сообщении.
    // Если автор сам пишет из той же группы — он всё равно получит
    // нотификацию (TG-API не отличает). Это «push» в группу всех сторон.
    (async () => {
      try {
        const [client] = await db.select().from(clients).where(eq(clients.id, inv.clientId)).limit(1);
        const target = resolveTelegramTarget(client);
        if (!target) return;
        let expensePart = "";
        if (expIdSafe) {
          const [exp] = await db.select().from(invoiceExpenses).where(eq(invoiceExpenses.id, expIdSafe)).limit(1);
          if (exp?.description) {
            expensePart = `\n📎 По списанию: <i>${escapeHtml(exp.description)}</i>`;
          }
        }
        const roleNames: Record<string, string> = { client: "Клиент", admin: "Админ", assistant: "Ассистент" };
        const author = roleNames[role] || role;
        const invoiceLabel = inv.invoiceNumber ? `Счёт № ${escapeHtml(inv.invoiceNumber)}` : "Счёт";
        const params = new URLSearchParams({ invoiceId });
        if (expIdSafe) params.set("expenseId", expIdSafe);
        const link = publicUrl(`/messages?${params.toString()}`);
        const linkPart = link ? `\n\n<a href="${link}">Открыть тред</a>` : "";
        const messageBody = text.length > 700 ? text.slice(0, 700) + "…" : text;
        const contactSuffix = (client as any)?.contactPerson
          ? ` (${escapeHtml((client as any).contactPerson)})`
          : "";
        const html =
          `💬 <b>${escapeHtml(invoiceLabel)}</b> · ${escapeHtml(client?.name || "Клиент")}${contactSuffix}\n` +
          `<i>${escapeHtml(author)} написал:</i>\n` +
          `${escapeHtml(messageBody)}` +
          expensePart +
          linkPart;
        await sendTelegramMessage(target, html);
      } catch (e) {
        console.error("[messages] telegram notify error:", (e as Error).message);
      }
    })().catch(() => {});

    res.status(201).json(created);
  } catch (error) {
    console.error("Post message error:", error);
    res.status(500).json({ error: "Failed to send message" });
  }
});
