import type { AuthMiddleware } from "../middleware";
import { Router, Response } from "express";
import type { ClientsStore } from "../routeStores";
import { UserRole } from "../../shared/schema";
import { AuthenticatedRequest, requireRole } from "../middleware";
import {
  projectClientForRole,
  projectClientsForRole,
  projectPartnerForRole,
  projectPartnersForRole,
} from "../permissions";
import { pick, CLIENT_WRITABLE_FIELDS } from "../lib/sanitize";
import {
  canListClientRelationships,
  canReadClient,
  canReadClientRelationships,
  filterRelationshipPartnerIds,
  resolveClientCollectionScope,
} from "../tenantAccess";

export function createClientsRouter(storage: ClientsStore, authMiddleware: AuthMiddleware) {
const clientsRouter = Router();

function auditSafeClientBody(body: unknown): string {
  const safe = body && typeof body === "object"
    ? { ...(body as Record<string, unknown>) }
    : {};
  if (Object.prototype.hasOwnProperty.call(safe, "tgBotToken")) {
    safe.tgBotToken = safe.tgBotToken ? "[REDACTED]" : safe.tgBotToken;
  }
  return JSON.stringify(safe);
}

clientsRouter.get("/api/clients", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const actor = req.user!;
    const scope = resolveClientCollectionScope(actor);
    if (!scope) return res.status(403).json({ error: "Forbidden" });

    const result = await storage.getClients(scope);
    res.json(projectClientsForRole(result, actor.role));
  } catch (error) {
    console.error("Get clients error:", error);
    res.status(500).json({ error: "Failed to get clients" });
  }
});

clientsRouter.get("/api/closing-docs-status", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clients = await storage.getClients({ kind: "all" });
    const allInvoices = await storage.getInvoices("admin" as UserRole);
    const hiddenInvoices = allInvoices.filter(inv => inv.hideFromAssistant);

    const clientDocsMap = new Map<string, { clientId: string; clientName: string; totalInvoices: number; invoicesWithDoc: number; invoicesWithoutDoc: number; invoiceDetails: { id: string; invoiceNumber: string; status: string; hasClosingDoc: boolean; closingDocumentUrl: string | null; paymentDate: string | null }[] }>();
    for (const client of clients) {
      clientDocsMap.set(client.id, { clientId: client.id, clientName: client.name, totalInvoices: 0, invoicesWithDoc: 0, invoicesWithoutDoc: 0, invoiceDetails: [] });
    }
    for (const invoice of hiddenInvoices) {
      if (!invoice.clientId) continue;
      const clientData = clientDocsMap.get(invoice.clientId);
      if (!clientData) continue;
      const hasDoc = !!invoice.closingDocumentUrl;
      clientData.totalInvoices++;
      if (hasDoc) clientData.invoicesWithDoc++; else clientData.invoicesWithoutDoc++;
      clientData.invoiceDetails.push({ id: invoice.id, invoiceNumber: invoice.invoiceNumber, status: invoice.status || "draft", hasClosingDoc: hasDoc, closingDocumentUrl: invoice.closingDocumentUrl || null, paymentDate: invoice.paymentDate });
    }
    const result = Array.from(clientDocsMap.values())
      .filter(c => c.totalInvoices > 0)
      .sort((a, b) => b.invoicesWithoutDoc - a.invoicesWithoutDoc || b.totalInvoices - a.totalInvoices);
    res.json(result);
  } catch (error) {
    console.error("Get closing docs status error:", error);
    res.status(500).json({ error: "Failed to get closing docs status" });
  }
});

