import { db } from "./db";
import { 
  partners, clients, accessTokens, userSessions, invoices, 
  invoiceCalculations, invoiceExpenses, partnerPayments, clientPartners,
  Partner, Client, Invoice, InvoiceCalculation, InvoiceExpense, PartnerPayment,
  InsertPartner, InsertClient, InsertInvoice, InsertInvoiceExpense, InsertPartnerPayment,
  AccessToken, UserSession, UserRole, InvoiceScheme
} from "../shared/schema";
import { eq, and, desc, isNull, gte, sql, inArray } from "drizzle-orm";
import { randomBytes } from "crypto";

// Server-side invoice calculations
function calculateInvoiceServer(
  scheme: InvoiceScheme,
  clientBill: number,
  partnerCommissionRate?: number,
  executorExpenses: number = 0
): Partial<InvoiceCalculation> {
  const result: Partial<InvoiceCalculation> = {
    clientBill: clientBill.toString(),
    executorExpensesTotal: executorExpenses.toString(),
  };

  switch (scheme) {
    case 'agency_30': {
      const agencyMargin = clientBill * 0.30;
      const partnerShare = clientBill * 0.15;
      const adminShare = clientBill * 0.15;
      const clientBase = clientBill * 0.70;
      const clientRemaining = clientBase - executorExpenses;
      
      result.agencyMargin = agencyMargin.toString();
      result.partnerShareFromMargin = partnerShare.toString();
      result.adminShareFromMargin = adminShare.toString();
      result.clientBaseAfterMargin = clientBase.toString();
      result.clientRemaining = clientRemaining.toString();
      result.netProfitAdmin = adminShare.toString();
      result.adminShare50 = (adminShare / 2).toString();
      result.catShare50 = (adminShare / 2).toString();
      break;
    }
    case 'partner_10': {
      const commissionRate = 10;
      const commissionAmount = clientBill * 0.10;
      const amountToAdmin = clientBill * 0.90;
      const netProfitAdmin = amountToAdmin - executorExpenses;
      
      result.commissionRate = commissionRate.toString();
      result.commissionAmount = commissionAmount.toString();
      result.amountToAdmin = amountToAdmin.toString();
      result.netProfitAdmin = netProfitAdmin.toString();
      result.adminShare50 = (netProfitAdmin / 2).toString();
      result.catShare50 = (netProfitAdmin / 2).toString();
      break;
    }
    case 'partner_15': {
      const commissionRate = 15;
      const commissionAmount = clientBill * 0.15;
      const amountToAdmin = clientBill * 0.85;
      const netProfitAdmin = amountToAdmin - executorExpenses;
      
      result.commissionRate = commissionRate.toString();
      result.commissionAmount = commissionAmount.toString();
      result.amountToAdmin = amountToAdmin.toString();
      result.netProfitAdmin = netProfitAdmin.toString();
      result.adminShare50 = (netProfitAdmin / 2).toString();
      result.catShare50 = (netProfitAdmin / 2).toString();
      break;
    }
    case 'vika_ie_7': {
      const taxAmount = clientBill * 0.07;
      const amountAfterTax = clientBill * 0.93;
      const netProfitAdmin = amountAfterTax - executorExpenses;
      
      result.amountToAdmin = amountAfterTax.toString();
      result.netProfitAdmin = netProfitAdmin.toString();
      result.adminShare50 = (netProfitAdmin / 2).toString();
      result.catShare50 = (netProfitAdmin / 2).toString();
      break;
    }
    case 'commission_based':
    default: {
      const commissionRate = partnerCommissionRate || 10;
      const commissionAmount = clientBill * (commissionRate / 100);
      const amountToAdmin = clientBill - commissionAmount;
      const netProfitAdmin = amountToAdmin - executorExpenses;
      
      result.commissionRate = commissionRate.toString();
      result.commissionAmount = commissionAmount.toString();
      result.amountToAdmin = amountToAdmin.toString();
      result.netProfitAdmin = netProfitAdmin.toString();
      result.adminShare50 = (netProfitAdmin / 2).toString();
      result.catShare50 = (netProfitAdmin / 2).toString();
      break;
    }
  }

  return result;
}

export interface IStorage {
  verifyAccessCode(code: string): Promise<AccessToken | null>;
  createSession(tokenId: string, ipAddress?: string, userAgent?: string): Promise<{ sessionId: string; csrfToken: string; expiresAt: Date }>;
  validateSession(sessionId: string, csrfToken?: string): Promise<{ isValid: boolean; token?: AccessToken } | null>;
  refreshSession(sessionId: string): Promise<Date | null>;
  revokeSession(sessionId: string): Promise<void>;
  
  getPartners(): Promise<Partner[]>;
  getPartner(id: string): Promise<Partner | null>;
  createPartner(partner: InsertPartner): Promise<Partner>;
  updatePartner(id: string, partner: Partial<InsertPartner>): Promise<Partner | null>;
  deletePartner(id: string): Promise<{ success: boolean; error?: string }>;
  getPartnerClients(partnerId: string): Promise<Client[]>;
  
  getClients(partnerId?: string): Promise<Client[]>;
  getClient(id: string): Promise<Client | null>;
  getClientWithPartner(id: string): Promise<(Client & { partner?: Partner }) | null>;
  getClientPartners(clientId: string): Promise<Partner[]>;
  getClientsWithPartners(): Promise<(Client & { partners: Partner[] })[]>;
  setClientPartners(clientId: string, partnerIds: string[]): Promise<void>;
  createClient(client: InsertClient): Promise<Client>;
  updateClient(id: string, client: Partial<InsertClient>): Promise<Client | null>;
  deleteClient(id: string): Promise<{ success: boolean; error?: string }>;
  
  getInvoices(role: UserRole, partnerId?: string, clientId?: string): Promise<(Invoice & { calculations?: InvoiceCalculation; partner?: Partner; client?: Client })[]>;
  getInvoice(id: string): Promise<(Invoice & { calculations?: InvoiceCalculation; partner?: Partner; client?: Client }) | null>;
  createInvoice(invoice: InsertInvoice, calculations: Partial<InvoiceCalculation>): Promise<Invoice>;
  updateInvoice(id: string, invoice: Partial<InsertInvoice>): Promise<Invoice | null>;
  updateInvoiceCalculations(invoiceId: string, calculations: Partial<InvoiceCalculation>): Promise<InvoiceCalculation | null>;
  deleteInvoice(id: string): Promise<void>;
  
