import { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { AccessToken, UserRole } from "../shared/schema";

export function registerHealthCheck(app: Express) {
  app.get("/", (req: Request, res: Response, next: NextFunction) => {
    const userAgent = req.headers['user-agent'] || '';
    const acceptHeader = req.headers['accept'] || '';
    if (!userAgent || userAgent.includes('HealthCheck') || userAgent.includes('kube-probe') || 
        userAgent.includes('curl') || !acceptHeader.includes('text/html')) {
      return res.status(200).send('OK');
    }
    next();
  });
  
  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ok", timestamp: Date.now() });
  });
  
  app.get("/api/health", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ok", timestamp: Date.now() });
  });
}

interface AuthenticatedRequest extends Request {
  user?: {
    token: AccessToken;
    role: UserRole;
    partnerId?: string;
    clientId?: string;
  };
}

/**
 * UNIFIED SOURCE OF TRUTH: Role-based field visibility rules
 * 
 * All roles get data from the SAME stored values in invoice_calculations table.
 * This configuration determines what each role can SEE, not what is calculated.
 * 
 * BUSINESS RULES:
 * - Admin: sees everything (full financial transparency)
 * - Partner: sees their commission, debt, client remaining
 * - Client: sees their bill and remaining budget
 * - Assistant: sees basic invoice info + for Agency 30%: margin, client budget (70%), remaining
 *             BUT does NOT see partner/admin split (15%/15%)
 */
const ROLE_INVOICE_PERMISSIONS: Record<UserRole, readonly string[]> = {
  admin: [
    'id', 'invoiceNumber', 'partnerId', 'clientId', 'status', 'description',
    'clientBill', 'scheme', 'createdAt', 'updatedAt', 'createdBy', 'dueDate',
    'paidDate', 'paymentDueDate', 'notes', 'hideFromAssistant',
  ],
  partner: [
    'id', 'invoiceNumber', 'clientId', 'status', 'description',
    'clientBill', 'scheme', 'createdAt', 'updatedAt', 'dueDate',
    'paidDate', 'paymentDueDate', 'notes',
  ],
  client: [
    'id', 'invoiceNumber', 'status', 'description', 'clientBill',
    'scheme', 'createdAt', 'updatedAt', 'dueDate', 'paidDate', 'notes',
  ],
  assistant: [
    'id', 'invoiceNumber', 'clientId', 'status', 'description',
    'clientBill', 'createdAt', 'updatedAt', 'createdBy', 'dueDate',
    'paidDate', 'notes', 'scheme',
  ],
};

const ROLE_CALCULATION_PERMISSIONS: Record<UserRole, readonly string[]> = {
  admin: [
    'id', 'invoiceId', 'clientBill', 'commissionRate', 'commissionAmount',
    'amountToAdmin', 'agencyMargin', 'partnerShareFromMargin', 'adminShareFromMargin',
    'clientBaseAfterMargin', 'clientSpent', 'clientRemaining', 'executorExpensesTotal',
    'partnerTransferDue', 'netProfitAdmin', 'adminShare50', 'catShare50',
    'assistantBonusActs', 'assistantBonusPaid',
  ],
  partner: [
    'id', 'invoiceId', 'clientBill', 'commissionRate', 'commissionAmount',
    'amountToAdmin', 'agencyMargin', 'partnerShareFromMargin', 'adminShareFromMargin',
    'clientBaseAfterMargin', 'clientSpent', 'clientRemaining', 'executorExpensesTotal',
    'partnerTransferDue',
  ],
  client: [
    'id', 'invoiceId', 'clientBill', 'clientBaseAfterMargin',
    'clientSpent', 'clientRemaining', 'executorExpensesTotal',
  ],
  assistant: [
    'id', 'invoiceId', 'clientBill', 'executorExpensesTotal',
    // Для Agency 30% показываем бюджет клиента и остаток, но НЕ разбивку партнёр/админ
    'agencyMargin', 'clientBaseAfterMargin', 'clientRemaining',
  ],
};

const ROLE_STATS_PERMISSIONS: Record<UserRole, readonly string[]> = {
  admin: [
    'totalInvoices', 'paidInvoices', 'pendingInvoices', 'overdueInvoices',
    'totalClientBill', 'paidClientBill', 'pendingClientBill', 'totalExpenses',
    'totalPartnerCommission', 'totalAdminShare', 'totalNetProfit', 'clientRemaining',
  ],
  partner: [
    'totalInvoices', 'paidInvoices', 'pendingInvoices', 'overdueInvoices',
    'totalClientBill', 'paidClientBill', 'pendingClientBill', 'totalExpenses',
    'totalPartnerCommission', 'partnerDebt', 'clientRemaining',
  ],
  client: [
    'totalInvoices', 'paidInvoices', 'pendingInvoices', 'overdueInvoices',
    'totalClientBill', 'totalExpenses', 'clientRemaining',
  ],
  assistant: [
    'totalInvoices', 'paidInvoices', 'pendingInvoices', 'overdueInvoices',
    'totalClientBill', 'paidClientBill', 'pendingClientBill', 'totalExpenses',
  ],
};

