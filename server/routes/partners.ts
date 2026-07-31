import { Router, Response } from "express";
import { storage } from "../storage";
import { AuthenticatedRequest, authMiddleware, requireRole } from "../middleware";
import { parseNum } from "../../shared/financialEngine";
import { pick, PARTNER_WRITABLE_FIELDS, PARTNER_PAYMENT_WRITABLE_FIELDS, LEVERAGE_ROLES } from "../lib/sanitize";
import { validateBody, partnerPaymentSchema } from "../lib/validate";
import {
  projectClientForRole,
  projectClientsForRole,
  projectPartnerForRole,
  projectPartnersForRole,
} from "../permissions";
import { canReadPartner, canReadPartnerClients } from "../tenantAccess";

export const partnersRouter = Router();

/**
 * Санитизация тела партнёра: whitelist полей (анти-mass-assignment, раньше
 * req.body шёл сырым) + правила для leverageRole: значение только из
 * LEVERAGE_ROLES, менять её может ТОЛЬКО админ (роль влияет на владельческую
 * метрику — ассистенту/бухгалтеру её трогать незачем).
 */
function sanitizePartnerBody(req: AuthenticatedRequest): { ok: true; data: any } | { ok: false; error: string } {
  const data = pick(req.body, PARTNER_WRITABLE_FIELDS);
  if ("leverageRole" in data) {
    if (req.user?.role !== "admin") {
      delete data.leverageRole; // молча вырезаем, как и остальной whitelist
    } else if (!LEVERAGE_ROLES.includes(data.leverageRole)) {
      return { ok: false, error: `leverageRole must be one of: ${LEVERAGE_ROLES.join(", ")}` };
    }
  }
  return { ok: true, data };
}

partnersRouter.get("/api/partners", authMiddleware, requireRole("admin", "assistant", "accountant"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const partners = await storage.getPartners();
    res.json(projectPartnersForRole(partners, req.user!.role));
  } catch (error) {
    console.error("Get partners error:", error);
    res.status(500).json({ error: "Failed to get partners" });
  }
});

partnersRouter.get("/api/partners/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const actor = req.user!;
    const partner = await storage.getPartner(id);
    if (!partner) return res.status(404).json({ error: "Partner not found" });

    const ownClientPartnerIds = actor.role === "client" && actor.clientId
      ? (await storage.getClientPartners(actor.clientId)).map(item => item.id)
      : [];
    if (!canReadPartner(actor, id, ownClientPartnerIds)) {
      return res.status(404).json({ error: "Partner not found" });
    }

    res.json(projectPartnerForRole(partner, actor.role));
  } catch (error) {
    console.error("Get partner error:", error);
    res.status(500).json({ error: "Failed to get partner" });
  }
});

partnersRouter.post("/api/partners", authMiddleware, requireRole("admin", "assistant", "accountant"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role || "client";
    const body = sanitizePartnerBody(req);
    if (body.ok === false) return res.status(400).json({ error: body.error });
    const partner = await storage.createPartner(body.data);
    if (role === "assistant" || role === "admin" || role === "accountant") {
      await storage.logAssistantAction({ accessTokenId: req.user!.token.id, actionType: "create_partner", entityType: "partner", entityId: partner.id, description: `Создан партнёр: ${partner.name}`, details: JSON.stringify(req.body), ipAddress: req.ip || req.headers["x-forwarded-for"] as string || null, userAgent: req.headers["user-agent"] || null });
    }
    res.status(201).json(projectPartnerForRole(partner, role));
  } catch (error) {
    console.error("Create partner error:", error);
    res.status(500).json({ error: "Failed to create partner" });
  }
});

partnersRouter.patch("/api/partners/:id", authMiddleware, requireRole("admin", "assistant", "accountant"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const role = req.user?.role || "client";
    const body = sanitizePartnerBody(req);
    if (body.ok === false) return res.status(400).json({ error: body.error });
    const partner = await storage.updatePartner(id, body.data);
    if (!partner) return res.status(404).json({ error: "Partner not found" });
    if (role === "assistant" || role === "admin" || role === "accountant") {
      await storage.logAssistantAction({ accessTokenId: req.user!.token.id, actionType: "update_partner", entityType: "partner", entityId: id, description: `Обновлён партнёр: ${partner.name}`, details: JSON.stringify(req.body), ipAddress: req.ip || req.headers["x-forwarded-for"] as string || null, userAgent: req.headers["user-agent"] || null });
    }
    res.json(projectPartnerForRole(partner, role));
  } catch (error) {
    console.error("Update partner error:", error);
    res.status(500).json({ error: "Failed to update partner" });
  }
});

partnersRouter.delete("/api/partners/:id", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const result = await storage.deletePartner(id);
    if (!result.success) return res.status(400).json({ error: result.error });
    res.json({ success: true });
  } catch (error) {
    console.error("Delete partner error:", error);
    res.status(500).json({ error: "Failed to delete partner" });
  }
});

