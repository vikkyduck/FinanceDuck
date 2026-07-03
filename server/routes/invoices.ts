import { Router, Response } from "express";
import { storage } from "../storage";
import { AuthenticatedRequest, authMiddleware, requireRole } from "../middleware";
import { stripSensitiveFieldsForRole, stripSensitiveFieldsFromList, isClientFinancialVisible, isClientUsageVisible } from "../permissions";
import { pick, INVOICE_WRITABLE_FIELDS, EXPENSE_WRITABLE_FIELDS } from "../lib/sanitize";

export const invoicesRouter = Router();

invoicesRouter.get("/api/invoices", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role || "client";
    let partnerId = req.user?.partnerId;
    const clientId = req.user?.clientId;
    if (role === "admin" && req.query.partnerId) partnerId = req.query.partnerId as string;
    const result = await storage.getInvoices(role, partnerId, clientId);
    res.json(stripSensitiveFieldsFromList(result, role));
  } catch (error) {
    console.error("Get invoices error:", error);
    res.status(500).json({ error: "Failed to get invoices" });
  }
});

invoicesRouter.get("/api/invoices/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const role = req.user?.role || "client";
    const invoice = await storage.getInvoiceForRole(id, role as any, req.user?.partnerId, req.user?.clientId);
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    res.json(stripSensitiveFieldsForRole(invoice, role));
  } catch (error) {
    console.error("Get invoice error:", error);
    res.status(500).json({ error: "Failed to get invoice" });
  }
});

invoicesRouter.post("/api/invoices", authMiddleware, requireRole("admin", "assistant", "accountant"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role || "client";
    const { calculations } = req.body || {};
    const invoiceData = pick(req.body, INVOICE_WRITABLE_FIELDS);
    const invoice = await storage.createInvoice({ ...invoiceData, createdBy: req.user!.token.id }, calculations || {});
    const fullInvoice = await storage.getInvoice(invoice.id);
    const filtered = stripSensitiveFieldsForRole(fullInvoice || invoice, role);
    if (role === "assistant" || role === "admin" || role === "accountant") {
      const client = invoiceData.clientId ? await storage.getClient(invoiceData.clientId) : null;
      const partner = invoiceData.partnerId ? await storage.getPartner(invoiceData.partnerId) : null;
      const invoiceNumber = fullInvoice?.invoiceNumber;
      const displayName = invoiceNumber || client?.name || partner?.name || fullInvoice?.description || invoice.id;
      await storage.logAssistantAction({ accessTokenId: req.user!.token.id, actionType: "create_invoice", entityType: "invoice", entityId: invoice.id, description: `Создан счёт: ${displayName}`, details: JSON.stringify({ invoiceNumber, clientName: client?.name, partnerName: partner?.name, description: fullInvoice?.description, clientBill: invoiceData.clientBill, status: invoice.status }), ipAddress: req.ip || req.headers["x-forwarded-for"] as string || null, userAgent: req.headers["user-agent"] || null });
    }
    // Fire-and-forget TG notification — клиенту в группу.
    // Видимость: ровно как в кабинете — clientTitle (если есть) или номер счёта,
    // сумма к оплате, статус. Внутренние поля (комиссия, партнёр) не светим.
    (async () => {
      try {
        if (!fullInvoice?.clientId) return;
        const { resolveTelegramTarget, sendTelegramMessage, escapeHtml, publicUrl } = await import("../lib/telegram");
        const client = await storage.getClient(fullInvoice.clientId);
        const target = resolveTelegramTarget(client as any);
        if (!target) return;
        const label = fullInvoice.clientTitle || fullInvoice.invoiceNumber || invoice.id;
        const amountStr = new Intl.NumberFormat("ru-RU", {
          style: "currency", currency: "RUB", minimumFractionDigits: 0, maximumFractionDigits: 2,
        }).format(Number(fullInvoice.clientBill) || 0);
        const statusMap: Record<string, string> = {
          pending: "ожидает оплаты",
          paid: "оплачен",
          overdue: "просрочен",
          partial: "частично оплачен",
        };
        const statusStr = statusMap[String(fullInvoice.status)] || String(fullInvoice.status || "");
        const periodicPart = fullInvoice.serviceType === "periodic" && fullInvoice.totalPeriods
          ? `\nПериодическая услуга: ${fullInvoice.totalPeriods} ${fullInvoice.periodUnit || "период."}`
          : "";
        const link = publicUrl(`/invoices/${invoice.id}`);
        const linkPart = link ? `\n<a href="${escapeHtml(link)}">Открыть счёт →</a>` : "";
        const contactSuffix = (client as any)?.contactPerson
          ? ` (${escapeHtml((client as any).contactPerson)})`
          : "";
        const html =
          `🧾 <b>Новый счёт</b> · ${escapeHtml(label)}${contactSuffix}\n` +
          `Сумма: <b>${escapeHtml(amountStr)}</b>` +
          (statusStr ? `\nСтатус: ${escapeHtml(statusStr)}` : "") +
          periodicPart +
          linkPart;
        await sendTelegramMessage(target, html);
      } catch (e) {
        console.error("[telegram] invoice notify failed:", (e as Error).message);
      }
    })().catch(() => {});
    res.status(201).json(filtered);
  } catch (error) {
    console.error("Create invoice error:", error);
    res.status(500).json({ error: "Failed to create invoice" });
  }
});