const ASSISTANT_ALLOWED_INVOICE_FIELDS = ROLE_INVOICE_PERMISSIONS.assistant;
const ASSISTANT_ALLOWED_CALCULATION_FIELDS = ROLE_CALCULATION_PERMISSIONS.assistant;

/**
 * Project invoice data based on role permissions
 * Uses ROLE_INVOICE_PERMISSIONS and ROLE_CALCULATION_PERMISSIONS as single source of truth
 */
function projectInvoiceForRole(invoice: Record<string, any>, role: UserRole): Record<string, any> {
  const allowedInvoiceFields = ROLE_INVOICE_PERMISSIONS[role];
  const allowedCalcFields = ROLE_CALCULATION_PERMISSIONS[role];
  
  const result: Record<string, any> = {};
  
  for (const field of allowedInvoiceFields) {
    if (field in invoice) {
      result[field] = invoice[field];
    }
  }
  
  if (invoice.calculations && typeof invoice.calculations === 'object') {
    const calc: Record<string, any> = {};
    for (const field of allowedCalcFields) {
      if (field in invoice.calculations) {
        calc[field] = invoice.calculations[field];
      }
    }
    result.calculations = calc;
  }
  
  if (invoice.partner && role === 'admin') {
    result.partner = invoice.partner;
  } else if (invoice.partner && role === 'partner') {
    result.partner = { id: invoice.partner.id, name: invoice.partner.name };
  }
  
  if (invoice.client) {
    if (role === 'assistant') {
      result.client = { id: invoice.client.id, name: invoice.client.name };
    } else {
      result.client = invoice.client;
    }
  }
  
  return result;
}

function createAssistantInvoiceProjection(invoice: Record<string, any>): Record<string, any> {
  return projectInvoiceForRole(invoice, 'assistant');
}

function stripSensitiveFieldsForRole<T extends Record<string, any>>(data: T, role: UserRole): T {
  return projectInvoiceForRole(data, role) as T;
}

function stripSensitiveFieldsFromList<T extends Record<string, any>>(data: T[], role: UserRole): T[] {
  return data.map(item => projectInvoiceForRole(item, role)) as T[];
}

/**
 * Project stats data based on role permissions
 * Uses ROLE_STATS_PERMISSIONS as single source of truth
 */
