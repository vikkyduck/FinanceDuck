import { db } from "./db";
import { 
  partners, clients, accessTokens, userSessions, invoices, 
  invoiceCalculations, invoiceExpenses, partnerPayments, clientPartners, monthlyFinancialPlans, signedActs, assistantBonusPayments,
  Partner, Client, Invoice, InvoiceCalculation, InvoiceExpense, PartnerPayment, MonthlyFinancialPlan, SignedAct, AssistantBonusPayment,
  InsertPartner, InsertClient, InsertInvoice, InsertInvoiceExpense, InsertPartnerPayment, InsertMonthlyFinancialPlan, InsertSignedAct, InsertAssistantBonusPayment,
  AccessToken, UserSession, UserRole, InvoiceScheme, ActType
} from "../shared/schema";
import { eq, and, desc, isNull, gte, sql, inArray, or } from "drizzle-orm";
import { randomBytes } from "crypto";

/**
 * Server-side invoice calculations
 * 
 * CRITICAL BUSINESS RULE:
 * For partner schemes (partner_10, partner_15, commission_based):
 *   - Partner receives client payment
 *   - Partner pays expenses from client money (expensesPaidByPartner)
 *   - Partner transfers remainder to admin: amountToAdmin - expensesPaidByPartner
 *   - Admin may also pay expenses from own pocket (expensesPaidByAdmin)
 *   - Admin net profit = (amountToAdmin - expensesPaidByPartner) - expensesPaidByAdmin
 * 
 * For agency_30:
 *   - 70% stays with partner for project expenses
 *   - 30% is agency margin (15% partner + 15% admin)
 *   - Admin's 15% is FIXED, not affected by expenses (they come from 70%)
 * 
 * @param expensesPaidByPartner - Expenses paid by partner from client money (paidByAdmin=false)
 * @param expensesPaidByAdmin - Expenses paid by admin from own funds (paidByAdmin=true)
 */
