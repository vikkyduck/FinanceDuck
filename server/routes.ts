import { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { AccessToken, UserRole } from "../shared/schema";

interface AuthenticatedRequest extends Request {
  user?: {
    token: AccessToken;
    role: UserRole;
    partnerId?: string;
    clientId?: string;
  };
}

const ASSISTANT_ALLOWED_INVOICE_FIELDS = [
  'id',
  'invoiceNumber',
  'clientId',
  'status',
  'description',
  'clientBill',
  'createdAt',
  'updatedAt',
  'createdBy',
  'dueDate',
  'paidDate',
  'notes',
  'scheme',
] as const;

const ASSISTANT_ALLOWED_CALCULATION_FIELDS = [
  'id',
  'invoiceId',
  'clientBill',
  'executorExpensesTotal',
] as const;

function createAssistantInvoiceProjection(invoice: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  
  for (const field of ASSISTANT_ALLOWED_INVOICE_FIELDS) {
    if (field in invoice) {
      result[field] = invoice[field];
    }
  }
  
  if (invoice.calculations && typeof invoice.calculations === 'object') {
    const calc: Record<string, any> = {};
    for (const field of ASSISTANT_ALLOWED_CALCULATION_FIELDS) {
      if (field in invoice.calculations) {
        calc[field] = invoice.calculations[field];
      }
    }
    result.calculations = calc;
  }
  
  if (invoice.client) {
    result.client = { id: invoice.client.id, name: invoice.client.name };
  }
  
  return result;
}

function stripSensitiveFieldsForRole<T extends Record<string, any>>(data: T, role: UserRole): T {
  if (role !== 'assistant') return data;
  return createAssistantInvoiceProjection(data) as T;
}

function stripSensitiveFieldsFromList<T extends Record<string, any>>(data: T[], role: UserRole): T[] {
  if (role !== 'assistant') return data;
  return data.map(item => createAssistantInvoiceProjection(item)) as T[];
}

function stripPartnerInfoFromClient<T extends Record<string, any>>(client: T, role: UserRole): T {
  if (role !== 'assistant') return client;
  const { partnerId, partner, ...rest } = client;
  return rest as T;
}

function stripPartnerInfoFromClients<T extends Record<string, any>>(clients: T[], role: UserRole): T[] {
  if (role !== 'assistant') return clients;
  return clients.map(client => {
    const { partnerId, partner, ...rest } = client;
    return rest as T;
  });
}

const SESSION_COOKIE = "session_id";

async function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const sessionId = req.cookies[SESSION_COOKIE];
  
  if (!sessionId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  
  const csrfToken = req.headers["x-csrf-token"] as string | undefined;
  const isModifying = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method);
  
  const result = await storage.validateSession(sessionId, isModifying ? csrfToken : undefined);
  
  if (!result?.isValid || !result.token) {
    res.clearCookie(SESSION_COOKIE);
    return res.status(401).json({ error: "Session expired" });
  }
  
  req.user = {
    token: result.token,
    role: result.token.role,
    partnerId: result.token.partnerId || undefined,
    clientId: result.token.clientId || undefined,
  };
  
  next();
}

function requireRole(...roles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}