invoicesRouter.patch("/api/invoices/:id", authMiddleware, requireRole("admin", "assistant", "accountant"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const role = req.user?.role || "client";
    const { calculations } = req.body || {};
    const invoiceData = pick(req.body, INVOICE_WRITABLE_FIELDS);
    if (role === "accountant") {
      const existing = await storage.getInvoice(id);
      if (!existing || !existing.hideFromAssistant) return res.status(403).json({ error: "Forbidden" });
    }

    // Валидация периодических полей: 1 ≤ totalPeriods, 0 ≤ pricePerPeriod,
    // 0 ≤ periodsUsed ≤ totalPeriods. Проверяем по эффективному состоянию
    // (новое значение, если прислали, иначе текущее в БД).
    const periodicTouched =
      invoiceData.serviceType !== undefined ||
      invoiceData.periodUnit !== undefined ||
      invoiceData.pricePerPeriod !== undefined ||
      invoiceData.totalPeriods !== undefined ||
      invoiceData.periodsUsed !== undefined;
    if (periodicTouched) {
      const existing = await storage.getInvoice(id);
      if (!existing) return res.status(404).json({ error: "Invoice not found" });
      const eff = {
        serviceType:    invoiceData.serviceType    ?? existing.serviceType,
        pricePerPeriod: invoiceData.pricePerPeriod ?? existing.pricePerPeriod,
        totalPeriods:   invoiceData.totalPeriods   ?? existing.totalPeriods,
        periodsUsed:    invoiceData.periodsUsed    ?? existing.periodsUsed,
      };
      if (eff.serviceType === 'periodic') {
        const price = Number(eff.pricePerPeriod ?? 0);
        const total = Number(eff.totalPeriods ?? 0);
        const used  = Number(eff.periodsUsed ?? 0);
        if (!Number.isFinite(total) || total < 1) return res.status(400).json({ error: "totalPeriods должно быть ≥ 1" });
        if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: "pricePerPeriod должно быть ≥ 0" });
        if (!Number.isInteger(used) || used < 0)  return res.status(400).json({ error: "periodsUsed должно быть ≥ 0" });
        if (used > total) return res.status(400).json({ error: "periodsUsed не может превышать totalPeriods" });
      }
    }

    const invoice = await storage.updateInvoice(id, invoiceData);
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    // Пересчёт нужен и при изменении periodic-полей (без calculations в теле).
    if (calculations || invoiceData.plannedExpenses !== undefined || periodicTouched) {
      await storage.updateInvoiceCalculations(id, calculations || {});
    }
    const fullInvoice = await storage.getInvoice(id);
    const filtered = stripSensitiveFieldsForRole(fullInvoice || invoice, role);
    if (role === "assistant" || role === "admin" || role === "accountant") {
      const client = fullInvoice?.clientId ? await storage.getClient(fullInvoice.clientId) : null;
      const partner = fullInvoice?.partnerId ? await storage.getPartner(fullInvoice.partnerId) : null;
      const invoiceNumber = fullInvoice?.invoiceNumber;
      const displayName = invoiceNumber || client?.name || partner?.name || fullInvoice?.description || id;
      await storage.logAssistantAction({ accessTokenId: req.user!.token.id, actionType: "update_invoice", entityType: "invoice", entityId: id, description: `Обновлён счёт: ${displayName}`, details: JSON.stringify({ invoiceNumber, clientName: client?.name, partnerName: partner?.name, description: fullInvoice?.description, status: fullInvoice?.status, ...invoiceData }), ipAddress: req.ip || req.headers["x-forwarded-for"] as string || null, userAgent: req.headers["user-agent"] || null });
    }
    res.json(filtered);
  } catch (error) {
    console.error("Update invoice error:", error);
    res.status(500).json({ error: "Failed to update invoice" });
  }
});

