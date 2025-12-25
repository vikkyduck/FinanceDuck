import { db } from "./db";
import { 
  partners, clients, accessTokens, userSessions, invoices, 
  invoiceCalculations, invoiceExpenses, partnerPayments, clientPartners, monthlyFinancialPlans, signedActs, assistantBonusPayments, recurringInvoices, assistantActionLogs,
  Partner, Client, Invoice, InvoiceCalculation, InvoiceExpense, PartnerPayment, MonthlyFinancialPlan, SignedAct, AssistantBonusPayment, AssistantActionLog,
  InsertPartner, InsertClient, InsertInvoice, InsertInvoiceExpense, InsertPartnerPayment, InsertMonthlyFinancialPlan, InsertSignedAct, InsertAssistantBonusPayment, InsertAssistantActionLog,
  AccessToken, UserSession, UserRole, InvoiceScheme, ActType, AssistantActionType
} from "../shared/schema";
import { eq, and, desc, asc, isNull, isNotNull, gte, lte, sql, inArray, or, type SQL } from "drizzle-orm";
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
 *   - Admin net profit = (amountToAdmin - expensesPaidByPartner) - expensesPaidByAdmin - plannedExpenses
 * 
 * For agency_30:
 *   - 70% stays with partner for project expenses
 *   - 30% is agency margin (15% partner + 15% admin)
 *   - Admin's 15% is FIXED, not affected by expenses (they come from 70%)
 * 
 * @param expensesPaidByPartner - Expenses paid by partner from client money (paidByAdmin=false)
 * @param expensesPaidByAdmin - Expenses paid by admin from own funds (paidByAdmin=true)
 * @param plannedExpenses - Planned project expenses (reserved, not yet spent) - affects net profit for partner schemes
 */