function projectStatsForRole(stats: Record<string, any>, role: UserRole): Record<string, any> {
  const allowedFields = ROLE_STATS_PERMISSIONS[role];
  const result: Record<string, any> = {};
  
  for (const field of allowedFields) {
    if (field in stats) {
      result[field] = stats[field];
    }
  }
  
  return result;
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
        return res.status(400).json({ 
          success: false,
          error: "missing_code",
          message: "Код доступа обязателен"
        });
      }
      
      const token = await storage.verifyAccessCode(code);
      
      if (!token) {
        return res.status(401).json({ 
          success: false,
          error: "invalid_code",
          message: "Неверный код доступа"
        });
      }
      
      const session = await storage.createSession(
        token.id,
        req.ip,
        req.headers["user-agent"]
      );
      
      const isProxied = req.headers['x-forwarded-proto'] === 'https';
      const isSecure = isProxied || req.secure;
      res.cookie(SESSION_COOKIE, session.sessionId, {
        httpOnly: true,
        secure: isSecure,
        sameSite: isSecure ? "none" : "lax",
        maxAge: 30 * 60 * 1000,
        path: "/",
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
      res.status(500).json({ 
        success: false,
        error: "server_error",
        message: "Ошибка сервера при входе"
      });
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
    
    const isProxied = req.headers['x-forwarded-proto'] === 'https';
    const isSecure = isProxied || req.secure;
    res.cookie(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      secure: isSecure,
      sameSite: isSecure ? "none" : "lax",
      maxAge: 30 * 60 * 1000,
      path: "/",
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
      
      // Get stats from storage (single source of truth)
      const stats = await storage.getDashboardStats(role, partnerId, clientId);
      
      // Filter stats based on role permissions (uses ROLE_STATS_PERMISSIONS)
      const filteredStats = projectStatsForRole(stats, role);
      res.json(filteredStats);
    } catch (error) {
      console.error("Get dashboard stats error:", error);
      res.status(500).json({ error: "Failed to get dashboard stats" });
    }
  });

  // Admin analytics endpoints
  app.get("/api/admin/monthly-data", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const year = parseInt(req.query.year as string) || new Date().getFullYear();
      const data = await storage.getAdminMonthlyData(year);
      res.json(data);
    } catch (error) {
      console.error("Get admin monthly data error:", error);
      res.status(500).json({ error: "Failed to get monthly data" });
    }
  });

  app.get("/api/admin/forecast", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const monthsAhead = parseInt(req.query.months as string) || 6;
      const data = await storage.getAdminForecast(monthsAhead);
      res.json(data);
    } catch (error) {
      console.error("Get admin forecast error:", error);
      res.status(500).json({ error: "Failed to get forecast" });
    }
  });

  app.get("/api/admin/drafts-stats", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const data = await storage.getDraftsStats();
      res.json(data);
    } catch (error) {
      console.error("Get drafts stats error:", error);
      res.status(500).json({ error: "Failed to get drafts stats" });
    }
  });

  app.get("/api/invoices/overdue", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const data = await storage.getOverdueInvoices();
      res.json(data);
    } catch (error) {
      console.error("Get overdue invoices error:", error);
      res.status(500).json({ error: "Failed to get overdue invoices" });
    }
  });

  // Alert counts for sidebar badges
  app.get("/api/alert-counts", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const role = req.user?.role || "client";
      const counts = await storage.getAlertCounts(role);
      res.json(counts);
    } catch (error) {
      console.error("Get alert counts error:", error);
      res.status(500).json({ error: "Failed to get alert counts" });
    }
  });

  // Global search for command palette
  app.get("/api/search", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const role = req.user?.role || "client";
      const query = req.query.q as string || "";
      if (!query.trim()) {
        return res.json([]);
      }
      const results = await storage.globalSearch(query, role);
      res.json(results);
    } catch (error) {
      console.error("Global search error:", error);
      res.status(500).json({ error: "Failed to search" });
    }
  });

  // Priority actions for dashboard
  app.get("/api/priority-actions", authMiddleware, requireRole("admin", "assistant"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const actions = await storage.getPriorityActions();
      res.json(actions);
    } catch (error) {
      console.error("Get priority actions error:", error);
      res.status(500).json({ error: "Failed to get priority actions" });
    }
  });

  // Overdue invoices with details for alerts
  app.get("/api/overdue-invoices", authMiddleware, requireRole("admin", "assistant"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const data = await storage.getOverdueInvoicesDetailed();
      res.json(data);
    } catch (error) {
      console.error("Get overdue invoices detailed error:", error);
      res.status(500).json({ error: "Failed to get overdue invoices" });
    }
  });

  // Partner terms - schemes and commission rates for current partner
  app.get("/api/partner/terms", authMiddleware, requireRole("partner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const partnerId = req.user?.partnerId;
      if (!partnerId) {
        return res.status(403).json({ error: "No partner ID found" });
      }
      const terms = await storage.getPartnerTerms(partnerId);
      res.json(terms);
    } catch (error) {
      console.error("Get partner terms error:", error);
      res.status(500).json({ error: "Failed to get partner terms" });
    }
  });

  // Partner payments list
  app.get("/api/partner/payments", authMiddleware, requireRole("partner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const partnerId = req.user?.partnerId;
      if (!partnerId) {
        return res.status(403).json({ error: "No partner ID found" });
      }
      const payments = await storage.getPartnerPayments(partnerId);
      res.json(payments);
    } catch (error) {
      console.error("Get partner payments error:", error);
      res.status(500).json({ error: "Failed to get partner payments" });
    }
  });

  // Client budget dashboard - project budgets with expenses
  app.get("/api/client/budget", authMiddleware, requireRole("client"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const clientId = req.user?.clientId;
      if (!clientId) {
        return res.status(403).json({ error: "No client ID found" });
      }
      const data = await storage.getClientBudget(clientId);
      res.json(data);
    } catch (error) {
      console.error("Get client budget error:", error);
      res.status(500).json({ error: "Failed to get client budget" });
    }
  });

  // Client agency 30 report
  app.get("/api/client/agency30", authMiddleware, requireRole("client"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const clientId = req.user?.clientId;
      if (!clientId) {
        return res.status(403).json({ error: "No client ID found" });
      }
      const data = await storage.getClientAgency30Report(clientId);
      res.json(data);
    } catch (error) {
      console.error("Get client agency30 report error:", error);
      res.status(500).json({ error: "Failed to get agency30 report" });
    }
  });

  // Admin: Partner invoices detail with debt tracking
  app.get("/api/admin/partner-invoices/:partnerId", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { partnerId } = req.params;
      const data = await storage.getPartnerInvoicesDetail(partnerId);
      res.json(data);
    } catch (error) {
      console.error("Get partner invoices detail error:", error);
      res.status(500).json({ error: "Failed to get partner invoices" });
    }
  });

  // Admin: Working capital balance
  app.get("/api/admin/working-capital", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const data = await storage.getWorkingCapital();
      res.json(data);
    } catch (error) {
      console.error("Get working capital error:", error);
      res.status(500).json({ error: "Failed to get working capital" });
    }
  });

  app.patch("/api/admin/working-capital", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { amount, notes } = req.body;
      const updatedBy = req.user!.token.id;
      const data = await storage.updateWorkingCapital(amount, notes, updatedBy);
      res.json(data);
    } catch (error) {
      console.error("Update working capital error:", error);
      res.status(500).json({ error: "Failed to update working capital" });
    }
  });

  // Admin: Client LTV report
  app.get("/api/admin/client-ltv", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const data = await storage.getClientLTV();
      res.json(data);
    } catch (error) {
      console.error("Get client LTV error:", error);
      res.status(500).json({ error: "Failed to get client LTV" });
    }
  });

  app.get("/api/admin/plan-fact", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const year = parseInt(req.query.year as string) || new Date().getFullYear();
      const data = await storage.getAdminPlanFact(year);
      res.json(data);
    } catch (error) {
      console.error("Get admin plan-fact error:", error);
      res.status(500).json({ error: "Failed to get plan-fact data" });
    }
  });

  app.get("/api/admin/monthly-plans", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const year = parseInt(req.query.year as string) || new Date().getFullYear();
      const data = await storage.getMonthlyPlans(year);
      res.json(data);
    } catch (error) {
      console.error("Get monthly plans error:", error);
      res.status(500).json({ error: "Failed to get monthly plans" });
    }
  });

  // Financial plans history with actuals for PlanHistoryComparison
  // Fetches actual admin/cat shares from invoice_calculations for accurate comparison
  app.get("/api/financial-plans/history", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const currentYear = new Date().getFullYear();
      const lastYear = currentYear - 1;
      
      // Get plans for current and last year
      const currentYearPlans = await storage.getMonthlyPlans(currentYear);
      const lastYearPlans = await storage.getMonthlyPlans(lastYear);
      
      const allPlans = [...currentYearPlans, ...lastYearPlans]
        .sort((a, b) => {
          if (a.year !== b.year) return parseInt(b.year) - parseInt(a.year);
          return parseInt(b.month) - parseInt(a.month);
        });
      
      // Get actual admin/cat shares for each year using dedicated method
      const getActualsForYear = async (year: number) => {
        const yearStart = new Date(year, 0, 1);
        const yearEnd = new Date(year, 11, 31, 23, 59, 59);
        
        // Use specialized method that returns raw calculation fields
        const paidInvoices = await storage.getInvoicesWithCalculations();
        const monthlyActuals: { [month: number]: { admin: number; cat: number } } = {};
        
        // Initialize all months
        for (let m = 1; m <= 12; m++) {
          monthlyActuals[m] = { admin: 0, cat: 0 };
        }
        
        // Sum up actual shares by month from paid invoices
        for (const invoice of paidInvoices) {
          if (invoice.paymentDate) {
            const paymentDate = new Date(invoice.paymentDate);
            if (paymentDate >= yearStart && paymentDate <= yearEnd) {
              const month = paymentDate.getMonth() + 1;
              
              // Parse string values to numbers - treat empty/null/very small as zero
              const parseShare = (val: string | null): number => {
                if (!val || val.trim() === '') return 0;
                const num = parseFloat(val);
                return isNaN(num) || Math.abs(num) < 0.01 ? 0 : num;
              };
              
              let adminShare = parseShare(invoice.adminShare50);
              let catShare = parseShare(invoice.catShare50);
              
              // Fallback: if shares are effectively zero but netProfitAdmin exists, compute 50/50 split
              if (adminShare === 0 && catShare === 0 && invoice.netProfitAdmin) {
                const netProfit = parseShare(invoice.netProfitAdmin);
                if (netProfit > 0) {
                  adminShare = netProfit / 2;
                  catShare = netProfit / 2;
                }
              }
              
              monthlyActuals[month].admin += adminShare;
              monthlyActuals[month].cat += catShare;
            }
          }
        }
        
        return monthlyActuals;
      };
      
      const currentYearActuals = await getActualsForYear(currentYear);
      const lastYearActuals = await getActualsForYear(lastYear);
      
      const result = allPlans.map(plan => {
        const year = parseInt(plan.year);
        const month = parseInt(plan.month);
        const actuals = year === currentYear ? currentYearActuals : lastYearActuals;
        
        // profitTarget is split 50/50 between admin and cat shares
        const profitTarget = parseFloat(plan.profitTarget || "0");
        const halfTarget = profitTarget / 2;
        
        return {
          id: plan.id,
          year,
          month,
          plannedAdminShare: halfTarget.toString(),
          plannedCatShare: halfTarget.toString(),
          actualAdminShare: actuals[month]?.admin || 0,
          actualCatShare: actuals[month]?.cat || 0,
        };
      });
      
      res.json(result);
    } catch (error) {
      console.error("Get financial plans history error:", error);
      res.status(500).json({ error: "Failed to get plans history" });
    }
  });

  app.post("/api/admin/monthly-plans", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { year, month, salesTarget, profitTarget, receiptsTarget } = req.body;
      const plan = await storage.upsertMonthlyPlan({
        year: parseInt(year),
        month: parseInt(month),
        salesTarget: salesTarget ? parseFloat(salesTarget) : undefined,
        profitTarget: profitTarget ? parseFloat(profitTarget) : undefined,
        receiptsTarget: receiptsTarget ? parseFloat(receiptsTarget) : undefined,
      });
      res.json(plan);
    } catch (error) {
      console.error("Upsert monthly plan error:", error);
      res.status(500).json({ error: "Failed to save monthly plan" });
    }
  });

  app.post("/api/admin/recalculate-invoices", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
    console.log('[API] Recalculate invoices request received');
    try {
      const result = await storage.recalculateAllInvoices();
      console.log('[API] Recalculate invoices result:', result);
      res.json({ 
        success: true, 
        message: `Recalculated ${result.updated} invoices with ${result.errors} errors`,
        ...result 
      });
    } catch (error) {
      console.error("[API] Recalculate invoices error:", error);
      res.status(500).json({ error: "Failed to recalculate invoices" });
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
      
      // Assistant cannot see invoices hidden from them
      if (role === "assistant" && invoice.hideFromAssistant) {
        return res.status(403).json({ error: "Forbidden" });
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
      // Reload full invoice with calculations, partner, client
      const fullInvoice = await storage.getInvoice(invoice.id);
      const filtered = stripSensitiveFieldsForRole(fullInvoice || invoice, role);
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
      
      // Reload full invoice with recalculated values
      const fullInvoice = await storage.getInvoice(id);
      const filtered = stripSensitiveFieldsForRole(fullInvoice || invoice, role);
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

  app.get("/api/partner-debt", authMiddleware, requireRole("admin", "partner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const role = req.user?.role;
      
      const summaries = await storage.getPartnerDebtSummaries();
      
      // If partner, filter to only their own data
      if (role === "partner") {
        const partnerId = req.user?.partnerId;
        const filtered = summaries.filter(s => s.partnerId === partnerId);
        return res.json(filtered);
      }
      
      // Admin sees all
      res.json(summaries);
    } catch (error) {
      console.error("Get partner debt error:", error);
      res.status(500).json({ error: "Failed to get partner debt data" });
    }
  });
  
  // Get partner's own debt details (for partner dashboard)
  app.get("/api/my-debt", authMiddleware, requireRole("partner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const partnerId = req.user?.partnerId;
      if (!partnerId) {
        return res.status(400).json({ error: "Partner ID not found in session" });
      }
      
      const debtDetails = await storage.getPartnerDebtDetails(partnerId);
      res.json(debtDetails);
    } catch (error) {
      console.error("Get my debt error:", error);
      res.status(500).json({ error: "Failed to get debt details" });
    }
  });

  // Get partner payment history with running balance
  // Accessible by admin (for any partner) and partner (for own history)
  app.get("/api/partners/:id/payment-history", authMiddleware, requireRole("admin", "partner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const partnerId = req.params.id;
      const role = req.user?.role;
      
      // Partner can only view their own history
      if (role === "partner" && req.user?.partnerId !== partnerId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const history = await storage.getPartnerPaymentHistory(partnerId);
      res.json(history);
    } catch (error) {
      console.error("Get partner payment history error:", error);
      res.status(500).json({ error: "Failed to get payment history" });
    }
  });

  // Get my own payment history (for partner dashboard)
  app.get("/api/my-payment-history", authMiddleware, requireRole("partner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const partnerId = req.user?.partnerId;
      if (!partnerId) {
        return res.status(400).json({ error: "Partner ID not found in session" });
      }
      
      const history = await storage.getPartnerPaymentHistory(partnerId);
      res.json(history);
    } catch (error) {
      console.error("Get my payment history error:", error);
      res.status(500).json({ error: "Failed to get payment history" });
    }
  });

  // Partner client stats with dynamic year - monthly breakdown by client
  app.get("/api/partner/client-stats", authMiddleware, requireRole("partner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const partnerId = req.user?.partnerId;
      if (!partnerId) {
        return res.status(400).json({ error: "Partner ID not found in session" });
      }
      
      const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();
      const stats = await storage.getPartnerClientStats(partnerId, year);
      
      // Get available years for the dropdown
      const currentYear = new Date().getFullYear();
      const availableYears = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];
      
      res.json({ stats, selectedYear: year, availableYears });
    } catch (error) {
      console.error("Get partner client stats error:", error);
      res.status(500).json({ error: "Failed to get client stats" });
    }
  });

  // Partner document risk - uses unified signed_acts table (same source as admin)
  app.get("/api/partner/document-risk", authMiddleware, requireRole("partner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const partnerId = req.user?.partnerId;
      if (!partnerId) {
        return res.status(400).json({ error: "Partner ID not found in session" });
      }
      
      const risk = await storage.getPartnerDocumentRisk(partnerId);
      res.json(risk);
    } catch (error) {
      console.error("Get partner document risk error:", error);
      res.status(500).json({ error: "Failed to get document risk" });
    }
  });

  // Partner agency 30% client funds tracker - shows untouchable client money
  app.get("/api/partner/agency30-funds", authMiddleware, requireRole("partner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const partnerId = req.user?.partnerId;
      if (!partnerId) {
        return res.status(400).json({ error: "Partner ID not found in session" });
      }
      
      const funds = await storage.getPartnerAgency30Funds(partnerId);
      const total = funds.reduce((sum, f) => sum + f.remaining, 0);
      res.json({ clients: funds, totalRemaining: total });
    } catch (error) {
      console.error("Get partner agency30 funds error:", error);
      res.status(500).json({ error: "Failed to get agency 30 funds" });
    }
  });

  app.get("/api/do-not-spend", authMiddleware, requireRole("admin", "assistant", "partner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const role = req.user?.role;
      const partnerId = req.user?.partnerId;
      
      const data = await storage.getDoNotSpendData(role === 'partner' ? partnerId : undefined);
      res.json(data);
    } catch (error) {
      console.error("Get do-not-spend error:", error);
      res.status(500).json({ error: "Failed to get do-not-spend data" });
    }
  });

  /**
   * UNIFIED FINANCIAL SUMMARY ENDPOINT
   * Single source of truth for all financial data across all roles.
   * Data comes from stored values in invoice_calculations table.
   * Filtering is done based on ROLE_*_PERMISSIONS constants.
   */
  app.get("/api/financial-summary", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const role = req.user?.role || "client";
      const partnerId = req.user?.partnerId;
      const clientId = req.user?.clientId;
      
      // Get dashboard stats (uses stored values)
      const stats = await storage.getDashboardStats(role, partnerId, clientId);
      const filteredStats = projectStatsForRole(stats, role);
      
      // Get invoices filtered by role
      const invoices = await storage.getInvoices(role, partnerId, clientId);
      const filteredInvoices = invoices.map(inv => projectInvoiceForRole(inv as Record<string, any>, role));
      
      // Role-specific additional data
      const summary: Record<string, any> = {
        stats: filteredStats,
        invoices: filteredInvoices,
        role,
        dataSource: 'invoice_calculations', // Indicates all data comes from stored values
      };
      
      // Admin gets partner debt summaries
      if (role === 'admin') {
        const partnerDebts = await storage.getPartnerDebtSummaries();
        summary.partnerDebts = partnerDebts;
      }
      
      // Partner gets their own debt
      if (role === 'partner' && partnerId) {
        const partnerDebts = await storage.getPartnerDebtSummaries();
        const myDebt = partnerDebts.find(d => d.partnerId === partnerId);
        summary.myDebt = myDebt || { totalToTransfer: 0, totalPaid: 0, remaining: 0 };
      }
      
      res.json(summary);
    } catch (error) {
      console.error("Get financial summary error:", error);
      res.status(500).json({ error: "Failed to get financial summary" });
    }
  });
  
  // Admin dashboard stats (Cash Flow, Sales, Yearly Summary, Leverage)
  app.get("/api/admin/dashboard-stats", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const year = req.query.year ? parseInt(req.query.year as string) : undefined;
      const month = req.query.month ? parseInt(req.query.month as string) : undefined;
      const stats = await storage.getAdminDashboardStats(year, month);
      res.json(stats);
    } catch (error) {
      console.error("Get admin dashboard stats error:", error);
      res.status(500).json({ error: "Failed to get dashboard stats" });
    }
  });

  // Critical alerts for admin dashboard
  app.get("/api/admin/critical-alerts", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const alerts = await storage.getCriticalAlerts();
      res.json(alerts);
    } catch (error) {
      console.error("Get critical alerts error:", error);
      res.status(500).json({ error: "Failed to get critical alerts" });
    }
  });

  // Assistant Bonus Payments
  app.get("/api/admin/bonus-payments", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const payments = await storage.getAssistantBonusPayments();
      res.json(payments);
    } catch (error) {
      console.error("Get bonus payments error:", error);
      res.status(500).json({ error: "Failed to get bonus payments" });
    }
  });

  app.get("/api/admin/unpaid-bonus", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await storage.getUnpaidBonusTotal();
      res.json(result);
    } catch (error) {
      console.error("Get unpaid bonus error:", error);
      res.status(500).json({ error: "Failed to get unpaid bonus" });
    }
  });

  app.post("/api/admin/bonus-payout", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { amount, notes, invoiceIds } = req.body;
      
      if (!amount || amount <= 0) {
        return res.status(400).json({ error: "Invalid amount" });
      }
      
      const payment = await storage.createAssistantBonusPayment({
        amount: amount.toString(),
        paymentDate: new Date().toISOString().split('T')[0],
        notes: notes || null,
        paidBy: req.user!.token.id,
      });
      
      if (invoiceIds && invoiceIds.length > 0) {
        await storage.markBonusesAsPaid(invoiceIds);
      }
      
      res.status(201).json(payment);
    } catch (error) {
      console.error("Create bonus payout error:", error);
      res.status(500).json({ error: "Failed to create bonus payout" });
    }
  });

  // Assistant can view their bonus payment history
  app.get("/api/my-bonus-payments", authMiddleware, requireRole("admin", "assistant"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const payments = await storage.getAssistantBonusPayments();
      res.json(payments);
    } catch (error) {
      console.error("Get my bonus payments error:", error);
      res.status(500).json({ error: "Failed to get bonus payments" });
    }
  });

  // Acts statistics for bonus calculations
  app.get("/api/acts-statistics", authMiddleware, requireRole("admin", "assistant"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const role = req.user?.role;
      const excludeHidden = role === 'assistant';
      const stats = await storage.getActsStatistics(excludeHidden);
      res.json(stats);
    } catch (error) {
      console.error("Get acts statistics error:", error);
      res.status(500).json({ error: "Failed to get acts statistics" });
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

  // Signed Acts API
  app.get("/api/invoices/:id/acts", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const role = req.user?.role || "client";
      const actType = req.query.type as string | undefined;
      
      // Get invoice to check access
      const invoice = await storage.getInvoice(id);
      if (!invoice) {
        return res.status(404).json({ error: "Invoice not found" });
      }
      
      // Check access
      if (role === "assistant" && invoice.hideFromAssistant) {
        return res.status(403).json({ error: "Forbidden" });
      }
      if (role === "partner" && invoice.partnerId !== req.user?.partnerId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      if (role === "client" && invoice.clientId !== req.user?.clientId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      
      let acts = await storage.getSignedActsByInvoice(id, actType as any);
      
      // Partner and client can only see company acts, not executor acts
      if (role === "partner" || role === "client") {
        acts = acts.filter(a => a.actType === 'company');
      }
      
      // Don't send file data in list response
      const actsWithoutData = acts.map(({ fileData, ...rest }) => rest);
      res.json(actsWithoutData);
    } catch (error) {
      console.error("Get acts error:", error);
      res.status(500).json({ error: "Failed to get acts" });
    }
  });

  app.post("/api/invoices/:id/acts", authMiddleware, requireRole("admin", "assistant"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { actType, fileName, fileData, mimeType, isLink, url } = req.body;
      
      // Validate invoice exists
      const invoice = await storage.getInvoice(id);
      if (!invoice) {
        return res.status(404).json({ error: "Invoice not found" });
      }
      
      // Validate: either file data or URL must be provided
      if (isLink) {
        if (!url) {
          return res.status(400).json({ error: "URL is required for link-type acts" });
        }
      } else {
        if (!fileData || !mimeType) {
          return res.status(400).json({ error: "File data and mime type are required for file uploads" });
        }
      }
      
      const act = await storage.createSignedAct({
        invoiceId: id,
        actType,
        fileName,
        fileData: isLink ? null : fileData,
        mimeType: isLink ? null : mimeType,
        isLink: isLink || false,
        url: isLink ? url : null,
        uploadedBy: req.user!.token.id,
      });
      
      // Return without file data
      const { fileData: _, ...actWithoutData } = act;
      res.status(201).json(actWithoutData);
    } catch (error) {
      console.error("Create act error:", error);
      res.status(500).json({ error: "Failed to upload act" });
    }
  });

  app.get("/api/acts/:id/download", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const role = req.user?.role || "client";
      
      const act = await storage.getSignedAct(id);
      if (!act) {
        return res.status(404).json({ error: "Act not found" });
      }
      
      // Check access - partner/client can only download company acts
      if ((role === "partner" || role === "client") && act.actType === 'executor') {
        return res.status(403).json({ error: "Forbidden" });
      }
      
      // Get invoice to check access
      const invoice = await storage.getInvoice(act.invoiceId);
      if (!invoice) {
        return res.status(404).json({ error: "Invoice not found" });
      }
      
      if (role === "partner" && invoice.partnerId !== req.user?.partnerId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      if (role === "client" && invoice.clientId !== req.user?.clientId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      
      // Return file data
      res.json({
        fileName: act.fileName,
        fileData: act.fileData,
        mimeType: act.mimeType,
      });
    } catch (error) {
      console.error("Download act error:", error);
      res.status(500).json({ error: "Failed to download act" });
    }
  });

  app.delete("/api/acts/:id", authMiddleware, requireRole("admin", "assistant"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      await storage.deleteSignedAct(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete act error:", error);
      res.status(500).json({ error: "Failed to delete act" });
    }
  });

  // Assistant dashboard stats
  app.get("/api/assistant/stats", authMiddleware, requireRole("admin", "assistant"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const stats = await storage.getAssistantStats();
      res.json(stats);
    } catch (error) {
      console.error("Get assistant stats error:", error);
      res.status(500).json({ error: "Failed to get assistant stats" });
    }
  });

  // Recurring invoices
  app.get("/api/recurring-invoices", authMiddleware, requireRole("admin", "assistant"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const recurring = await storage.getRecurringInvoices();
      res.json(recurring);
    } catch (error) {
      console.error("Get recurring invoices error:", error);
      res.status(500).json({ error: "Failed to get recurring invoices" });
    }
  });

  app.post("/api/recurring-invoices", authMiddleware, requireRole("admin", "assistant"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { clientId, partnerId, scheme, partnerCommissionRate, amount, description, frequency, dayOfMonth, startDate, endDate, nextInvoiceDate, notes, hideFromAssistant } = req.body;
      
      const created = await storage.createRecurringInvoice({
        clientId,
        partnerId,
        scheme,
        partnerCommissionRate: partnerCommissionRate ? partnerCommissionRate.toString() : null,
        amount: amount?.toString() || '0',
        description,
        frequency: frequency || 'monthly',
        dayOfMonth: dayOfMonth?.toString() || '1',
        startDate: startDate || new Date().toISOString().split('T')[0],
        endDate: endDate || null,
        nextInvoiceDate: nextInvoiceDate || startDate,
        notes,
        hideFromAssistant: hideFromAssistant ?? false,
        createdBy: req.user!.token.id,
      });
      
      res.status(201).json(created);
    } catch (error) {
      console.error("Create recurring invoice error:", error);
      res.status(500).json({ error: "Failed to create recurring invoice" });
    }
  });

  app.get("/api/recurring-invoices/due", authMiddleware, requireRole("admin", "assistant"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const due = await storage.getDueRecurringInvoices();
      res.json(due);
    } catch (error) {
      console.error("Get due recurring invoices error:", error);
      res.status(500).json({ error: "Failed to get due recurring invoices" });
    }
  });

  app.post("/api/recurring-invoices/process", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await storage.processAllDueRecurringInvoices();
      res.json(result);
    } catch (error) {
      console.error("Process recurring invoices error:", error);
      res.status(500).json({ error: "Failed to process recurring invoices" });
    }
  });

  app.post("/api/recurring-invoices/:id/create-draft", authMiddleware, requireRole("admin", "assistant"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { invoiceDate } = req.body;
      const invoice = await storage.createDraftFromRecurring(id, invoiceDate);
      res.status(201).json(invoice);
    } catch (error: any) {
      console.error("Create draft from recurring error:", error);
      res.status(500).json({ error: error.message || "Failed to create draft" });
    }
  });

  app.post("/api/recurring-invoices/:id/backdate", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { fromDate } = req.body;
      if (!fromDate) {
        return res.status(400).json({ error: "fromDate is required" });
      }
      const result = await storage.generateBackdatedInvoices(id, fromDate);
      res.json(result);
    } catch (error: any) {
      console.error("Generate backdated invoices error:", error);
      res.status(500).json({ error: error.message || "Failed to generate backdated invoices" });
    }
  });

  app.get("/api/recurring-invoices/cashflow", authMiddleware, requireRole("admin", "assistant"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const recurring = await storage.getActiveRecurringInvoicesForCashFlow();
      res.json(recurring);
    } catch (error) {
      console.error("Get recurring for cashflow error:", error);
      res.status(500).json({ error: "Failed to get recurring invoices for cashflow" });
    }
  });

  app.patch("/api/recurring-invoices/:id", authMiddleware, requireRole("admin", "assistant"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const updated = await storage.updateRecurringInvoice(id, req.body);
      
      if (!updated) {
        return res.status(404).json({ error: "Recurring invoice not found" });
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Update recurring invoice error:", error);
      res.status(500).json({ error: "Failed to update recurring invoice" });
    }
  });

  app.delete("/api/recurring-invoices/:id", authMiddleware, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      await storage.deleteRecurringInvoice(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete recurring invoice error:", error);
      res.status(500).json({ error: "Failed to delete recurring invoice" });
    }
  });
}
