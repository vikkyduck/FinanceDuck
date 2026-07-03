import { Router, Response } from "express";
import { storage } from "../storage";
import { AuthenticatedRequest, authMiddleware, requireRole } from "../middleware";

export const recurringRouter = Router();

recurringRouter.get("/api/recurring-invoices", authMiddleware, requireRole("admin", "assistant"), async (_req: AuthenticatedRequest, res: Response) => {
  try { res.json(await storage.getRecurringInvoices()); }
  catch (error) { console.error("Get recurring invoices error:", error); res.status(500).json({ error: "Failed to get recurring invoices" }); }
});

recurringRouter.post("/api/recurring-invoices", authMiddleware, requireRole("admin", "assistant"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { clientId, partnerId, scheme, partnerCommissionRate, amount, description, frequency, dayOfMonth, startDate, endDate, nextInvoiceDate, notes, hideFromAssistant } = req.body;
    const created = await storage.createRecurringInvoice({ clientId, partnerId, scheme, partnerCommissionRate: partnerCommissionRate ? partnerCommissionRate.toString() : null, amount: amount?.toString() || "0", description, frequency: frequency || "monthly", dayOfMonth: dayOfMonth?.toString() || "1", startDate: startDate || new Date().toISOString().split("T")[0], endDate: endDate || null, nextInvoiceDate: nextInvoiceDate || startDate, notes, hideFromAssistant: hideFromAssistant ?? false, createdBy: req.user!.token.id });
    res.status(201).json(created);
  } catch (error) { console.error("Create recurring invoice error:", error); res.status(500).json({ error: "Failed to create recurring invoice" }); }
});

recurringRouter.get("/api/recurring-invoices/due", authMiddleware, requireRole("admin", "assistant"), async (_req: AuthenticatedRequest, res: Response) => {
  try { res.json(await storage.getDueRecurringInvoices()); }
  catch (error) { console.error("Get due recurring invoices error:", error); res.status(500).json({ error: "Failed to get due recurring invoices" }); }
});

recurringRouter.post("/api/recurring-invoices/process", authMiddleware, requireRole("admin"), async (_req: AuthenticatedRequest, res: Response) => {
  try { res.json(await storage.processAllDueRecurringInvoices()); }
  catch (error) { console.error("Process recurring invoices error:", error); res.status(500).json({ error: "Failed to process recurring invoices" }); }
});

recurringRouter.get("/api/recurring-invoices/cashflow", authMiddleware, requireRole("admin", "assistant"), async (_req: AuthenticatedRequest, res: Response) => {
  try { res.json(await storage.getActiveRecurringInvoicesForCashFlow()); }
  catch (error) { console.error("Get recurring for cashflow error:", error); res.status(500).json({ error: "Failed to get recurring invoices for cashflow" }); }
});

recurringRouter.post("/api/recurring-invoices/:id/create-draft", authMiddleware, requireRole("admin", "assistant"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { invoiceDate } = req.body;
    res.status(201).json(await storage.createDraftFromRecurring(id, invoiceDate));
  } catch (error: any) { console.error("Create draft from recurring error:", error); res.status(500).json({ error: error.message || "Failed to create draft" }); }
});

recurringRouter.post("/api/recurring-invoices/:id/backdate", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { fromDate } = req.body;
    if (!fromDate) return res.status(400).json({ error: "fromDate is required" });
    res.json(await storage.generateBackdatedInvoices(id, fromDate));
  } catch (error: any) { console.error("Generate backdated invoices error:", error); res.status(500).json({ error: error.message || "Failed to generate backdated invoices" }); }
});

recurringRouter.patch("/api/recurring-invoices/:id", authMiddleware, requireRole("admin", "assistant"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const updated = await storage.updateRecurringInvoice(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: "Recurring invoice not found" });
    res.json(updated);
  } catch (error) { console.error("Update recurring invoice error:", error); res.status(500).json({ error: "Failed to update recurring invoice" }); }
});

recurringRouter.delete("/api/recurring-invoices/:id", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try { await storage.deleteRecurringInvoice(req.params.id); res.json({ success: true }); }
  catch (error) { console.error("Delete recurring invoice error:", error); res.status(500).json({ error: "Failed to delete recurring invoice" }); }
});
