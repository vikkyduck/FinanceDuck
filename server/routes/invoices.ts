import { Router, Response } from "express";
import { storage } from "../storage";
import { AuthenticatedRequest, authMiddleware, requireRole } from "../middleware";
import { stripSensitiveFieldsForRole, stripSensitiveFieldsFromList } from "../permissions";

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
    const { calculations, ...invoiceData } = req.body;
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
    const { calculations, ...invoiceData } = req.body;
    if (role === "accountant") {
      const existing = await storage.getInvoice(id);
      if (!existing || !existing.hideFromAssistant) return res.status(403).json({ error: "Forbidden" });
    }
    const invoice = await storage.updateInvoice(id, invoiceData);
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    if (calculations || invoiceData.plannedExpenses !== undefined) await storage.updateInvoiceCalculations(id, calculations || {});
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
    const expense = await storage.createInvoiceExpense({ ...req.body, invoiceId: id, createdBy: req.user!.token.id });
    if (role === "assistant" || role === "admin" || role === "accountant") {
      await storage.logAssistantAction({ accessTokenId: req.user!.token.id, actionType: "create_expense", entityType: "expense", entityId: expense.id, description: `Создан расход: ${req.body.description || expense.id}`, details: JSON.stringify({ invoiceId: id, amount: req.body.amount, paidByPartner: req.body.paidByPartner }), ipAddress: req.ip || req.headers["x-forwarded-for"] as string || null, userAgent: req.headers["user-agent"] || null });
    }
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
    const expense = await storage.updateInvoiceExpense(id, req.body);
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
