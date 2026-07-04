import { db } from "./db";
import { 
  partners, clients, accessTokens, userSessions, invoices, 
  invoiceCalculations, invoiceExpenses, partnerPayments, clientPartners, monthlyFinancialPlans, signedActs, assistantBonusPayments, recurringInvoices, assistantActionLogs,
  Partner, Client, Invoice, InvoiceCalculation, InvoiceExpense, PartnerPayment, MonthlyFinancialPlan, SignedAct, AssistantBonusPayment, AssistantActionLog,
  InsertPartner, InsertClient, InsertInvoice, InsertInvoiceExpense, InsertPartnerPayment, InsertMonthlyFinancialPlan, InsertSignedAct, InsertAssistantBonusPayment, InsertAssistantActionLog,
  AccessToken, UserSession, UserRole, InvoiceScheme, ActType, AssistantActionType
} from "../shared/schema";
import { eq, and, desc, asc, isNull, isNotNull, gte, lte, sql, inArray, or, sum, count, type SQL } from "drizzle-orm";
import { calculateFinancials, parseNum, type FinancialResult } from "../shared/financialEngine";
import { randomBytes } from "crypto";
import * as userRepo       from "./repositories/userRepo";
import * as partnerRepo     from "./repositories/partnerRepo";
import * as clientRepo      from "./repositories/clientRepo";
import * as invoiceRepo     from "./repositories/invoiceRepo";
import * as recurringRepo   from "./repositories/recurringRepo";
import * as actsRepo        from "./repositories/actsRepo";
import * as actionLogRepo   from "./repositories/actionLogRepo";
import * as dashboardRepo    from "./repositories/dashboardRepo";
import * as alertsRepo from "./repositories/alertsRepo";
import * as planningRepo from "./repositories/planningRepo";
import * as reportsRepo from "./repositories/reportsRepo";
import * as searchRepo from "./repositories/searchRepo";
import { calculateInvoiceServer } from "./repositories/invoiceRepo";


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
  /** IDOR-safe variant: filters by ownership based on role/partnerId/clientId */
  getInvoiceForRole(id: string, role: UserRole, partnerId?: string, clientId?: string): Promise<(Invoice & { calculations?: InvoiceCalculation; partner?: Partner; client?: Client }) | null>;
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
  
  getPartnerPayments(partnerId: string): Promise<Array<{ id: string; amount: number; paymentDate: string; notes: string | null; invoiceId: string | null; invoiceNumber: string | null }>>;
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
  getClientLTV(year?: number): Promise<{ data: ClientLTVData[]; availableYears: number[] }>;
  
  // Assistant action logs
  logAssistantAction(log: InsertAssistantActionLog): Promise<AssistantActionLog>;
  getAssistantActionLogs(filters: AssistantActionLogFilters): Promise<{ logs: AssistantActionLogWithDetails[]; total: number }>;
  
  // Dashboard invoice details for expandable cards
  getDashboardInvoices(year: number, month: number, category: 'received' | 'expected' | 'drafts' | 'overdue' | 'drafts_no_date'): Promise<DashboardInvoiceDetail[]>;
  
  // Recurring invoices for month display
  getRecurringInvoicesForMonth(year: number, month: number): Promise<RecurringInvoiceForMonth[]>;
}