clientsRouter.get("/api/clients/acts-status", authMiddleware, requireRole("admin", "assistant", "accountant"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = (req.user?.role as UserRole) || "client";
    const clients = await storage.getClients({ kind: "all" });
    const allInvoices = await storage.getInvoices(role);
    const paidInvoices = allInvoices.filter(inv => inv.status === "paid");

    const clientActsMap = new Map<string, { clientId: string; clientName: string; totalInvoices: number; invoicesWithCompanyAct: number; invoicesWithExecutorAct: number; invoicesWithBothActs: number; invoicesWithoutActs: number; invoiceDetails: { id: string; invoiceNumber: string; hasCompanyAct: boolean; hasExecutorAct: boolean; paymentDate: string | null }[] }>();
    for (const client of clients) {
      clientActsMap.set(client.id, { clientId: client.id, clientName: client.name, totalInvoices: 0, invoicesWithCompanyAct: 0, invoicesWithExecutorAct: 0, invoicesWithBothActs: 0, invoicesWithoutActs: 0, invoiceDetails: [] });
    }
    for (const invoice of paidInvoices) {
      if (!invoice.clientId) continue;
      const clientData = clientActsMap.get(invoice.clientId);
      if (!clientData) continue;
      const acts = await storage.getSignedActsByInvoice(invoice.id);
      const hasCompanyAct = acts.some(a => a.actType === "company");
      const hasExecutorAct = acts.some(a => a.actType === "executor");
      clientData.totalInvoices++;
      if (hasCompanyAct) clientData.invoicesWithCompanyAct++;
      if (hasExecutorAct) clientData.invoicesWithExecutorAct++;
      if (hasCompanyAct && hasExecutorAct) clientData.invoicesWithBothActs++;
      if (!hasCompanyAct && !hasExecutorAct) clientData.invoicesWithoutActs++;
      clientData.invoiceDetails.push({ id: invoice.id, invoiceNumber: invoice.invoiceNumber, hasCompanyAct, hasExecutorAct, paymentDate: invoice.paymentDate });
    }
    const result = Array.from(clientActsMap.values())
      .filter(c => c.totalInvoices > 0)
      .sort((a, b) => b.invoicesWithoutActs - a.invoicesWithoutActs || b.totalInvoices - a.totalInvoices);
    res.json(result);
  } catch (error) {
    console.error("Get clients acts status error:", error);
    res.status(500).json({ error: "Failed to get clients acts status" });
  }
});

clientsRouter.get("/api/clients/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const actor = req.user!;
    const client = await storage.getClient(id);
    if (!client) return res.status(404).json({ error: "Client not found" });

    // Авторизация партнёра — по членству в client_partners (любой из
    // партнёров), а не по устаревшему одиночному partner_id.
    const linkedPartnerIds = actor.role === "partner"
      ? (await storage.getClientPartners(id)).map(partner => partner.id)
      : [];
    if (!canReadClient(actor, id, linkedPartnerIds)) {
      return res.status(404).json({ error: "Client not found" });
    }

    res.json(projectClientForRole(client, actor.role));
  } catch (error) {
    console.error("Get client error:", error);
    res.status(500).json({ error: "Failed to get client" });
  }
});

clientsRouter.post("/api/clients", authMiddleware, requireRole("admin", "assistant", "accountant"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user?.role || "client";
    const client = await storage.createClient(pick(req.body, CLIENT_WRITABLE_FIELDS));
    // Единый путь назначения партнёров: partnerIds (или легаси одиночный partnerId).
    const partnerIds: string[] = Array.isArray(req.body.partnerIds)
      ? req.body.partnerIds.filter(Boolean)
      : (req.body.partnerId ? [req.body.partnerId] : []);
    if (partnerIds.length) await storage.setClientPartners(client.id, partnerIds);
    if (role === "assistant" || role === "admin" || role === "accountant") {
      await storage.logAssistantAction({ accessTokenId: req.user!.token.id, actionType: "create_client", entityType: "client", entityId: client.id, description: `Создан клиент: ${client.name}`, details: auditSafeClientBody(req.body), ipAddress: req.ip || req.headers["x-forwarded-for"] as string || null, userAgent: req.headers["user-agent"] || null });
    }
    res.status(201).json(projectClientForRole(client, role));
  } catch (error) {
    console.error("Create client error:", error);
    res.status(500).json({ error: "Failed to create client" });
  }
});