function calculateInvoiceServer(
  scheme: InvoiceScheme,
  clientBill: number,
  partnerCommissionRate?: number,
  executorExpenses: number = 0,
  expensesPaidByPartner: number = 0,
  expensesPaidByAdmin: number = 0,
  plannedExpenses: number = 0
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
    case 'agency_40': {
      // Agency 40%: расходы идут из клиентского бюджета (60%), не из доли админа
      const agencyMargin40 = clientBill * 0.40;
      const partnerShare40 = clientBill * 0.16;
      const adminShare40 = clientBill * 0.24;
      const clientBase40 = clientBill * 0.60;
      const clientRemaining40 = clientBase40 - executorExpenses;
      // Для agency_40: партнёр должен перевести 24% (фиксировано)
      const partnerTransferDue40 = adminShare40;
      // Чистая прибыль админа = 24% (расходы из 60% клиента)
      const netProfitAdmin40 = adminShare40;
      
      result.agencyMargin = agencyMargin40.toString();
      result.partnerShareFromMargin = partnerShare40.toString();
      result.adminShareFromMargin = adminShare40.toString();
      result.clientBaseAfterMargin = clientBase40.toString();
      result.clientRemaining = clientRemaining40.toString();
      result.partnerTransferDue = partnerTransferDue40.toString();
      result.netProfitAdmin = netProfitAdmin40.toString();
      result.adminShare50 = (netProfitAdmin40 / 2).toString();
      result.catShare50 = (netProfitAdmin40 / 2).toString();
      break;
    }
    case 'partner_10': {
      // Partner 10%: партнёр платит расходы из денег клиента, потом переводит остаток админу
      const commissionRate = 10;
      const commissionAmount = clientBill * 0.10;
      const amountToAdmin = clientBill * 0.90;
      // Долг партнёра зависит от наличия резерва:
      // - С резервом: ФИКСИРОВАННЫЙ = amountToAdmin - plannedExpenses
      // - Без резерва: уменьшается с расходами = amountToAdmin - expensesPaidByPartner
      const partnerTransferDue = plannedExpenses > 0
        ? Math.max(0, amountToAdmin - plannedExpenses)
        : Math.max(0, amountToAdmin - expensesPaidByPartner);
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
      const amountToAdmin = clientBill * 0.85;
      // Долг партнёра зависит от наличия резерва:
      // - С резервом: ФИКСИРОВАННЫЙ = amountToAdmin - plannedExpenses
      // - Без резерва: уменьшается с расходами = amountToAdmin - expensesPaidByPartner
      const partnerTransferDue = plannedExpenses > 0
        ? Math.max(0, amountToAdmin - plannedExpenses)
        : Math.max(0, amountToAdmin - expensesPaidByPartner);
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
      const amountToAdmin = clientBill - commissionAmount;
      // Долг партнёра зависит от наличия резерва:
      // - С резервом: ФИКСИРОВАННЫЙ = amountToAdmin - plannedExpenses
      // - Без резерва: уменьшается с расходами = amountToAdmin - expensesPaidByPartner
      const partnerTransferDue = plannedExpenses > 0
        ? Math.max(0, amountToAdmin - plannedExpenses)
        : Math.max(0, amountToAdmin - expensesPaidByPartner);
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
  getInvoicesWithCalculations(): Promise<Array<{ id: string; status: string; paymentDate: string | null; adminShare50: string | null; catShare50: string | null; netProfitAdmin: string | null }>>;
  createInvoice(invoice: InsertInvoice, calculations: Partial<InvoiceCalculation>): Promise<Invoice>;
  updateInvoice(id: string, invoice: Partial<InsertInvoice>): Promise<Invoice | null>;
  updateInvoiceCalculations(invoiceId: string, calculations: Partial<InvoiceCalculation>): Promise<InvoiceCalculation | null>;
  deleteInvoice(id: string): Promise<void>;
  
  getInvoiceExpenses(invoiceId: string): Promise<InvoiceExpense[]>;
  getAllExpenses(): Promise<InvoiceExpense[]>;
  createInvoiceExpense(expense: InsertInvoiceExpense): Promise<InvoiceExpense>;
  updateInvoiceExpense(id: string, updates: Partial<InsertInvoiceExpense>): Promise<InvoiceExpense | null>;
  deleteInvoiceExpense(id: string): Promise<void>;
  
  deleteDocument(id: string): Promise<void>;
  
  getPartnerPayments(partnerId?: string): Promise<PartnerPayment[]>;
  getPartnerPayment(id: string): Promise<PartnerPayment | null>;
  createPartnerPayment(payment: InsertPartnerPayment): Promise<PartnerPayment>;
  updatePartnerPayment(id: string, updates: Partial<InsertPartnerPayment>): Promise<PartnerPayment | null>;
  deletePartnerPayment(id: string): Promise<void>;
  getPartnerPaymentHistory(partnerId: string): Promise<PaymentHistoryEntry[]>;
  
  getAccessTokens(): Promise<AccessToken[]>;
  createAccessToken(code: string, role: UserRole, partnerId?: string, clientId?: string): Promise<AccessToken>;
  deleteAccessToken(id: string): Promise<void>;
  
  getDashboardStats(role: UserRole, partnerId?: string, clientId?: string): Promise<DashboardStats>;
  
  // Analytics methods
  getAdminMonthlyData(year: number): Promise<MonthlyData[]>;
  getAdminForecast(monthsAhead: number): Promise<ForecastData[]>;
  getInvoicesByMonth(month: number, year: number, type?: string): Promise<MonthInvoiceDetail[]>;
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
  getUnpaidBonusTotal(): Promise<{ total: number; invoiceCount: number; invoiceIds: string[]; executorActs: number; companyActs: number; totalEarned: number; totalPaid: number }>;
  markBonusesAsPaid(invoiceIds: string[]): Promise<void>;
  
  // Signed acts methods
  createSignedAct(act: InsertSignedAct): Promise<SignedAct>;
  getSignedActsByInvoice(invoiceId: string, actType?: ActType): Promise<SignedAct[]>;
  getSignedAct(id: string): Promise<SignedAct | null>;
  deleteSignedAct(id: string): Promise<void>;
  getActsStatistics(excludeHidden?: boolean): Promise<{ executorActs: number; companyActs: number; totalPaidInvoices: number }>;
  
  // Draft invoices statistics (sales funnel)
  getDraftsStats(): Promise<DraftsStats>;
  
  // Recurring invoices
  getRecurringInvoices(): Promise<any[]>;
  getRecurringInvoice(id: string): Promise<any | null>;
  createRecurringInvoice(data: any): Promise<any>;
  updateRecurringInvoice(id: string, data: any): Promise<any | null>;
  deleteRecurringInvoice(id: string): Promise<void>;
  
  // Partner-specific methods
  getPartnerClientStats(partnerId: string, year: number): Promise<PartnerClientStatsData[]>;
  getPartnerDocumentRisk(partnerId: string): Promise<PartnerDocumentRiskData>;
  getPartnerAgency30Funds(partnerId: string): Promise<PartnerAgency30FundsData[]>;
  getPartnerHeroMetrics(partnerId: string): Promise<PartnerHeroMetricsData>;
  
  // Working capital
  getWorkingCapital(): Promise<WorkingCapitalData | null>;
  updateWorkingCapital(amount: number, notes: string | null, updatedBy: string): Promise<WorkingCapitalData>;
  
  // Client LTV
  getClientLTV(): Promise<ClientLTVData[]>;
  
  // Assistant action logs
  logAssistantAction(log: InsertAssistantActionLog): Promise<AssistantActionLog>;
  getAssistantActionLogs(filters: AssistantActionLogFilters): Promise<{ logs: AssistantActionLogWithDetails[]; total: number }>;
  
  // Dashboard invoice details for expandable cards
  getDashboardInvoices(year: number, month: number, category: 'received' | 'expected' | 'drafts'): Promise<DashboardInvoiceDetail[]>;
}

export interface AssistantActionLogFilters {
  limit?: number;
  offset?: number;
  role?: 'admin' | 'assistant' | null;
  dateFrom?: string | null;
  dateTo?: string | null;
}

export interface AssistantActionLogWithDetails extends AssistantActionLog {
  tokenCode?: string;
  tokenRole?: string;
}

export interface WorkingCapitalData {
  id: string;
  amount: number;
  notes: string | null;
  updated_at: string | null;
}

export interface ClientLTVData {
  client_id: string;
  client_name: string;
  total_invoices: number;
  paid_invoices: number;
  total_admin_profit: number;
  potential_profit: number;
}

export interface PartnerClientStatsData {
  clientId: string;
  clientName: string;
  month: number;
  monthName: string;
  clientBill: number;
  partnerCommission: number;
  clientRemaining: number;
  invoiceCount: number;
}

export interface PartnerDocumentRiskData {
  status: 'green' | 'red';
  missingActsCount: number;
  missingActsInvoices: { id: string; invoiceNumber: string }[];
}

export interface PartnerAgency30FundsData {
  clientId: string;
  clientName: string;
  totalBudget: number;
  totalSpent: number;
  remaining: number;
  invoiceCount: number;
}

export interface PartnerHeroMetricsData {
  debtToAdmin: number;
  reservedForExpenses: number;
  yearlyCommission: number;
  signedActsCount: number;
  totalPaidInvoices: number;
  invoicesWithDebt: { id: string; number: string; amount: number }[];
}

export interface DashboardInvoiceDetail {
  id: string;
  invoiceNumber: string;
  clientName: string | null;
  netProfitAdmin: number;
  clientBill: number;
  status: string;
  paymentDate: string | null;
}

export interface MonthlyData {
  monthNumber: number;
  totalSales: number;
  totalProfit: number;
  invoiceCount: number;
  expenses: number;
}

export interface MonthInvoiceDetail {
  id: string;
  invoiceNumber: string | null;
  clientName: string | null;
  clientBill: number;
  netProfitAdmin: number;
  status: string;
  paymentDate: string | null;
  isExpected: boolean;
  isPaid: boolean;
}

export interface DraftsStats {
  totalDrafts: number;
  totalDraftAmount: number;
  currentMonthDrafts: number;
  currentMonthAmount: number;
  fromRecurring: number;
  fromRecurringAmount: number;
}

export interface ForecastData {
  monthIndex: number;
  monthName: string;
  yearNum: number;
  expectedAmount: number;
  receivedAmount: number;
  recurringAmount?: number;
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
  recurringExpectedMonthly?: number;
  recurringExpectedYearly?: number;
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

  // Get raw invoice data with full calculations for internal use (plan-fact analysis)
  // Includes ALL invoices with actualPaymentDate set (regardless of status) to match Supabase behavior
  // Includes netProfitAdmin for fallback calculation when shares are null/zero
  async getInvoicesWithCalculations(): Promise<Array<{
    id: string;
    status: string;
    paymentDate: string | null;
    adminShare50: string | null;
    catShare50: string | null;
    netProfitAdmin: string | null;
  }>> {
    const results = await db
      .select({
        id: invoices.id,
        status: invoices.status,
        actualPaymentDate: invoices.actualPaymentDate,
        paymentDate: invoices.paymentDate,
        adminShare50: invoiceCalculations.adminShare50,
        catShare50: invoiceCalculations.catShare50,
        netProfitAdmin: invoiceCalculations.netProfitAdmin,
      })
      .from(invoices)
      .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
      .where(or(
        eq(invoices.status, 'paid'),
        // Include ANY invoice with actualPaymentDate set (regardless of current status)
        isNotNull(invoices.actualPaymentDate)
      ));
    
    // Use actualPaymentDate if available, fallback to paymentDate
    return results.map(r => ({
      id: r.id,
      status: r.status,
      paymentDate: r.actualPaymentDate || r.paymentDate || null,
      adminShare50: r.adminShare50,
      catShare50: r.catShare50,
      netProfitAdmin: r.netProfitAdmin,
    }));
  }

  async createInvoice(invoice: InsertInvoice, calculations: Partial<InvoiceCalculation>): Promise<Invoice> {
    const [created] = await db.insert(invoices).values(invoice).returning();
    
    // Auto-calculate all fields based on scheme
    const clientBill = parseFloat(calculations.clientBill || "0");
    const commissionRate = calculations.commissionRate ? parseFloat(calculations.commissionRate) : undefined;
    const executorExpenses = parseFloat(calculations.executorExpensesTotal || "0");
    const plannedExp = created.plannedExpenses ? parseFloat(created.plannedExpenses) : 0;
    
    const computed = calculateInvoiceServer(
      created.scheme as InvoiceScheme,
      clientBill,
      commissionRate,
      executorExpenses,
      0, // expensesPaidByPartner
      0, // expensesPaidByAdmin
      plannedExp
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
    const plannedExp = invoice.plannedExpenses ? parseFloat(invoice.plannedExpenses) : 0;
    
    // Recalculate all fields with both expense types
    const computed = calculateInvoiceServer(
      invoice.scheme as InvoiceScheme,
      clientBill,
      commissionRate,
      executorExpenses,
      expensesPaidByPartner,
      expensesPaidByAdmin,
      plannedExp
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

  async getAllExpenses(): Promise<InvoiceExpense[]> {
    return db
      .select()
      .from(invoiceExpenses)
      .orderBy(desc(invoiceExpenses.date));
  }

  async createInvoiceExpense(expense: InsertInvoiceExpense): Promise<InvoiceExpense> {
    const [created] = await db.insert(invoiceExpenses).values(expense).returning();
    
    // Recalculate with proper expense breakdown by payer
    await this.recalculateInvoiceExpenses(expense.invoiceId);
    
    return created;
  }
  
  private async recalculateInvoiceExpenses(invoiceId: string): Promise<void> {
    const expenses = await this.getInvoiceExpenses(invoiceId);
    const total = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
    const expensesPaidByPartner = expenses
      .filter(e => e.paidByAdmin !== true)
      .reduce((sum, e) => sum + parseFloat(e.amount), 0);
    const expensesPaidByAdmin = expenses
      .filter(e => e.paidByAdmin === true)
      .reduce((sum, e) => sum + parseFloat(e.amount), 0);
    
    // Get invoice to know scheme and commission rate
    const invoice = await this.getInvoice(invoiceId);
    if (!invoice) return;
    
    const [existing] = await db
      .select()
      .from(invoiceCalculations)
      .where(eq(invoiceCalculations.invoiceId, invoiceId))
      .limit(1);
    
    if (!existing) return;
    
    const clientBill = parseFloat(existing.clientBill || "0");
    const commissionRate = existing.commissionRate ? parseFloat(existing.commissionRate) : undefined;
    const plannedExp = invoice.plannedExpenses ? parseFloat(invoice.plannedExpenses) : 0;
    
    // Recalculate with correct expense breakdown
    const computed = calculateInvoiceServer(
      invoice.scheme as InvoiceScheme,
      clientBill,
      commissionRate,
      total,
      expensesPaidByPartner,
      expensesPaidByAdmin,
      plannedExp
    );
    
    await db.update(invoiceCalculations)
      .set({ ...computed, updatedAt: new Date() })
      .where(eq(invoiceCalculations.invoiceId, invoiceId));
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
    
    // Recalculate with proper expense breakdown by payer
    await this.recalculateInvoiceExpenses(expense.invoiceId);
    
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
      
      // Recalculate with proper expense breakdown by payer
      await this.recalculateInvoiceExpenses(expense.invoiceId);
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

  async getPartnerPayment(id: string): Promise<PartnerPayment | null> {
    const [payment] = await db.select().from(partnerPayments).where(eq(partnerPayments.id, id)).limit(1);
    return payment || null;
  }

  async updatePartnerPayment(id: string, updates: Partial<InsertPartnerPayment>): Promise<PartnerPayment | null> {
    const [updated] = await db
      .update(partnerPayments)
      .set(updates)
      .where(eq(partnerPayments.id, id))
      .returning();
    return updated || null;
  }

  async deletePartnerPayment(id: string): Promise<void> {
    await db.delete(partnerPayments).where(eq(partnerPayments.id, id));
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
    let expectedProfit = 0;  // For unpaid invoices
    let receivedProfit = 0;  // For paid invoices
    let clientRemaining = 0;
    let totalPlannedExpenses = 0;  // Reserved funds from planned expenses
    
    for (const r of results) {
      const inv = r.invoice;
      const calc = r.calculations;
      
      totalInvoices++;
      const clientBill = calc ? parseFloat(calc.clientBill || "0") : 0;
      const expenses = calc ? parseFloat(calc.executorExpensesTotal || "0") : 0;
      const plannedExp = inv.plannedExpenses ? parseFloat(inv.plannedExpenses) : 0;
      
      totalClientBill += clientBill;
      totalExpenses += expenses;
      totalPlannedExpenses += plannedExp;
      
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
        const netProfit = parseFloat(calc.netProfitAdmin || "0");
        
        if (scheme === 'agency_30' || scheme === 'agency_40') {
          // Agency schemes: partner & admin get from margin
          totalPartnerCommission += parseFloat(calc.partnerShareFromMargin || "0");
          totalAdminShare += parseFloat(calc.adminShareFromMargin || "0");
          clientRemaining += parseFloat(calc.clientBaseAfterMargin || "0") - expenses;
        } else {
          // partner_10, partner_15, commission_based
          totalPartnerCommission += parseFloat(calc.commissionAmount || "0");
          totalAdminShare += parseFloat(calc.amountToAdmin || "0");
          clientRemaining += parseFloat(calc.clientRemaining || "0");
        }
        
        totalNetProfit += netProfit;
        
        // Split profit into expected vs received based on payment status
        if (inv.status === 'paid') {
          receivedProfit += netProfit;
        } else {
          expectedProfit += netProfit;
        }
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
      stats.expectedProfit = expectedProfit;  // Profit from unpaid invoices
      stats.receivedProfit = receivedProfit;  // Profit from paid invoices
      stats.totalPlannedExpenses = totalPlannedExpenses;  // Reserved for planned expenses
      stats.clientRemaining = clientRemaining;
      
      // Calculate recurring expected amounts for admin
      const recurringStats = await this.getRecurringExpectedAmounts();
      stats.recurringExpectedMonthly = recurringStats.monthly;
      stats.recurringExpectedYearly = recurringStats.yearly;
    } else if (role === 'partner') {
      stats.totalPartnerCommission = totalPartnerCommission;
      stats.partnerDebt = partnerDebt;
      stats.clientRemaining = clientRemaining;
    } else if (role === 'client') {
      stats.clientRemaining = Math.max(0, clientRemaining);
    }
    
    return stats;
  }
  
  async getRecurringExpectedAmounts(): Promise<{ monthly: number; yearly: number }> {
    const activeRecurring = await db
      .select()
      .from(recurringInvoices)
      .where(eq(recurringInvoices.isActive, true));
    
    let monthlyTotal = 0;
    let yearlyTotal = 0;
    const now = new Date();
    const yearEnd = new Date(now.getFullYear(), 11, 31);
    
    for (const recurring of activeRecurring) {
      const amount = parseFloat(recurring.amount || "0");
      if (amount <= 0) continue;
      
      const scheme = recurring.scheme as InvoiceScheme;
      const partnerCommissionRate = recurring.partnerCommissionRate 
        ? parseFloat(recurring.partnerCommissionRate) 
        : undefined;
      
      // Calculate expected admin profit
      const calculation = calculateInvoiceServer(scheme, amount, partnerCommissionRate, 0, 0, 0);
      const expectedProfit = parseFloat(calculation.netProfitAdmin || "0");
      
      if (expectedProfit <= 0) continue;
      
      const frequency = recurring.frequency as 'monthly' | 'quarterly' | 'yearly';
      const endDateValue = recurring.endDate ? new Date(recurring.endDate) : null;
      
      // Calculate monthly expected (for next month)
      if (!endDateValue || endDateValue >= now) {
        switch (frequency) {
          case 'monthly':
            monthlyTotal += expectedProfit;
            break;
          case 'quarterly':
            monthlyTotal += expectedProfit / 3;
            break;
          case 'yearly':
            monthlyTotal += expectedProfit / 12;
            break;
        }
      }
      
      // Calculate yearly expected (remaining occurrences this year)
      const dayOfMonth = parseInt(recurring.dayOfMonth || "1");
      let checkDate = recurring.nextInvoiceDate 
        ? new Date(recurring.nextInvoiceDate) 
        : new Date(now.getFullYear(), now.getMonth(), dayOfMonth);
      
      if (checkDate < now) {
        switch (frequency) {
          case 'monthly':
            checkDate = new Date(now.getFullYear(), now.getMonth() + 1, dayOfMonth);
            break;
          case 'quarterly':
            checkDate.setMonth(checkDate.getMonth() + 3);
            break;
          case 'yearly':
            checkDate.setFullYear(checkDate.getFullYear() + 1);
            break;
        }
      }
      
      let iterations = 0;
      const maxIterations = 50;
      
      while (checkDate <= yearEnd && iterations < maxIterations) {
        iterations++;
        
        if (endDateValue && checkDate > endDateValue) break;
        
        yearlyTotal += expectedProfit;
        
        const nextYear = checkDate.getFullYear();
        const nextMonth = checkDate.getMonth();
        
        switch (frequency) {
          case 'monthly':
            checkDate = new Date(nextYear, nextMonth + 1, dayOfMonth);
            break;
          case 'quarterly':
            checkDate = new Date(nextYear, nextMonth + 3, dayOfMonth);
            break;
          case 'yearly':
            checkDate = new Date(nextYear + 1, nextMonth, dayOfMonth);
            break;
        }
      }
    }
    
    return { monthly: monthlyTotal, yearly: yearlyTotal };
  }

  async getPartnerDebtSummaries(): Promise<{
    partnerId: string;
    partnerName: string;
    totalToTransfer: number;
    totalPaid: number;
    remaining: number;
    invoiceCount: number;
    paidCommission: number;
    totalInvoiceCount: number;
    email: string | null;
    phone: string | null;
  }[]> {
    // Get all invoices for total counts
    const allInvoicesList = await db
      .select({
        invoice: invoices,
        calculations: invoiceCalculations,
        partnerName: partners.name,
        partnerEmail: partners.email,
        partnerPhone: partners.phone,
      })
      .from(invoices)
      .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
      .leftJoin(partners, eq(invoices.partnerId, partners.id));
    
    // Get all paid invoices with their stored partnerTransferDue values
    const paidInvoices = allInvoicesList.filter(r => r.invoice.status === 'paid');

    const allPayments = await db.select().from(partnerPayments);

    const partnerMap = new Map<string, {
      partnerId: string;
      partnerName: string;
      totalToTransfer: number;
      totalPaid: number;
      remaining: number;
      invoiceCount: number;
      paidCommission: number;
      totalInvoiceCount: number;
      email: string | null;
      phone: string | null;
    }>();

    // First pass: count all invoices per partner
    for (const row of allInvoicesList) {
      if (!row.invoice.partnerId) continue;
      
      const pid = row.invoice.partnerId;
      const pName = row.partnerName || 'Unknown';
      
      if (!partnerMap.has(pid)) {
        partnerMap.set(pid, {
          partnerId: pid,
          partnerName: pName,
          totalToTransfer: 0,
          totalPaid: 0,
          remaining: 0,
          invoiceCount: 0,
          paidCommission: 0,
          totalInvoiceCount: 0,
          email: row.partnerEmail,
          phone: row.partnerPhone,
        });
      }
      
      const summary = partnerMap.get(pid)!;
      summary.totalInvoiceCount += 1;
    }

    // Second pass: process paid invoices for debt and commission
    for (const row of paidInvoices) {
      if (!row.invoice.partnerId || !row.calculations) continue;
      
      const pid = row.invoice.partnerId;
      const pName = row.partnerName || 'Unknown';
      
      // Use stored values from calculations - single source of truth
      // Guard against NaN with || 0
      const debt = parseFloat(row.calculations.partnerTransferDue || "0") || 0;
      const commission = parseFloat(row.calculations.commissionAmount || "0") || 0;

      if (!partnerMap.has(pid)) {
        partnerMap.set(pid, {
          partnerId: pid,
          partnerName: pName,
          totalToTransfer: 0,
          totalPaid: 0,
          remaining: 0,
          invoiceCount: 0,
          paidCommission: 0,
          totalInvoiceCount: 0,
          email: row.partnerEmail,
          phone: row.partnerPhone,
        });
      }

      const summary = partnerMap.get(pid)!;
      summary.totalToTransfer += debt;
      summary.invoiceCount += 1;
      summary.paidCommission += commission;
    }

    for (const payment of allPayments) {
      if (partnerMap.has(payment.partnerId)) {
        const summary = partnerMap.get(payment.partnerId)!;
        summary.totalPaid += parseFloat(payment.amount) || 0;
      }
    }

    // Include ALL partners, not just those with debt
    const allPartnersDb = await db.select().from(partners);
    
    for (const partner of allPartnersDb) {
      if (!partnerMap.has(partner.id)) {
        partnerMap.set(partner.id, {
          partnerId: partner.id,
          partnerName: partner.name,
          totalToTransfer: 0,
          totalPaid: 0,
          remaining: 0,
          invoiceCount: 0,
          paidCommission: 0,
          totalInvoiceCount: 0,
          email: partner.email,
          phone: partner.phone,
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

  async getDoNotSpendData(partnerId?: string): Promise<{
    clientId: string;
    clientName: string;
    totalBudget: number;
    totalSpent: number;
    remaining: number;
    invoiceCount: number;
    invoices: {
      id: string;
      number: string;
      description: string | null;
      notes: string | null;
      budget: number;
      spent: number;
      remaining: number;
      createdAt: Date | null;
    }[];
  }[]> {
    const conditions = [
      inArray(invoices.scheme, ['agency_30', 'agency_40']),
      eq(invoices.status, 'paid')
    ];
    
    if (partnerId) {
      conditions.push(eq(invoices.partnerId, partnerId));
    }
    
    const agencyInvoices = await db
      .select({
        invoice: invoices,
        calculations: invoiceCalculations,
        clientName: clients.name,
      })
      .from(invoices)
      .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
      .leftJoin(clients, eq(invoices.clientId, clients.id))
      .where(and(...conditions));

    const clientMap = new Map<string, {
      clientId: string;
      clientName: string;
      totalBudget: number;
      totalSpent: number;
      remaining: number;
      invoiceCount: number;
      invoices: {
        id: string;
        number: string;
        description: string | null;
        notes: string | null;
        budget: number;
        spent: number;
        remaining: number;
        createdAt: Date | null;
      }[];
    }>();

    for (const row of agencyInvoices) {
      if (!row.invoice.clientId || !row.calculations) continue;

      const clientId = row.invoice.clientId;
      const clientName = row.clientName || 'Unknown';
      const clientBill = parseFloat(row.calculations.clientBill || "0");
      const executorExpenses = parseFloat(row.calculations.executorExpensesTotal || "0");
      
      // Use stored clientBaseAfterMargin if available, else calculate based on scheme
      const scheme = row.invoice.scheme;
      const clientBaseRate = scheme === 'agency_40' ? 0.6 : 0.7; // agency_40: 60%, agency_30: 70%
      const clientBase = parseFloat(row.calculations.clientBaseAfterMargin || "0") || (clientBill * clientBaseRate);
      const doNotSpendBudget = clientBase;
      const invoiceRemaining = Math.max(0, doNotSpendBudget - executorExpenses);
      
      if (!clientMap.has(clientId)) {
        clientMap.set(clientId, {
          clientId,
          clientName,
          totalBudget: 0,
          totalSpent: 0,
          remaining: 0,
          invoiceCount: 0,
          invoices: [],
        });
      }

      const summary = clientMap.get(clientId)!;
      summary.totalBudget += doNotSpendBudget;
      summary.totalSpent += executorExpenses;
      summary.invoiceCount += 1;
      summary.invoices.push({
        id: row.invoice.id,
        number: row.invoice.invoiceNumber || `INV-${row.invoice.id}`,
        description: row.invoice.description,
        notes: row.invoice.notes,
        budget: doNotSpendBudget,
        spent: executorExpenses,
        remaining: invoiceRemaining,
        createdAt: row.invoice.createdAt,
      });
    }

    return Array.from(clientMap.values())
      .map(s => ({
        ...s,
        remaining: Math.max(0, s.totalBudget - s.totalSpent),
        invoices: s.invoices.sort((a, b) => {
          if (!a.createdAt || !b.createdAt) return 0;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }),
      }))
      .filter(s => s.totalBudget > 0)
      .sort((a, b) => b.remaining - a.remaining);
  }

  async getPartnerSchemeDoNotSpendData(partnerId?: string, role?: string): Promise<{
    partnerId: string;
    partnerName: string;
    totalPlannedExpenses: number;
    totalSpent: number;
    totalCommission: number;
    totalDoNotSpend: number;
    totalPartnerDebt: number;
    totalClientBill: number;
    invoiceCount: number;
    invoices: {
      id: string;
      number: string;
      description: string | null;
      notes: string | null;
      clientBill: number;
      plannedExpenses: number;
      spent: number;
      remaining: number;
      commission: number;
      partnerDebt: number;
      doNotSpend: number;
      createdAt: Date | null;
    }[];
  }[]> {
    // Include all partner schemes: commission_based, partner_10, partner_15
    const conditions = [
      inArray(invoices.scheme, ['commission_based', 'partner_10', 'partner_15']),
      inArray(invoices.status, ['paid', 'sent'])
    ];
    
    if (partnerId) {
      conditions.push(eq(invoices.partnerId, partnerId));
    }
    
    const partnerInvoices = await db
      .select({
        invoice: invoices,
        calculations: invoiceCalculations,
        partnerName: partners.name,
      })
      .from(invoices)
      .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
      .leftJoin(partners, eq(invoices.partnerId, partners.id))
      .where(and(...conditions));

    // Get all expenses for partner scheme invoices to calculate spent amounts
    const invoiceIds = partnerInvoices.map(row => row.invoice.id);
    const allExpenses = invoiceIds.length > 0 
      ? await db.select().from(invoiceExpenses).where(inArray(invoiceExpenses.invoiceId, invoiceIds))
      : [];
    
    // Group expenses by invoice ID
    const expensesByInvoice = new Map<string, { paidByPartner: number; paidByAdmin: number }>();
    for (const expense of allExpenses) {
      const current = expensesByInvoice.get(expense.invoiceId) || { paidByPartner: 0, paidByAdmin: 0 };
      const amount = parseFloat(expense.amount);
      if (expense.paidByAdmin === true) {
        current.paidByAdmin += amount;
      } else {
        current.paidByPartner += amount;
      }
      expensesByInvoice.set(expense.invoiceId, current);
    }

    const partnerMap = new Map<string, {
      partnerId: string;
      partnerName: string;
      totalPlannedExpenses: number;
      totalSpent: number;
      totalCommission: number;
      totalDoNotSpend: number;
      totalPartnerDebt: number;
      totalClientBill: number;
      invoiceCount: number;
      invoices: {
        id: string;
        number: string;
        description: string | null;
        notes: string | null;
        clientBill: number;
        plannedExpenses: number;
        spent: number;
        remaining: number;
        commission: number;
        partnerDebt: number;
        doNotSpend: number;
        createdAt: Date | null;
      }[];
    }>();

    for (const row of partnerInvoices) {
      if (!row.invoice.partnerId || !row.calculations) continue;

      const pId = row.invoice.partnerId;
      const partnerName = row.partnerName || 'Unknown';
      const clientBill = parseFloat(row.calculations.clientBill || "0");
      const plannedExpenses = row.invoice.plannedExpenses ? parseFloat(row.invoice.plannedExpenses) : 0;
      const commissionRate = row.calculations.commissionRate ? parseFloat(row.calculations.commissionRate) : 10;
      
      // Get ACTUAL spent expenses from invoice_expenses table (partner-paid only)
      const invoiceExpensesData = expensesByInvoice.get(row.invoice.id) || { paidByPartner: 0, paidByAdmin: 0 };
      const spent = invoiceExpensesData.paidByPartner;
      const remaining = Math.max(0, plannedExpenses - spent);
      
      // Commission is partner's share (what they keep): clientBill * (commissionRate / 100)
      const commission = clientBill * (commissionRate / 100);
      
      // Partner debt comes from stored calculation (FIXED value, doesn't change with expenses)
      const partnerDebt = parseFloat(row.calculations.partnerTransferDue || "0");
      
      // "Do not spend" calculation - only remaining planned expenses
      // Commission is now tracked separately for "Expected Commission" dashboard
      const doNotSpend = remaining;
      
      // Skip invoices without planned expenses (same logic for ALL roles)
      if (plannedExpenses <= 0) continue;
      
      if (!partnerMap.has(pId)) {
        partnerMap.set(pId, {
          partnerId: pId,
          partnerName,
          totalPlannedExpenses: 0,
          totalSpent: 0,
          totalCommission: 0,
          totalDoNotSpend: 0,
          totalPartnerDebt: 0,
          totalClientBill: 0,
          invoiceCount: 0,
          invoices: [],
        });
      }

      const summary = partnerMap.get(pId)!;
      summary.totalPlannedExpenses += plannedExpenses;
      summary.totalSpent += spent;
      // Only add commission to totals for non-assistant roles
      summary.totalCommission += role === 'assistant' ? 0 : commission;
      summary.totalDoNotSpend += doNotSpend;
      summary.totalPartnerDebt += partnerDebt;
      summary.totalClientBill += clientBill;
      summary.invoiceCount += 1;
      summary.invoices.push({
        id: row.invoice.id,
        number: row.invoice.invoiceNumber || `INV-${row.invoice.id}`,
        description: row.invoice.description,
        notes: row.invoice.notes,
        clientBill,
        plannedExpenses,
        spent,
        remaining,
        commission: role === 'assistant' ? 0 : commission,
        partnerDebt,
        doNotSpend,
        createdAt: row.invoice.createdAt,
      });
    }

    // Filter and sort results, zero out commission fields for assistant
    return Array.from(partnerMap.values())
      .map(s => ({
        ...s,
        // Ensure assistant never sees any commission data
        totalCommission: role === 'assistant' ? 0 : s.totalCommission,
        invoices: s.invoices.sort((a, b) => {
          if (!a.createdAt || !b.createdAt) return 0;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }),
      }))
      .filter(s => s.totalDoNotSpend > 0)
      .sort((a, b) => b.totalDoNotSpend - a.totalDoNotSpend);
  }

  async getExpectedCommission(partnerId?: string): Promise<{
    partnerId: string;
    partnerName: string;
    totalExpectedCommission: number;
    invoiceCount: number;
    invoices: {
      id: string;
      number: string;
      clientName: string | null;
      clientBill: number;
      commission: number;
      scheme: string;
      createdAt: Date | null;
    }[];
  }[]> {
    // Get all UNPAID invoices (status = 'sent') for partner schemes
    const conditions = [
      inArray(invoices.scheme, ['commission_based', 'partner_10', 'partner_15', 'agency_30', 'agency_40']),
      eq(invoices.status, 'sent')
    ];
    
    if (partnerId) {
      conditions.push(eq(invoices.partnerId, partnerId));
    }
    
    const unpaidInvoices = await db
      .select({
        invoice: invoices,
        calculations: invoiceCalculations,
        partnerName: partners.name,
        clientName: clients.name,
      })
      .from(invoices)
      .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
      .leftJoin(partners, eq(invoices.partnerId, partners.id))
      .leftJoin(clients, eq(invoices.clientId, clients.id))
      .where(and(...conditions));

    const partnerMap = new Map<string, {
      partnerId: string;
      partnerName: string;
      totalExpectedCommission: number;
      invoiceCount: number;
      invoices: {
        id: string;
        number: string;
        clientName: string | null;
        clientBill: number;
        commission: number;
        scheme: string;
        createdAt: Date | null;
      }[];
    }>();

    for (const row of unpaidInvoices) {
      if (!row.invoice.partnerId || !row.calculations) continue;

      const pId = row.invoice.partnerId;
      const partnerName = row.partnerName || 'Unknown';
      const clientBill = parseFloat(row.calculations.clientBill || "0");
      const scheme = row.invoice.scheme || 'commission_based';
      
      // Calculate commission based on scheme
      let commission = 0;
      if (scheme === 'agency_30' || scheme === 'agency_40') {
        // For agency schemes: partner gets partnerShareFromMargin
        commission = parseFloat(row.calculations.partnerShareFromMargin || "0");
      } else {
        // For partner_10, partner_15, commission_based: use commissionAmount
        commission = parseFloat(row.calculations.commissionAmount || "0");
      }
      
      if (commission <= 0) continue;
      
      if (!partnerMap.has(pId)) {
        partnerMap.set(pId, {
          partnerId: pId,
          partnerName,
          totalExpectedCommission: 0,
          invoiceCount: 0,
          invoices: [],
        });
      }

      const summary = partnerMap.get(pId)!;
      summary.totalExpectedCommission += commission;
      summary.invoiceCount += 1;
      summary.invoices.push({
        id: row.invoice.id,
        number: row.invoice.invoiceNumber || `INV-${row.invoice.id}`,
        clientName: row.clientName,
        clientBill,
        commission,
        scheme,
        createdAt: row.invoice.createdAt,
      });
    }

    return Array.from(partnerMap.values())
      .map(s => ({
        ...s,
        invoices: s.invoices.sort((a, b) => {
          if (!a.createdAt || !b.createdAt) return 0;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }),
      }))
      .filter(s => s.totalExpectedCommission > 0)
      .sort((a, b) => b.totalExpectedCommission - a.totalExpectedCommission);
  }

  async getExpectedAdminProfit(): Promise<{
    partnerId: string;
    partnerName: string;
    totalExpectedProfit: number;
    invoiceCount: number;
    invoices: {
      id: string;
      number: string;
      clientName: string | null;
      clientBill: number;
      netProfitAdmin: number;
      scheme: string;
      createdAt: Date | null;
    }[];
  }[]> {
    // Get all UNPAID invoices (status = 'sent' or 'draft') with calculations
    const conditions = [
      inArray(invoices.status, ['sent', 'draft'])
    ];
    
    const unpaidInvoices = await db
      .select({
        invoice: invoices,
        calculations: invoiceCalculations,
        partnerName: partners.name,
        clientName: clients.name,
      })
      .from(invoices)
      .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
      .leftJoin(partners, eq(invoices.partnerId, partners.id))
      .leftJoin(clients, eq(invoices.clientId, clients.id))
      .where(and(...conditions));

    const partnerMap = new Map<string, {
      partnerId: string;
      partnerName: string;
      totalExpectedProfit: number;
      invoiceCount: number;
      invoices: {
        id: string;
        number: string;
        clientName: string | null;
        clientBill: number;
        netProfitAdmin: number;
        scheme: string;
        createdAt: Date | null;
      }[];
    }>();

    for (const row of unpaidInvoices) {
      if (!row.calculations) continue;

      const pId = row.invoice.partnerId || 'no-partner';
      const partnerName = row.partnerName || 'Без партнёра';
      const clientBill = parseFloat(row.calculations.clientBill || "0");
      const netProfitAdmin = parseFloat(row.calculations.netProfitAdmin || "0");
      const scheme = row.invoice.scheme || 'commission_based';
      
      if (netProfitAdmin <= 0) continue;
      
      if (!partnerMap.has(pId)) {
        partnerMap.set(pId, {
          partnerId: pId,
          partnerName,
          totalExpectedProfit: 0,
          invoiceCount: 0,
          invoices: [],
        });
      }

      const summary = partnerMap.get(pId)!;
      summary.totalExpectedProfit += netProfitAdmin;
      summary.invoiceCount += 1;
      summary.invoices.push({
        id: row.invoice.id,
        number: row.invoice.invoiceNumber || `INV-${row.invoice.id}`,
        clientName: row.clientName,
        clientBill,
        netProfitAdmin,
        scheme,
        createdAt: row.invoice.createdAt,
      });
    }

    return Array.from(partnerMap.values())
      .map(s => ({
        ...s,
        invoices: s.invoices.sort((a, b) => {
          if (!a.createdAt || !b.createdAt) return 0;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }),
      }))
      .filter(s => s.totalExpectedProfit > 0)
      .sort((a, b) => b.totalExpectedProfit - a.totalExpectedProfit);
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
      recurring: number;
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
    recurringExpected: {
      monthlyAmount: number;
      yearlyTotal: number;
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
      
      // Use partnerTransferDue for cash flow - this is what partner actually transfers after expenses
      let cashToAdmin: number;
      if (scheme === 'agency_30' || scheme === 'agency_40') {
        cashToAdmin = parseFloat(row.calculations.adminShareFromMargin || "0");
      } else {
        // Partner transfers partnerTransferDue = amountToAdmin - expensesPaidByPartner
        cashToAdmin = parseFloat(row.calculations.partnerTransferDue || "0");
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
        
        // Monthly net profit - based on payment date within selected month
        if (paymentDate && paymentDate >= monthStart && paymentDate <= monthEnd) {
          monthlyReceived += netProfit;  // Now using netProfitAdmin instead of cashToAdmin
          monthlyProfit += netProfit;
          
          // Monthly leverage calculation
          if (isVika) {
            monthlyVikaProfit += netProfit;
          } else {
            monthlyOthersProfit += netProfit;
          }
        }
      }
      
      // Expected this month - unpaid invoices with planned payment date in selected month
      if (status !== 'paid' && status !== 'cancelled' && paymentDate && paymentDate >= monthStart && paymentDate <= monthEnd) {
        monthlyExpected += netProfit;
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
    
    // Get recurring expected for selected month
    const recurringStats = await this.getRecurringExpectedForMonth(selectedYear, selectedMonth);
    
    return {
      yearlySummary: {
        totalRevenue: yearlyRevenue,
        totalProfit: yearlyProfit,
        netProfitMargin: netProfitMargin,
      },
      monthlyCashFlow: {
        received: monthlyReceived,
        expected: monthlyExpected,
        recurring: recurringStats.monthlyAmount,
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
      recurringExpected: recurringStats,
      selectedYear,
      selectedMonth,
      availableYears,
    };
  }
  
  async getRecurringExpectedForMonth(year: number, month: number): Promise<{ monthlyAmount: number; yearlyTotal: number }> {
    const activeRecurring = await db
      .select()
      .from(recurringInvoices)
      .where(eq(recurringInvoices.isActive, true));
    
    let monthlyAmount = 0;
    let yearlyTotal = 0;
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31);
    const now = new Date();
    
    // Helper to advance date by frequency
    const advanceByFrequency = (date: Date, freq: 'monthly' | 'quarterly' | 'yearly', day: number): Date => {
      switch (freq) {
        case 'monthly':
          return new Date(date.getFullYear(), date.getMonth() + 1, day);
        case 'quarterly':
          return new Date(date.getFullYear(), date.getMonth() + 3, day);
        case 'yearly':
          return new Date(date.getFullYear() + 1, date.getMonth(), day);
      }
    };
    
    // Generator: yields all occurrences in [rangeStart, rangeEnd]
    // CRITICAL: Always iterate from scheduleStart anchor to preserve frequency alignment
    const generateOccurrences = function*(
      scheduleStart: Date,
      frequency: 'monthly' | 'quarterly' | 'yearly',
      dayOfMonth: number,
      rangeStart: Date,
      rangeEnd: Date,
      scheduleEnd: Date | null
    ): Generator<Date> {
      // ALWAYS start from schedule anchor to preserve frequency alignment
      // e.g., quarterly starting May 10 → May, Aug, Nov, Feb, May...
      let cursor = new Date(scheduleStart.getFullYear(), scheduleStart.getMonth(), dayOfMonth);
      
      // If cursor is before scheduleStart, set to scheduleStart's month
      if (cursor < scheduleStart) {
        cursor = new Date(scheduleStart.getFullYear(), scheduleStart.getMonth(), dayOfMonth);
      }
      
      let iterations = 0;
      while (cursor <= rangeEnd && iterations < 500) {
        iterations++;
        
        // Stop if past schedule end
        if (scheduleEnd && cursor > scheduleEnd) break;
        
        // Yield occurrence only if:
        // 1. cursor >= scheduleStart (schedule has begun)
        // 2. cursor >= rangeStart (within query range)
        // 3. cursor <= rangeEnd (within query range)
        if (cursor >= scheduleStart && cursor >= rangeStart && cursor <= rangeEnd) {
          yield cursor;
        }
        
        cursor = advanceByFrequency(cursor, frequency, dayOfMonth);
      }
    };
    
    for (const recurring of activeRecurring) {
      const amount = parseFloat(recurring.amount || "0");
      if (amount <= 0) continue;
      
      const scheme = recurring.scheme as InvoiceScheme;
      const partnerCommissionRate = recurring.partnerCommissionRate 
        ? parseFloat(recurring.partnerCommissionRate) 
        : undefined;
      
      const calculation = calculateInvoiceServer(scheme, amount, partnerCommissionRate, 0, 0, 0);
      const expectedProfit = parseFloat(calculation.netProfitAdmin || "0");
      
      if (expectedProfit <= 0) continue;
      
      const dayOfMonth = parseInt(recurring.dayOfMonth || "1");
      const frequency = recurring.frequency as 'monthly' | 'quarterly' | 'yearly';
      const endDateValue = recurring.endDate ? new Date(recurring.endDate) : null;
      const startDate = recurring.startDate ? new Date(recurring.startDate) : new Date();
      
      // Check if schedule is active for this year
      if (startDate > yearEnd) continue;
      if (endDateValue && endDateValue < yearStart) continue;
      
      // For current year, count from now; for other years, count from yearStart
      const countFromDate = year === now.getFullYear() 
        ? (now > yearStart ? now : yearStart) 
        : yearStart;
      
      // 1. Calculate monthlyAmount - occurrences in selected month that are >= countFromDate
      const monthRangeStart = monthStart > countFromDate ? monthStart : countFromDate;
      for (const occurrence of generateOccurrences(startDate, frequency, dayOfMonth, monthRangeStart, monthEnd, endDateValue)) {
        monthlyAmount += expectedProfit;
      }
      
      // 2. Calculate yearlyTotal - all future occurrences from countFromDate to yearEnd
      for (const occurrence of generateOccurrences(startDate, frequency, dayOfMonth, countFromDate, yearEnd, endDateValue)) {
        yearlyTotal += expectedProfit;
      }
    }
    
    return { monthlyAmount, yearlyTotal };
  }
  
  async getCriticalAlerts(): Promise<Array<{
    id: string;
    type: 'overdue' | 'draft' | 'long_sent';
    severity: 'critical' | 'high' | 'medium';
    title: string;
    description: string;
    amount?: number;
    daysCount?: number;
    invoiceNumber: string;
    clientName: string;
  }>> {
    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    const alerts: Array<{
      id: string;
      type: 'overdue' | 'draft' | 'long_sent';
      severity: 'critical' | 'high' | 'medium';
      title: string;
      description: string;
      amount?: number;
      daysCount?: number;
      invoiceNumber: string;
      clientName: string;
    }> = [];

    // Get all relevant invoices
    const allInvoices = await db
      .select({
        invoice: invoices,
        calculations: invoiceCalculations,
        clientName: clients.name,
        partnerName: partners.name,
      })
      .from(invoices)
      .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
      .leftJoin(clients, eq(invoices.clientId, clients.id))
      .leftJoin(partners, eq(invoices.partnerId, partners.id));

    for (const row of allInvoices) {
      const { invoice, calculations, clientName, partnerName } = row;
      const clientBill = calculations ? parseFloat(calculations.clientBill || "0") : 0;

      // 1. Overdue payments - sent but not paid, past due date
      if (invoice.status === 'sent' && !invoice.actualPaymentDate && invoice.paymentDate) {
        const dueDate = new Date(invoice.paymentDate);
        if (dueDate < today) {
          const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (24 * 60 * 60 * 1000));
          const severity = daysOverdue > 30 ? 'critical' : daysOverdue > 14 ? 'high' : 'medium';
          
          alerts.push({
            id: invoice.id,
            type: 'overdue',
            severity,
            title: `Просрочка ${daysOverdue} ${daysOverdue === 1 ? "день" : "дней"}`,
            description: `${invoice.invoiceNumber} • ${clientName || 'N/A'} → ${partnerName || 'N/A'}`,
            amount: clientBill,
            daysCount: daysOverdue,
            invoiceNumber: invoice.invoiceNumber || '',
            clientName: clientName || '',
          });
        }
      }

      // 2. Drafts without payment date
      if (invoice.status === 'draft' && !invoice.paymentDate) {
        alerts.push({
          id: invoice.id,
          type: 'draft',
          severity: 'medium',
          title: "Нет даты оплаты",
          description: `${invoice.invoiceNumber} • ${clientName || 'N/A'}`,
          amount: clientBill,
          invoiceNumber: invoice.invoiceNumber || '',
          clientName: clientName || '',
        });
      }

      // 3. Long sent invoices (>30 days without payment)
      if (invoice.status === 'sent' && !invoice.actualPaymentDate && invoice.createdAt) {
        const createdAt = new Date(invoice.createdAt);
        if (createdAt < thirtyDaysAgo) {
          const daysWaiting = Math.floor((today.getTime() - createdAt.getTime()) / (24 * 60 * 60 * 1000));
          
          alerts.push({
            id: invoice.id,
            type: 'long_sent',
            severity: 'medium',
            title: `В ожидании ${daysWaiting} дней`,
            description: `${invoice.invoiceNumber} • ${clientName || 'N/A'}`,
            amount: clientBill,
            daysCount: daysWaiting,
            invoiceNumber: invoice.invoiceNumber || '',
            clientName: clientName || '',
          });
        }
      }
    }

    // Sort: critical -> high -> medium, within by days
    alerts.sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2 };
      if (severityOrder[a.severity] !== severityOrder[b.severity]) {
        return severityOrder[a.severity] - severityOrder[b.severity];
      }
      return (b.daysCount || 0) - (a.daysCount || 0);
    });

    return alerts;
  }

  async getAlertCounts(role: string): Promise<{
    overdueInvoices: number;
    pendingInvoices: number;
    unresolvedSecurityEvents: number;
  }> {
    const today = new Date();
    let overdueCount = 0;
    let pendingCount = 0;

    if (role === 'admin' || role === 'assistant') {
      // Overdue invoices - sent but past payment date
      const overdueInvoices = await db
        .select({ id: invoices.id })
        .from(invoices)
        .where(
          and(
            eq(invoices.status, 'sent'),
            isNull(invoices.actualPaymentDate),
            sql`${invoices.paymentDate} < ${today.toISOString().split('T')[0]}`
          )
        );
      overdueCount = overdueInvoices.length;
    }

    // Pending invoices (drafts)
    const pendingInvoices = await db
      .select({ id: invoices.id })
      .from(invoices)
      .where(eq(invoices.status, 'draft'));
    pendingCount = pendingInvoices.length;

    return {
      overdueInvoices: overdueCount,
      pendingInvoices: pendingCount,
      unresolvedSecurityEvents: 0, // security_events table not in Neon
    };
  }

  async globalSearch(query: string, role: string): Promise<Array<{
    id: string;
    type: 'invoice' | 'partner' | 'client';
    title: string;
    subtitle?: string;
    url?: string;
  }>> {
    const results: Array<{
      id: string;
      type: 'invoice' | 'partner' | 'client';
      title: string;
      subtitle?: string;
      url?: string;
    }> = [];

    if (role !== 'admin' && role !== 'assistant') {
      return results;
    }

    const searchPattern = `%${query.toLowerCase()}%`;

    // Search invoices
    const invoiceResults = await db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        clientName: clients.name,
        partnerName: partners.name,
      })
      .from(invoices)
      .leftJoin(clients, eq(invoices.clientId, clients.id))
      .leftJoin(partners, eq(invoices.partnerId, partners.id))
      .where(sql`LOWER(${invoices.invoiceNumber}) LIKE ${searchPattern}`)
      .limit(5);

    for (const inv of invoiceResults) {
      results.push({
        id: inv.id,
        type: 'invoice',
        title: inv.invoiceNumber || `Счёт ${inv.id.slice(0, 8)}`,
        subtitle: `${inv.clientName || 'Клиент'} • ${inv.partnerName || 'Партнёр'}`,
        url: `/invoices?invoice=${inv.id}`,
      });
    }

    // Search partners
    const partnerResults = await db
      .select({ id: partners.id, name: partners.name })
      .from(partners)
      .where(sql`LOWER(${partners.name}) LIKE ${searchPattern}`)
      .limit(5);

    for (const p of partnerResults) {
      results.push({
        id: p.id,
        type: 'partner',
        title: p.name,
        url: '/partners',
      });
    }

    // Search clients
    const clientResults = await db
      .select({ id: clients.id, name: clients.name })
      .from(clients)
      .where(sql`LOWER(${clients.name}) LIKE ${searchPattern}`)
      .limit(5);

    for (const c of clientResults) {
      results.push({
        id: c.id,
        type: 'client',
        title: c.name,
        url: '/clients',
      });
    }

    return results;
  }

  async getPriorityActions(): Promise<Array<{
    id: string;
    type: string;
    priority: number;
    title: string;
    description: string;
    amount: number | null;
    actionType: string;
  }>> {
    const today = new Date();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const actions: Array<{
      id: string;
      type: string;
      priority: number;
      title: string;
      description: string;
      amount: number | null;
      actionType: string;
    }> = [];

    // Overdue invoices
    const overdueInvoices = await db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        paymentDate: invoices.paymentDate,
        clientName: clients.name,
        clientBill: invoiceCalculations.clientBill,
      })
      .from(invoices)
      .leftJoin(clients, eq(invoices.clientId, clients.id))
      .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
      .where(
        and(
          eq(invoices.status, 'sent'),
          isNull(invoices.actualPaymentDate),
          sql`${invoices.paymentDate} < ${today.toISOString().split('T')[0]}`
        )
      );

    for (const inv of overdueInvoices) {
      const daysOverdue = Math.floor((today.getTime() - new Date(inv.paymentDate!).getTime()) / (1000 * 60 * 60 * 24));
      const clientBill = parseFloat(inv.clientBill || "0");
      actions.push({
        id: inv.id,
        type: 'overdue',
        priority: daysOverdue * clientBill,
        title: `Просрочен на ${daysOverdue} дн.`,
        description: `Счет ${inv.invoiceNumber} • ${inv.clientName || 'N/A'}`,
        amount: clientBill,
        actionType: 'mark_paid',
      });
    }

    // Draft invoices without payment date
    const draftInvoices = await db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        clientName: clients.name,
        clientBill: invoiceCalculations.clientBill,
      })
      .from(invoices)
      .leftJoin(clients, eq(invoices.clientId, clients.id))
      .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
      .where(
        and(
          eq(invoices.status, 'draft'),
          isNull(invoices.paymentDate)
        )
      );

    for (const inv of draftInvoices) {
      actions.push({
        id: inv.id,
        type: 'draft',
        priority: 50,
        title: 'Заполните дату оплаты',
        description: `Счет ${inv.invoiceNumber} • ${inv.clientName || 'N/A'}`,
        amount: parseFloat(inv.clientBill || "0"),
        actionType: 'edit',
      });
    }

    // Long-waiting sent invoices
    const longSentInvoices = await db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        createdAt: invoices.createdAt,
        clientName: clients.name,
        clientBill: invoiceCalculations.clientBill,
      })
      .from(invoices)
      .leftJoin(clients, eq(invoices.clientId, clients.id))
      .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
      .where(
        and(
          eq(invoices.status, 'sent'),
          isNull(invoices.actualPaymentDate),
          sql`${invoices.createdAt} < ${thirtyDaysAgo.toISOString()}`
        )
      );

    for (const inv of longSentInvoices) {
      const daysWaiting = Math.floor((today.getTime() - new Date(inv.createdAt!).getTime()) / (1000 * 60 * 60 * 24));
      actions.push({
        id: inv.id,
        type: 'long_sent',
        priority: daysWaiting,
        title: `Ожидает ${daysWaiting} дней`,
        description: `Счет ${inv.invoiceNumber} • ${inv.clientName || 'N/A'}`,
        amount: parseFloat(inv.clientBill || "0"),
        actionType: 'remind',
      });
    }

    // Sort by priority descending
    actions.sort((a, b) => b.priority - a.priority);
    return actions.slice(0, 5); // Top 5
  }

  async getOverdueInvoicesDetailed(): Promise<Array<{
    id: string;
    invoice_number: string;
    payment_date: string;
    overdue_days: number;
    priority_level: string;
    client_name: string;
    partner_name: string;
    client_bill: number;
  }>> {
    const today = new Date();
    
    const overdueInvoices = await db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        paymentDate: invoices.paymentDate,
        priorityLevel: invoices.priorityLevel,
        clientName: clients.name,
        partnerName: partners.name,
        clientBill: invoiceCalculations.clientBill,
      })
      .from(invoices)
      .leftJoin(clients, eq(invoices.clientId, clients.id))
      .leftJoin(partners, eq(invoices.partnerId, partners.id))
      .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
      .where(
        and(
          eq(invoices.status, 'sent'),
          sql`${invoices.paymentDate} < ${today.toISOString().split('T')[0]}`
        )
      )
      .orderBy(invoices.paymentDate);

    return overdueInvoices.map(inv => {
      const paymentDate = new Date(inv.paymentDate!);
      const overdueDays = Math.floor((today.getTime() - paymentDate.getTime()) / (1000 * 60 * 60 * 24));
      return {
        id: inv.id,
        invoice_number: inv.invoiceNumber || '',
        payment_date: inv.paymentDate || '',
        overdue_days: overdueDays,
        priority_level: inv.priorityLevel || 'normal',
        client_name: inv.clientName || '',
        partner_name: inv.partnerName || '',
        client_bill: parseFloat(inv.clientBill || "0"),
      };
    });
  }

  async getPartnerTerms(partnerId: string): Promise<Array<{
    scheme: string;
    partnerCommissionRate: number | null;
  }>> {
    const invoicesData = await db
      .select({
        scheme: invoices.scheme,
        partnerCommissionRate: invoices.partnerCommissionRate,
      })
      .from(invoices)
      .where(eq(invoices.partnerId, partnerId));

    // Get unique combinations
    const termsMap = new Map<string, { scheme: string; partnerCommissionRate: number | null }>();
    for (const inv of invoicesData) {
      const key = `${inv.scheme}-${inv.partnerCommissionRate}`;
      if (!termsMap.has(key)) {
        termsMap.set(key, {
          scheme: inv.scheme,
          partnerCommissionRate: inv.partnerCommissionRate,
        });
      }
    }

    return Array.from(termsMap.values()).sort((a, b) => a.scheme.localeCompare(b.scheme));
  }

  async getPartnerPayments(partnerId: string): Promise<Array<{
    id: string;
    amount: number;
    paymentDate: string;
    notes: string | null;
    invoiceId: string | null;
    invoiceNumber: string | null;
  }>> {
    // Get invoice IDs for the partner
    const partnerInvoices = await db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
      })
      .from(invoices)
      .where(eq(invoices.partnerId, partnerId));

    const invoiceMap = new Map<string, string>();
    for (const inv of partnerInvoices) {
      invoiceMap.set(inv.id, inv.invoiceNumber || '');
    }
    const invoiceIds = Array.from(invoiceMap.keys());

    // Get payments - always query by partnerId, optionally also by invoiceId
    let paymentsData: typeof partnerPayments.$inferSelect[] = [];
    
    if (invoiceIds.length > 0) {
      // Partner has invoices - get payments by invoice OR partner
      paymentsData = await db
        .select()
        .from(partnerPayments)
        .where(
          or(
            inArray(partnerPayments.invoiceId, invoiceIds),
            eq(partnerPayments.partnerId, partnerId)
          )
        )
        .orderBy(desc(partnerPayments.paymentDate));
    } else {
      // Partner has no invoices - only get payments by partnerId
      paymentsData = await db
        .select()
        .from(partnerPayments)
        .where(eq(partnerPayments.partnerId, partnerId))
        .orderBy(desc(partnerPayments.paymentDate));
    }

    // Deduplicate and merge
    const paymentsMap = new Map<string, {
      id: string;
      amount: number;
      paymentDate: string;
      notes: string | null;
      invoiceId: string | null;
      invoiceNumber: string | null;
    }>();

    for (const p of paymentsData) {
      if (!paymentsMap.has(p.id)) {
        paymentsMap.set(p.id, {
          id: p.id,
          amount: parseFloat(p.amount),
          paymentDate: p.paymentDate,
          notes: p.notes,
          invoiceId: p.invoiceId,
          invoiceNumber: p.invoiceId ? invoiceMap.get(p.invoiceId) || null : null,
        });
      }
    }

    return Array.from(paymentsMap.values()).sort(
      (a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime()
    );
  }

  async getClientBudget(clientId: string): Promise<Array<{
    invoiceId: string;
    invoiceNumber: string;
    partnerName: string;
    totalBudget: number;
    spent: number;
    remaining: number;
    expenses: Array<{
      description: string;
      amount: number;
      date: string;
    }>;
  }>> {
    // Get invoices with calculations for this client
    const clientInvoices = await db
      .select({
        invoice: invoices,
        calculations: invoiceCalculations,
      })
      .from(invoices)
      .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
      .where(
        and(
          eq(invoices.clientId, clientId),
          inArray(invoices.status, ['sent', 'paid'])
        )
      )
      .orderBy(desc(invoices.createdAt));

    // Get partner names
    const partnerIds = [...new Set(clientInvoices.map(i => i.invoice.partnerId).filter(Boolean))];
    const partnerData = partnerIds.length > 0
      ? await db.select().from(partners).where(inArray(partners.id, partnerIds as string[]))
      : [];
    const partnerMap = new Map(partnerData.map(p => [p.id, p.name]));

    // Get expenses for all invoices
    const invoiceIds = clientInvoices.map(i => i.invoice.id);
    const allExpenses = invoiceIds.length > 0
      ? await db.select().from(invoiceExpenses).where(inArray(invoiceExpenses.invoiceId, invoiceIds))
      : [];
    const expensesByInvoice = new Map<string, Array<{ description: string; amount: number; date: string }>>();
    for (const exp of allExpenses) {
      if (!expensesByInvoice.has(exp.invoiceId)) {
        expensesByInvoice.set(exp.invoiceId, []);
      }
      expensesByInvoice.get(exp.invoiceId)!.push({
        description: exp.description || '',
        amount: parseFloat(exp.amount),
        date: exp.date || '',
      });
    }

    return clientInvoices
      .filter(row => row.calculations?.clientBaseAfterMargin)
      .map(row => ({
        invoiceId: row.invoice.id,
        invoiceNumber: row.invoice.invoiceNumber || '',
        partnerName: row.invoice.partnerId ? partnerMap.get(row.invoice.partnerId) || '—' : '—',
        totalBudget: parseFloat(row.calculations?.clientBaseAfterMargin || '0'),
        spent: parseFloat(row.calculations?.executorExpensesTotal || '0'),
        remaining: parseFloat(row.calculations?.clientRemaining || '0'),
        expenses: expensesByInvoice.get(row.invoice.id) || [],
      }));
  }

  async getPartnerInvoicesDetail(partnerId: string): Promise<Array<{
    id: string;
    invoice_number: string | null;
    client_name: string;
    client_bill: number;
    partner_commission: number;
    debt_to_admin: number;
    paid_amount: number;
    remaining: number;
    status: string;
    created_at: string;
  }>> {
    // Get invoices with calculations for this partner
    const partnerInvoices = await db
      .select({
        invoice: invoices,
        calculations: invoiceCalculations,
      })
      .from(invoices)
      .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
      .where(eq(invoices.partnerId, partnerId))
      .orderBy(desc(invoices.createdAt));

    // Get client names
    const clientIds = [...new Set(partnerInvoices.map(i => i.invoice.clientId).filter(Boolean))];
    const clientData = clientIds.length > 0
      ? await db.select().from(clients).where(inArray(clients.id, clientIds as string[]))
      : [];
    const clientMap = new Map(clientData.map(c => [c.id, c.name]));

    // Get payments by invoice
    const invoiceIds = partnerInvoices.map(i => i.invoice.id);
    const paymentsData = invoiceIds.length > 0
      ? await db.select().from(partnerPayments).where(inArray(partnerPayments.invoiceId, invoiceIds))
      : [];
    const paymentsByInvoice = new Map<string, number>();
    for (const p of paymentsData) {
      if (p.invoiceId) {
        const current = paymentsByInvoice.get(p.invoiceId) || 0;
        paymentsByInvoice.set(p.invoiceId, current + parseFloat(p.amount));
      }
    }

    return partnerInvoices
      .map(row => {
        const calc = row.calculations;
        const clientBill = parseFloat(calc?.clientBill || '0');
        const partnerCommission = parseFloat(calc?.commissionAmount || '0') || parseFloat(calc?.partnerShareFromMargin || '0');
        const storedDebt = parseFloat(calc?.partnerTransferDue || '0');
        const debtToAdmin = Math.max(0, storedDebt);
        const paidAmount = paymentsByInvoice.get(row.invoice.id) || 0;
        const remaining = Math.max(0, debtToAdmin - paidAmount);

        return {
          id: row.invoice.id,
          invoice_number: row.invoice.invoiceNumber,
          client_name: row.invoice.clientId ? clientMap.get(row.invoice.clientId) || 'Клиент' : 'Клиент',
          client_bill: clientBill,
          partner_commission: partnerCommission,
          debt_to_admin: debtToAdmin,
          paid_amount: paidAmount,
          remaining,
          status: row.invoice.status,
          created_at: row.invoice.createdAt || '',
        };
      })
      .filter(inv => inv.remaining > 0);
  }

  async getClientAgency30Report(clientId: string): Promise<{
    total_paid: number;
    agency_margin: number;
    client_budget_70: number;
    total_spent: number;
    remaining_budget: number;
  }> {
    // Get agency scheme invoices (agency_30 and agency_40) for this client
    const agencyInvoices = await db
      .select({
        calculations: invoiceCalculations,
      })
      .from(invoices)
      .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
      .where(
        and(
          eq(invoices.clientId, clientId),
          inArray(invoices.scheme, ['agency_30', 'agency_40'])
        )
      );

    let totalPaid = 0;
    let agencyMargin = 0;
    let clientBudget = 0;
    let totalSpent = 0;
    let remainingBudget = 0;

    for (const row of agencyInvoices) {
      if (!row.calculations) continue;
      totalPaid += parseFloat(row.calculations.clientBill || '0');
      agencyMargin += parseFloat(row.calculations.agencyMargin || '0');
      clientBudget += parseFloat(row.calculations.clientBaseAfterMargin || '0');
      totalSpent += parseFloat(row.calculations.clientSpent || '0');
      remainingBudget += parseFloat(row.calculations.clientRemaining || '0');
    }

    return {
      total_paid: totalPaid,
      agency_margin: agencyMargin,
      client_budget_70: clientBudget,
      total_spent: totalSpent,
      remaining_budget: remainingBudget,
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
      
      // Use actualPaymentDate first, then paymentDate for grouping (matches dashboard logic)
      const paymentDateStr = row.invoice.actualPaymentDate || row.invoice.paymentDate;
      const paymentDate = paymentDateStr 
        ? new Date(paymentDateStr) 
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
        recurringAmount: 0,
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
      
      const isPaid = row.invoice.status === 'paid';
      
      // For paid invoices: use actualPaymentDate first, then paymentDate (matches dashboard logic)
      // For expected invoices: use plannedPaymentDate or issueDate
      let dateStr: string | Date | null;
      if (isPaid) {
        dateStr = row.invoice.actualPaymentDate || row.invoice.paymentDate;
      } else {
        dateStr = row.invoice.plannedPaymentDate || row.invoice.paymentDate || row.invoice.issueDate;
      }
      
      const paymentDate = dateStr ? new Date(dateStr) : null;
      
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
      
      if (isPaid) {
        forecastData[forecastIndex].receivedAmount += profit;
      } else if (row.invoice.status === 'sent') {
        forecastData[forecastIndex].expectedAmount += profit;
      }
    }
    
    // Add recurring invoices expected amounts to forecast
    const activeRecurring = await db
      .select()
      .from(recurringInvoices)
      .where(eq(recurringInvoices.isActive, true));
    
    for (const recurring of activeRecurring) {
      const amount = parseFloat(recurring.amount || "0");
      if (amount <= 0) continue;
      
      const scheme = recurring.scheme as InvoiceScheme;
      const partnerCommissionRate = recurring.partnerCommissionRate 
        ? parseFloat(recurring.partnerCommissionRate) 
        : undefined;
      
      // Calculate expected admin profit for this recurring invoice
      const calculation = calculateInvoiceServer(scheme, amount, partnerCommissionRate, 0, 0, 0);
      const expectedProfit = parseFloat(calculation.netProfitAdmin || "0");
      
      if (expectedProfit <= 0) continue;
      
      // Validate dates before processing
      const startDate = recurring.startDate ? new Date(recurring.startDate) : new Date();
      const endDateValue = recurring.endDate ? new Date(recurring.endDate) : null;
      const nextInvoiceDateValue = recurring.nextInvoiceDate 
        ? new Date(recurring.nextInvoiceDate) 
        : null;
      
      // Calculate end of forecast period
      const lastForecast = forecastData[forecastData.length - 1];
      const forecastEndDate = new Date(lastForecast.yearNum, lastForecast.monthIndex, 0);
      
      // Start from nextInvoiceDate if valid, otherwise calculate from startDate
      const dayOfMonth = parseInt(recurring.dayOfMonth || "1");
      const frequency = recurring.frequency as 'monthly' | 'quarterly' | 'yearly';
      
      let checkDate: Date;
      if (nextInvoiceDateValue && !isNaN(nextInvoiceDateValue.getTime())) {
        checkDate = new Date(nextInvoiceDateValue.getTime());
      } else {
        // Calculate first occurrence from startDate
        checkDate = new Date(startDate.getFullYear(), startDate.getMonth(), dayOfMonth);
        if (checkDate < startDate) {
          checkDate.setMonth(checkDate.getMonth() + 1);
        }
      }
      
      // Iterate through forecast periods
      let iterations = 0;
      const maxIterations = 100; // Safety limit
      
      while (checkDate <= forecastEndDate && iterations < maxIterations) {
        iterations++;
        
        // Check if within endDate (if set)
        if (endDateValue && checkDate > endDateValue) break;
        
        const checkMonth = checkDate.getMonth();
        const checkYear = checkDate.getFullYear();
        
        // Find matching forecast period
        const forecastIndex = forecastData.findIndex(f => 
          f.monthIndex === checkMonth + 1 && f.yearNum === checkYear
        );
        
        if (forecastIndex !== -1) {
          forecastData[forecastIndex].recurringAmount = 
            (forecastData[forecastIndex].recurringAmount || 0) + expectedProfit;
        }
        
        // Move to next occurrence - create new Date to avoid mutation issues
        const nextYear = checkDate.getFullYear();
        const nextMonth = checkDate.getMonth();
        
        switch (frequency) {
          case 'monthly':
            checkDate = new Date(nextYear, nextMonth + 1, dayOfMonth);
            break;
          case 'quarterly':
            checkDate = new Date(nextYear, nextMonth + 3, dayOfMonth);
            break;
          case 'yearly':
            checkDate = new Date(nextYear + 1, nextMonth, dayOfMonth);
            break;
        }
      }
    }
    
    return forecastData;
  }
  
  async getInvoicesByMonth(month: number, year: number, type?: string): Promise<MonthInvoiceDetail[]> {
    // Get invoices for a specific month - for expandable month rows
    const startDateStr = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0); // Last day of month
    const endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
    
    // For forecast type, we need to include sent invoices that may not have paymentDate
    // For paid invoices: use actualPaymentDate first, then paymentDate (matches dashboard logic)
    // For sent invoices: use plannedPaymentDate, paymentDate, or issueDate as fallback
    const results = await db
      .select({
        invoice: invoices,
        calculations: invoiceCalculations,
        clientName: clients.name,
      })
      .from(invoices)
      .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
      .leftJoin(clients, eq(invoices.clientId, clients.id))
      .where(
        type === 'forecast' 
          ? and(
              or(eq(invoices.status, 'sent'), eq(invoices.status, 'paid')),
              sql`COALESCE(${invoices.actualPaymentDate}::date, ${invoices.paymentDate}::date, ${invoices.plannedPaymentDate}::date, ${invoices.issueDate}::date) >= ${startDateStr}::date`,
              sql`COALESCE(${invoices.actualPaymentDate}::date, ${invoices.paymentDate}::date, ${invoices.plannedPaymentDate}::date, ${invoices.issueDate}::date) <= ${endDateStr}::date`
            )
          : and(
              eq(invoices.status, 'paid'),
              sql`COALESCE(${invoices.actualPaymentDate}::date, ${invoices.paymentDate}::date) >= ${startDateStr}::date`,
              sql`COALESCE(${invoices.actualPaymentDate}::date, ${invoices.paymentDate}::date) <= ${endDateStr}::date`
            )
      );
    
    return results.map(row => ({
      id: row.invoice.id,
      invoiceNumber: row.invoice.invoiceNumber,
      clientName: row.clientName,
      clientBill: parseFloat(row.calculations?.clientBill || '0'),
      netProfitAdmin: parseFloat(row.calculations?.netProfitAdmin || '0'),
      status: row.invoice.status,
      paymentDate: row.invoice.paymentDate,
      isExpected: row.invoice.status === 'sent',
      isPaid: row.invoice.status === 'paid',
    }));
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
    
    const balance = totalDebt - totalPaid;
    return {
      summary: {
        totalDebt,
        totalPaid,
        remainingDebt: Math.max(0, balance),
        overpayment: balance < 0 ? Math.abs(balance) : 0,
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
    console.log('[recalculateAllInvoices] Starting recalculation...');
    let updated = 0;
    let errors = 0;
    
    // Get all invoices
    const allInvoices = await db.select().from(invoices);
    console.log(`[recalculateAllInvoices] Found ${allInvoices.length} invoices to process`);
    
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
        const plannedExp = invoice.plannedExpenses ? parseFloat(invoice.plannedExpenses) : 0;
        
        // Recalculate with correct expense breakdown
        const computed = calculateInvoiceServer(
          invoice.scheme as InvoiceScheme,
          clientBill,
          commissionRate,
          totalExpenses,
          expensesPaidByPartner,
          expensesPaidByAdmin,
          plannedExp
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
    
    console.log(`[recalculateAllInvoices] Completed: ${updated} updated, ${errors} errors`);
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
    totalEarned: number;
    totalPaid: number;
  }> {
    const stats = await this.getActsStatistics(true);
    
    const totalEarned = (stats.executorActs * 1000) + (stats.companyActs * 2000);
    
    // Get total already paid from payment history
    const paymentsResult = await db.select({ 
      totalPaid: sql<string>`COALESCE(SUM(amount::numeric), 0)` 
    }).from(assistantBonusPayments);
    const totalPaid = parseFloat(paymentsResult[0]?.totalPaid || '0');
    
    // assistantBonus = unpaid amount (accumulated since last payment)
    const assistantBonus = Math.max(0, totalEarned - totalPaid);
    
    return {
      paidInvoicesCount: stats.totalPaidInvoices,
      executorActsCount: stats.executorActs,
      companyActsCount: stats.companyActs,
      totalPaidInvoices: stats.totalPaidInvoices,
      assistantBonus,
      totalEarned,
      totalPaid,
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

  async getUnpaidBonusTotal(): Promise<{ total: number; invoiceCount: number; invoiceIds: string[]; executorActs: number; companyActs: number; totalEarned: number; totalPaid: number }> {
    // Get all acts statistics (excluding hidden invoices)
    const stats = await this.getActsStatistics(true);
    const executorActs = stats.executorActs;
    const companyActs = stats.companyActs;
    const totalEarned = (executorActs * 1000) + (companyActs * 2000);
    
    // Get total already paid from payment history
    const paymentsResult = await db.select({ 
      totalPaid: sql<string>`COALESCE(SUM(amount::numeric), 0)` 
    }).from(assistantBonusPayments);
    const totalPaid = parseFloat(paymentsResult[0]?.totalPaid || '0');
    
    // Unpaid = earned - paid
    const unpaidTotal = Math.max(0, totalEarned - totalPaid);
    
    // Get invoices with acts for reference
    const invoicesWithActs = await db.selectDistinct({ invoiceId: signedActs.invoiceId })
      .from(signedActs)
      .innerJoin(invoices, eq(invoices.id, signedActs.invoiceId))
      .where(eq(invoices.status, 'paid'));

    return { 
      total: unpaidTotal, 
      invoiceCount: invoicesWithActs.length, 
      invoiceIds: invoicesWithActs.map(r => r.invoiceId),
      executorActs,
      companyActs,
      totalEarned,
      totalPaid
    };
  }

  async markBonusesAsPaid(invoiceIds: string[]): Promise<void> {
    // No longer needed - payments are tracked via assistant_bonus_payments table
    // Kept for backwards compatibility but does nothing
  }

  async getDraftsStats(): Promise<DraftsStats> {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    
    const draftInvoices = await db
      .select({
        invoice: invoices,
        calculations: invoiceCalculations,
      })
      .from(invoices)
      .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
      .where(eq(invoices.status, 'draft'));
    
    let totalDrafts = 0;
    let totalDraftAmount = 0;
    let currentMonthDrafts = 0;
    let currentMonthAmount = 0;
    let fromRecurring = 0;
    let fromRecurringAmount = 0;
    
    for (const row of draftInvoices) {
      const clientBill = row.calculations?.clientBill ? parseFloat(row.calculations.clientBill) : 0;
      const issueDate = row.invoice.issueDate ? new Date(row.invoice.issueDate) : null;
      
      totalDrafts++;
      totalDraftAmount += clientBill;
      
      if (issueDate && issueDate >= currentMonthStart && issueDate < nextMonthStart) {
        currentMonthDrafts++;
        currentMonthAmount += clientBill;
      }
      
      if (row.invoice.recurringInvoiceId) {
        fromRecurring++;
        fromRecurringAmount += clientBill;
      }
    }
    
    return {
      totalDrafts,
      totalDraftAmount,
      currentMonthDrafts,
      currentMonthAmount,
      fromRecurring,
      fromRecurringAmount,
    };
  }

  async getRecurringInvoices(): Promise<any[]> {
    const result = await db.select({
      recurring: recurringInvoices,
      clientName: clients.name,
      partnerName: partners.name,
    })
    .from(recurringInvoices)
    .leftJoin(clients, eq(recurringInvoices.clientId, clients.id))
    .leftJoin(partners, eq(recurringInvoices.partnerId, partners.id))
    .orderBy(asc(recurringInvoices.nextInvoiceDate));
    
    return result.map(r => ({
      ...r.recurring,
      clients: { name: r.clientName },
      partners: { name: r.partnerName },
    }));
  }

  async getRecurringInvoice(id: string): Promise<any | null> {
    const [result] = await db.select()
      .from(recurringInvoices)
      .where(eq(recurringInvoices.id, id));
    return result || null;
  }

  async createRecurringInvoice(data: any): Promise<any> {
    const [created] = await db.insert(recurringInvoices)
      .values({
        clientId: data.clientId,
        partnerId: data.partnerId,
        scheme: data.scheme,
        partnerCommissionRate: data.partnerCommissionRate,
        amount: data.amount,
        description: data.description,
        frequency: data.frequency,
        dayOfMonth: data.dayOfMonth,
        startDate: data.startDate,
        endDate: data.endDate || null,
        nextInvoiceDate: data.nextInvoiceDate,
        notes: data.notes,
        hideFromAssistant: data.hideFromAssistant ?? false,
        createdBy: data.createdBy,
      })
      .returning();
    return created;
  }

  async getDueRecurringInvoices(upToDate?: Date): Promise<any[]> {
    const checkDate = upToDate || new Date();
    const dateStr = checkDate.toISOString().split('T')[0];
    
    const result = await db.select({
      recurring: recurringInvoices,
      clientName: clients.name,
      partnerName: partners.name,
    })
    .from(recurringInvoices)
    .leftJoin(clients, eq(recurringInvoices.clientId, clients.id))
    .leftJoin(partners, eq(recurringInvoices.partnerId, partners.id))
    .where(and(
      eq(recurringInvoices.isActive, true),
      lte(recurringInvoices.nextInvoiceDate, dateStr)
    ))
    .orderBy(asc(recurringInvoices.nextInvoiceDate));
    
    return result.map(r => ({
      ...r.recurring,
      clients: { name: r.clientName },
      partners: { name: r.partnerName },
    }));
  }

  async getActiveRecurringInvoicesForCashFlow(): Promise<any[]> {
    const result = await db.select({
      recurring: recurringInvoices,
      clientName: clients.name,
      partnerName: partners.name,
    })
    .from(recurringInvoices)
    .leftJoin(clients, eq(recurringInvoices.clientId, clients.id))
    .leftJoin(partners, eq(recurringInvoices.partnerId, partners.id))
    .where(eq(recurringInvoices.isActive, true))
    .orderBy(asc(recurringInvoices.nextInvoiceDate));
    
    return result.map(r => ({
      ...r.recurring,
      clients: { name: r.clientName },
      partners: { name: r.partnerName },
    }));
  }

  calculateNextInvoiceDate(currentDate: string, frequency: string): string {
    const date = new Date(currentDate);
    switch (frequency) {
      case 'monthly':
        date.setMonth(date.getMonth() + 1);
        break;
      case 'quarterly':
        date.setMonth(date.getMonth() + 3);
        break;
      case 'yearly':
        date.setFullYear(date.getFullYear() + 1);
        break;
    }
    return date.toISOString().split('T')[0];
  }

  async generateInvoiceNumber(): Promise<string> {
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(invoices);
    const count = Number(result[0]?.count || 0) + 1;
    return `INV-${new Date().getFullYear()}-${String(count).padStart(4, '0')}`;
  }

  async createDraftFromRecurring(recurringId: string, invoiceDate?: string): Promise<any> {
    const recurring = await this.getRecurringInvoice(recurringId);
    if (!recurring) {
      throw new Error('Recurring invoice not found');
    }

    const targetDate = invoiceDate || recurring.nextInvoiceDate;
    const invoiceNumber = await this.generateInvoiceNumber();
    
    const invoice = await this.createInvoice(
      {
        invoiceNumber,
        clientId: recurring.clientId,
        partnerId: recurring.partnerId,
        scheme: recurring.scheme,
        partnerCommissionRate: recurring.partnerCommissionRate,
        clientBill: recurring.amount,
        description: recurring.description || `Recurring invoice for ${targetDate}`,
        issueDate: targetDate,
        status: 'draft',
        hideFromAssistant: recurring.hideFromAssistant ?? false,
        recurringInvoiceId: recurring.id,
        createdBy: recurring.createdBy,
      },
      { clientBill: recurring.amount }
    );

    // Create default expense if specified in recurring template
    const defaultExpenses = Number(recurring.defaultExpenses) || 0;
    if (defaultExpenses > 0 && invoice?.id) {
      await this.createInvoiceExpense({
        invoiceId: invoice.id,
        description: 'Расходы по умолчанию',
        amount: String(defaultExpenses),
        paidByAdmin: true,
        createdBy: recurring.createdBy,
      });
      // Recalculate invoice after adding expense
      await this.recalculateInvoiceExpenses(invoice.id);
    }

    const newNextDate = this.calculateNextInvoiceDate(recurring.nextInvoiceDate, recurring.frequency);
    
    const shouldDeactivate = recurring.endDate && new Date(newNextDate) > new Date(recurring.endDate);
    
    await db.update(recurringInvoices)
      .set({
        nextInvoiceDate: newNextDate,
        isActive: !shouldDeactivate,
        updatedAt: new Date(),
      })
      .where(eq(recurringInvoices.id, recurringId));

    return invoice;
  }

  async processAllDueRecurringInvoices(): Promise<{ created: number; errors: string[] }> {
    const dueInvoices = await this.getDueRecurringInvoices();
    let created = 0;
    const errors: string[] = [];

    for (const recurring of dueInvoices) {
      try {
        await this.createDraftFromRecurring(recurring.id);
        created++;
      } catch (error: any) {
        errors.push(`Failed to create invoice for recurring ${recurring.id}: ${error.message}`);
      }
    }

    return { created, errors };
  }

  async generateBackdatedInvoices(recurringId: string, fromDate: string): Promise<{ created: number; invoices: any[] }> {
    const recurring = await this.getRecurringInvoice(recurringId);
    if (!recurring) {
      throw new Error('Recurring invoice not found');
    }

    const createdInvoices: any[] = [];
    let currentDate = new Date(fromDate);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    
    const dayOfMonth = parseInt(recurring.dayOfMonth) || 1;
    currentDate.setDate(dayOfMonth);
    
    const defaultExpenses = Number(recurring.defaultExpenses) || 0;

    while (currentDate <= today) {
      if (recurring.endDate && currentDate > new Date(recurring.endDate)) {
        break;
      }
      
      const invoiceDate = currentDate.toISOString().split('T')[0];
      const invoiceNumber = await this.generateInvoiceNumber();

      const invoice = await this.createInvoice(
        {
          invoiceNumber,
          clientId: recurring.clientId,
          partnerId: recurring.partnerId,
          scheme: recurring.scheme,
          partnerCommissionRate: recurring.partnerCommissionRate,
          clientBill: recurring.amount,
          description: recurring.description || `Backdated invoice for ${invoiceDate}`,
          issueDate: invoiceDate,
          status: 'draft',
          hideFromAssistant: recurring.hideFromAssistant ?? false,
          recurringInvoiceId: recurring.id,
          createdBy: recurring.createdBy,
        },
        { clientBill: recurring.amount }
      );

      // Create default expense if specified in recurring template
      if (defaultExpenses > 0 && invoice?.id) {
        await this.createInvoiceExpense({
          invoiceId: invoice.id,
          description: 'Расходы по умолчанию',
          amount: String(defaultExpenses),
          paidByAdmin: true,
          createdBy: recurring.createdBy,
        });
        // Recalculate invoice after adding expense
        await this.recalculateInvoiceExpenses(invoice.id);
      }

      createdInvoices.push(invoice);

      switch (recurring.frequency) {
        case 'monthly':
          currentDate.setMonth(currentDate.getMonth() + 1);
          break;
        case 'quarterly':
          currentDate.setMonth(currentDate.getMonth() + 3);
          break;
        case 'yearly':
          currentDate.setFullYear(currentDate.getFullYear() + 1);
          break;
      }
    }

    return { created: createdInvoices.length, invoices: createdInvoices };
  }

  async updateRecurringInvoice(id: string, data: any): Promise<any | null> {
    const [updated] = await db.update(recurringInvoices)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(recurringInvoices.id, id))
      .returning();
    return updated || null;
  }

  async deleteRecurringInvoice(id: string): Promise<void> {
    await db.delete(recurringInvoices)
      .where(eq(recurringInvoices.id, id));
  }

  async getPartnerClientStats(partnerId: string, year: number): Promise<PartnerClientStatsData[]> {
    const monthNames = [
      'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
      'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
    ];
    
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31, 23, 59, 59);
    
    const partnerInvoices = await db
      .select({
        invoice: invoices,
        calculations: invoiceCalculations,
        clientName: clients.name,
      })
      .from(invoices)
      .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
      .leftJoin(clients, eq(invoices.clientId, clients.id))
      .where(and(
        eq(invoices.partnerId, partnerId),
        eq(invoices.status, 'paid'),
        gte(invoices.actualPaymentDate, yearStart.toISOString().split('T')[0])
      ));

    // Group by client and month
    const statsMap = new Map<string, PartnerClientStatsData>();
    
    for (const row of partnerInvoices) {
      if (!row.invoice.clientId || !row.calculations) continue;
      
      const paymentDate = row.invoice.actualPaymentDate ? new Date(row.invoice.actualPaymentDate) : null;
      if (!paymentDate || paymentDate.getFullYear() !== year) continue;
      
      const month = paymentDate.getMonth();
      const key = `${row.invoice.clientId}-${month}`;
      
      const clientBill = parseFloat(row.calculations.clientBill || "0");
      const scheme = row.invoice.scheme;
      
      let commission = 0;
      let clientRemaining = 0;
      
      if (scheme === 'agency_30' || scheme === 'agency_40') {
        commission = parseFloat(row.calculations.partnerShareFromMargin || "0");
        const clientPercent = scheme === 'agency_40' ? 0.60 : 0.70;
        const clientBase = clientBill * clientPercent;
        const expenses = parseFloat(row.calculations.executorExpensesTotal || "0");
        clientRemaining = Math.max(0, clientBase - expenses);
      } else {
        commission = parseFloat(row.calculations.commissionAmount || "0");
        clientRemaining = parseFloat(row.calculations.clientRemaining || "0");
      }
      
      if (!statsMap.has(key)) {
        statsMap.set(key, {
          clientId: row.invoice.clientId,
          clientName: row.clientName || 'Unknown',
          month,
          monthName: monthNames[month],
          clientBill: 0,
          partnerCommission: 0,
          clientRemaining: 0,
          invoiceCount: 0,
        });
      }
      
      const stats = statsMap.get(key)!;
      stats.clientBill += clientBill;
      stats.partnerCommission += commission;
      stats.clientRemaining += Math.max(0, clientRemaining);
      stats.invoiceCount += 1;
    }
    
    return Array.from(statsMap.values()).sort((a, b) => {
      if (a.month !== b.month) return a.month - b.month;
      return a.clientName.localeCompare(b.clientName);
    });
  }

  async getPartnerDocumentRisk(partnerId: string): Promise<PartnerDocumentRiskData> {
    // Get paid invoices for this partner
    const paidInvoices = await db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
      })
      .from(invoices)
      .where(and(
        eq(invoices.partnerId, partnerId),
        eq(invoices.status, 'paid')
      ));
    
    if (paidInvoices.length === 0) {
      return { status: 'green', missingActsCount: 0, missingActsInvoices: [] };
    }
    
    const invoiceIds = paidInvoices.map(i => i.id);
    
    // Get all signed acts for these invoices (use the same source as admin)
    const acts = await db
      .select({
        invoiceId: signedActs.invoiceId,
      })
      .from(signedActs)
      .where(inArray(signedActs.invoiceId, invoiceIds));
    
    const invoicesWithActs = new Set(acts.map(a => a.invoiceId));
    
    // Find invoices without ANY acts (critical risk)
    const missingActs = paidInvoices.filter(i => !invoicesWithActs.has(i.id));
    
    return {
      status: missingActs.length > 0 ? 'red' : 'green',
      missingActsCount: missingActs.length,
      missingActsInvoices: missingActs.map(i => ({
        id: i.id,
        invoiceNumber: i.invoiceNumber || 'Unknown',
      })),
    };
  }

  async getPartnerAgency30Funds(partnerId: string): Promise<PartnerAgency30FundsData[]> {
    // Get agency scheme invoices (agency_30 and agency_40) for this partner
    const agencyInvoices = await db
      .select({
        invoice: invoices,
        calculations: invoiceCalculations,
        clientName: clients.name,
      })
      .from(invoices)
      .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
      .leftJoin(clients, eq(invoices.clientId, clients.id))
      .where(and(
        eq(invoices.partnerId, partnerId),
        inArray(invoices.scheme, ['agency_30', 'agency_40']),
        inArray(invoices.status, ['paid', 'sent'])
      ));

    const clientMap = new Map<string, PartnerAgency30FundsData>();

    for (const row of agencyInvoices) {
      if (!row.invoice.clientId || !row.calculations) continue;

      const clientId = row.invoice.clientId;
      const clientName = row.clientName || 'Unknown';
      const clientBill = parseFloat(row.calculations.clientBill || "0");
      const executorExpenses = parseFloat(row.calculations.executorExpensesTotal || "0");
      
      // Client money that partner must not spend (70% for agency_30, 60% for agency_40)
      const scheme = row.invoice.scheme;
      const clientBaseRate = scheme === 'agency_40' ? 0.6 : 0.7;
      const clientBase = parseFloat(row.calculations.clientBaseAfterMargin || "0") || (clientBill * clientBaseRate);
      
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
      summary.totalBudget += clientBase;
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

  async getPartnerHeroMetrics(partnerId: string): Promise<PartnerHeroMetricsData> {
    const currentYear = new Date().getFullYear();
    const yearStart = new Date(currentYear, 0, 1);
    
    // Get all paid invoices for this partner in current year
    const partnerInvoices = await db
      .select({
        invoice: invoices,
        calculations: invoiceCalculations,
      })
      .from(invoices)
      .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
      .where(and(
        eq(invoices.partnerId, partnerId),
        eq(invoices.status, 'paid'),
        sql`${invoices.createdAt} >= ${yearStart.toISOString()}`
      ));
    
    // Get all invoices with debt (partnerTransferDue > 0)
    const allPartnerInvoices = await db
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
    
    // Calculate metrics
    let debtToAdmin = 0;
    let reservedForExpenses = 0;
    let yearlyCommission = 0;
    const invoicesWithDebt: { id: string; number: string; amount: number }[] = [];
    
    for (const row of allPartnerInvoices) {
      if (!row.calculations) continue;
      
      const partnerTransferDue = parseFloat(row.calculations.partnerTransferDue || "0");
      const plannedExpenses = parseFloat(row.calculations.plannedExpenses || "0");
      const expensesPaidByPartner = parseFloat(row.calculations.expensesPaidByPartner || "0");
      
      // Add to debt if partnerTransferDue > 0
      if (partnerTransferDue > 0) {
        debtToAdmin += partnerTransferDue;
        invoicesWithDebt.push({
          id: row.invoice.id,
          number: row.invoice.invoiceNumber || `INV-${row.invoice.id}`,
          amount: partnerTransferDue,
        });
      }
      
      // For partner schemes with reserve (plannedExpenses > 0)
      // Reserved = plannedExpenses - expensesPaidByPartner
      if (plannedExpenses > 0) {
        const reserved = Math.max(0, plannedExpenses - expensesPaidByPartner);
        reservedForExpenses += reserved;
      }
    }
    
    // Calculate yearly commission from current year invoices
    for (const row of partnerInvoices) {
      if (!row.calculations) continue;
      const commission = parseFloat(row.calculations.partnerCommission || "0");
      yearlyCommission += commission;
    }
    
    // Get payments made to reduce debt
    const payments = await db.select().from(partnerPayments)
      .where(eq(partnerPayments.partnerId, partnerId));
    
    const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount || "0"), 0);
    debtToAdmin = Math.max(0, debtToAdmin - totalPaid);
    
    // Count signed acts for this partner's invoices
    const paidInvoiceIds = allPartnerInvoices.map(r => r.invoice.id);
    let signedActsCount = 0;
    
    if (paidInvoiceIds.length > 0) {
      const actsResult = await db.select({ count: sql<number>`count(*)` })
        .from(signedActs)
        .where(inArray(signedActs.invoiceId, paidInvoiceIds));
      signedActsCount = Number(actsResult[0]?.count || 0);
    }
    
    return {
      debtToAdmin,
      reservedForExpenses,
      yearlyCommission,
      signedActsCount,
      totalPaidInvoices: allPartnerInvoices.length,
      invoicesWithDebt,
    };
  }

  async getWorkingCapital(): Promise<WorkingCapitalData | null> {
    // Return mock data since working_capital_balance table doesn't exist in Neon yet
    // TODO: Create working_capital_balance table in schema.ts and migrate
    return {
      id: 'wc-1',
      amount: 0,
      notes: 'Данные временно недоступны - требуется миграция таблицы',
      updated_at: new Date().toISOString(),
    };
  }

  async updateWorkingCapital(amount: number, notes: string | null, updatedBy: string): Promise<WorkingCapitalData> {
    // Return updated mock data since table doesn't exist yet
    // TODO: Implement actual update when table is created
    return {
      id: 'wc-1',
      amount,
      notes,
      updated_at: new Date().toISOString(),
    };
  }

  async getClientLTV(): Promise<ClientLTVData[]> {
    // Get all invoices with client info and calculations
    // LTV = чистая прибыль админа (netProfitAdmin) от клиента
    const allInvoices = await db
      .select({
        invoice: invoices,
        calculations: invoiceCalculations,
        clientName: clients.name,
      })
      .from(invoices)
      .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
      .leftJoin(clients, eq(invoices.clientId, clients.id))
      .where(isNotNull(invoices.clientId));

    const clientMap = new Map<string, ClientLTVData>();

    for (const row of allInvoices) {
      if (!row.invoice.clientId) continue;

      const clientId = row.invoice.clientId;
      const clientName = row.clientName || 'Неизвестный клиент';
      // Используем netProfitAdmin как доход админа от клиента
      const adminProfit = parseFloat(row.calculations?.netProfitAdmin || "0");
      const isPaid = row.invoice.status === 'paid';

      if (!clientMap.has(clientId)) {
        clientMap.set(clientId, {
          client_id: clientId,
          client_name: clientName,
          total_invoices: 0,
          paid_invoices: 0,
          total_admin_profit: 0,
          potential_profit: 0,
        });
      }

      const client = clientMap.get(clientId)!;
      client.total_invoices += 1;

      if (isPaid) {
        // Оплаченные счета - реальная прибыль
        client.paid_invoices += 1;
        client.total_admin_profit += adminProfit;
      } else if (row.invoice.status === 'sent') {
        // Неоплаченные счета - потенциальная прибыль
        client.potential_profit += adminProfit;
      }
    }

    // Сортируем по total_admin_profit (реальной прибыли)
    return Array.from(clientMap.values())
      .sort((a, b) => b.total_admin_profit - a.total_admin_profit);
  }

  async getDashboardInvoices(year: number, month: number, category: 'received' | 'expected' | 'drafts'): Promise<DashboardInvoiceDetail[]> {
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0, 23, 59, 59);
    
    const allInvoices = await db
      .select({
        invoice: invoices,
        calculations: invoiceCalculations,
        clientName: clients.name,
      })
      .from(invoices)
      .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
      .leftJoin(clients, eq(invoices.clientId, clients.id));
    
    const result: DashboardInvoiceDetail[] = [];
    
    for (const row of allInvoices) {
      if (!row.calculations) continue;
      
      const status = row.invoice.status;
      const netProfitAdmin = parseFloat(row.calculations.netProfitAdmin || "0");
      const clientBill = parseFloat(row.calculations.clientBill || "0");
      
      if (category === 'received') {
        // Paid invoices in selected month (using paymentDate first - this is what user enters as payment date)
        if (status !== 'paid') continue;
        const paymentDateStr = row.invoice.paymentDate || row.invoice.actualPaymentDate;
        const paymentDate = paymentDateStr ? new Date(paymentDateStr) : null;
        if (!paymentDate || paymentDate < monthStart || paymentDate > monthEnd) continue;
        
        result.push({
          id: row.invoice.id,
          invoiceNumber: row.invoice.invoiceNumber || `INV-${row.invoice.id}`,
          clientName: row.clientName,
          netProfitAdmin,
          clientBill,
          status,
          paymentDate: paymentDateStr?.toString() || null,
        });
      } else if (category === 'expected') {
        // Sent/pending invoices with expected payment in selected month
        if (status === 'paid' || status === 'cancelled') continue;
        const paymentDateStr = row.invoice.plannedPaymentDate || row.invoice.paymentDate || row.invoice.createdAt;
        const paymentDate = paymentDateStr ? new Date(paymentDateStr) : null;
        if (!paymentDate || paymentDate < monthStart || paymentDate > monthEnd) continue;
        
        result.push({
          id: row.invoice.id,
          invoiceNumber: row.invoice.invoiceNumber || `INV-${row.invoice.id}`,
          clientName: row.clientName,
          netProfitAdmin,
          clientBill,
          status,
          paymentDate: paymentDateStr?.toString() || null,
        });
      } else if (category === 'drafts') {
        // Draft invoices created in selected month
        if (status === 'paid' || status === 'sent' || status === 'cancelled') continue;
        const createdAt = row.invoice.createdAt ? new Date(row.invoice.createdAt) : null;
        if (!createdAt || createdAt < monthStart || createdAt > monthEnd) continue;
        
        result.push({
          id: row.invoice.id,
          invoiceNumber: row.invoice.invoiceNumber || `INV-${row.invoice.id}`,
          clientName: row.clientName,
          netProfitAdmin,
          clientBill,
          status,
          paymentDate: null,
        });
      }
    }
    
    // Sort by netProfitAdmin descending
    return result.sort((a, b) => b.netProfitAdmin - a.netProfitAdmin);
  }

  async logAssistantAction(log: InsertAssistantActionLog): Promise<AssistantActionLog> {
    // For update_invoice actions, try to coalesce with recent logs from the same user on the same invoice
    // Only coalesce if entityId is non-null to avoid merging unrelated updates
    if (log.actionType === 'update_invoice' && log.entityId && log.accessTokenId) {
      // Find recent log for same entity and action (within 10 seconds)
      const recentLogs = await db.select()
        .from(assistantActionLogs)
        .where(
          and(
            eq(assistantActionLogs.accessTokenId, log.accessTokenId),
            eq(assistantActionLogs.entityId, log.entityId),
            eq(assistantActionLogs.actionType, 'update_invoice'),
            sql`${assistantActionLogs.createdAt} > NOW() - INTERVAL '10 seconds'`
          )
        )
        .orderBy(desc(assistantActionLogs.createdAt))
        .limit(1);
      
      if (recentLogs.length > 0) {
        const existingLog = recentLogs[0];
        
        // Merge details - new fields override old ones
        let mergedDetails: any = {};
        if (existingLog.details) {
          try {
            mergedDetails = JSON.parse(existingLog.details);
          } catch {}
        }
        if (log.details) {
          try {
            const newDetails = JSON.parse(log.details);
            mergedDetails = { ...mergedDetails, ...newDetails };
          } catch {}
        }
        
        // Use the new description if it contains more info (e.g., invoice number)
        // Prefer description with invoice number over one with just client name
        const newDescription = log.description || existingLog.description;
        
        // Update existing log with merged details, keep original createdAt
        const [updated] = await db.update(assistantActionLogs)
          .set({
            details: JSON.stringify(mergedDetails),
            description: newDescription,
            // Keep original createdAt, don't update timestamp
          })
          .where(eq(assistantActionLogs.id, existingLog.id))
          .returning();
        
        return updated;
      }
    }
    
    // No coalescing - create new log entry
    const [created] = await db.insert(assistantActionLogs).values(log).returning();
    return created;
  }

  async getAssistantActionLogs(filters: AssistantActionLogFilters): Promise<{ logs: AssistantActionLogWithDetails[]; total: number }> {
    const { limit = 100, offset = 0, role, dateFrom, dateTo } = filters;
    
    // Build where conditions
    const conditions: SQL<unknown>[] = [];
    if (role) {
      conditions.push(eq(accessTokens.role, role));
    }
    if (dateFrom) {
      conditions.push(sql`${assistantActionLogs.createdAt} >= ${dateFrom}::timestamp`);
    }
    if (dateTo) {
      conditions.push(sql`${assistantActionLogs.createdAt} <= ${dateTo}::timestamp + interval '1 day'`);
    }
    
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    
    // Count query
    const countQuery = db
      .select({ count: sql<number>`count(*)::int` })
      .from(assistantActionLogs)
      .leftJoin(accessTokens, eq(assistantActionLogs.accessTokenId, accessTokens.id));
    
    if (whereClause) {
      countQuery.where(whereClause);
    }
    
    const [countResult] = await countQuery;
    
    // Data query
    const dataQuery = db
      .select({
        log: assistantActionLogs,
        tokenCode: accessTokens.code,
        tokenRole: accessTokens.role,
      })
      .from(assistantActionLogs)
      .leftJoin(accessTokens, eq(assistantActionLogs.accessTokenId, accessTokens.id));
    
    if (whereClause) {
      dataQuery.where(whereClause);
    }
    
    const logsData = await dataQuery
      .orderBy(desc(assistantActionLogs.createdAt))
      .limit(limit)
      .offset(offset);

    // Collect all client, partner, and invoice IDs from log details
    const clientIds = new Set<string>();
    const partnerIds = new Set<string>();
    const invoiceIds = new Set<string>();
    
    for (const row of logsData) {
      if (row.log.details) {
        try {
          const parsed = JSON.parse(row.log.details);
          if (parsed.clientId) clientIds.add(parsed.clientId);
          if (parsed.partnerId) partnerIds.add(parsed.partnerId);
          if (parsed.invoiceId) invoiceIds.add(parsed.invoiceId);
        } catch {}
      }
      // Also check entityId for invoice actions
      if (row.log.entityId && row.log.actionType.includes('invoice')) {
        invoiceIds.add(row.log.entityId);
      }
    }
    
    // Fetch client, partner, and invoice data
    const clientMap = new Map<string, string>();
    const partnerMap = new Map<string, string>();
    const invoiceMap = new Map<string, { number: string; status: string }>();
    
    if (clientIds.size > 0) {
      const clientsData = await db.select({ id: clients.id, name: clients.name })
        .from(clients)
        .where(inArray(clients.id, Array.from(clientIds)));
      for (const c of clientsData) {
        clientMap.set(c.id, c.name);
      }
    }
    
    if (partnerIds.size > 0) {
      const partnersData = await db.select({ id: partners.id, name: partners.name })
        .from(partners)
        .where(inArray(partners.id, Array.from(partnerIds)));
      for (const p of partnersData) {
        partnerMap.set(p.id, p.name);
      }
    }
    
    if (invoiceIds.size > 0) {
      // Fetch invoices with client info via join
      const invoicesData = await db.select({ 
        id: invoices.id, 
        invoiceNumber: invoices.invoiceNumber, 
        status: invoices.status,
        clientId: invoices.clientId,
        description: invoices.description,
        clientName: clients.name
      })
        .from(invoices)
        .leftJoin(clients, eq(invoices.clientId, clients.id))
        .where(inArray(invoices.id, Array.from(invoiceIds)));
      for (const inv of invoicesData) {
        // Use invoice number, or client name, or description as fallback
        const displayName = inv.invoiceNumber || inv.clientName || inv.description || inv.id;
        invoiceMap.set(inv.id, { number: displayName, status: inv.status });
      }
    }
    
    // Enrich logs with names and invoice numbers
    const logs: AssistantActionLogWithDetails[] = logsData.map(row => {
      let enrichedDetails = row.log.details;
      let enrichedDescription = row.log.description;
      let parsedDetails: any = null;
      
      // Parse details first to get stored names
      if (row.log.details) {
        try {
          parsedDetails = JSON.parse(row.log.details);
        } catch {}
      }
      
      // FIRST: Enrich parsedDetails with names from database (for old logs that only have IDs)
      if (parsedDetails) {
        if (parsedDetails.clientId && clientMap.has(parsedDetails.clientId) && !parsedDetails.clientName) {
          parsedDetails.clientName = clientMap.get(parsedDetails.clientId);
        }
        if (parsedDetails.partnerId && partnerMap.has(parsedDetails.partnerId) && !parsedDetails.partnerName) {
          parsedDetails.partnerName = partnerMap.get(parsedDetails.partnerId);
        }
        if (parsedDetails.invoiceId && invoiceMap.has(parsedDetails.invoiceId)) {
          const invData = invoiceMap.get(parsedDetails.invoiceId)!;
          if (!parsedDetails.invoiceNumber) parsedDetails.invoiceNumber = invData.number;
          parsedDetails.invoiceStatus = invData.status;
        }
        // Add status from entityId invoice if action is about invoice
        if (row.log.entityId && invoiceMap.has(row.log.entityId) && !parsedDetails.status) {
          parsedDetails.invoiceStatus = invoiceMap.get(row.log.entityId)!.status;
        }
        enrichedDetails = JSON.stringify(parsedDetails);
      }
      
      // THEN: Replace invoice UUID in description with readable name
      if (row.log.entityId && row.log.entityType === "invoice") {
        // Helper to check if string looks like UUID
        const isUUID = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
        
        let displayName: string | null = null;
        
        // Try stored/enriched details (now includes names from DB for old logs)
        if (parsedDetails) {
          displayName = parsedDetails.invoiceNumber || parsedDetails.clientName || parsedDetails.partnerName || parsedDetails.description || null;
        }
        
        // Fall back to database data if no stored name
        if (!displayName && invoiceMap.has(row.log.entityId)) {
          const invData = invoiceMap.get(row.log.entityId)!;
          // Only use if it's not a UUID
          if (!isUUID(invData.number)) {
            displayName = invData.number;
          }
        }
        
        // Replace UUID in description with readable name
        if (displayName && enrichedDescription.includes(row.log.entityId)) {
          enrichedDescription = enrichedDescription.replace(row.log.entityId, displayName);
        }
      }
      
      return {
        ...row.log,
        description: enrichedDescription,
        details: enrichedDetails,
        tokenCode: row.tokenCode || undefined,
        tokenRole: row.tokenRole || undefined,
      };
    });

    return {
      logs,
      total: countResult?.count || 0,
    };
  }
}

export const storage = new DatabaseStorage();