// Закрыть один период периодического счёта: periodsUsed += 1, не больше totalPeriods.
invoicesRouter.post("/api/invoices/:id/close-period", authMiddleware, requireRole("admin", "assistant"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await storage.getInvoice(id);
    if (!existing) return res.status(404).json({ error: "Invoice not found" });
    if (existing.serviceType !== 'periodic') {
      return res.status(400).json({ error: "Счёт не периодический" });
    }
    const total = Number(existing.totalPeriods ?? 0);
    const used  = Number(existing.periodsUsed ?? 0);
    if (used >= total) {
      return res.status(400).json({ error: "Все периоды уже закрыты" });
    }
    await storage.updateInvoice(id, { periodsUsed: used + 1 });
    await storage.updateInvoiceCalculations(id, {});
    const fullInvoice = await storage.getInvoice(id);
    const role = req.user?.role || "admin";
    if (role === "assistant" || role === "admin") {
      await storage.logAssistantAction({
        accessTokenId: req.user!.token.id,
        actionType: "update_invoice",
        entityType: "invoice",
        entityId: id,
        description: `Закрыт период по счёту: ${existing.invoiceNumber} (${used + 1}/${total})`,
        details: JSON.stringify({ invoiceNumber: existing.invoiceNumber, periodsUsed: used + 1, totalPeriods: total }),
        ipAddress: req.ip || req.headers["x-forwarded-for"] as string || null,
        userAgent: req.headers["user-agent"] || null,
      });
    }
    res.json(stripSensitiveFieldsForRole(fullInvoice as any, role));
  } catch (error) {
    console.error("Close period error:", error);
    res.status(500).json({ error: "Failed to close period" });
  }
});

invoicesRouter.delete("/api/invoices/:id", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const role = req.user?.role || "client";
    const invoice = await storage.getInvoice(id);
    if (role === "assistant" || role === "admin" || role === "accountant") {
      const invoiceNumber = invoice?.invoiceNumber;
      const clientName = invoice?.clientId ? (await storage.getClient(invoice.clientId))?.name : null;
      const partnerName = invoice?.partnerId ? (await storage.getPartner(invoice.partnerId))?.name : null;
      const displayName = invoiceNumber || clientName || partnerName || invoice?.description || id;
      await storage.logAssistantAction({ accessTokenId: req.user!.token.id, actionType: "delete_invoice", entityType: "invoice", entityId: id, description: `Удалён счёт: ${displayName}`, details: JSON.stringify({ invoiceNumber, clientName, partnerName, description: invoice?.description, clientBill: invoice?.clientBill, status: invoice?.status }), ipAddress: req.ip || req.headers["x-forwarded-for"] as string || null, userAgent: req.headers["user-agent"] || null });
    }
    await storage.deleteInvoice(id);
    res.json({ success: true });
  } catch (error) {
    console.error("Delete invoice error:", error);
    res.status(500).json({ error: "Failed to delete invoice" });
  }
});