clientsRouter.patch("/api/clients/:id", authMiddleware, requireRole("admin", "assistant", "accountant"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const role = req.user?.role || "client";
    const client = await storage.updateClient(id, pick(req.body, CLIENT_WRITABLE_FIELDS));
    if (!client) return res.status(404).json({ error: "Client not found" });
    // Синхронизируем партнёров ТОЛЬКО если явно пришёл partnerIds (иначе связи не трогаем).
    if (Array.isArray(req.body.partnerIds)) {
      await storage.setClientPartners(id, req.body.partnerIds.filter(Boolean));
    }
    if (role === "assistant" || role === "admin" || role === "accountant") {
      await storage.logAssistantAction({ accessTokenId: req.user!.token.id, actionType: "update_client", entityType: "client", entityId: id, description: `Обновлён клиент: ${client.name}`, details: auditSafeClientBody(req.body), ipAddress: req.ip || req.headers["x-forwarded-for"] as string || null, userAgent: req.headers["user-agent"] || null });
    }
    res.json(projectClientForRole(client, role));
  } catch (error) {
    console.error("Update client error:", error);
    res.status(500).json({ error: "Failed to update client" });
  }
});

// Тестовая отправка в Telegram — для проверки настроек клиента.
// Доступ — admin/assistant (те же, кто настраивает).
clientsRouter.post("/api/clients/:id/telegram-test", authMiddleware, requireRole("admin", "assistant"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { resolveTelegramTarget, sendTelegramMessage, escapeHtml } = await import("../lib/telegram");
    const client = await storage.getClient(String(req.params.id));
    if (!client) return res.status(404).json({ error: "Client not found" });
    const target = resolveTelegramTarget(client);
    if (!target) {
      return res.status(400).json({
        error: "Не задан Telegram chat_id (и нет глобального бота FALLBACK_TG_BOT_TOKEN)",
      });
    }
    const html =
      `✅ <b>Тестовое сообщение</b>\n` +
      `Клиент: <i>${escapeHtml(client.name)}</i>\n` +
      `Если ты это видишь — интеграция настроена корректно.`;
    await sendTelegramMessage(target, html);
    res.json({ ok: true });
  } catch (error: unknown) {
    console.error("Telegram test error:", error);
    res.status(500).json({ error: (error instanceof Error ? error.message : String(error)) || "Не удалось отправить тестовое сообщение" });
  }
});

clientsRouter.delete("/api/clients/:id", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const result = await storage.deleteClient(id);
    if (!result.success) return res.status(400).json({ error: result.error });
    res.json({ success: true });
  } catch (error) {
    console.error("Delete client error:", error);
    res.status(500).json({ error: "Failed to delete client" });
  }
});

clientsRouter.get("/api/clients/:id/with-partner", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const actor = req.user!;
    if (!canListClientRelationships(actor)) {
      return res.status(403).json({ error: "Forbidden: cannot view partner-client relationships" });
    }

    const client = await storage.getClientWithPartner(id);
    if (!client) return res.status(404).json({ error: "Client not found" });

    const linkedPartners = await storage.getClientPartners(id);
    const linkedPartnerIds = linkedPartners.map(partner => partner.id);
    if (!canReadClientRelationships(actor, id, linkedPartnerIds)) {
      return res.status(404).json({ error: "Client not found" });
    }

    const result = projectClientForRole(client, actor.role);
    const visiblePartnerIds = new Set(filterRelationshipPartnerIds(actor, linkedPartnerIds));
    if (client.partner && visiblePartnerIds.has(client.partner.id)) {
      result.partner = projectPartnerForRole(client.partner, actor.role);
    }
    res.json(result);
  } catch (error) {
    console.error("Get client with partner error:", error);
    res.status(500).json({ error: "Failed to get client" });
  }
});