partnersRouter.get("/api/partners/:id/clients", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const actor = req.user!;
    if (actor.role === "assistant" || actor.role === "accountant") {
      return res.status(403).json({ error: "Forbidden: cannot view partner-client relationships" });
    }

    const partner = await storage.getPartner(id);
    if (!partner) return res.status(404).json({ error: "Partner not found" });

    const ownClientPartners = actor.role === "client" && actor.clientId
      ? await storage.getClientPartners(actor.clientId)
      : [];
    const ownClientPartnerIds = ownClientPartners.map(item => item.id);
    if (!canReadPartnerClients(actor, id, ownClientPartnerIds)) {
      return res.status(404).json({ error: "Partner not found" });
    }

    if (actor.role === "client") {
      const ownClient = actor.clientId ? await storage.getClient(actor.clientId) : null;
      return res.json(ownClient ? [projectClientForRole(ownClient, actor.role)] : []);
    }

    const clients = await storage.getPartnerClients(id);
    res.json(projectClientsForRole(clients, actor.role));
  } catch (error) {
    console.error("Get partner clients error:", error);
    res.status(500).json({ error: "Failed to get partner clients" });
  }
});

partnersRouter.get("/api/partner-payments", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role;
    if (role === "assistant" || role === "accountant") return res.status(403).json({ error: "Forbidden" });
    let partnerId: string | undefined;
    if (role === "partner") partnerId = req.user?.partnerId;
    else if (role === "admin" && req.query.partnerId) partnerId = req.query.partnerId as string;
    res.json(await storage.getPartnerPayments(partnerId));
  } catch (error) {
    console.error("Get payments error:", error);
    res.status(500).json({ error: "Failed to get payments" });
  }
});

partnersRouter.post("/api/partner-payments", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const vErr = validateBody(partnerPaymentSchema, req.body);
    if (vErr) return res.status(400).json({ error: vErr });
    const payment = await storage.createPartnerPayment({ ...pick(req.body, PARTNER_PAYMENT_WRITABLE_FIELDS), createdBy: req.user!.token.id });
    res.status(201).json(payment);
  } catch (error) {
    console.error("Create payment error:", error);
    res.status(500).json({ error: "Failed to create payment" });
  }
});

partnersRouter.put("/api/partner-payments/:id", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { amount, paymentDate, notes } = req.body;
    const parsedAmount = parseNum(String(amount));
    if (isNaN(parsedAmount) || parsedAmount <= 0) return res.status(400).json({ error: "Invalid amount: must be a positive number" });
    if (!paymentDate || !/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) return res.status(400).json({ error: "Invalid paymentDate: must be in YYYY-MM-DD format" });
    const sanitizedNotes = notes ? String(notes).trim() : null;
    const existing = await storage.getPartnerPayment(id);
    if (!existing) return res.status(404).json({ error: "Payment not found" });
    res.json(await storage.updatePartnerPayment(id, { amount: parsedAmount.toString(), paymentDate, notes: sanitizedNotes }));
  } catch (error) {
    console.error("Update payment error:", error);
    res.status(500).json({ error: "Failed to update payment" });
  }
});

partnersRouter.delete("/api/partner-payments/:id", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await storage.getPartnerPayment(id);
    if (!existing) return res.status(404).json({ error: "Payment not found" });
    await storage.deletePartnerPayment(id);
    res.status(204).send();
  } catch (error) {
    console.error("Delete payment error:", error);
    res.status(500).json({ error: "Failed to delete payment" });
  }
});

partnersRouter.get("/api/partner-debt", authMiddleware, requireRole("admin", "partner"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const summaries = await storage.getPartnerDebtSummaries();
    if (req.user?.role === "partner") {
      return res.json(summaries.filter(s => s.partnerId === req.user?.partnerId));
    }
    res.json(summaries);
  } catch (error) {
    console.error("Get partner debt error:", error);
    res.status(500).json({ error: "Failed to get partner debt data" });
  }
});

partnersRouter.get("/api/my-debt", authMiddleware, requireRole("partner"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const partnerId = req.user?.partnerId;
    if (!partnerId) return res.status(400).json({ error: "Partner ID not found in session" });
    res.json(await storage.getPartnerDebtDetails(partnerId));
  } catch (error) {
    console.error("Get my debt error:", error);
    res.status(500).json({ error: "Failed to get debt details" });
  }
});

partnersRouter.get("/api/partners/:id/payment-history", authMiddleware, requireRole("admin", "partner"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const partnerId = req.params.id;
    if (req.user?.role === "partner" && req.user?.partnerId !== partnerId) return res.status(403).json({ error: "Access denied" });
    res.json(await storage.getPartnerPaymentHistory(partnerId));
  } catch (error) {
    console.error("Get partner payment history error:", error);
    res.status(500).json({ error: "Failed to get payment history" });
  }
});