invoicesRouter.get("/api/invoices/:id/expenses", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.user?.role === "client") {
      const invoice = await storage.getInvoice(req.params.id);
      if (!invoice || invoice.clientId !== req.user.clientId) {
        return res.status(404).json({ error: "Invoice not found" });
      }
      const expenses = await storage.getInvoiceExpenses(req.params.id);
      // Агентские 30/40 — клиент видит расходы целиком (вместе с суммами).
      if (isClientFinancialVisible(invoice.scheme)) {
        return res.json(expenses);
      }
      // commission_based / partner_10 / partner_15 — список списаний
      // отдаём с описаниями и датами, но БЕЗ сумм и без признака
      // «кто оплатил» — клиенту знать «затраты» не положено.
      return res.json(expenses.map(e => ({
        id: e.id,
        invoiceId: e.invoiceId,
        description: e.description,
        date: e.date,
        createdAt: e.createdAt,
      })));
    }
    res.json(await storage.getInvoiceExpenses(req.params.id));
  } catch (error) {
    console.error("Get expenses error:", error);
    res.status(500).json({ error: "Failed to get expenses" });
  }
});

invoicesRouter.post("/api/invoices/:id/expenses", authMiddleware, requireRole("admin", "assistant", "accountant"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const role = req.user?.role || "client";
    if (role === "accountant") {
      const inv = await storage.getInvoice(id);
      if (!inv || !inv.hideFromAssistant) return res.status(403).json({ error: "Forbidden" });
    }
    const expense = await storage.createInvoiceExpense({ ...pick(req.body, EXPENSE_WRITABLE_FIELDS), invoiceId: id, createdBy: req.user!.token.id });
    if (role === "assistant" || role === "admin" || role === "accountant") {
      await storage.logAssistantAction({ accessTokenId: req.user!.token.id, actionType: "create_expense", entityType: "expense", entityId: expense.id, description: `Создан расход: ${req.body.description || expense.id}`, details: JSON.stringify({ invoiceId: id, amount: req.body.amount, paidByPartner: req.body.paidByPartner }), ipAddress: req.ip || req.headers["x-forwarded-for"] as string || null, userAgent: req.headers["user-agent"] || null });
    }
    // Fire-and-forget TG notification. Шлём клиенту, когда он видит движение по
    // счёту: агентские схемы (видит расходы в кабинете) ИЛИ периодические
    // (видит потребление по периодам). Для периодических показываем КЛИЕНТСКУЮ
    // ставку за период (pricePerPeriod), а не себестоимость исполнителя, и не
    // раскрываем описание расхода (там имя/оклад исполнителя — внутреннее).
    (async () => {
      try {
        const inv = await storage.getInvoice(id);
        if (!inv || !isClientUsageVisible(inv)) return;
        const { resolveTelegramTarget, sendTelegramMessage, escapeHtml, publicUrl } = await import("../lib/telegram");
        const client = inv.clientId ? await storage.getClient(inv.clientId) : null;
        const target = resolveTelegramTarget(client as any);
        if (!target) return;
        const isPeriodic = inv.serviceType === "periodic";
        const invoiceLabel = inv.clientTitle || inv.invoiceNumber || id;
        // Клиентская сумма: для периодических — ставка за период, иначе — сама трата.
        const clientAmount = isPeriodic ? (Number(inv.pricePerPeriod) || 0) : (Number(expense.amount) || 0);
        const amountStr = new Intl.NumberFormat("ru-RU", {
          style: "currency", currency: "RUB", minimumFractionDigits: 0, maximumFractionDigits: 2,
        }).format(clientAmount);
        const unitLabel = ({ month: "месяц", day: "день", hour: "час" } as Record<string, string>)[String(inv.periodUnit)] || "период";
        // Для периодических — нейтральная клиентская подпись (без исполнителя).
        const lineDesc = isPeriodic ? `Списание за ${unitLabel}` : (expense.description || "—");
        const link = publicUrl(`/invoices/${id}`);
        const linkPart = link ? `\n<a href="${escapeHtml(link)}">Открыть счёт →</a>` : "";
        const contactSuffix = (client as any)?.contactPerson
          ? ` (${escapeHtml((client as any).contactPerson)})`
          : "";
        const html =
          `💸 <b>${isPeriodic ? "Списание" : "Новая трата"}</b> · ${escapeHtml(invoiceLabel)}${contactSuffix}\n` +
          `${escapeHtml(lineDesc)} — <b>${escapeHtml(amountStr)}</b>` +
          linkPart;
        await sendTelegramMessage(target, html);
      } catch (e) {
        console.error("[telegram] expense notify failed:", (e as Error).message);
      }
    })().catch(() => {});
    res.status(201).json(expense);
  } catch (error) {
    console.error("Create expense error:", error);
    res.status(500).json({ error: "Failed to create expense" });
  }
});