clientsRouter.get("/api/clients/:id/partners", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const actor = req.user!;
    if (!canListClientRelationships(actor)) {
      return res.status(403).json({ error: "Forbidden: cannot view partner-client relationships" });
    }

    const client = await storage.getClient(id);
    if (!client) return res.status(404).json({ error: "Client not found" });
    const partners = await storage.getClientPartners(id);
    const linkedPartnerIds = partners.map(partner => partner.id);
    if (!canReadClientRelationships(actor, id, linkedPartnerIds)) {
      return res.status(404).json({ error: "Client not found" });
    }

    const visiblePartnerIds = new Set(filterRelationshipPartnerIds(actor, linkedPartnerIds));
    const visiblePartners = partners.filter(partner => visiblePartnerIds.has(partner.id));
    res.json(projectPartnersForRole(visiblePartners, actor.role));
  } catch (error) {
    console.error("Get client partners error:", error);
    res.status(500).json({ error: "Failed to get client partners" });
  }
});

clientsRouter.put("/api/clients/:id/partners", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const { partnerIds } = req.body;
    if (!Array.isArray(partnerIds)) return res.status(400).json({ error: "partnerIds must be an array" });
    await storage.setClientPartners(id, partnerIds);
    const updatedPartners = await storage.getClientPartners(id);
    res.json(projectPartnersForRole(updatedPartners, "admin"));
  } catch (error) {
    console.error("Set client partners error:", error);
    res.status(500).json({ error: "Failed to set client partners" });
  }
});

clientsRouter.get("/api/clients-with-partners", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const actor = req.user!;
    if (!canListClientRelationships(actor)) {
      return res.status(403).json({ error: "Forbidden: cannot view partner-client relationships" });
    }
    const scope = resolveClientCollectionScope(actor);
    if (!scope) return res.status(403).json({ error: "Forbidden" });

    const clients = await storage.getClientsWithPartners(scope);
    const result = clients.map(client => {
      const linkedPartnerIds = client.partners.map(partner => partner.id);
      const visiblePartnerIds = new Set(filterRelationshipPartnerIds(actor, linkedPartnerIds));
      const visiblePartners = client.partners.filter(partner => visiblePartnerIds.has(partner.id));
      return {
        ...projectClientForRole(client, actor.role),
        partners: projectPartnersForRole(visiblePartners, actor.role),
      };
    });
    res.json(result);
  } catch (error) {
    console.error("Get clients with partners error:", error);
    res.status(500).json({ error: "Failed to get clients" });
  }
});

clientsRouter.get("/api/client/budget", authMiddleware, requireRole("client"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clientId = req.user?.clientId;
    if (!clientId) return res.status(403).json({ error: "No client ID found" });
    res.json(await storage.getClientBudget(clientId));
  } catch (error) {
    console.error("Get client budget error:", error);
    res.status(500).json({ error: "Failed to get client budget" });
  }
});

clientsRouter.get("/api/client/overview-buckets", authMiddleware, requireRole("client"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clientId = req.user?.clientId;
    if (!clientId) return res.status(403).json({ error: "No client ID found" });
    const dateFrom = typeof req.query.dateFrom === 'string' ? req.query.dateFrom : undefined;
    const dateTo   = typeof req.query.dateTo   === 'string' ? req.query.dateTo   : undefined;
    res.json(await storage.getClientOverviewBuckets(clientId, dateFrom, dateTo));
  } catch (error) {
    console.error("Get client overview buckets error:", error);
    res.status(500).json({ error: "Failed to get overview" });
  }
});

clientsRouter.get("/api/client/agency30", authMiddleware, requireRole("client"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clientId = req.user?.clientId;
    if (!clientId) return res.status(403).json({ error: "No client ID found" });
    res.json(await storage.getClientAgency30Report(clientId));
  } catch (error) {
    console.error("Get client agency30 report error:", error);
    res.status(500).json({ error: "Failed to get agency30 report" });
  }
});

return clientsRouter;
}
