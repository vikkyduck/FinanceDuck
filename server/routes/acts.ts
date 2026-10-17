import { DocumentInputError } from "../services/objectStore";
import { USER_ROLES } from "../../shared/domainTypes";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import type { AuthMiddleware } from "../middleware";
import { Router, Response } from "express";
import type { ActsStore } from "../routeStores";
import { AuthenticatedRequest, requireRole } from "../middleware";
import { findAuthorizedInvoice } from "../invoiceAccess";

export function createActsRouter(storage: ActsStore, authMiddleware: AuthMiddleware) {
const actsRouter = Router();

actsRouter.get("/api/admin/bonus-payments", authMiddleware, requireRole("admin"), async (_req: AuthenticatedRequest, res: Response) => {
  try { res.json(await storage.getAssistantBonusPayments()); }
  catch (error) { console.error("Get bonus payments error:", error); res.status(500).json({ error: "Failed to get bonus payments" }); }
});

actsRouter.get("/api/admin/unpaid-bonus", authMiddleware, requireRole("admin"), async (_req: AuthenticatedRequest, res: Response) => {
  try { res.json(await storage.getUnpaidBonusTotal()); }
  catch (error) { console.error("Get unpaid bonus error:", error); res.status(500).json({ error: "Failed to get unpaid bonus" }); }
});

actsRouter.post("/api/admin/bonus-payout", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { amount, notes, invoiceIds } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: "Invalid amount" });
    const payment = await storage.createAssistantBonusPayment({ amount: amount.toString(), paymentDate: new Date().toISOString().split("T")[0], notes: notes || null, paidBy: req.user!.token.id });
    if (invoiceIds && invoiceIds.length > 0) await storage.markBonusesAsPaid(invoiceIds);
    res.status(201).json(payment);
  } catch (error) { console.error("Create bonus payout error:", error); res.status(500).json({ error: "Failed to create bonus payout" }); }
});

actsRouter.get("/api/my-bonus-payments", authMiddleware, requireRole("admin", "assistant"), async (_req: AuthenticatedRequest, res: Response) => {
  try { res.json(await storage.getAssistantBonusPayments()); }
  catch (error) { console.error("Get my bonus payments error:", error); res.status(500).json({ error: "Failed to get bonus payments" }); }
});

actsRouter.get("/api/acts-statistics", authMiddleware, requireRole("admin", "assistant"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const excludeHidden = req.user?.role === "assistant";
    res.json(await storage.getActsStatistics(excludeHidden));
  } catch (error) { console.error("Get acts statistics error:", error); res.status(500).json({ error: "Failed to get acts statistics" }); }
});

actsRouter.get("/api/access-tokens", authMiddleware, requireRole("admin"), async (_req: AuthenticatedRequest, res: Response) => {
  try { res.json(await storage.getAccessTokens()); }
  catch (error) { console.error("Get tokens error:", error); res.status(500).json({ error: "Failed to get tokens" }); }
});

const VALID_ROLES = USER_ROLES;

actsRouter.post("/api/access-tokens", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { code, role, partnerId, clientId } = req.body || {};
    // Валидация: код непустой, роль из известного набора.
    if (typeof code !== "string" || code.trim().length === 0) {
      return res.status(400).json({ error: "code обязателен" });
    }
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: "Недопустимая роль" });
    }
    // Deny-by-default в связке с IDOR-фиксом: partner/client-токен БЕЗ своего
    // scope-id бесполезен и опасен — не создаём такой.
    if (role === "partner" && !partnerId) {
      return res.status(400).json({ error: "Для роли partner обязателен partnerId" });
    }
    if (role === "client" && !clientId) {
      return res.status(400).json({ error: "Для роли client обязателен clientId" });
    }
    res.status(201).json(await storage.createAccessToken(code, role, partnerId, clientId));
  } catch (error) { console.error("Create token error:", error); res.status(500).json({ error: "Failed to create token" }); }
});

actsRouter.delete("/api/access-tokens/:id", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try { await storage.deleteAccessToken(req.params.id); res.json({ success: true }); }
  catch (error) { console.error("Delete token error:", error); res.status(500).json({ error: "Failed to delete token" }); }
});

actsRouter.get("/api/assistant/stats", authMiddleware, requireRole("admin", "assistant"), async (_req: AuthenticatedRequest, res: Response) => {
  try { res.json(await storage.getAssistantStats()); }
  catch (error) { console.error("Get assistant stats error:", error); res.status(500).json({ error: "Failed to get assistant stats" }); }
});

// Signed Acts
actsRouter.get("/api/invoices/:id/acts", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const actor = req.user!;
    const role = actor.role;
    const actType = req.query.type as string | undefined;
    const invoice = await findAuthorizedInvoice(storage, actor, id);
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    if (actType && actType !== "company" && actType !== "executor") return res.status(400).json({ error: "Invalid act type" });
    let acts = await storage.getSignedActsByInvoice(id, actType as "company" | "executor" | undefined);
    if (role === "partner" || role === "client") acts = acts.filter(a => a.actType === "company");
    res.json(acts);
  } catch (error) { console.error("Get acts error:", error); res.status(500).json({ error: "Failed to get acts" }); }
});