invoicesRouter.patch("/api/expenses/:id", authMiddleware, requireRole("admin", "assistant", "accountant"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const role = req.user?.role || "client";
    const expense = await storage.updateInvoiceExpense(id, pick(req.body, EXPENSE_WRITABLE_FIELDS));
    if (!expense) return res.status(404).json({ error: "Expense not found" });
    if (role === "assistant" || role === "admin" || role === "accountant") {
      await storage.logAssistantAction({ accessTokenId: req.user!.token.id, actionType: "update_expense", entityType: "expense", entityId: id, description: `Обновлён расход: ${expense.description || id}`, details: JSON.stringify(req.body), ipAddress: req.ip || req.headers["x-forwarded-for"] as string || null, userAgent: req.headers["user-agent"] || null });
    }
    res.json(expense);
  } catch (error) {
    console.error("Update expense error:", error);
    res.status(500).json({ error: "Failed to update expense" });
  }
});

invoicesRouter.delete("/api/expenses/:id", authMiddleware, requireRole("admin", "assistant", "accountant"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const role = req.user?.role || "client";
    if (role === "assistant" || role === "admin" || role === "accountant") {
      await storage.logAssistantAction({ accessTokenId: req.user!.token.id, actionType: "delete_expense", entityType: "expense", entityId: id, description: `Удалён расход: ${id}`, details: null, ipAddress: req.ip || req.headers["x-forwarded-for"] as string || null, userAgent: req.headers["user-agent"] || null });
    }
    await storage.deleteInvoiceExpense(id);
    res.json({ success: true });
  } catch (error) {
    console.error("Delete expense error:", error);
    res.status(500).json({ error: "Failed to delete expense" });
  }
});

// ─── Переносы средств между счетами одного клиента (admin only) ────────────
//
// Не создают «фейковых» расходов/доходов: client_bill счетов остаётся как был,
// меняется только client_remaining (то, что клиент видит как «доступно»).
// Админская математика (комиссия, перевод партнёру, прибыль) — от client_bill.
invoicesRouter.post("/api/invoices/transfer", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { fromInvoiceId, toInvoiceId, amount, notes } = req.body || {};
    if (!fromInvoiceId || !toInvoiceId) return res.status(400).json({ error: "fromInvoiceId и toInvoiceId обязательны" });
    const amt = Number(amount);
    const result = await storage.createInvoiceTransfer({
      fromInvoiceId, toInvoiceId, amount: amt, notes: notes ?? null,
      createdBy: req.user!.token.id,
    });
    if (!result.ok) return res.status(400).json({ error: result.error });

    // Журнал действий
    const fromInv = await storage.getInvoice(fromInvoiceId);
    const toInv   = await storage.getInvoice(toInvoiceId);
    await storage.logAssistantAction({
      accessTokenId: req.user!.token.id,
      actionType: "transfer_funds",
      entityType: "invoice",
      entityId: fromInvoiceId,
      description: `Перенос ${amt} ₽ со счёта ${fromInv?.invoiceNumber || fromInvoiceId} на ${toInv?.invoiceNumber || toInvoiceId}`,
      details: JSON.stringify({ fromInvoiceId, toInvoiceId, amount: amt, notes: notes ?? null }),
      ipAddress: req.ip || req.headers["x-forwarded-for"] as string || null,
      userAgent: req.headers["user-agent"] || null,
    });

    // TG-уведомление клиенту (только если хотя бы один из счетов агентский 30/40)
    (async () => {
      try {
        if (!fromInv?.clientId) return;
        const fromAgency = isClientFinancialVisible(fromInv.scheme);
        const toAgency   = isClientFinancialVisible(toInv?.scheme);
        if (!fromAgency && !toAgency) return;
        const { resolveTelegramTarget, sendTelegramMessage, escapeHtml } = await import("../lib/telegram");
        const client = await storage.getClient(fromInv.clientId);
        const target = resolveTelegramTarget(client as any);
        if (!target) return;
        const fromLabel = fromInv.clientTitle || fromInv.invoiceNumber || fromInvoiceId;
        const toLabel   = toInv?.clientTitle  || toInv?.invoiceNumber  || toInvoiceId;
        const amountStr = new Intl.NumberFormat("ru-RU", {
          style: "currency", currency: "RUB", minimumFractionDigits: 0, maximumFractionDigits: 2,
        }).format(amt);
        const contactSuffix = (client as any)?.contactPerson
          ? ` (${escapeHtml((client as any).contactPerson)})`
          : "";
        const html =
          `🔁 <b>Перенос средств</b>${contactSuffix}\n` +
          `Со счёта: ${escapeHtml(fromLabel)}\n` +
          `На счёт: ${escapeHtml(toLabel)}\n` +
          `Сумма: <b>${escapeHtml(amountStr)}</b>` +
          (notes ? `\n${escapeHtml(notes)}` : "");
        await sendTelegramMessage(target, html);
      } catch (e) {
        console.error("[telegram] transfer notify failed:", (e as Error).message);
      }
    })().catch(() => {});

    res.status(201).json({ id: result.id });
  } catch (error) {
    console.error("Transfer funds error:", error);
    res.status(500).json({ error: "Не удалось перенести средства" });
  }
});