  getInvoiceExpenses(invoiceId: string): Promise<InvoiceExpense[]>;
  createInvoiceExpense(expense: InsertInvoiceExpense): Promise<InvoiceExpense>;
  updateInvoiceExpense(id: string, updates: Partial<InsertInvoiceExpense>): Promise<InvoiceExpense | null>;
  deleteInvoiceExpense(id: string): Promise<void>;
  
  deleteDocument(id: string): Promise<void>;
  
  getPartnerPayments(partnerId?: string): Promise<PartnerPayment[]>;
  createPartnerPayment(payment: InsertPartnerPayment): Promise<PartnerPayment>;
  
  getAccessTokens(): Promise<AccessToken[]>;
  createAccessToken(code: string, role: UserRole, partnerId?: string, clientId?: string): Promise<AccessToken>;
  deleteAccessToken(id: string): Promise<void>;
  
  getDashboardStats(role: UserRole, partnerId?: string, clientId?: string): Promise<DashboardStats>;
  
  // Analytics methods
  getAdminMonthlyData(year: number): Promise<MonthlyData[]>;
  getAdminForecast(monthsAhead: number): Promise<ForecastData[]>;
  getOverdueInvoices(): Promise<OverdueInvoice[]>;
}

export interface MonthlyData {
  monthNumber: number;
  totalSales: number;
  totalProfit: number;
  invoiceCount: number;
  expenses: number;
}

export interface ForecastData {
  monthIndex: number;
  monthName: string;
  yearNum: number;
  expectedAmount: number;
  receivedAmount: number;
}

export interface OverdueInvoice {
  id: string;
  invoiceNumber: string;
  paymentDate: string;
  clientName: string;
  partnerName: string;
  amount: number;
  daysOverdue: number;
}

export interface DashboardStats {
  totalInvoices: number;
  paidInvoices: number;
  pendingInvoices: number;
  overdueInvoices: number;
  totalClientBill: number;
  paidClientBill: number;
  pendingClientBill: number;
  totalExpenses: number;
  totalPartnerCommission?: number;
  totalAdminShare?: number;
  totalNetProfit?: number;
  partnerDebt?: number;
  clientRemaining?: number;
}

export class DatabaseStorage implements IStorage {
  async verifyAccessCode(code: string): Promise<AccessToken | null> {
    const [token] = await db
      .select()
      .from(accessTokens)
      .where(and(
        eq(accessTokens.code, code),
        eq(accessTokens.isActive, true)
      ))
      .limit(1);
    
    if (token) {
      await db.update(accessTokens)
        .set({ lastUsedAt: new Date() })
        .where(eq(accessTokens.id, token.id));
    }
    
    return token || null;
  }

  async createSession(tokenId: string, ipAddress?: string, userAgent?: string): Promise<{ sessionId: string; csrfToken: string; expiresAt: Date }> {
    const sessionId = randomBytes(32).toString('base64');
    const csrfToken = randomBytes(32).toString('base64');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    
    await db.insert(userSessions).values({
      sessionId,
      accessTokenId: tokenId,
      csrfToken,
      ipAddress,
      userAgent,
      expiresAt,
    });
    
    return { sessionId, csrfToken, expiresAt };
  }

  async validateSession(sessionId: string, csrfToken?: string): Promise<{ isValid: boolean; token?: AccessToken } | null> {
    const [session] = await db
      .select()
      .from(userSessions)
      .where(and(
        eq(userSessions.sessionId, sessionId),
        eq(userSessions.revoked, false),
        gte(userSessions.expiresAt, new Date())
      ))
      .limit(1);
    
    if (!session) {
      return { isValid: false };
    }
    
    if (csrfToken && session.csrfToken !== csrfToken) {
      return { isValid: false };
    }
    
    await db.update(userSessions)
      .set({ lastActivity: new Date() })
      .where(eq(userSessions.id, session.id));
    
    const [token] = await db
      .select()
      .from(accessTokens)
      .where(and(
        eq(accessTokens.id, session.accessTokenId),
        eq(accessTokens.isActive, true)
      ))
      .limit(1);
    
    if (!token) {
      return { isValid: false };
    }
    
    return { isValid: true, token };
  }

  async refreshSession(sessionId: string): Promise<Date | null> {
    const newExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
    
    const result = await db.update(userSessions)
      .set({ 
        expiresAt: newExpiresAt,
        lastActivity: new Date()
      })
      .where(and(
        eq(userSessions.sessionId, sessionId),
        eq(userSessions.revoked, false),
        gte(userSessions.expiresAt, new Date())
      ))
      .returning();
    
    return result.length > 0 ? newExpiresAt : null;
  }

  async revokeSession(sessionId: string): Promise<void> {
    await db.update(userSessions)
      .set({ revoked: true })
      .where(eq(userSessions.sessionId, sessionId));
  }

  async getPartners(): Promise<Partner[]> {
    return db.select().from(partners).orderBy(partners.name);
  }

  async getPartner(id: string): Promise<Partner | null> {
    const [partner] = await db.select().from(partners).where(eq(partners.id, id)).limit(1);
    return partner || null;
  }

  async createPartner(partner: InsertPartner): Promise<Partner> {
    const [created] = await db.insert(partners).values(partner).returning();
    return created;
  }

  async updatePartner(id: string, partner: Partial<InsertPartner>): Promise<Partner | null> {
    const [updated] = await db.update(partners)
      .set({ ...partner, updatedAt: new Date() })
      .where(eq(partners.id, id))
      .returning();
    return updated || null;
  }

  async deletePartner(id: string): Promise<{ success: boolean; error?: string }> {
    const linkedInvoices = await db.select({ id: invoices.id })
      .from(invoices)
      .where(eq(invoices.partnerId, id))
      .limit(1);
    
    if (linkedInvoices.length > 0) {
      return { success: false, error: "Нельзя удалить партнёра: есть связанные счета" };
    }
    
    const linkedClients = await db.select({ id: clientPartners.clientId })
      .from(clientPartners)
      .where(eq(clientPartners.partnerId, id))
      .limit(1);
    
    if (linkedClients.length > 0) {
      return { success: false, error: "Нельзя удалить партнёра: есть связанные клиенты" };
    }
    
    await db.delete(accessTokens).where(eq(accessTokens.partnerId, id));
    await db.delete(partners).where(eq(partners.id, id));
    
    return { success: true };
  }