partnersRouter.get("/api/my-payment-history", authMiddleware, requireRole("partner"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const partnerId = req.user?.partnerId;
    if (!partnerId) return res.status(400).json({ error: "Partner ID not found in session" });
    res.json(await storage.getPartnerPaymentHistory(partnerId));
  } catch (error) {
    console.error("Get my payment history error:", error);
    res.status(500).json({ error: "Failed to get payment history" });
  }
});

partnersRouter.get("/api/partner/terms", authMiddleware, requireRole("partner"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const partnerId = req.user?.partnerId;
    if (!partnerId) return res.status(403).json({ error: "No partner ID found" });
    res.json(await storage.getPartnerTerms(partnerId));
  } catch (error) {
    console.error("Get partner terms error:", error);
    res.status(500).json({ error: "Failed to get partner terms" });
  }
});

partnersRouter.get("/api/partner/payments", authMiddleware, requireRole("partner"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const partnerId = req.user?.partnerId;
    if (!partnerId) return res.status(403).json({ error: "No partner ID found" });
    res.json(await storage.getPartnerPayments(partnerId));
  } catch (error) {
    console.error("Get partner payments error:", error);
    res.status(500).json({ error: "Failed to get partner payments" });
  }
});

partnersRouter.get("/api/partner/client-stats", authMiddleware, requireRole("partner"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const partnerId = req.user?.partnerId;
    if (!partnerId) return res.status(400).json({ error: "Partner ID not found in session" });
    const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();
    const stats = await storage.getPartnerClientStats(partnerId, year);
    const currentYear = new Date().getFullYear();
    res.json({ stats, selectedYear: year, availableYears: [currentYear - 2, currentYear - 1, currentYear, currentYear + 1] });
  } catch (error) {
    console.error("Get partner client stats error:", error);
    res.status(500).json({ error: "Failed to get client stats" });
  }
});

partnersRouter.get("/api/partner/document-risk", authMiddleware, requireRole("partner"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const partnerId = req.user?.partnerId;
    if (!partnerId) return res.status(400).json({ error: "Partner ID not found in session" });
    res.json(await storage.getPartnerDocumentRisk(partnerId));
  } catch (error) {
    console.error("Get partner document risk error:", error);
    res.status(500).json({ error: "Failed to get document risk" });
  }
});

partnersRouter.get("/api/partner/agency30-funds", authMiddleware, requireRole("partner"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const partnerId = req.user?.partnerId;
    if (!partnerId) return res.status(400).json({ error: "Partner ID not found in session" });
    const funds = await storage.getPartnerAgency30Funds(partnerId);
    res.json({ clients: funds, totalRemaining: funds.reduce((sum, f) => sum + f.remaining, 0) });
  } catch (error) {
    console.error("Get partner agency30 funds error:", error);
    res.status(500).json({ error: "Failed to get agency 30 funds" });
  }
});

partnersRouter.get("/api/partner/hero-metrics", authMiddleware, requireRole("partner"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const partnerId = req.user?.partnerId;
    if (!partnerId) return res.status(400).json({ error: "Partner ID not found in session" });
    res.json(await storage.getPartnerHeroMetrics(partnerId));
  } catch (error) {
    console.error("Get partner hero metrics error:", error);
    res.status(500).json({ error: "Failed to get partner metrics" });
  }
});

partnersRouter.get("/api/do-not-spend", authMiddleware, requireRole("admin", "assistant", "partner"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role;
    res.json(await storage.getDoNotSpendData(role === "partner" ? req.user?.partnerId : undefined));
  } catch (error) {
    console.error("Get do-not-spend error:", error);
    res.status(500).json({ error: "Failed to get do-not-spend data" });
  }
});

partnersRouter.get("/api/do-not-spend/partner-schemes", authMiddleware, requireRole("admin", "assistant", "partner"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role;
    res.json(await storage.getPartnerSchemeDoNotSpendData(role === "partner" ? req.user?.partnerId : undefined, role));
  } catch (error) {
    console.error("Get partner scheme do-not-spend error:", error);
    res.status(500).json({ error: "Failed to get partner scheme do-not-spend data" });
  }
});

partnersRouter.get("/api/expected-commission", authMiddleware, requireRole("admin", "partner"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role;
    res.json(await storage.getExpectedCommission(role === "partner" ? req.user?.partnerId : undefined));
  } catch (error) {
    console.error("Get expected commission error:", error);
    res.status(500).json({ error: "Failed to get expected commission data" });
  }
});

partnersRouter.get("/api/expected-admin-profit", authMiddleware, requireRole("admin"), async (_req: AuthenticatedRequest, res: Response) => {
  try {
    res.json(await storage.getExpectedAdminProfit());
  } catch (error) {
    console.error("Get expected admin profit error:", error);
    res.status(500).json({ error: "Failed to get expected admin profit data" });
  }
});