invoicesRouter.get("/api/invoices/:id/transfers", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role || "client";
    const inv = await storage.getInvoice(req.params.id);
    if (!inv) return res.status(404).json({ error: "Invoice not found" });
    if (role === "client") {
      if (inv.clientId !== req.user?.clientId) return res.status(403).json({ error: "Forbidden" });
    } else if (role === "partner") {
      if (inv.partnerId !== req.user?.partnerId) return res.status(403).json({ error: "Forbidden" });
    }
    res.json(await storage.getInvoiceTransfers(req.params.id));
  } catch (error) {
    console.error("Get transfers error:", error);
    res.status(500).json({ error: "Не удалось получить переносы" });
  }
});

invoicesRouter.delete("/api/transfers/:id", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    await storage.deleteInvoiceTransfer(req.params.id);
    await storage.logAssistantAction({
      accessTokenId: req.user!.token.id,
      actionType: "transfer_funds_delete",
      entityType: "transfer",
      entityId: req.params.id,
      description: `Удалён перенос средств`,
      details: null,
      ipAddress: req.ip || req.headers["x-forwarded-for"] as string || null,
      userAgent: req.headers["user-agent"] || null,
    });
    res.json({ success: true });
  } catch (error) {
    console.error("Delete transfer error:", error);
    res.status(500).json({ error: "Не удалось удалить перенос" });
  }
});

invoicesRouter.delete("/api/documents/:id", authMiddleware, requireRole("admin", "assistant", "accountant"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    await storage.deleteDocument(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error("Delete document error:", error);
    res.status(500).json({ error: "Failed to delete document" });
  }
});

invoicesRouter.patch("/api/invoices/:id/closing-document", authMiddleware, requireRole("admin", "accountant"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { closingDocumentUrl } = req.body;
    const role = req.user?.role || "client";
    const invoice = await storage.getInvoice(id);
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    if (role === "accountant" && !invoice.hideFromAssistant) return res.status(403).json({ error: "Forbidden" });
    const updated = await storage.updateInvoice(id, { closingDocumentUrl });
    await storage.logAssistantAction({ accessTokenId: req.user!.token.id, actionType: "update_invoice", entityType: "invoice", entityId: id, description: `${closingDocumentUrl ? "Прикреплён" : "Удалён"} закрывающий документ: ${invoice.invoiceNumber || id}`, details: JSON.stringify({ closingDocumentUrl, invoiceNumber: invoice.invoiceNumber }), ipAddress: req.ip || req.headers["x-forwarded-for"] as string || null, userAgent: req.headers["user-agent"] || null });
    res.json(updated);
  } catch (error) {
    console.error("Update closing document error:", error);
    res.status(500).json({ error: "Failed to update closing document" });
  }
});