  async getPartnerClients(partnerId: string): Promise<Client[]> {
    const results = await db
      .select({ client: clients })
      .from(clientPartners)
      .innerJoin(clients, eq(clientPartners.clientId, clients.id))
      .where(eq(clientPartners.partnerId, partnerId))
      .orderBy(clients.name);
    
    return results.map(r => r.client);
  }

  async getClients(partnerId?: string): Promise<Client[]> {
    if (partnerId) {
      return db.select().from(clients).where(eq(clients.partnerId, partnerId)).orderBy(clients.name);
    }
    return db.select().from(clients).orderBy(clients.name);
  }

  async getClient(id: string): Promise<Client | null> {
    const [client] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
    return client || null;
  }

  async createClient(client: InsertClient): Promise<Client> {
    const [created] = await db.insert(clients).values(client).returning();
    return created;
  }

  async updateClient(id: string, client: Partial<InsertClient>): Promise<Client | null> {
    const [updated] = await db.update(clients)
      .set({ ...client, updatedAt: new Date() })
      .where(eq(clients.id, id))
      .returning();
    return updated || null;
  }

  async getClientWithPartner(id: string): Promise<(Client & { partner?: Partner }) | null> {
    const [result] = await db
      .select({
        client: clients,
        partner: partners,
      })
      .from(clients)
      .leftJoin(partners, eq(clients.partnerId, partners.id))
      .where(eq(clients.id, id))
      .limit(1);
    
    if (!result) return null;
    
    return {
      ...result.client,
      partner: result.partner || undefined,
    };
  }

  async getClientPartners(clientId: string): Promise<Partner[]> {
    const results = await db
      .select({ partner: partners })
      .from(clientPartners)
      .innerJoin(partners, eq(clientPartners.partnerId, partners.id))
      .where(eq(clientPartners.clientId, clientId))
      .orderBy(partners.name);
    
    return results.map(r => r.partner);
  }

  async getClientsWithPartners(): Promise<(Client & { partners: Partner[] })[]> {
    const allClients = await db.select().from(clients).orderBy(clients.name);
    
    const clientsWithPartners = await Promise.all(
      allClients.map(async (client) => {
        const clientPartnerList = await this.getClientPartners(client.id);
        return {
          ...client,
          partners: clientPartnerList,
        };
      })
    );
    
    return clientsWithPartners;
  }

  async setClientPartners(clientId: string, partnerIds: string[]): Promise<void> {
    await db.delete(clientPartners).where(eq(clientPartners.clientId, clientId));
    
    if (partnerIds.length > 0) {
      await db.insert(clientPartners).values(
        partnerIds.map(partnerId => ({
          clientId,
          partnerId,
        }))
      );
    }
    
    if (partnerIds.length === 1) {
      await db.update(clients)
        .set({ partnerId: partnerIds[0], updatedAt: new Date() })
        .where(eq(clients.id, clientId));
    } else if (partnerIds.length === 0) {
      await db.update(clients)
        .set({ partnerId: null, updatedAt: new Date() })
        .where(eq(clients.id, clientId));
    }
  }

  async deleteClient(id: string): Promise<{ success: boolean; error?: string }> {
    const linkedInvoices = await db.select({ id: invoices.id })
      .from(invoices)
      .where(eq(invoices.clientId, id))
      .limit(1);
    
    if (linkedInvoices.length > 0) {
      return { success: false, error: "Нельзя удалить клиента: есть связанные счета" };
    }
    
    await db.delete(clientPartners).where(eq(clientPartners.clientId, id));
    await db.delete(accessTokens).where(eq(accessTokens.clientId, id));
    await db.delete(clients).where(eq(clients.id, id));
    
    return { success: true };
  }

  async getInvoices(role: UserRole, partnerId?: string, clientId?: string): Promise<(Invoice & { calculations?: InvoiceCalculation; partner?: Partner; client?: Client })[]> {
    const baseQuery = db
      .select({
        invoice: invoices,
        calculations: invoiceCalculations,
        partner: partners,
        client: clients,
      })
      .from(invoices)
      .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
      .leftJoin(partners, eq(invoices.partnerId, partners.id))
      .leftJoin(clients, eq(invoices.clientId, clients.id))
      .orderBy(desc(invoices.createdAt));
    
    let results;
    if (partnerId) {
      results = await baseQuery.where(eq(invoices.partnerId, partnerId));
    } else if (role === 'client' && clientId) {
      results = await baseQuery.where(eq(invoices.clientId, clientId));
    } else {
      results = await baseQuery;
    }
    
    return results.map(r => ({
      ...r.invoice,
      calculations: r.calculations || undefined,
      partner: r.partner || undefined,
      client: r.client || undefined,
    }));
  }

  async getInvoice(id: string): Promise<(Invoice & { calculations?: InvoiceCalculation; partner?: Partner; client?: Client }) | null> {
    const [result] = await db
      .select({
        invoice: invoices,
        calculations: invoiceCalculations,
        partner: partners,
        client: clients,
      })
      .from(invoices)
      .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
      .leftJoin(partners, eq(invoices.partnerId, partners.id))
      .leftJoin(clients, eq(invoices.clientId, clients.id))
      .where(eq(invoices.id, id))
      .limit(1);
    
    if (!result) return null;
    
    return {
      ...result.invoice,
      calculations: result.calculations || undefined,
      partner: result.partner || undefined,
      client: result.client || undefined,
    };
  }

  async createInvoice(invoice: InsertInvoice, calculations: Partial<InvoiceCalculation>): Promise<Invoice> {
    const [created] = await db.insert(invoices).values(invoice).returning();
    
    // Auto-calculate all fields based on scheme
    const clientBill = parseFloat(calculations.clientBill || "0");
    const commissionRate = calculations.commissionRate ? parseFloat(calculations.commissionRate) : undefined;
    const executorExpenses = parseFloat(calculations.executorExpensesTotal || "0");
    
    const computed = calculateInvoiceServer(
      created.scheme as InvoiceScheme,
      clientBill,
      commissionRate,
      executorExpenses
    );
    
    await db.insert(invoiceCalculations).values({
      invoiceId: created.id,
      clientBill: computed.clientBill || "0",
      ...computed,
    });
    
    return created;
  }

  async updateInvoice(id: string, invoice: Partial<InsertInvoice>): Promise<Invoice | null> {
    const [updated] = await db.update(invoices)
      .set({ ...invoice, updatedAt: new Date() })
      .where(eq(invoices.id, id))
      .returning();
    return updated || null;
  }

