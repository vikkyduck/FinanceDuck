import type { AuthMiddleware } from "../middleware";
import { type InvoiceCommands, CommandError, type CommandActor } from "../services/invoiceCommands";
import type { db as Database } from "../db";
import { getInvoiceListMetadata } from "../repositories/invoiceRepo";
import { invoiceQueryInput } from "../invoiceQuery";
import { Router, Response } from "express";
import type { InvoicesStore } from "../routeStores";
import { AuthenticatedRequest, requireRole } from "../middleware";
import { stripSensitiveFieldsForRole, stripSensitiveFieldsFromList, isClientFinancialVisible, isClientUsageVisible } from "../permissions";
import { pick, pickExpense, INVOICE_WRITABLE_FIELDS } from "../lib/sanitize";
import { validateBody, invoiceMoneySchema, expenseCreateSchema, expenseUpdateSchema } from "../lib/validate";
import { constrainInvoiceWrite, findAuthorizedInvoice } from "../invoiceAccess";

export function createInvoicesRouter(storage: InvoicesStore, authMiddleware: AuthMiddleware, db: typeof Database, invoiceCommands: InvoiceCommands) {
const invoicesRouter = Router();
const commandActor = (req: AuthenticatedRequest): CommandActor => ({
  role: req.user!.role, partnerId: req.user!.partnerId, clientId: req.user!.clientId,
  tokenId: req.user!.token.id, requestKey: req.get('Idempotency-Key'), ip: req.ip, userAgent: req.get('user-agent'),
});

invoicesRouter.get("/api/invoices", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role || "client";
    let partnerId = req.user?.partnerId;
    const clientId = req.user?.clientId;
    if (role === "admin" && req.query.partnerId) partnerId = req.query.partnerId as string;
    const parsed = invoiceQueryInput.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid invoice filters' });
    const result = await storage.getInvoices(role, partnerId, clientId, parsed.data);
    const projected = stripSensitiveFieldsFromList(result, role);
    if (parsed.data.page) return res.json({ invoices: projected, ...await getInvoiceListMetadata(db, req.user!, parsed.data) });
    res.json(projected);
  } catch (error) {
    if (error instanceof CommandError) return res.status(error.status).json({ error: error.message });
    console.error("Get invoices error:", error);
    res.status(500).json({ error: "Failed to get invoices" });
  }
});

invoicesRouter.get("/api/invoices/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const actor = req.user!;
    const invoice = await findAuthorizedInvoice(storage, actor, id);
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    res.json(stripSensitiveFieldsForRole(invoice, actor.role));
  } catch (error) {
    if (error instanceof CommandError) return res.status(error.status).json({ error: error.message });
    console.error("Get invoice error:", error);
    res.status(500).json({ error: "Failed to get invoice" });
  }
});

invoicesRouter.post("/api/invoices", authMiddleware, requireRole("admin", "assistant", "accountant"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role || "client";
    const vErr = validateBody(invoiceMoneySchema, req.body);
    if (vErr) return res.status(400).json({ error: vErr });
    const { calculations } = req.body || {};
    const invoiceData = constrainInvoiceWrite(
      role,
      pick(req.body, INVOICE_WRITABLE_FIELDS),
      "create",
    );
    const invoice = await invoiceCommands.create(commandActor(req), { ...invoiceData, createdBy: req.user!.token.id }, calculations || {});
    const fullInvoice = await findAuthorizedInvoice(storage, req.user!, invoice.id);
    if (!fullInvoice) return res.status(404).json({ error: "Invoice not found" });
    const filtered = stripSensitiveFieldsForRole(fullInvoice, role);
    res.status(201).json(filtered);
  } catch (error) {
    if (error instanceof CommandError) return res.status(error.status).json({ error: error.message });
    console.error("Create invoice error:", error);
    res.status(500).json({ error: "Failed to create invoice" });
  }
});

invoicesRouter.patch("/api/invoices/:id", authMiddleware, requireRole("admin", "assistant", "accountant"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const actor = req.user!;
    const role = actor.role;
    const existing = await findAuthorizedInvoice(storage, actor, id);
    if (!existing) return res.status(404).json({ error: "Invoice not found" });

    const vErr = validateBody(invoiceMoneySchema, req.body);
    if (vErr) return res.status(400).json({ error: vErr });
    const { calculations } = req.body || {};
    const invoiceData = constrainInvoiceWrite(
      role,
      pick(req.body, INVOICE_WRITABLE_FIELDS),
      "update",
    );

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

    const invoice = await invoiceCommands.update(commandActor(req), id, invoiceData, calculations || {});
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    const fullInvoice = await findAuthorizedInvoice(storage, actor, id);
    const filtered = stripSensitiveFieldsForRole(fullInvoice || invoice, role);
    res.json(filtered);
  } catch (error) {
    if (error instanceof CommandError) return res.status(error.status).json({ error: error.message });
    console.error("Update invoice error:", error);
    res.status(500).json({ error: "Failed to update invoice" });
  }
});

