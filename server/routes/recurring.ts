import type { AuthMiddleware } from "../middleware";
import { stripSensitiveFieldsForRole } from "../permissions";
import { Router, Response } from "express";
import { recurringInput, isoDate } from "../lib/recurringInput";
import { constrainInvoiceWrite } from "../invoiceAccess";
import type { RecurringStore } from "../routeStores";
import { AuthenticatedRequest, requireRole } from "../middleware";

export function createRecurringRouter(storage: RecurringStore, authMiddleware: AuthMiddleware) {
const recurringRouter = Router();
const scopeFor = (req: AuthenticatedRequest) => req.user!.role === "assistant" ? "assistant" as const : "all" as const;

recurringRouter.get("/api/recurring-invoices", authMiddleware, requireRole("admin", "assistant"), async (req: AuthenticatedRequest, res: Response) => {
  try { res.json(await storage.getRecurringInvoices(scopeFor(req))); }
  catch (error) { console.error("Get recurring invoices error:", error); res.status(500).json({ error: "Failed to get recurring invoices" }); }
});

recurringRouter.post("/api/recurring-invoices", authMiddleware, requireRole("admin", "assistant"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = recurringInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map(i => i.message).join('; ') });
    const data = constrainInvoiceWrite(req.user!.role, parsed.data, 'create');
    if (data.endDate && data.endDate < data.startDate) return res.status(400).json({ error: 'endDate precedes startDate' });
    const created = await storage.createRecurringInvoice({ ...data, clientId: data.clientId!, partnerId: data.partnerId!, scheme: data.scheme!, amount: data.amount!, startDate: data.startDate!, nextInvoiceDate: data.nextInvoiceDate ?? data.startDate, createdBy: req.user!.token.id });
    res.status(201).json(created);
  } catch (error) { console.error("Create recurring invoice error:", error); res.status(500).json({ error: "Failed to create recurring invoice" }); }
});

recurringRouter.get("/api/recurring-invoices/due", authMiddleware, requireRole("admin", "assistant"), async (req: AuthenticatedRequest, res: Response) => {
  try { res.json(await storage.getDueRecurringInvoices(undefined, scopeFor(req))); }
  catch (error) { console.error("Get due recurring invoices error:", error); res.status(500).json({ error: "Failed to get due recurring invoices" }); }
});

recurringRouter.post("/api/recurring-invoices/process", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try { res.json(await storage.processAllDueRecurringInvoices()); }
  catch (error) { console.error("Process recurring invoices error:", error); res.status(500).json({ error: "Failed to process recurring invoices" }); }
});

recurringRouter.get("/api/recurring-invoices/cashflow", authMiddleware, requireRole("admin", "assistant"), async (req: AuthenticatedRequest, res: Response) => {
  try { res.json(await storage.getActiveRecurringInvoicesForCashFlow(scopeFor(req))); }
  catch (error) { console.error("Get recurring for cashflow error:", error); res.status(500).json({ error: "Failed to get recurring invoices for cashflow" }); }
});

recurringRouter.post("/api/recurring-invoices/:id/create-draft", authMiddleware, requireRole("admin", "assistant"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const { invoiceDate } = req.body;
    if (!await storage.getRecurringInvoice(id, scopeFor(req))) return res.status(404).json({ error: 'Recurring invoice not found' });
    if (invoiceDate !== undefined && !isoDate.safeParse(invoiceDate).success) return res.status(400).json({ error: 'Invalid invoiceDate' });
    const draft = await storage.createDraftFromRecurring(id, invoiceDate, scopeFor(req));
    res.status(201).json(stripSensitiveFieldsForRole(draft, req.user!.role));
  } catch (error: unknown) { console.error("Create draft from recurring error:", error); res.status(500).json({ error: (error instanceof Error ? error.message : String(error)) || "Failed to create draft" }); }
});

recurringRouter.post("/api/recurring-invoices/:id/backdate", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const { fromDate } = req.body;
    if (!isoDate.safeParse(fromDate).success) return res.status(400).json({ error: "fromDate is required" });
    res.json(await storage.generateBackdatedInvoices(id, fromDate));
  } catch (error: unknown) { console.error("Generate backdated invoices error:", error); res.status(500).json({ error: (error instanceof Error ? error.message : String(error)) || "Failed to generate backdated invoices" }); }
});

recurringRouter.patch("/api/recurring-invoices/:id", authMiddleware, requireRole("admin", "assistant"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const existing = await storage.getRecurringInvoice(id, scopeFor(req));
    if (!existing) return res.status(404).json({ error: 'Recurring invoice not found' });
    const parsed = recurringInput.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map(i => i.message).join('; ') });
    const data = constrainInvoiceWrite(req.user!.role, parsed.data, 'update');
    const effective = { ...existing, ...data };
    if (effective.endDate && effective.endDate < effective.startDate) return res.status(400).json({ error: 'endDate precedes startDate' });
    const updated = await storage.updateRecurringInvoice(id, data, scopeFor(req));
    if (!updated) return res.status(404).json({ error: "Recurring invoice not found" });
    res.json(updated);
  } catch (error) { console.error("Update recurring invoice error:", error); res.status(500).json({ error: "Failed to update recurring invoice" }); }
});

recurringRouter.delete("/api/recurring-invoices/:id", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try { await storage.deleteRecurringInvoice(String(req.params.id)); res.json({ success: true }); }
  catch (error) { console.error("Delete recurring invoice error:", error); res.status(500).json({ error: "Failed to delete recurring invoice" }); }
});

return recurringRouter;
}