  async updateInvoiceCalculations(invoiceId: string, calculations: Partial<InvoiceCalculation>): Promise<InvoiceCalculation | null> {
    // Get the invoice to know the scheme
    const invoice = await this.getInvoice(invoiceId);
    if (!invoice) return null;
    
    const [existing] = await db
      .select()
      .from(invoiceCalculations)
      .where(eq(invoiceCalculations.invoiceId, invoiceId))
      .limit(1);
    
    // Get current values or use new ones
    const clientBill = calculations.clientBill 
      ? parseFloat(calculations.clientBill) 
      : (existing?.clientBill ? parseFloat(existing.clientBill) : 0);
    const commissionRate = calculations.commissionRate 
      ? parseFloat(calculations.commissionRate) 
      : (existing?.commissionRate ? parseFloat(existing.commissionRate) : undefined);
    const executorExpenses = calculations.executorExpensesTotal 
      ? parseFloat(calculations.executorExpensesTotal)
      : (existing?.executorExpensesTotal ? parseFloat(existing.executorExpensesTotal) : 0);
    
    // Recalculate all fields
    const computed = calculateInvoiceServer(
      invoice.scheme as InvoiceScheme,
      clientBill,
      commissionRate,
      executorExpenses
    );
    
    if (existing) {
      const [updated] = await db.update(invoiceCalculations)
        .set({ ...computed, updatedAt: new Date() })
        .where(eq(invoiceCalculations.invoiceId, invoiceId))
        .returning();
      return updated || null;
    } else {
      const [created] = await db.insert(invoiceCalculations)
        .values({
          invoiceId,
          clientBill: computed.clientBill || "0",
          ...computed,
        })
        .returning();
      return created;
    }
  }

  async getInvoiceExpenses(invoiceId: string): Promise<InvoiceExpense[]> {
    return db
      .select()
      .from(invoiceExpenses)
      .where(eq(invoiceExpenses.invoiceId, invoiceId))
      .orderBy(desc(invoiceExpenses.date));
  }

  async createInvoiceExpense(expense: InsertInvoiceExpense): Promise<InvoiceExpense> {
    const [created] = await db.insert(invoiceExpenses).values(expense).returning();
    
    // Recalculate with new total expenses
    const expenses = await this.getInvoiceExpenses(expense.invoiceId);
    const total = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
    
    await this.updateInvoiceCalculations(expense.invoiceId, {
      executorExpensesTotal: total.toString()
    });
    
    return created;
  }

  async updateInvoiceExpense(id: string, updates: Partial<InsertInvoiceExpense>): Promise<InvoiceExpense | null> {
    const [expense] = await db
      .select()
      .from(invoiceExpenses)
      .where(eq(invoiceExpenses.id, id))
      .limit(1);
    
    if (!expense) return null;
    
    const [updated] = await db.update(invoiceExpenses)
      .set(updates)
      .where(eq(invoiceExpenses.id, id))
      .returning();
    
    // Recalculate with updated total expenses
    const expenses = await this.getInvoiceExpenses(expense.invoiceId);
    const total = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
    
    await this.updateInvoiceCalculations(expense.invoiceId, {
      executorExpensesTotal: total.toString()
    });
    
    return updated || null;
  }

  async deleteInvoiceExpense(id: string): Promise<void> {
    const [expense] = await db
      .select()
      .from(invoiceExpenses)
      .where(eq(invoiceExpenses.id, id))
      .limit(1);
    
    if (expense) {
      await db.delete(invoiceExpenses).where(eq(invoiceExpenses.id, id));
      
      // Recalculate with updated total expenses
      const expenses = await this.getInvoiceExpenses(expense.invoiceId);
      const total = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
      
      await this.updateInvoiceCalculations(expense.invoiceId, {
        executorExpensesTotal: total.toString()
      });
    }
  }

  async deleteInvoice(id: string): Promise<void> {
    await db.delete(invoiceExpenses).where(eq(invoiceExpenses.invoiceId, id));
    await db.delete(invoiceCalculations).where(eq(invoiceCalculations.invoiceId, id));
    await db.delete(invoices).where(eq(invoices.id, id));
  }

  async deleteDocument(id: string): Promise<void> {
    await db.execute(sql`DELETE FROM invoice_documents WHERE id = ${id}`);
  }

  async getPartnerPayments(partnerId?: string): Promise<PartnerPayment[]> {
    if (partnerId) {
      return db.select().from(partnerPayments)
        .where(eq(partnerPayments.partnerId, partnerId))
        .orderBy(desc(partnerPayments.paymentDate));
    }
    return db.select().from(partnerPayments).orderBy(desc(partnerPayments.paymentDate));
  }

  async createPartnerPayment(payment: InsertPartnerPayment): Promise<PartnerPayment> {
    const [created] = await db.insert(partnerPayments).values(payment).returning();
    return created;
  }

  async getAccessTokens(): Promise<(AccessToken & { partnerName?: string; clientName?: string })[]> {
    const results = await db
      .select({
        token: accessTokens,
        partnerName: partners.name,
        clientName: clients.name,
      })
      .from(accessTokens)
      .leftJoin(partners, eq(accessTokens.partnerId, partners.id))
      .leftJoin(clients, eq(accessTokens.clientId, clients.id))
      .orderBy(desc(accessTokens.createdAt));
    
    return results.map(r => ({
      ...r.token,
      partnerName: r.partnerName ?? undefined,
      clientName: r.clientName ?? undefined,
    }));
  }

  async createAccessToken(code: string, role: UserRole, partnerId?: string, clientId?: string): Promise<AccessToken> {
    const [created] = await db.insert(accessTokens).values({
      code,
      role,
      partnerId,
      clientId,
    }).returning();
    return created;
  }

  async deleteAccessToken(id: string): Promise<void> {
    await db.delete(accessTokens).where(eq(accessTokens.id, id));
  }