export interface RecurringInvoiceForMonth {
  id: string;
  clientName: string | null;
  partnerName: string | null;
  amount: number;
  expectedProfit: number;
  frequency: string;
  dayOfMonth: number;
  scheme: string;
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
    return userRepo.verifyAccessCode(db, code);
  }

  async createSession(tokenId: string, ipAddress?: string, userAgent?: string) {
    return userRepo.createSession(db, tokenId, ipAddress, userAgent);
  }

  async validateSession(sessionId: string, csrfToken?: string) {
    return userRepo.validateSession(db, sessionId, csrfToken);
  }

  async refreshSession(sessionId: string): Promise<Date | null> {
    return userRepo.refreshSession(db, sessionId);
  }

  async revokeSession(sessionId: string): Promise<void> {
    return userRepo.revokeSession(db, sessionId);
  }

  async getPartners() { return partnerRepo.getPartners(db); }
  async getPartner(id: string) { return partnerRepo.getPartner(db, id); }
  async createPartner(partner: InsertPartner) { return partnerRepo.createPartner(db, partner); }
  async updatePartner(id: string, partner: Partial<InsertPartner>) { return partnerRepo.updatePartner(db, id, partner); }
  async deletePartner(id: string) { return partnerRepo.deletePartner(db, id); }
  async getPartnerClients(partnerId: string) { return partnerRepo.getPartnerClients(db, partnerId); }

  async getClients(partnerId?: string) { return clientRepo.getClients(db, partnerId); }
  async getClient(id: string) { return clientRepo.getClient(db, id); }
  async createClient(client: InsertClient) { return clientRepo.createClient(db, client); }
  async updateClient(id: string, client: Partial<InsertClient>) { return clientRepo.updateClient(db, id, client); }
  async getClientWithPartner(id: string) { return clientRepo.getClientWithPartner(db, id); }
  async getClientPartners(clientId: string) { return clientRepo.getClientPartners(db, clientId); }
  async getClientsWithPartners() { return clientRepo.getClientsWithPartners(db); }
  async setClientPartners(clientId: string, partnerIds: string[]) { return clientRepo.setClientPartners(db, clientId, partnerIds); }
  async deleteClient(id: string) { return clientRepo.deleteClient(db, id); }

  async getInvoices(role: UserRole, partnerId?: string, clientId?: string) { return invoiceRepo.getInvoices(db, role, partnerId, clientId); }
  async getInvoice(id: string) { return invoiceRepo.getInvoice(db, id); }
  async getInvoiceForRole(id: string, role: UserRole, partnerId?: string, clientId?: string) { return invoiceRepo.getInvoice(db, id, role, partnerId, clientId); }
  async getInvoicesWithCalculations() { return invoiceRepo.getInvoicesWithCalculations(db); }
  async createInvoice(invoice: InsertInvoice, calculations: Partial<InvoiceCalculation>) { return invoiceRepo.createInvoice(db, invoice, calculations); }
  async updateInvoice(id: string, invoice: Partial<InsertInvoice>) { return invoiceRepo.updateInvoice(db, id, invoice); }
  async updateInvoiceCalculations(invoiceId: string, calculations: Partial<InvoiceCalculation>) { return invoiceRepo.updateInvoiceCalculations(db, invoiceId, calculations); }
  async getInvoiceExpenses(invoiceId: string) { return invoiceRepo.getInvoiceExpenses(db, invoiceId); }
  async getAllExpenses() { return invoiceRepo.getAllExpenses(db); }
  async createInvoiceExpense(expense: InsertInvoiceExpense) { return invoiceRepo.createInvoiceExpense(db, expense); }
  async updateInvoiceExpense(id: string, updates: Partial<InsertInvoiceExpense>) { return invoiceRepo.updateInvoiceExpense(db, id, updates); }
  async deleteInvoiceExpense(id: string) { return invoiceRepo.deleteInvoiceExpense(db, id); }
  async createInvoiceTransfer(args: Parameters<typeof invoiceRepo.createInvoiceTransfer>[1]) { return invoiceRepo.createInvoiceTransfer(db, args); }
  async deleteInvoiceTransfer(id: string) { return invoiceRepo.deleteInvoiceTransfer(db, id); }
  async getInvoiceTransfers(invoiceId: string) { return invoiceRepo.getInvoiceTransfers(db, invoiceId); }
  async deleteInvoice(id: string) { return invoiceRepo.deleteInvoice(db, id); }
  async deleteDocument(id: string) { return invoiceRepo.deleteDocument(db, id);
  }

  async getPartnerPayment(id: string) { return partnerRepo.getPartnerPayment(db, id); }
  async createPartnerPayment(payment: InsertPartnerPayment) { return partnerRepo.createPartnerPayment(db, payment); }
  async updatePartnerPayment(id: string, updates: Partial<InsertPartnerPayment>) { return partnerRepo.updatePartnerPayment(db, id, updates); }
  async deletePartnerPayment(id: string) { return partnerRepo.deletePartnerPayment(db, id); }
  async getPartnerPaymentHistory(partnerId: string) { return partnerRepo.getPartnerPaymentHistory(db, partnerId); }

  async getAccessTokens() { return userRepo.getAccessTokens(db); }
  async createAccessToken(code: string, role: UserRole, partnerId?: string, clientId?: string) { return userRepo.createAccessToken(db, code, role, partnerId, clientId); }
  async deleteAccessToken(id: string) { return userRepo.deleteAccessToken(db, id); }

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
    // Клиенту по неагентским схемам нельзя показывать расходы и остаток.
    // Считаем эти суммы только по агентским счетам (agency_30/40),
    // чтобы по дашборду клиента не утекала «кухня» партнёрских/комиссионных.
    let clientVisibleExpenses = 0;
    let clientVisibleRemaining = 0;
    
    for (const r of results) {
      const inv = r.invoice;
      const calc = r.calculations;
      
      totalInvoices++;
      const clientBill = calc ? parseNum(calc.clientBill) : 0;
      const expenses = calc ? parseNum(calc.executorExpensesTotal) : 0;
      const plannedExp = parseNum(inv.plannedExpenses);
      
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
        const netProfit = parseNum(calc.netProfitAdmin);
        
        if (scheme === 'agency_30' || scheme === 'agency_40' || scheme === 'agency') {
          // Agency schemes: partner & admin get from margin
          totalPartnerCommission += parseNum(calc.partnerShareFromMargin);
          totalAdminShare += parseNum(calc.adminShareFromMargin);
          const agencyRemaining = parseNum(calc.clientBaseAfterMargin) - expenses;
          clientRemaining += agencyRemaining;
          clientVisibleExpenses += expenses;
          clientVisibleRemaining += agencyRemaining;
        } else {
          // partner_10, partner_15, commission_based — закрытая комиссия,
          // клиенту не агрегируется в totalExpenses/clientRemaining.
          totalPartnerCommission += parseNum(calc.commissionAmount);
          totalAdminShare += parseNum(calc.amountToAdmin);
          clientRemaining += parseNum(calc.clientRemaining);
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
      const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0); // amount уже number
      
      // Use stored partnerTransferDue as single source of truth
      let totalDebtToAdmin = 0;
      for (const r of results) {
        if (r.invoice.status === 'paid' && r.calculations) {
          // Read stored value instead of recalculating
          const storedDebt = parseNum(r.calculations.partnerTransferDue);
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
      // Перекрываем totalExpenses, чтобы клиент видел расходы только по агентским счетам.
      stats.totalExpenses = clientVisibleExpenses;
      stats.clientRemaining = Math.max(0, clientVisibleRemaining);
    }
    
    return stats;
  }
  
  async getRecurringExpectedAmounts() {
    return recurringRepo.getRecurringExpectedAmounts(db);
  }

  async getPartnerDebtSummaries() {
    return dashboardRepo.getPartnerDebtSummaries(db);
  }

  async getDoNotSpendData(partnerId?: string) {
    return reportsRepo.getDoNotSpendData(db, partnerId);
  }

  async getPartnerSchemeDoNotSpendData(partnerId?: string, role?: string) {
    return dashboardRepo.getPartnerSchemeDoNotSpendData(db, partnerId, role);
  }

  async getExpectedCommission(partnerId?: string) {
    return reportsRepo.getExpectedCommission(db, partnerId);
  }

  async getExpectedAdminProfit() {
    return reportsRepo.getExpectedAdminProfit(db);
  }
  
  async getAdminDashboardStats(year?: number, month?: number) {
    return dashboardRepo.getAdminDashboardStats(db, (y: number, m: number) => this.getRecurringExpectedForMonth(y, m), year, month);
  }
  
  async getRecurringExpectedForMonth(year: number, month: number) {
    return recurringRepo.getRecurringExpectedForMonth(db, year, month);
  }
  
  async getRecurringInvoicesForMonth(year: number, month: number) {
    return recurringRepo.getRecurringInvoicesForMonth(db, year, month);
  }
  
  async getAlertCounts(role: string) {
    return alertsRepo.getAlertCounts(db, role);
  }

  async globalSearch(
    query: string,
    role: string,
    options: { clientId?: string } = {},
  ) {
    return searchRepo.globalSearch(db, query, role, options);
  }

  async getPriorityActions() {
    return alertsRepo.getPriorityActions(db);
  }

  async getOverdueInvoicesDetailed() {
    return alertsRepo.getOverdueInvoicesDetailed(db);
  }

  async getPartnerTerms(partnerId: string) {
    return partnerRepo.getPartnerTerms(db, partnerId);
  }

  async getPartnerPayments(partnerId: string) {
    return partnerRepo.getPartnerPayments(db, partnerId);
  }

  async getClientBudget(clientId: string) {
    return dashboardRepo.getClientBudget(db, clientId);
  }

  /**
   * Три блока для клиентского «Обзора»:
   *   1) agency  — открытая комиссия (agency_30/40): Σ доступно/потрачено/осталось + таблица счетов.
   *   2) recurring — счета из шаблонов recurring_invoices: «осталось N мес ≈ M ₽» на услугу.
   *   3) oneTime — неагентские разовые: оплачено / к оплате (X из Y · ₽).
   * Любая сумма приходит как number с защитой от NaN.
   */
  async getClientOverviewBuckets(clientId: string, dateFrom?: string, dateTo?: string) {
    return dashboardRepo.getClientOverviewBuckets(db, clientId, dateFrom, dateTo);
  }

  async getPartnerInvoicesDetail(partnerId: string) {
    return dashboardRepo.getPartnerInvoicesDetail(db, partnerId);
  }

  async getClientAgency30Report(clientId: string) {
    return reportsRepo.getClientAgency30Report(db, clientId);
  }

  async getAdminMonthlyData(year: number): Promise<MonthlyData[]> { return dashboardRepo.getAdminMonthlyData(db, year); }
  
  async getAdminForecast(monthsAhead: number) {
    return planningRepo.getAdminForecast(db, monthsAhead);
  }
  
  async getInvoicesByMonth(month: number, year: number, type?: string) {
    return reportsRepo.getInvoicesByMonth(db, month, year, type);
  }
  
  async getOverdueInvoices() {
    return alertsRepo.getOverdueInvoices(db);
  }
  
  async getPartnerDebtDetails(partnerId: string) {
    return dashboardRepo.getPartnerDebtDetails(db, partnerId);
  }

  async getAdminPlanFact(year: number) {
    return planningRepo.getAdminPlanFact(db, year);
  }

  async getMonthlyPlans(year: number) {
    return planningRepo.getMonthlyPlans(db, year);
  }

  async getMonthlyPlan(year: number, month: number) {
    return planningRepo.getMonthlyPlan(db, year, month);
  }

  async upsertMonthlyPlan(input: MonthlyPlanInput) {
    return planningRepo.upsertMonthlyPlan(db, input);
  }
  
  async recalculateAllInvoices() { return invoiceRepo.recalculateAllInvoices(db); }

  // Signed Acts methods
  async createSignedAct(act: InsertSignedAct)                        { return actsRepo.createSignedAct(db, act); }
  async getSignedActsByInvoice(invoiceId: string, actType?: ActType)  { return actsRepo.getSignedActsByInvoice(db, invoiceId, actType); }
  async getSignedAct(id: string)                                      { return actsRepo.getSignedAct(db, id); }
  async deleteSignedAct(id: string)                                   { return actsRepo.deleteSignedAct(db, id); }
  async getActsStatistics(excludeHidden = false)                      { return actsRepo.getActsStatistics(db, excludeHidden); }
  async getAssistantStats()                                           { return actsRepo.getAssistantStats(db); }
  async getAssistantBonusPayments()                                   { return actsRepo.getAssistantBonusPayments(db); }
  async createAssistantBonusPayment(payment: InsertAssistantBonusPayment) { return actsRepo.createAssistantBonusPayment(db, payment); }
  async getUnpaidBonusTotal()                                         { return actsRepo.getUnpaidBonusTotal(db); }
  async markBonusesAsPaid(invoiceIds: string[])                       { return actsRepo.markBonusesAsPaid(db, invoiceIds); }

  async getDraftsStats() {
    return reportsRepo.getDraftsStats(db);
  }

  async getRecurringInvoices()                                           { return recurringRepo.getRecurringInvoices(db); }
  async getRecurringInvoice(id: string)                                  { return recurringRepo.getRecurringInvoice(db, id); }
  async createRecurringInvoice(data: any)                                { return recurringRepo.createRecurringInvoice(db, data); }
  async getDueRecurringInvoices(upToDate?: Date)                         { return recurringRepo.getDueRecurringInvoices(db, upToDate); }
  async getActiveRecurringInvoicesForCashFlow()                          { return recurringRepo.getActiveRecurringInvoicesForCashFlow(db); }
  async generateInvoiceNumber()                                          { return invoiceRepo.generateInvoiceNumber(db); }
  async createDraftFromRecurring(recurringId: string, invoiceDate?: string) { return recurringRepo.createDraftFromRecurring(db, recurringId, invoiceDate); }
  async processAllDueRecurringInvoices()                                 { return recurringRepo.processAllDueRecurringInvoices(db); }
  async generateBackdatedInvoices(recurringId: string, fromDate: string) { return recurringRepo.generateBackdatedInvoices(db, recurringId, fromDate); }
  async updateRecurringInvoice(id: string, data: any)                    { return recurringRepo.updateRecurringInvoice(db, id, data); }
  async deleteRecurringInvoice(id: string)                               { return recurringRepo.deleteRecurringInvoice(db, id); }

  async getPartnerClientStats(partnerId: string, year: number) {
    return partnerRepo.getPartnerClientStats(db, partnerId, year);
  }

  async getPartnerDocumentRisk(partnerId: string) {
    return partnerRepo.getPartnerDocumentRisk(db, partnerId);
  }

  async getPartnerAgency30Funds(partnerId: string) {
    return partnerRepo.getPartnerAgency30Funds(db, partnerId);
  }

  async getPartnerHeroMetrics(partnerId: string): Promise<PartnerHeroMetricsData> { return dashboardRepo.getPartnerHeroMetrics(db, partnerId); }

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

  async getClientLTV(year?: number) {
    return reportsRepo.getClientLTV(db, year);
  }

  async getDashboardInvoices(year: number, month: number, category: 'received' | 'expected' | 'drafts' | 'overdue' | 'drafts_no_date') {
    return dashboardRepo.getDashboardInvoices(db, year, month, category);
  }

  async logAssistantAction(log: InsertAssistantActionLog) { return actionLogRepo.logAssistantAction(db, log); }
  async getAssistantActionLogs(filters: AssistantActionLogFilters) { return actionLogRepo.getAssistantActionLogs(db, filters); }
}

export const storage = new DatabaseStorage();