export function registerRoutes(app: Express): void {
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { code } = req.body;
      
      if (!code) {
        return res.status(400).json({ error: "Access code required" });
      }
      
      const token = await storage.verifyAccessCode(code);
      
      if (!token) {
        return res.status(401).json({ error: "Invalid access code" });
      }
      
      const session = await storage.createSession(
        token.id,
        req.ip,
        req.headers["user-agent"]
      );
      
      res.cookie(SESSION_COOKIE, session.sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 30 * 60 * 1000,
      });
      
      res.json({
        success: true,
        csrfToken: session.csrfToken,
        user: {
          role: token.role,
          partnerId: token.partnerId,
          clientId: token.clientId,
        },
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.post("/api/auth/logout", async (req: Request, res: Response) => {
    const sessionId = req.cookies[SESSION_COOKIE];
    if (sessionId) {
      await storage.revokeSession(sessionId);
    }
    res.clearCookie(SESSION_COOKIE);
    res.json({ success: true });
  });

  app.get("/api/auth/validate", async (req: Request, res: Response) => {
    const sessionId = req.cookies[SESSION_COOKIE];
    
    if (!sessionId) {
      return res.json({ valid: false });
    }
    
    const result = await storage.validateSession(sessionId);
    
    if (!result?.isValid || !result.token) {
      res.clearCookie(SESSION_COOKIE);
      return res.json({ valid: false });
    }
    
    res.json({
      valid: true,
      user: {
        role: result.token.role,
        partnerId: result.token.partnerId,
        clientId: result.token.clientId,
      },
    });
  });

  app.post("/api/auth/refresh", async (req: Request, res: Response) => {
    const sessionId = req.cookies[SESSION_COOKIE];
    
    if (!sessionId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    
    const newExpiresAt = await storage.refreshSession(sessionId);
    
    if (!newExpiresAt) {
      res.clearCookie(SESSION_COOKIE);
      return res.status(401).json({ error: "Session expired" });
    }
    
    res.cookie(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 60 * 1000,
    });
    
    res.json({ success: true, expiresAt: newExpiresAt });
  });

  app.get("/api/partners", authMiddleware, requireRole("admin", "assistant"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await storage.getPartners();
      res.json(result);
    } catch (error) {
      console.error("Get partners error:", error);
      res.status(500).json({ error: "Failed to get partners" });
    }
  });

  app.get("/api/partners/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      
      if (req.user?.role === "partner" && req.user.partnerId !== id) {
        return res.status(403).json({ error: "Forbidden" });
      }
      
      const partner = await storage.getPartner(id);
      if (!partner) {
        return res.status(404).json({ error: "Partner not found" });
      }
      res.json(partner);
    } catch (error) {
      console.error("Get partner error:", error);
      res.status(500).json({ error: "Failed to get partner" });
    }
  });

  app.post("/api/partners", authMiddleware, requireRole("admin", "assistant"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const partner = await storage.createPartner(req.body);
      res.status(201).json(partner);
    } catch (error) {
      console.error("Create partner error:", error);
      res.status(500).json({ error: "Failed to create partner" });
    }
  });

  app.patch("/api/partners/:id", authMiddleware, requireRole("admin", "assistant"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const partner = await storage.updatePartner(id, req.body);
      if (!partner) {
        return res.status(404).json({ error: "Partner not found" });
      }
      res.json(partner);
    } catch (error) {
      console.error("Update partner error:", error);
      res.status(500).json({ error: "Failed to update partner" });
    }
  });

  app.delete("/api/partners/:id", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const result = await storage.deletePartner(id);
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Delete partner error:", error);
      res.status(500).json({ error: "Failed to delete partner" });
    }
  });

  app.get("/api/partners/:id/clients", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const role = req.user?.role;
      
      if (role === "assistant") {
        return res.status(403).json({ error: "Forbidden: assistants cannot view partner-client relationships" });
      }
      
      if (role === "partner" && req.user?.partnerId !== id) {
        return res.status(403).json({ error: "Forbidden" });
      }
      
      const clients = await storage.getPartnerClients(id);
      res.json(clients);
    } catch (error) {
      console.error("Get partner clients error:", error);
      res.status(500).json({ error: "Failed to get partner clients" });
    }
  });

  app.get("/api/clients", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const role = req.user?.role || "client";
      let partnerId: string | undefined;
      
      if (role === "partner") {
        partnerId = req.user?.partnerId;
      }
      
      const result = await storage.getClients(partnerId);
      const filtered = stripPartnerInfoFromClients(result, role);
      res.json(filtered);
    } catch (error) {
      console.error("Get clients error:", error);
      res.status(500).json({ error: "Failed to get clients" });
    }
  });

  app.get("/api/clients/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const role = req.user?.role || "client";
      const client = await storage.getClient(id);
      
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }
      
      if (role === "partner" && client.partnerId !== req.user?.partnerId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      
      const filtered = stripPartnerInfoFromClient(client, role);
      res.json(filtered);
    } catch (error) {
      console.error("Get client error:", error);
      res.status(500).json({ error: "Failed to get client" });
    }
  });

  app.post("/api/clients", authMiddleware, requireRole("admin", "assistant"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const role = req.user?.role || "client";
      const client = await storage.createClient(req.body);
      const filtered = stripPartnerInfoFromClient(client, role);
      res.status(201).json(filtered);
    } catch (error) {
      console.error("Create client error:", error);
      res.status(500).json({ error: "Failed to create client" });
    }
  });

  app.patch("/api/clients/:id", authMiddleware, requireRole("admin", "assistant"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const role = req.user?.role || "client";
      const client = await storage.updateClient(id, req.body);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }
      const filtered = stripPartnerInfoFromClient(client, role);
      res.json(filtered);
    } catch (error) {
      console.error("Update client error:", error);
      res.status(500).json({ error: "Failed to update client" });
    }
  });

  app.delete("/api/clients/:id", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const result = await storage.deleteClient(id);
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Delete client error:", error);
      res.status(500).json({ error: "Failed to delete client" });
    }
  });

  app.get("/api/clients/:id/with-partner", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const role = req.user?.role || "client";
      
      if (role === "assistant") {
        return res.status(403).json({ error: "Forbidden: assistants cannot view partner-client relationships" });
      }
      
      const client = await storage.getClientWithPartner(id);
      
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }
      
      if (role === "partner" && client.partnerId !== req.user?.partnerId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      
      res.json(client);
    } catch (error) {
      console.error("Get client with partner error:", error);
      res.status(500).json({ error: "Failed to get client" });
    }
  });

  app.get("/api/clients/:id/partners", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const role = req.user?.role || "client";
      
      if (role === "assistant") {
        return res.status(403).json({ error: "Forbidden: assistants cannot view partner-client relationships" });
      }
      
      const partners = await storage.getClientPartners(id);
      res.json(partners);
    } catch (error) {
      console.error("Get client partners error:", error);
      res.status(500).json({ error: "Failed to get client partners" });
    }
  });

  app.put("/api/clients/:id/partners", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { partnerIds } = req.body;
      
      if (!Array.isArray(partnerIds)) {
        return res.status(400).json({ error: "partnerIds must be an array" });
      }
      
      await storage.setClientPartners(id, partnerIds);
      const updatedPartners = await storage.getClientPartners(id);
      res.json(updatedPartners);
    } catch (error) {
      console.error("Set client partners error:", error);
      res.status(500).json({ error: "Failed to set client partners" });
    }
  });

  app.get("/api/clients-with-partners", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const role = req.user?.role || "client";
      
      if (role === "assistant") {
        return res.status(403).json({ error: "Forbidden: assistants cannot view partner-client relationships" });
      }
      
      const clients = await storage.getClientsWithPartners();
      res.json(clients);
    } catch (error) {
      console.error("Get clients with partners error:", error);
      res.status(500).json({ error: "Failed to get clients" });
    }
  });

  app.get("/api/dashboard/stats", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const role = req.user?.role || "client";
      const partnerId = req.user?.partnerId;
      const clientId = req.user?.clientId;
      
      const stats = await storage.getDashboardStats(role, partnerId, clientId);
      
      if (role === "assistant") {
        const { totalPartnerCommission, totalAdminShare, totalNetProfit, partnerDebt, clientRemaining, ...safeStats } = stats;
        return res.json(safeStats);
      }
      
      res.json(stats);
    } catch (error) {
      console.error("Get dashboard stats error:", error);
      res.status(500).json({ error: "Failed to get dashboard stats" });
    }
  });

  app.get("/api/invoices", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const role = req.user?.role || "client";
      let partnerId = req.user?.partnerId;
      const clientId = req.user?.clientId;
      
      if (role === "admin" && req.query.partnerId) {
        partnerId = req.query.partnerId as string;
      }
      
      const result = await storage.getInvoices(role, partnerId, clientId);
      const filtered = stripSensitiveFieldsFromList(result, role);
      res.json(filtered);
    } catch (error) {
      console.error("Get invoices error:", error);
      res.status(500).json({ error: "Failed to get invoices" });
    }
  });

  app.get("/api/invoices/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const role = req.user?.role || "client";
      const invoice = await storage.getInvoice(id);
      
      if (!invoice) {
        return res.status(404).json({ error: "Invoice not found" });
      }
      
      if (role === "partner" && invoice.partnerId !== req.user?.partnerId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      
      if (role === "client" && invoice.clientId !== req.user?.clientId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      
      const filtered = stripSensitiveFieldsForRole(invoice, role);
      res.json(filtered);
    } catch (error) {
      console.error("Get invoice error:", error);
      res.status(500).json({ error: "Failed to get invoice" });
    }
  });

  app.post("/api/invoices", authMiddleware, requireRole("admin", "assistant"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const role = req.user?.role || "client";
      const { calculations, ...invoiceData } = req.body;
      const invoice = await storage.createInvoice(
        { ...invoiceData, createdBy: req.user!.token.id },
        calculations || {}
      );
      const filtered = stripSensitiveFieldsForRole(invoice, role);
      res.status(201).json(filtered);
    } catch (error) {
      console.error("Create invoice error:", error);
      res.status(500).json({ error: "Failed to create invoice" });
    }
  });

  app.patch("/api/invoices/:id", authMiddleware, requireRole("admin", "assistant"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const role = req.user?.role || "client";
      const { calculations, ...invoiceData } = req.body;
      
      const invoice = await storage.updateInvoice(id, invoiceData);
      if (!invoice) {
        return res.status(404).json({ error: "Invoice not found" });
      }
      
      if (calculations) {
        await storage.updateInvoiceCalculations(id, calculations);
      }
      
      const filtered = stripSensitiveFieldsForRole(invoice, role);
      res.json(filtered);
    } catch (error) {
      console.error("Update invoice error:", error);
      res.status(500).json({ error: "Failed to update invoice" });
    }
  });

  app.get("/api/invoices/:id/expenses", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const expenses = await storage.getInvoiceExpenses(id);
      res.json(expenses);
    } catch (error) {
      console.error("Get expenses error:", error);
      res.status(500).json({ error: "Failed to get expenses" });
    }
  });

  app.post("/api/invoices/:id/expenses", authMiddleware, requireRole("admin", "assistant"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const expense = await storage.createInvoiceExpense({
        ...req.body,
        invoiceId: id,
        createdBy: req.user!.token.id,
      });
      res.status(201).json(expense);
    } catch (error) {
      console.error("Create expense error:", error);
      res.status(500).json({ error: "Failed to create expense" });
    }
  });

  app.patch("/api/expenses/:id", authMiddleware, requireRole("admin", "assistant"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const expense = await storage.updateInvoiceExpense(id, req.body);
      if (!expense) {
        return res.status(404).json({ error: "Expense not found" });
      }
      res.json(expense);
    } catch (error) {
      console.error("Update expense error:", error);
      res.status(500).json({ error: "Failed to update expense" });
    }
  });

  app.delete("/api/expenses/:id", authMiddleware, requireRole("admin", "assistant"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      await storage.deleteInvoiceExpense(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete expense error:", error);
      res.status(500).json({ error: "Failed to delete expense" });
    }
  });

  app.delete("/api/invoices/:id", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      await storage.deleteInvoice(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete invoice error:", error);
      res.status(500).json({ error: "Failed to delete invoice" });
    }
  });

  app.delete("/api/documents/:id", authMiddleware, requireRole("admin", "assistant"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      await storage.deleteDocument(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete document error:", error);
      res.status(500).json({ error: "Failed to delete document" });
    }
  });

  app.get("/api/partner-payments", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const role = req.user?.role;
      
      if (role === "assistant") {
        return res.status(403).json({ error: "Forbidden: assistants cannot view partner payments" });
      }
      
      let partnerId: string | undefined;
      
      if (role === "partner") {
        partnerId = req.user?.partnerId;
      }
      
      const payments = await storage.getPartnerPayments(partnerId);
      res.json(payments);
    } catch (error) {
      console.error("Get payments error:", error);
      res.status(500).json({ error: "Failed to get payments" });
    }
  });

  app.post("/api/partner-payments", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const payment = await storage.createPartnerPayment({
        ...req.body,
        createdBy: req.user!.token.id,
      });
      res.status(201).json(payment);
    } catch (error) {
      console.error("Create payment error:", error);
      res.status(500).json({ error: "Failed to create payment" });
    }
  });

  app.get("/api/access-tokens", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tokens = await storage.getAccessTokens();
      res.json(tokens);
    } catch (error) {
      console.error("Get tokens error:", error);
      res.status(500).json({ error: "Failed to get tokens" });
    }
  });

  app.post("/api/access-tokens", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { code, role, partnerId, clientId } = req.body;
      const token = await storage.createAccessToken(code, role, partnerId, clientId);
      res.status(201).json(token);
    } catch (error) {
      console.error("Create token error:", error);
      res.status(500).json({ error: "Failed to create token" });
    }
  });

  app.delete("/api/access-tokens/:id", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      await storage.deleteAccessToken(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete token error:", error);
      res.status(500).json({ error: "Failed to delete token" });
    }
  });
}