  async getDashboardStats(role: UserRole, partnerId?: string, clientId?: string): Promise<DashboardStats> {
    let query = db
      .select({
        invoice: invoices,
        calculations: invoiceCalculations,
      })
      .from(invoices)
      .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId));
    
    let results;
    if (role === 'partner' && partnerId) {
      results = await query.where(eq(invoices.partnerId, partnerId));
    } else if (role === 'client' && clientId) {
      results = await query.where(eq(invoices.clientId, clientId));
    } else {
      results = await query;
    }
    
    const today = new Date();
    let totalInvoices = 0;
    let paidInvoices = 0;
    let pendingInvoices = 0;
    let overdueInvoices = 0;
    let totalClientBill = 0;
    let paidClientBill = 0;
    let pendingClientBill = 0;
    let totalExpenses = 0;
    let totalPartnerCommission = 0;
    let totalAdminShare = 0;
    let totalNetProfit = 0;
    let clientRemaining = 0;
    
    for (const r of results) {
      const inv = r.invoice;
      const calc = r.calculations;
      
      totalInvoices++;
      const clientBill = calc ? parseFloat(calc.clientBill || "0") : 0;
      const expenses = calc ? parseFloat(calc.executorExpensesTotal || "0") : 0;
      
      totalClientBill += clientBill;
      totalExpenses += expenses;
      
      if (inv.status === 'paid') {
        paidInvoices++;
        paidClientBill += clientBill;
      } else {
        pendingInvoices++;
        pendingClientBill += clientBill;
        
        if (inv.paymentDueDate && new Date(inv.paymentDueDate) < today) {
          overdueInvoices++;
        }
      }
      
      if (calc) {
        const scheme = inv.scheme;
        
        if (scheme === 'agency_30') {
          // Agency 30%: 15% to partner, 15% to admin (both from margin)
          totalPartnerCommission += parseFloat(calc.partnerShareFromMargin || "0");
          totalAdminShare += parseFloat(calc.adminShareFromMargin || "0");
          clientRemaining += parseFloat(calc.clientBaseAfterMargin || "0") - expenses;
        } else if (scheme === 'vika_ie_7') {
          // ИП Вики: No partner, all goes to admin after 7% tax
          // amountAfterTax = clientBill * 0.93
          const amountAfterTax = clientBill * 0.93;
          totalAdminShare += amountAfterTax;
          // No partner commission for this scheme
        } else {
          // partner_10, partner_15, commission_based
          totalPartnerCommission += parseFloat(calc.commissionAmount || "0");
          totalAdminShare += parseFloat(calc.amountToAdmin || "0");
          clientRemaining += parseFloat(calc.clientRemaining || "0");
        }
        
        totalNetProfit += parseFloat(calc.netProfitAdmin || "0");
      }
    }
    
    let partnerDebt = 0;
    if (role === 'partner' && partnerId) {
      const payments = await this.getPartnerPayments(partnerId);
      const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
      
      let debtToAdmin = 0;
      for (const r of results) {
        if (r.invoice.status === 'paid' && r.calculations) {
          const scheme = r.invoice.scheme;
          const clientBill = parseFloat(r.calculations.clientBill || "0");
          
          if (scheme === 'agency_30') {
            // Agency 30%: Partner owes admin their 15% share (adminShareFromMargin)
            debtToAdmin += parseFloat(r.calculations.adminShareFromMargin || "0");
          } else if (scheme === 'vika_ie_7') {
            // ИП Вики: No partner involvement, debt = 0
            // Skip
          } else {
            // partner_10, partner_15, commission_based:
            // Partner owes admin: clientBill - commission (amountToAdmin)
            debtToAdmin += parseFloat(r.calculations.amountToAdmin || "0");
          }
        }
      }
      partnerDebt = debtToAdmin - totalPaid;
    }
    
    const stats: DashboardStats = {
      totalInvoices,
      paidInvoices,
      pendingInvoices,
      overdueInvoices,
      totalClientBill,
      paidClientBill,
      pendingClientBill,
      totalExpenses,
    };
    
    if (role === 'admin') {
      stats.totalPartnerCommission = totalPartnerCommission;
      stats.totalAdminShare = totalAdminShare;
      stats.totalNetProfit = totalNetProfit;
      stats.clientRemaining = clientRemaining;
    } else if (role === 'partner') {
      stats.totalPartnerCommission = totalPartnerCommission;
      stats.partnerDebt = partnerDebt;
      stats.clientRemaining = clientRemaining;
    } else if (role === 'client') {
      stats.clientRemaining = Math.max(0, clientRemaining);
    }
    
    return stats;
  }

  async getPartnerDebtSummaries(): Promise<{
    partnerId: string;
    partnerName: string;
    totalToTransfer: number;
    totalPaid: number;
    remaining: number;
    invoiceCount: number;
  }[]> {
    const paidInvoices = await db
      .select({
        invoice: invoices,
        calculations: invoiceCalculations,
        partnerName: partners.name,
      })
      .from(invoices)
      .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
      .leftJoin(partners, eq(invoices.partnerId, partners.id))
      .where(eq(invoices.status, 'paid'));

    const allPayments = await db.select().from(partnerPayments);
    
    // Get all expenses to calculate paidByAdmin vs paidByPartner
    const allExpenses = await db.select().from(invoiceExpenses);
    const expensesByInvoice = new Map<string, { byPartner: number; byAdmin: number }>();
    
    for (const exp of allExpenses) {
      if (!expensesByInvoice.has(exp.invoiceId)) {
        expensesByInvoice.set(exp.invoiceId, { byPartner: 0, byAdmin: 0 });
      }
      const amounts = expensesByInvoice.get(exp.invoiceId)!;
      const amount = parseFloat(exp.amount);
      if (exp.paidByAdmin) {
        amounts.byAdmin += amount;
      } else {
        amounts.byPartner += amount;
      }
    }

    const partnerMap = new Map<string, {
      partnerId: string;
      partnerName: string;
      totalToTransfer: number;
      totalPaid: number;
      remaining: number;
      invoiceCount: number;
    }>();

    for (const row of paidInvoices) {
      if (!row.invoice.partnerId || !row.calculations) continue;
      
      const pid = row.invoice.partnerId;
      const pName = row.partnerName || 'Unknown';
      const scheme = row.invoice.scheme;
      
      const cBill = parseFloat(row.calculations.clientBill || "0");
      const expenses = expensesByInvoice.get(row.invoice.id) || { byPartner: 0, byAdmin: 0 };
      let debt = 0;

      if (scheme === 'agency_30') {
        // Agency 30%: Partner owes admin 15% (admin's share), fixed regardless of expenses
        // 70% stays with partner for client's external services
        debt = cBill * 0.15; // Admin's share from margin
      } else if (scheme === 'vika_ie_7') {
        // ИП Вики: No partner involved
        debt = 0;
      } else {
        // Partner schemes (partner_10, partner_15, commission_based):
        // Partner debt = clientBill - partnerCommission - expensesPaidByPartner
        // If admin paid expenses, they don't reduce partner's debt
        let commissionRate: number;
        if (scheme === 'partner_10') {
          commissionRate = 0.10;
        } else if (scheme === 'partner_15') {
          commissionRate = 0.15;
        } else {
          // commission_based - calculate from stored commission
          const comm = parseFloat(row.calculations.commissionAmount || "0");
          commissionRate = cBill > 0 ? comm / cBill : 0.10;
        }
        
        const partnerCommission = cBill * commissionRate;
        debt = cBill - partnerCommission - expenses.byPartner;
      }

      if (!partnerMap.has(pid)) {
        partnerMap.set(pid, {
          partnerId: pid,
          partnerName: pName,
          totalToTransfer: 0,
          totalPaid: 0,
          remaining: 0,
          invoiceCount: 0,
        });
      }

      const summary = partnerMap.get(pid)!;
      summary.totalToTransfer += debt;
      summary.invoiceCount += 1;
    }

    for (const payment of allPayments) {
      if (partnerMap.has(payment.partnerId)) {
        const summary = partnerMap.get(payment.partnerId)!;
        summary.totalPaid += parseFloat(payment.amount);
      }
    }

    // Include ALL partners, not just those with debt
    const allPartners = await db.select().from(partners);
    
    for (const partner of allPartners) {
      if (!partnerMap.has(partner.id)) {
        partnerMap.set(partner.id, {
          partnerId: partner.id,
          partnerName: partner.name,
          totalToTransfer: 0,
          totalPaid: 0,
          remaining: 0,
          invoiceCount: 0,
        });
      }
    }
    
    // Add payments even for partners without invoices
    for (const payment of allPayments) {
      if (partnerMap.has(payment.partnerId)) {
        const summary = partnerMap.get(payment.partnerId)!;
        // Already added above, but ensure we capture all payments
      }
    }

    return Array.from(partnerMap.values())
      .map(s => ({
        ...s,
        remaining: Math.max(0, s.totalToTransfer - s.totalPaid),
      }))
      .sort((a, b) => {
        // Sort by remaining debt descending, then by name
        if (b.remaining !== a.remaining) return b.remaining - a.remaining;
        return a.partnerName.localeCompare(b.partnerName);
      });
  }

  async getDoNotSpendData(): Promise<{
    clientId: string;
    clientName: string;
    totalBudget: number;
    totalSpent: number;
    remaining: number;
    invoiceCount: number;
  }[]> {
    const agency30Invoices = await db
      .select({
        invoice: invoices,
        calculations: invoiceCalculations,
        clientName: clients.name,
      })
      .from(invoices)
      .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
      .leftJoin(clients, eq(invoices.clientId, clients.id))
      .where(and(
        eq(invoices.scheme, 'agency_30'),
        inArray(invoices.status, ['paid', 'sent'])
      ));

    const clientMap = new Map<string, {
      clientId: string;
      clientName: string;
      totalBudget: number;
      totalSpent: number;
      remaining: number;
      invoiceCount: number;
    }>();

    for (const row of agency30Invoices) {
      if (!row.invoice.clientId || !row.calculations) continue;

      const clientId = row.invoice.clientId;
      const clientName = row.clientName || 'Unknown';
      const clientBill = parseFloat(row.calculations.clientBill || "0");
      const executorExpenses = parseFloat(row.calculations.executorExpensesTotal || "0");
      
      const clientBase = clientBill * 0.7;
      const doNotSpendBudget = clientBase;
      
      if (!clientMap.has(clientId)) {
        clientMap.set(clientId, {
          clientId,
          clientName,
          totalBudget: 0,
          totalSpent: 0,
          remaining: 0,
          invoiceCount: 0,
        });
      }

      const summary = clientMap.get(clientId)!;
      summary.totalBudget += doNotSpendBudget;
      summary.totalSpent += executorExpenses;
      summary.invoiceCount += 1;
    }

    return Array.from(clientMap.values())
      .map(s => ({
        ...s,
        remaining: Math.max(0, s.totalBudget - s.totalSpent),
      }))
      .filter(s => s.totalBudget > 0)
      .sort((a, b) => b.remaining - a.remaining);
  }
  
  async getAdminDashboardStats(): Promise<{
    yearlySummary: {
      totalProfit: number;
      totalWithdrawn: number;
      remaining: number;
    };
    monthlyCashFlow: {
      received: number;
      expected: number;
    };
    monthlySales: {
      draftsCount: number;
      draftsTotal: number;
    };
    withdrawnThisMonth: number;
    leverage: {
      othersProfit: number;
      vikaProfit: number;
      ratio: number;
    };
  }> {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const monthStart = new Date(currentYear, currentMonth, 1);
    const monthEnd = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59);
    const yearStart = new Date(currentYear, 0, 1);
    
    // Get all invoices with calculations
    const allInvoices = await db
      .select({
        invoice: invoices,
        calculations: invoiceCalculations,
        partnerName: partners.name,
      })
      .from(invoices)
      .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
      .leftJoin(partners, eq(invoices.partnerId, partners.id));
    
    // Get all partner payments
    const allPayments = await db.select().from(partnerPayments);
    
    // Calculate yearly profit and cash flow
    let yearlyProfit = 0;
    let monthlyReceived = 0;
    let monthlyExpected = 0;
    let vikaProfit = 0;
    let othersProfit = 0;
    
    for (const row of allInvoices) {
      if (!row.calculations) continue;
      
      const scheme = row.invoice.scheme;
      const status = row.invoice.status;
      // Use paymentDate for paid invoices, fallback to createdAt
      const paymentDate = row.invoice.paymentDate 
        ? new Date(row.invoice.paymentDate) 
        : (row.invoice.createdAt ? new Date(row.invoice.createdAt) : null);
      const createdAt = row.invoice.createdAt ? new Date(row.invoice.createdAt) : null;
      
      // Use appropriate cash field based on scheme
      // agency_30: admin receives adminShareFromMargin (15% of clientBill)
      // other schemes: admin receives amountToAdmin
      let cashToAdmin: number;
      if (scheme === 'agency_30') {
        cashToAdmin = parseFloat(row.calculations.adminShareFromMargin || "0");
      } else if (scheme === 'vika_ie_7') {
        // ИП Вики - all goes to admin
        cashToAdmin = parseFloat(row.calculations.clientBill || "0");
      } else {
        cashToAdmin = parseFloat(row.calculations.amountToAdmin || "0");
      }
      // Use netProfitAdmin for profit metrics
      const netProfit = parseFloat(row.calculations.netProfitAdmin || "0");
      
      const isVika = row.partnerName?.toLowerCase().includes("вика уткина") || 
                     row.partnerName?.toLowerCase().includes("vika utkina");
      
      // Only count paid invoices for cash flow and profit
      if (status === 'paid') {
        // Yearly profit - based on payment date
        if (paymentDate && paymentDate >= yearStart) {
          yearlyProfit += netProfit;
        }
        
        // Monthly cash flow - based on payment date, use cashToAdmin (actual cash)
        if (paymentDate && paymentDate >= monthStart && paymentDate <= monthEnd) {
          monthlyReceived += cashToAdmin;
        }
        
        // Leverage calculation - all paid invoices
        if (isVika || scheme === 'vika_ie_7') {
          vikaProfit += netProfit;
        } else {
          othersProfit += netProfit;
        }
      }
      
      // Expected this month - sent invoices (use cashToAdmin for expected cash)
      if (status === 'sent' && createdAt && createdAt >= monthStart && createdAt <= monthEnd) {
        monthlyExpected += cashToAdmin;
      }
    }
    
    // Drafts (sales pipeline) - count invoices with status 'draft' (sent/paid are not drafts)
    const drafts = allInvoices.filter(row => 
      row.invoice.status !== 'paid' && row.invoice.status !== 'sent' && row.invoice.status !== 'cancelled'
    );
    const draftsCount = drafts.length;
    const draftsTotal = drafts.reduce((sum, row) => {
      return sum + parseFloat(row.calculations?.clientBill || "0");
    }, 0);
    
    // Partner payments this month (withdrawn)
    const monthlyPayments = allPayments.filter(p => {
      const paymentDate = new Date(p.paymentDate);
      return paymentDate >= monthStart && paymentDate <= monthEnd;
    });
    const withdrawnThisMonth = monthlyPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
    
    // Total withdrawn (all time)
    const totalWithdrawn = allPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
    
    // Leverage ratio
    const leverageRatio = vikaProfit > 0 ? othersProfit / vikaProfit : 0;
    
    return {
      yearlySummary: {
        totalProfit: yearlyProfit,
        totalWithdrawn: totalWithdrawn,
        remaining: yearlyProfit - totalWithdrawn,
      },
      monthlyCashFlow: {
        received: monthlyReceived,
        expected: monthlyExpected,
      },
      monthlySales: {
        draftsCount,
        draftsTotal,
      },
      withdrawnThisMonth,
      leverage: {
        othersProfit,
        vikaProfit,
        ratio: leverageRatio,
      },
    };
  }
  
  async getAdminMonthlyData(year: number): Promise<MonthlyData[]> {
    const monthNames = [
      "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
      "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
    ];
    
    // Initialize all 12 months with zeros
    const monthlyData: MonthlyData[] = monthNames.map((_, i) => ({
      monthNumber: i + 1,
      totalSales: 0,
      totalProfit: 0,
      invoiceCount: 0,
      expenses: 0,
    }));
    
    // Get all paid invoices for the year
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31, 23, 59, 59);
    
    const allInvoices = await db
      .select({
        invoice: invoices,
        calculations: invoiceCalculations,
      })
      .from(invoices)
      .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
      .where(eq(invoices.status, 'paid'));
    
    // Get all expenses
    const allExpenses = await db.select().from(invoiceExpenses);
    const expensesByInvoice = new Map<string, number>();
    for (const exp of allExpenses) {
      const current = expensesByInvoice.get(exp.invoiceId) || 0;
      expensesByInvoice.set(exp.invoiceId, current + parseFloat(exp.amount));
    }
    
    for (const row of allInvoices) {
      if (!row.calculations) continue;
      
      // Use paymentDate for grouping
      const paymentDate = row.invoice.paymentDate 
        ? new Date(row.invoice.paymentDate) 
        : null;
      
      if (!paymentDate || paymentDate < yearStart || paymentDate > yearEnd) continue;
      
      const monthIndex = paymentDate.getMonth(); // 0-11
      const scheme = row.invoice.scheme;
      
      // Calculate profit based on scheme
      let profit: number;
      if (scheme === 'agency_30') {
        profit = parseFloat(row.calculations.adminShareFromMargin || "0");
      } else if (scheme === 'vika_ie_7') {
        profit = parseFloat(row.calculations.clientBill || "0");
      } else {
        profit = parseFloat(row.calculations.amountToAdmin || "0");
      }
      
      const clientBill = parseFloat(row.calculations.clientBill || "0");
      const invoiceExpenses = expensesByInvoice.get(row.invoice.id) || 0;
      
      monthlyData[monthIndex].totalSales += clientBill;
      monthlyData[monthIndex].totalProfit += profit;
      monthlyData[monthIndex].invoiceCount += 1;
      monthlyData[monthIndex].expenses += invoiceExpenses;
    }
    
    return monthlyData;
  }
  
  async getAdminForecast(monthsAhead: number): Promise<ForecastData[]> {
    const monthNames = [
      "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
      "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
    ];
    
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    // Create forecast periods
    const forecastData: ForecastData[] = [];
    for (let i = 0; i < monthsAhead; i++) {
      const targetMonth = (currentMonth + i) % 12;
      const targetYear = currentYear + Math.floor((currentMonth + i) / 12);
      
      forecastData.push({
        monthIndex: targetMonth + 1,
        monthName: monthNames[targetMonth],
        yearNum: targetYear,
        expectedAmount: 0,
        receivedAmount: 0,
      });
    }
    
    // Get all invoices with calculations
    const allInvoices = await db
      .select({
        invoice: invoices,
        calculations: invoiceCalculations,
      })
      .from(invoices)
      .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId));
    
    for (const row of allInvoices) {
      if (!row.calculations) continue;
      
      const paymentDate = row.invoice.paymentDate 
        ? new Date(row.invoice.paymentDate) 
        : null;
      
      if (!paymentDate) continue;
      
      const paymentMonth = paymentDate.getMonth();
      const paymentYear = paymentDate.getFullYear();
      
      // Calculate profit based on scheme
      const scheme = row.invoice.scheme;
      let profit: number;
      if (scheme === 'agency_30') {
        profit = parseFloat(row.calculations.adminShareFromMargin || "0");
      } else if (scheme === 'vika_ie_7') {
        profit = parseFloat(row.calculations.clientBill || "0");
      } else {
        profit = parseFloat(row.calculations.amountToAdmin || "0");
      }
      
      // Find matching forecast period
      const forecastIndex = forecastData.findIndex(f => 
        f.monthIndex === paymentMonth + 1 && f.yearNum === paymentYear
      );
      
      if (forecastIndex === -1) continue;
      
      if (row.invoice.status === 'paid') {
        forecastData[forecastIndex].receivedAmount += profit;
      } else if (row.invoice.status === 'sent') {
        forecastData[forecastIndex].expectedAmount += profit;
      }
    }
    
    return forecastData;
  }
  
  async getOverdueInvoices(): Promise<OverdueInvoice[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const overdueResults = await db
      .select({
        invoice: invoices,
        calculations: invoiceCalculations,
        clientName: clients.name,
        partnerName: partners.name,
      })
      .from(invoices)
      .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
      .leftJoin(clients, eq(invoices.clientId, clients.id))
      .leftJoin(partners, eq(invoices.partnerId, partners.id))
      .where(eq(invoices.status, 'sent'));
    
    const overdueInvoices: OverdueInvoice[] = [];
    
    for (const row of overdueResults) {
      if (!row.invoice.paymentDate) continue;
      
      const paymentDate = new Date(row.invoice.paymentDate);
      paymentDate.setHours(0, 0, 0, 0);
      
      if (paymentDate >= today) continue;
      
      const daysOverdue = Math.floor((today.getTime() - paymentDate.getTime()) / (1000 * 60 * 60 * 24));
      
      overdueInvoices.push({
        id: row.invoice.id,
        invoiceNumber: row.invoice.invoiceNumber,
        paymentDate: row.invoice.paymentDate,
        clientName: row.clientName || 'Неизвестно',
        partnerName: row.partnerName || 'Неизвестно',
        amount: parseFloat(row.calculations?.clientBill || "0"),
        daysOverdue,
      });
    }
    
    // Sort by days overdue (most overdue first)
    return overdueInvoices.sort((a, b) => b.daysOverdue - a.daysOverdue);
  }
  
  async getPartnerDebtDetails(partnerId: string): Promise<{
    summary: {
      totalDebt: number;
      totalPaid: number;
      remainingDebt: number;
      invoiceCount: number;
    };
    invoices: Array<{
      id: string;
      invoiceNumber: string;
      scheme: string;
      clientBill: number;
      partnerCommission: number;
      amountToAdmin: number;
      expensesByPartner: number;
      expensesByAdmin: number;
    }>;
    payments: Array<{
      id: string;
      amount: string;
      paymentDate: string;
      notes: string | null;
      invoiceNumber: string | null;
    }>;
  }> {
    // Get partner's paid invoices
    const partnerInvoices = await db
      .select({
        invoice: invoices,
        calculations: invoiceCalculations,
      })
      .from(invoices)
      .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
      .where(and(
        eq(invoices.partnerId, partnerId),
        eq(invoices.status, 'paid')
      ));
    
    // Get all expenses for these invoices
    const allExpenses = await db.select().from(invoiceExpenses);
    const expensesByInvoice = new Map<string, { byPartner: number; byAdmin: number }>();
    
    for (const exp of allExpenses) {
      if (!expensesByInvoice.has(exp.invoiceId)) {
        expensesByInvoice.set(exp.invoiceId, { byPartner: 0, byAdmin: 0 });
      }
      const amounts = expensesByInvoice.get(exp.invoiceId)!;
      const amount = parseFloat(exp.amount);
      if (exp.paidByAdmin) {
        amounts.byAdmin += amount;
      } else {
        amounts.byPartner += amount;
      }
    }
    
    // Get partner payments
    const partnerPaymentsList = await db
      .select()
      .from(partnerPayments)
      .where(eq(partnerPayments.partnerId, partnerId))
      .orderBy(partnerPayments.paymentDate);
    
    // Calculate totals and prepare invoice details
    let totalDebt = 0;
    const invoiceDetails: Array<{
      id: string;
      invoiceNumber: string;
      scheme: string;
      clientBill: number;
      partnerCommission: number;
      amountToAdmin: number;
      expensesByPartner: number;
      expensesByAdmin: number;
    }> = [];
    
    for (const row of partnerInvoices) {
      if (!row.calculations) continue;
      
      const scheme = row.invoice.scheme;
      const cBill = parseFloat(row.calculations.clientBill || "0");
      const expenses = expensesByInvoice.get(row.invoice.id) || { byPartner: 0, byAdmin: 0 };
      let partnerCommission = 0;
      let debt = 0;
      
      if (scheme === 'agency_30') {
        partnerCommission = cBill * 0.15; // Partner gets 15%
        debt = cBill * 0.15; // Admin also gets 15%
      } else if (scheme === 'vika_ie_7') {
        partnerCommission = 0;
        debt = 0;
      } else {
        // Partner schemes
        let commissionRate: number;
        if (scheme === 'partner_10') {
          commissionRate = 0.10;
        } else if (scheme === 'partner_15') {
          commissionRate = 0.15;
        } else {
          const comm = parseFloat(row.calculations.commissionAmount || "0");
          commissionRate = cBill > 0 ? comm / cBill : 0.10;
        }
        partnerCommission = cBill * commissionRate;
        debt = cBill - partnerCommission - expenses.byPartner;
      }
      
      totalDebt += debt;
      
      invoiceDetails.push({
        id: row.invoice.id,
        invoiceNumber: row.invoice.invoiceNumber,
        scheme: scheme,
        clientBill: cBill,
        partnerCommission,
        amountToAdmin: debt,
        expensesByPartner: expenses.byPartner,
        expensesByAdmin: expenses.byAdmin,
      });
    }
    
    // Calculate total paid
    const totalPaid = partnerPaymentsList.reduce((sum, p) => sum + parseFloat(p.amount), 0);
    
    // Map payments with invoice numbers
    const paymentDetails = await Promise.all(
      partnerPaymentsList.map(async (p) => {
        let invoiceNumber: string | null = null;
        if (p.invoiceId) {
          const inv = await db.select({ invoiceNumber: invoices.invoiceNumber })
            .from(invoices)
            .where(eq(invoices.id, p.invoiceId))
            .limit(1);
          invoiceNumber = inv[0]?.invoiceNumber || null;
        }
        return {
          id: p.id,
          amount: p.amount,
          paymentDate: p.paymentDate,
          notes: p.notes,
          invoiceNumber,
        };
      })
    );
    
    return {
      summary: {
        totalDebt,
        totalPaid,
        remainingDebt: Math.max(0, totalDebt - totalPaid),
        invoiceCount: invoiceDetails.length,
      },
      invoices: invoiceDetails,
      payments: paymentDetails,
    };
  }
}

export const storage = new DatabaseStorage();