actsRouter.post("/api/invoices/:id/acts", authMiddleware, requireRole("admin", "assistant", "accountant"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const parsed = z.object({ actType: z.enum(['company', 'executor']), fileName: z.string().min(1).max(255), fileData: z.string().optional(), mimeType: z.string().max(120).optional(), isLink: z.boolean().default(false), url: z.string().url().refine(url => /^https?:\/\//i.test(url)).optional() }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid act fields' });
    const { actType, fileName, fileData, mimeType, isLink, url } = parsed.data;
    const invoice = await findAuthorizedInvoice(storage, req.user!, id);
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    if (isLink) { if (!url) return res.status(400).json({ error: "URL is required for link-type acts" }); }
    else { if (!fileData || !mimeType) return res.status(400).json({ error: "File data and mime type are required for file uploads" }); }
    const act = await storage.createSignedAct({ invoiceId: id, actType, fileName, fileData: isLink ? null : fileData, mimeType: isLink ? null : mimeType, isLink: isLink || false, url: isLink ? url : null, uploadedBy: req.user!.token.id });
    const client = invoice.clientId ? await storage.getClient(invoice.clientId) : null;
    const partner = invoice.partnerId ? await storage.getPartner(invoice.partnerId) : null;
    const invoiceNumber = invoice.invoiceNumber;
    const displayName = invoiceNumber || client?.name || partner?.name || invoice.description || id;
    const actTypeLabel = actType === "company" ? "компании" : "исполнителя";
    try {
      await storage.logAssistantAction({ accessTokenId: req.user!.token.id, actionType: "upload_act", entityType: "act", entityId: act.id, description: `Загружен акт ${actTypeLabel}: ${displayName}`, details: JSON.stringify({ invoiceId: id, invoiceNumber, clientName: client?.name, partnerName: partner?.name, actType, fileName, isLink: isLink || false }), ipAddress: req.ip || req.headers["x-forwarded-for"] as string || null, userAgent: req.headers["user-agent"] || null });
    } catch (logError) { console.error("[Upload Act] Failed to log action:", logError); }
    const { fileData: _, objectKey: _key, ...actWithoutData } = act;
    res.status(201).json(actWithoutData);
  } catch (error) { if (error instanceof DocumentInputError) return res.status(400).json({ error: error.message }); console.error("Create act error:", error); res.status(500).json({ error: "Failed to upload act" }); }
});

actsRouter.get("/api/acts/:id/download", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const actor = req.user!;
    const role = actor.role;
    const act = await storage.getSignedAct(id);
    if (!act) return res.status(404).json({ error: "Act not found" });
    const invoice = await findAuthorizedInvoice(storage, actor, act.invoiceId);
    if (!invoice) return res.status(404).json({ error: "Act not found" });
    if ((role === "partner" || role === "client") && act.actType === "executor") {
      return res.status(404).json({ error: "Act not found" });
    }
    res.json({ fileName: act.fileName, fileData: await storage.readSignedActData(id), mimeType: act.mimeType });
  } catch (error) { console.error("Download act error:", error); res.status(500).json({ error: "Failed to download act" }); }
});

actsRouter.get("/api/acts/:id/content", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const act = await storage.getSignedAct(req.params.id);
    if (!act || !await findAuthorizedInvoice(storage, req.user!, act.invoiceId) || (['partner', 'client'].includes(req.user!.role) && act.actType === 'executor')) return res.status(404).json({ error: 'Act not found' });
    const file = await storage.openSignedActFile(act.id);
    if (!file) return res.status(404).json({ error: 'File not found' });
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="document"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
    res.setHeader('Cache-Control', 'no-store');
    await pipeline(file.stream, res);
  } catch (error) { if (!res.headersSent) res.status(500).json({ error: 'Failed to download document' }); else res.destroy(); }
});

actsRouter.delete("/api/acts/:id", authMiddleware, requireRole("admin", "assistant", "accountant"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const act = await storage.getSignedAct(id);
    if (!act) return res.status(404).json({ error: "Act not found" });
    const invoice = await findAuthorizedInvoice(storage, req.user!, act.invoiceId);
    if (!invoice) return res.status(404).json({ error: "Act not found" });
    const client = invoice?.clientId ? await storage.getClient(invoice.clientId) : null;
    const partner = invoice?.partnerId ? await storage.getPartner(invoice.partnerId) : null;
    const invoiceNumber = invoice?.invoiceNumber;
    const displayName = invoiceNumber || client?.name || partner?.name || invoice?.description || act.invoiceId;
    const actTypeLabel = act.actType === "company" ? "компании" : "исполнителя";
    await storage.logAssistantAction({ accessTokenId: req.user!.token.id, actionType: "delete_act", entityType: "act", entityId: id, description: `Удалён акт ${actTypeLabel}: ${displayName}`, details: JSON.stringify({ invoiceId: act.invoiceId, invoiceNumber, clientName: client?.name, partnerName: partner?.name, actType: act.actType, fileName: act.fileName }), ipAddress: req.ip || req.headers["x-forwarded-for"] as string || null, userAgent: req.headers["user-agent"] || null });
    await storage.deleteSignedAct(id);
    res.json({ success: true });
  } catch (error) { console.error("Delete act error:", error); res.status(500).json({ error: "Failed to delete act" }); }
});

return actsRouter;
}