function calculateInvoiceServer(
  scheme: InvoiceScheme,
  clientBill: number,
  partnerCommissionRate?: number,
  executorExpenses: number = 0,
  expensesPaidByPartner: number = 0,
  expensesPaidByAdmin: number = 0
): Partial<InvoiceCalculation> {
  const result: Partial<InvoiceCalculation> = {
    clientBill: clientBill.toString(),
    executorExpensesTotal: executorExpenses.toString(),
  };

  switch (scheme) {
    case 'agency_30': {
      // Agency 30%: расходы идут из клиентского бюджета (70%), не из доли админа
      const agencyMargin = clientBill * 0.30;
      const partnerShare = clientBill * 0.15;
      const adminShare = clientBill * 0.15;
      const clientBase = clientBill * 0.70;
      const clientRemaining = clientBase - executorExpenses;
      // Для agency_30: партнёр должен перевести 15% (фиксировано)
      const partnerTransferDue = adminShare;
      // Чистая прибыль админа = то же самое (расходы из 70% клиента)
      const netProfitAdmin = adminShare;
      
      result.agencyMargin = agencyMargin.toString();
      result.partnerShareFromMargin = partnerShare.toString();
      result.adminShareFromMargin = adminShare.toString();
      result.clientBaseAfterMargin = clientBase.toString();
      result.clientRemaining = clientRemaining.toString();
      result.partnerTransferDue = partnerTransferDue.toString();
      result.netProfitAdmin = netProfitAdmin.toString();
      result.adminShare50 = (netProfitAdmin / 2).toString();
      result.catShare50 = (netProfitAdmin / 2).toString();
      break;
    }
    case 'partner_10': {
      // Partner 10%: партнёр платит расходы из денег клиента, потом переводит остаток админу
      const commissionRate = 10;
      const commissionAmount = clientBill * 0.10;
      const amountToAdmin = clientBill * 0.90; // Теоретическая сумма до расходов
      // Партнёр переведёт: amountToAdmin - expensesPaidByPartner (это ДОЛГ партнёра)
      const partnerTransferDue = amountToAdmin - expensesPaidByPartner;
      // Чистая прибыль админа = долг партнёра - расходы оплаченные админом
      const netProfitAdmin = partnerTransferDue - expensesPaidByAdmin;
      
      result.commissionRate = commissionRate.toString();
      result.commissionAmount = commissionAmount.toString();
      result.amountToAdmin = amountToAdmin.toString();
      result.partnerTransferDue = partnerTransferDue.toString();
      result.netProfitAdmin = netProfitAdmin.toString();
      result.adminShare50 = (netProfitAdmin / 2).toString();
      result.catShare50 = (netProfitAdmin / 2).toString();
      break;
    }
    case 'partner_15': {
      // Partner 15%: партнёр платит расходы из денег клиента, потом переводит остаток админу
      const commissionRate = 15;
      const commissionAmount = clientBill * 0.15;
      const amountToAdmin = clientBill * 0.85; // Теоретическая сумма до расходов
      // Партнёр переведёт: amountToAdmin - expensesPaidByPartner (это ДОЛГ партнёра)
      const partnerTransferDue = amountToAdmin - expensesPaidByPartner;
      // Чистая прибыль админа = долг партнёра - расходы оплаченные админом
      const netProfitAdmin = partnerTransferDue - expensesPaidByAdmin;
      
      result.commissionRate = commissionRate.toString();
      result.commissionAmount = commissionAmount.toString();
      result.amountToAdmin = amountToAdmin.toString();
      result.partnerTransferDue = partnerTransferDue.toString();
      result.netProfitAdmin = netProfitAdmin.toString();
      result.adminShare50 = (netProfitAdmin / 2).toString();
      result.catShare50 = (netProfitAdmin / 2).toString();
      break;
    }
    case 'commission_based':
    default: {
      // Commission-based: партнёр платит расходы из денег клиента, потом переводит остаток админу
      const commissionRate = partnerCommissionRate || 10;
      const commissionAmount = clientBill * (commissionRate / 100);
      const amountToAdmin = clientBill - commissionAmount; // Теоретическая сумма до расходов
      // Партнёр переведёт: amountToAdmin - expensesPaidByPartner (это ДОЛГ партнёра)
      const partnerTransferDue = amountToAdmin - expensesPaidByPartner;
      // Чистая прибыль админа = долг партнёра - расходы оплаченные админом
      const netProfitAdmin = partnerTransferDue - expensesPaidByAdmin;
      
      result.commissionRate = commissionRate.toString();
      result.commissionAmount = commissionAmount.toString();
      result.amountToAdmin = amountToAdmin.toString();
      result.partnerTransferDue = partnerTransferDue.toString();
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
  getPartnerPaymentHistory(partnerId: string): Promise<PaymentHistoryEntry[]>;
  
  getAccessTokens(): Promise<AccessToken[]>;
  createAccessToken(code: string, role: UserRole, partnerId?: string, clientId?: string): Promise<AccessToken>;
  deleteAccessToken(id: string): Promise<void>;
  
  getDashboardStats(role: UserRole, partnerId?: string, clientId?: string): Promise<DashboardStats>;
  
  // Analytics methods
  getAdminMonthlyData(year: number): Promise<MonthlyData[]>;
  getAdminForecast(monthsAhead: number): Promise<ForecastData[]>;
  getOverdueInvoices(): Promise<OverdueInvoice[]>;
  getAdminPlanFact(year: number): Promise<PlanFactData[]>;
  
  getMonthlyPlans(year: number): Promise<MonthlyFinancialPlan[]>;
  getMonthlyPlan(year: number, month: number): Promise<MonthlyFinancialPlan | null>;
  upsertMonthlyPlan(input: MonthlyPlanInput): Promise<MonthlyFinancialPlan>;
  
  // Recalculate all invoices with correct expensesPaidByAdmin
  recalculateAllInvoices(): Promise<{ updated: number; errors: number }>;
  
  // Assistant bonus payments
  getAssistantBonusPayments(): Promise<AssistantBonusPayment[]>;
  createAssistantBonusPayment(payment: InsertAssistantBonusPayment): Promise<AssistantBonusPayment>;
  getUnpaidBonusTotal(): Promise<{ total: number; invoiceCount: number; invoiceIds: string[]; executorActs: number; companyActs: number }>;
  markBonusesAsPaid(invoiceIds: string[]): Promise<void>;
  
  // Signed acts methods
  createSignedAct(act: InsertSignedAct): Promise<SignedAct>;
  getSignedActsByInvoice(invoiceId: string, actType?: ActType): Promise<SignedAct[]>;
  getSignedAct(id: string): Promise<SignedAct | null>;
  deleteSignedAct(id: string): Promise<void>;
  getActsStatistics(excludeHidden?: boolean): Promise<{ executorActs: number; companyActs: number; totalPaidInvoices: number }>;
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

export interface PaymentHistoryEntry {
  id: string;
  paymentDate: string;
  amount: number;
  notes: string | null;
  runningBalance: number;
}

export interface PlanFactData {
  monthNumber: number;
  monthName: string;
  salesTarget: number;
  receiptsTarget: number;
  actualSales: number;
  actualReceipts: number;
}

export interface MonthlyPlanInput {
  year: number;
  month: number;
  salesTarget?: number;
  profitTarget?: number;
  receiptsTarget?: number;
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
    } else if (role === 'assistant') {
      // Filter out invoices hidden from assistant (allow NULL or false)
      results = await baseQuery.where(
        or(
          isNull(invoices.hideFromAssistant),
          eq(invoices.hideFromAssistant, false)
        )
      );
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
    
    // Calculate expenses by payer (for correct netProfitAdmin calculation)
    const expenses = await this.getInvoiceExpenses(invoiceId);
    const expensesPaidByPartner = expenses
      .filter(e => e.paidByAdmin !== true)
      .reduce((sum, e) => sum + parseFloat(e.amount), 0);
    const expensesPaidByAdmin = expenses
      .filter(e => e.paidByAdmin === true)
      .reduce((sum, e) => sum + parseFloat(e.amount), 0);
    
    // Recalculate all fields with both expense types
    const computed = calculateInvoiceServer(
      invoice.scheme as InvoiceScheme,
      clientBill,
      commissionRate,
      executorExpenses,
      expensesPaidByPartner,
      expensesPaidByAdmin
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

  async getPartnerPaymentHistory(partnerId: string): Promise<PaymentHistoryEntry[]> {
    // Get all partner's paid invoices with stored partnerTransferDue (single source of truth)
    const paidInvoices = await db
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

    // Calculate total debt using stored partnerTransferDue values
    let totalDebt = 0;
    for (const r of paidInvoices) {
      if (r.calculations) {
        // Use stored value as single source of truth
        const storedDebt = parseFloat(r.calculations.partnerTransferDue || "0");
        totalDebt += Math.max(0, storedDebt);
      }
    }

    // Get all payments sorted by date ascending
    const payments = await db.select().from(partnerPayments)
      .where(eq(partnerPayments.partnerId, partnerId))
      .orderBy(partnerPayments.paymentDate);

    // Calculate running balance (allow negative for overpayments)
    let runningBalance = totalDebt;
    const history: PaymentHistoryEntry[] = [];
    
    for (const payment of payments) {
      const amount = parseFloat(payment.amount);
      runningBalance -= amount;
      history.push({
        id: payment.id,
        paymentDate: payment.paymentDate,
        amount,
        notes: payment.notes,
        runningBalance, // Allow negative to show overpayments
      });
    }

    // Return in reverse chronological order (newest first)
    return history.reverse();
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
      
      // Use stored partnerTransferDue as single source of truth
      let totalDebtToAdmin = 0;
      for (const r of results) {
        if (r.invoice.status === 'paid' && r.calculations) {
          // Read stored value instead of recalculating
          const storedDebt = parseFloat(r.calculations.partnerTransferDue || "0");
          totalDebtToAdmin += Math.max(0, storedDebt);
        }
      }
      partnerDebt = Math.max(0, totalDebtToAdmin - totalPaid);
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
    // Get all paid invoices with their stored partnerTransferDue values
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
      
      // Use stored partnerTransferDue from calculations - single source of truth
      const debt = parseFloat(row.calculations.partnerTransferDue || "0");

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
  
  async getAdminDashboardStats(year?: number, month?: number): Promise<{
    yearlySummary: {
      totalRevenue: number;
      totalProfit: number;
      netProfitMargin: number;
    };
    monthlyCashFlow: {
      received: number;
      expected: number;
    };
    monthlyProfit: number;
    ownerShares: {
      yearlyKrya: number;
      yearlyKot: number;
      monthlyKrya: number;
      monthlyKot: number;
    };
    monthlySales: {
      draftsCount: number;
      draftsTotal: number;
    };
    leverage: {
      othersProfit: number;
      vikaProfit: number;
      ratio: number;
    };
    selectedYear: number;
    selectedMonth: number;
    availableYears: number[];
  }> {
    const now = new Date();
    const selectedYear = year ?? now.getFullYear();
    const selectedMonth = month ?? now.getMonth();
    const monthStart = new Date(selectedYear, selectedMonth, 1);
    const monthEnd = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59);
    const yearStart = new Date(selectedYear, 0, 1);
    const yearEnd = new Date(selectedYear, 11, 31, 23, 59, 59);
    
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
    
    // Calculate yearly metrics
    let yearlyRevenue = 0;
    let yearlyProfit = 0;
    let monthlyReceived = 0;
    let monthlyExpected = 0;
    let monthlyVikaProfit = 0;
    let monthlyOthersProfit = 0;
    let monthlyProfit = 0;
    
    // Collect available years from invoices
    const yearsSet = new Set<number>();
    
    for (const row of allInvoices) {
      // Track available years
      if (row.invoice.paymentDate) {
        yearsSet.add(new Date(row.invoice.paymentDate).getFullYear());
      } else if (row.invoice.createdAt) {
        yearsSet.add(new Date(row.invoice.createdAt).getFullYear());
      }
      
      if (!row.calculations) continue;
      
      const scheme = row.invoice.scheme;
      const status = row.invoice.status;
      const paymentDate = row.invoice.paymentDate 
        ? new Date(row.invoice.paymentDate) 
        : (row.invoice.createdAt ? new Date(row.invoice.createdAt) : null);
      const createdAt = row.invoice.createdAt ? new Date(row.invoice.createdAt) : null;
      
      // Client bill is the revenue
      const clientBill = parseFloat(row.calculations.clientBill || "0");
      
      // Use appropriate cash field based on scheme
      let cashToAdmin: number;
      if (scheme === 'agency_30') {
        cashToAdmin = parseFloat(row.calculations.adminShareFromMargin || "0");
      } else {
        cashToAdmin = parseFloat(row.calculations.amountToAdmin || "0");
      }
      
      const netProfit = parseFloat(row.calculations.netProfitAdmin || "0");
      
      const isVika = row.partnerName?.toLowerCase().includes("вика уткина") || 
                     row.partnerName?.toLowerCase().includes("vika utkina");
      
      // Only count paid invoices
      if (status === 'paid') {
        // Yearly metrics - based on payment date within selected year
        if (paymentDate && paymentDate >= yearStart && paymentDate <= yearEnd) {
          yearlyRevenue += clientBill;
          yearlyProfit += netProfit;
        }
        
        // Monthly cash flow - based on payment date within selected month
        if (paymentDate && paymentDate >= monthStart && paymentDate <= monthEnd) {
          monthlyReceived += cashToAdmin;
          monthlyProfit += netProfit;
          
          // Monthly leverage calculation
          if (isVika) {
            monthlyVikaProfit += netProfit;
          } else {
            monthlyOthersProfit += netProfit;
          }
        }
      }
      
      // Expected this month - sent invoices
      if (status === 'sent' && createdAt && createdAt >= monthStart && createdAt <= monthEnd) {
        monthlyExpected += cashToAdmin;
      }
    }
    
    // Drafts (sales pipeline) for selected month
    const monthlyDrafts = allInvoices.filter(row => {
      if (row.invoice.status === 'paid' || row.invoice.status === 'sent' || row.invoice.status === 'cancelled') {
        return false;
      }
      const createdAt = row.invoice.createdAt ? new Date(row.invoice.createdAt) : null;
      return createdAt && createdAt >= monthStart && createdAt <= monthEnd;
    });
    const draftsCount = monthlyDrafts.length;
    const draftsTotal = monthlyDrafts.reduce((sum, row) => {
      return sum + parseFloat(row.calculations?.clientBill || "0");
    }, 0);
    
    // Net Profit Margin = (Net Profit / Revenue) * 100
    const netProfitMargin = yearlyRevenue > 0 ? (yearlyProfit / yearlyRevenue) * 100 : 0;
    
    // Leverage ratio for selected month
    const leverageRatio = monthlyVikaProfit > 0 ? monthlyOthersProfit / monthlyVikaProfit : 0;
    
    // Sort available years descending
    const availableYears = Array.from(yearsSet).sort((a, b) => b - a);
    if (!availableYears.includes(now.getFullYear())) {
      availableYears.unshift(now.getFullYear());
    }
    
    // Owner shares: split profit 50/50 between Kря and Kot
    const yearlyOwnerShare = yearlyProfit / 2;
    const monthlyOwnerShare = monthlyProfit / 2;
    
    return {
      yearlySummary: {
        totalRevenue: yearlyRevenue,
        totalProfit: yearlyProfit,
        netProfitMargin: netProfitMargin,
      },
      monthlyCashFlow: {
        received: monthlyReceived,
        expected: monthlyExpected,
      },
      monthlyProfit,
      ownerShares: {
        yearlyKrya: yearlyOwnerShare,
        yearlyKot: yearlyOwnerShare,
        monthlyKrya: monthlyOwnerShare,
        monthlyKot: monthlyOwnerShare,
      },
      monthlySales: {
        draftsCount,
        draftsTotal,
      },
      leverage: {
        othersProfit: monthlyOthersProfit,
        vikaProfit: monthlyVikaProfit,
        ratio: leverageRatio,
      },
      selectedYear,
      selectedMonth,
      availableYears,
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
      
      // Use netProfitAdmin for profit calculation (includes expense deduction for admin-paid expenses)
      const profit = parseFloat(row.calculations.netProfitAdmin || "0");
      
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
      
      // Use netProfitAdmin for profit calculation (includes expense deduction for admin-paid expenses)
      const profit = parseFloat(row.calculations.netProfitAdmin || "0");
      
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
    
    // Calculate totals using stored partnerTransferDue values (single source of truth)
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
      
      // Use stored values as single source of truth
      const storedDebt = parseFloat(row.calculations.partnerTransferDue || "0");
      const partnerCommission = parseFloat(row.calculations.commissionAmount || "0");
      const debt = Math.max(0, storedDebt);
      
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

  async getAdminPlanFact(year: number): Promise<PlanFactData[]> {
    const monthNames = [
      "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
      "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
    ];
    
    // Initialize all 12 months
    const planFactData: PlanFactData[] = monthNames.map((name, i) => ({
      monthNumber: i + 1,
      monthName: name,
      salesTarget: 0,
      receiptsTarget: 0,
      actualSales: 0,
      actualReceipts: 0,
    }));
    
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31, 23, 59, 59);
    
    // Get monthly plans for the year
    const plans = await this.getMonthlyPlans(year);
    for (const plan of plans) {
      const monthIndex = parseInt(plan.month) - 1;
      if (monthIndex >= 0 && monthIndex < 12) {
        planFactData[monthIndex].salesTarget = parseFloat(plan.salesTarget || "0");
        planFactData[monthIndex].receiptsTarget = parseFloat(plan.receiptsTarget || "0");
      }
    }
    
    // Get invoices that are not draft/cancelled for sales
    const sentOrPaidInvoices = await db
      .select({
        invoice: invoices,
        calculations: invoiceCalculations,
      })
      .from(invoices)
      .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
      .where(
        sql`${invoices.status} IN ('sent', 'paid')`
      );
    
    for (const row of sentOrPaidInvoices) {
      if (!row.calculations) continue;
      
      const clientBill = parseFloat(row.calculations.clientBill || "0");
      
      // Actual Sales: based on invoice creation date (when invoice was issued/sent)
      const createdDate = row.invoice.createdAt 
        ? new Date(row.invoice.createdAt) 
        : null;
      
      if (createdDate && createdDate >= yearStart && createdDate <= yearEnd) {
        const salesMonth = createdDate.getMonth();
        planFactData[salesMonth].actualSales += clientBill;
      }
      
      // Actual Receipts: only for paid invoices with paymentDate in year
      if (row.invoice.status === 'paid' && row.invoice.paymentDate) {
        const paymentDate = new Date(row.invoice.paymentDate);
        if (paymentDate >= yearStart && paymentDate <= yearEnd) {
          const receiptMonth = paymentDate.getMonth();
          planFactData[receiptMonth].actualReceipts += clientBill;
        }
      }
    }
    
    return planFactData;
  }

  async getMonthlyPlans(year: number): Promise<MonthlyFinancialPlan[]> {
    return await db
      .select()
      .from(monthlyFinancialPlans)
      .where(eq(monthlyFinancialPlans.year, year.toString()))
      .orderBy(monthlyFinancialPlans.month);
  }

  async getMonthlyPlan(year: number, month: number): Promise<MonthlyFinancialPlan | null> {
    const [plan] = await db
      .select()
      .from(monthlyFinancialPlans)
      .where(and(
        eq(monthlyFinancialPlans.year, year.toString()),
        eq(monthlyFinancialPlans.month, month.toString())
      ))
      .limit(1);
    
    return plan || null;
  }

  async upsertMonthlyPlan(input: MonthlyPlanInput): Promise<MonthlyFinancialPlan> {
    const existing = await this.getMonthlyPlan(input.year, input.month);
    
    if (existing) {
      const [updated] = await db
        .update(monthlyFinancialPlans)
        .set({
          salesTarget: input.salesTarget?.toString() || existing.salesTarget,
          profitTarget: input.profitTarget?.toString() || existing.profitTarget,
          receiptsTarget: input.receiptsTarget?.toString() || existing.receiptsTarget,
          updatedAt: new Date(),
        })
        .where(eq(monthlyFinancialPlans.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(monthlyFinancialPlans)
        .values({
          year: input.year.toString(),
          month: input.month.toString(),
          salesTarget: input.salesTarget?.toString() || "0",
          profitTarget: input.profitTarget?.toString() || "0",
          receiptsTarget: input.receiptsTarget?.toString() || "0",
        })
        .returning();
      return created;
    }
  }
  
  async recalculateAllInvoices(): Promise<{ updated: number; errors: number }> {
    let updated = 0;
    let errors = 0;
    
    // Get all invoices
    const allInvoices = await db.select().from(invoices);
    
    for (const invoice of allInvoices) {
      try {
        // Get existing calculations
        const [existing] = await db
          .select()
          .from(invoiceCalculations)
          .where(eq(invoiceCalculations.invoiceId, invoice.id))
          .limit(1);
        
        if (!existing) continue;
        
        // Get expenses for this invoice
        const expenses = await this.getInvoiceExpenses(invoice.id);
        const totalExpenses = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
        const expensesPaidByPartner = expenses
          .filter(e => e.paidByAdmin !== true)
          .reduce((sum, e) => sum + parseFloat(e.amount), 0);
        const expensesPaidByAdmin = expenses
          .filter(e => e.paidByAdmin === true)
          .reduce((sum, e) => sum + parseFloat(e.amount), 0);
        
        const clientBill = parseFloat(existing.clientBill || "0");
        const commissionRate = existing.commissionRate ? parseFloat(existing.commissionRate) : undefined;
        
        // Recalculate with correct expense breakdown
        const computed = calculateInvoiceServer(
          invoice.scheme as InvoiceScheme,
          clientBill,
          commissionRate,
          totalExpenses,
          expensesPaidByPartner,
          expensesPaidByAdmin
        );
        
        // Update
        await db.update(invoiceCalculations)
          .set({ ...computed, updatedAt: new Date() })
          .where(eq(invoiceCalculations.invoiceId, invoice.id));
        
        updated++;
      } catch (err) {
        console.error(`Error recalculating invoice ${invoice.id}:`, err);
        errors++;
      }
    }
    
    return { updated, errors };
  }

  // Signed Acts methods
  async createSignedAct(act: InsertSignedAct): Promise<SignedAct> {
    const [created] = await db.insert(signedActs).values(act).returning();
    return created;
  }

  async getSignedActsByInvoice(invoiceId: string, actType?: ActType): Promise<SignedAct[]> {
    if (actType) {
      return await db.select().from(signedActs)
        .where(and(
          eq(signedActs.invoiceId, invoiceId),
          eq(signedActs.actType, actType)
        ))
        .orderBy(desc(signedActs.createdAt));
    }
    return await db.select().from(signedActs)
      .where(eq(signedActs.invoiceId, invoiceId))
      .orderBy(desc(signedActs.createdAt));
  }

  async getSignedAct(id: string): Promise<SignedAct | null> {
    const [act] = await db.select().from(signedActs).where(eq(signedActs.id, id)).limit(1);
    return act || null;
  }

  async deleteSignedAct(id: string): Promise<void> {
    await db.delete(signedActs).where(eq(signedActs.id, id));
  }

  async getActsStatistics(excludeHidden: boolean = false): Promise<{
    executorActs: number;
    companyActs: number;
    totalPaidInvoices: number;
  }> {
    const visibleCondition = excludeHidden
      ? and(
          eq(invoices.status, 'paid'),
          or(
            isNull(invoices.hideFromAssistant),
            eq(invoices.hideFromAssistant, false)
          )
        )
      : eq(invoices.status, 'paid');
    
    const paidInvoicesCount = await db.select({ count: sql<number>`count(*)` })
      .from(invoices)
      .where(visibleCondition);
    
    const visibleInvoices = await db.select({ id: invoices.id })
      .from(invoices)
      .where(visibleCondition);
    const visibleInvoiceIds = visibleInvoices.map(inv => inv.id.toString());
    
    let executorActsCount = 0;
    let companyActsCount = 0;
    
    if (visibleInvoiceIds.length > 0) {
      const executorResult = await db.select({ count: sql<number>`count(*)` })
        .from(signedActs)
        .where(and(
          eq(signedActs.actType, 'executor'),
          inArray(signedActs.invoiceId, visibleInvoiceIds)
        ));
      executorActsCount = Number(executorResult[0]?.count || 0);
      
      const companyResult = await db.select({ count: sql<number>`count(*)` })
        .from(signedActs)
        .where(and(
          eq(signedActs.actType, 'company'),
          inArray(signedActs.invoiceId, visibleInvoiceIds)
        ));
      companyActsCount = Number(companyResult[0]?.count || 0);
    }
    
    return {
      executorActs: executorActsCount,
      companyActs: companyActsCount,
      totalPaidInvoices: Number(paidInvoicesCount[0]?.count || 0),
    };
  }

  async getAssistantStats(): Promise<{
    paidInvoicesCount: number;
    executorActsCount: number;
    companyActsCount: number;
    totalPaidInvoices: number;
    assistantBonus: number;
  }> {
    const stats = await this.getActsStatistics(true);
    
    const assistantBonus = (stats.executorActs * 1000) + (stats.companyActs * 2000);
    
    return {
      paidInvoicesCount: stats.totalPaidInvoices,
      executorActsCount: stats.executorActs,
      companyActsCount: stats.companyActs,
      totalPaidInvoices: stats.totalPaidInvoices,
      assistantBonus,
    };
  }

  async getAssistantBonusPayments(): Promise<AssistantBonusPayment[]> {
    return db.select()
      .from(assistantBonusPayments)
      .orderBy(desc(assistantBonusPayments.paymentDate));
  }

  async createAssistantBonusPayment(payment: InsertAssistantBonusPayment): Promise<AssistantBonusPayment> {
    const [created] = await db.insert(assistantBonusPayments)
      .values(payment)
      .returning();
    return created;
  }

  async getUnpaidBonusTotal(): Promise<{ total: number; invoiceCount: number; invoiceIds: string[]; executorActs: number; companyActs: number }> {
    const unpaidInvoices = await db.select({
      invoiceId: invoiceCalculations.invoiceId,
    })
    .from(invoiceCalculations)
    .innerJoin(invoices, eq(invoices.id, invoiceCalculations.invoiceId))
    .where(
      and(
        eq(invoiceCalculations.assistantBonusPaid, false),
        eq(invoices.status, 'paid')
      )
    );

    const invoiceIds = unpaidInvoices.map(row => row.invoiceId);
    
    if (invoiceIds.length === 0) {
      return { total: 0, invoiceCount: 0, invoiceIds: [], executorActs: 0, companyActs: 0 };
    }

    const executorResult = await db.select({ count: sql<number>`count(*)` })
      .from(signedActs)
      .where(and(
        eq(signedActs.actType, 'executor'),
        inArray(signedActs.invoiceId, invoiceIds)
      ));
    const executorActs = Number(executorResult[0]?.count || 0);

    const companyResult = await db.select({ count: sql<number>`count(*)` })
      .from(signedActs)
      .where(and(
        eq(signedActs.actType, 'company'),
        inArray(signedActs.invoiceId, invoiceIds)
      ));
    const companyActs = Number(companyResult[0]?.count || 0);

    const total = (executorActs * 1000) + (companyActs * 2000);
    
    const invoicesWithActs = await db.selectDistinct({ invoiceId: signedActs.invoiceId })
      .from(signedActs)
      .where(inArray(signedActs.invoiceId, invoiceIds));

    return { 
      total, 
      invoiceCount: invoicesWithActs.length, 
      invoiceIds: invoicesWithActs.map(r => r.invoiceId),
      executorActs,
      companyActs
    };
  }

  async markBonusesAsPaid(invoiceIds: string[]): Promise<void> {
    if (invoiceIds.length === 0) return;
    
    await db.update(invoiceCalculations)
      .set({ assistantBonusPaid: true, updatedAt: new Date() })
      .where(inArray(invoiceCalculations.invoiceId, invoiceIds));
  }
}

export const storage = new DatabaseStorage();