invoicesRouter.delete("/api/invoices/:id", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    await invoiceCommands.delete(commandActor(req), id);
    res.json({ success: true });
  } catch (error) {
    if (error instanceof CommandError) return res.status(error.status).json({ error: error.message });
    console.error("Delete invoice error:", error);
    res.status(500).json({ error: "Failed to delete invoice" });
  }
});

invoicesRouter.get("/api/invoices/:id/expenses", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const actor = req.user!;
    const invoice = await findAuthorizedInvoice(storage, actor, id);
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });

    const expenses = await storage.getInvoiceExpenses(id);
    if (actor.role === "client") {
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
    res.json(expenses);
  } catch (error) {
    if (error instanceof CommandError) return res.status(error.status).json({ error: error.message });
    console.error("Get expenses error:", error);
    res.status(500).json({ error: "Failed to get expenses" });
  }
});

invoicesRouter.post("/api/invoices/:id/expenses", authMiddleware, requireRole("admin", "assistant", "accountant"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const actor = req.user!;
    const role = actor.role;
    const invoice = await findAuthorizedInvoice(storage, actor, id);
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });

    const vErr = validateBody(expenseCreateSchema, req.body);
    if (vErr) return res.status(400).json({ error: vErr });
    const expense = await invoiceCommands.createExpense(commandActor(req), { ...pickExpense(req.body), invoiceId: id, createdBy: req.user!.token.id });
    res.status(201).json(expense);
  } catch (error) {
    if (error instanceof CommandError) return res.status(error.status).json({ error: error.message });
    console.error("Create expense error:", error);
    res.status(500).json({ error: "Failed to create expense" });
  }
});

invoicesRouter.patch("/api/expenses/:id", authMiddleware, requireRole("admin", "assistant", "accountant"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const actor = req.user!;
    const role = actor.role;
    const existingExpense = await storage.getInvoiceExpense(id);
    if (!existingExpense) return res.status(404).json({ error: "Expense not found" });
    if (!await findAuthorizedInvoice(storage, actor, existingExpense.invoiceId)) {
      return res.status(404).json({ error: "Expense not found" });
    }

    const vErr = validateBody(expenseUpdateSchema, req.body);
    if (vErr) return res.status(400).json({ error: vErr });
    const expense = await invoiceCommands.updateExpense(commandActor(req), id, pickExpense(req.body));
    if (!expense) return res.status(404).json({ error: "Expense not found" });
    res.json(expense);
  } catch (error) {
    if (error instanceof CommandError) return res.status(error.status).json({ error: error.message });
    console.error("Update expense error:", error);
    res.status(500).json({ error: "Failed to update expense" });
  }
});

invoicesRouter.delete("/api/expenses/:id", authMiddleware, requireRole("admin", "assistant", "accountant"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    await invoiceCommands.deleteExpense(commandActor(req), id);
    res.json({ success: true });
  } catch (error) {
    if (error instanceof CommandError) return res.status(error.status).json({ error: error.message });
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
    const result = await invoiceCommands.transfer(commandActor(req), {
      fromInvoiceId, toInvoiceId, amount: amt, notes: notes ?? null,
      createdBy: req.user!.token.id,
    });

    res.status(201).json({ id: result.id });
  } catch (error) {
    if (error instanceof CommandError) return res.status(error.status).json({ error: error.message });
    console.error("Transfer funds error:", error);
    res.status(500).json({ error: "Не удалось перенести средства" });
  }
});

invoicesRouter.get("/api/invoices/:id/transfers", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const inv = await findAuthorizedInvoice(storage, req.user!, id);
    if (!inv) return res.status(404).json({ error: "Invoice not found" });
    res.json(await storage.getInvoiceTransfers(id));
  } catch (error) {
    if (error instanceof CommandError) return res.status(error.status).json({ error: error.message });
    console.error("Get transfers error:", error);
    res.status(500).json({ error: "Не удалось получить переносы" });
  }
});

invoicesRouter.delete("/api/transfers/:id", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    await invoiceCommands.deleteTransfer(commandActor(req), req.params.id);
    res.json({ success: true });
  } catch (error) {
    if (error instanceof CommandError) return res.status(error.status).json({ error: error.message });
    console.error("Delete transfer error:", error);
    res.status(500).json({ error: "Не удалось удалить перенос" });
  }
});

invoicesRouter.patch("/api/invoices/:id/closing-document", authMiddleware, requireRole("admin", "accountant"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const { closingDocumentUrl } = req.body;
    const invoice = await findAuthorizedInvoice(storage, req.user!, id);
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    const updated = await invoiceCommands.update(commandActor(req), id, { closingDocumentUrl });
    res.json(updated);
  } catch (error) {
    if (error instanceof CommandError) return res.status(error.status).json({ error: error.message });
    console.error("Update closing document error:", error);
    res.status(500).json({ error: "Failed to update closing document" });
  }
});

return invoicesRouter;
}
