import * as exportRepo from "./repositories/exportRepo";
import type { StorageOperations } from "./storagePorts";
import type { RecurringInvoiceForMonth, AssistantActionLogFilters, AssistantActionLogWithDetails, WorkingCapitalData, ClientLTVData, PartnerClientStatsData, PartnerDocumentRiskData, PartnerAgency30FundsData, PartnerHeroMetricsData, DashboardInvoiceDetail, MonthlyData, MonthInvoiceDetail, DraftsStats, ForecastData, OverdueInvoice, PaymentHistoryEntry, PlanFactData, MonthlyPlanInput, DashboardStats } from "./storageTypes";
export type * from "./storageTypes";
import { db } from "./db";
import { 
  partners, clients, accessTokens, userSessions, invoices, 
  invoiceCalculations, invoiceExpenses, partnerPayments, clientPartners, monthlyFinancialPlans, signedActs, assistantBonusPayments, recurringInvoices, assistantActionLogs,
  Partner, Client, Invoice, InvoiceCalculation, InvoiceExpense, PartnerPayment, MonthlyFinancialPlan, SignedAct, AssistantBonusPayment, AssistantActionLog,
  InsertPartner, InsertClient, InsertInvoice, InsertInvoiceExpense, InsertPartnerPayment, InsertMonthlyFinancialPlan, InsertSignedAct, InsertAssistantBonusPayment, InsertAssistantActionLog,
  RecurringInvoice, InsertRecurringInvoice, AccessToken, UserSession, UserRole, InvoiceScheme, ActType, AssistantActionType
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
import type { ClientCollectionScope } from "./tenantAccess";

export class DatabaseStorage implements StorageOperations {
  constructor(private readonly database = db) {}
  async verifyAccessCode(code: string): Promise<AccessToken | null> {
    return userRepo.verifyAccessCode(this.database, code);
  }

  async createSession(tokenId: string, ipAddress?: string, userAgent?: string) {
    return userRepo.createSession(this.database, tokenId, ipAddress, userAgent);
  }

  async validateSession(sessionId: string, csrfToken?: string) {
    return userRepo.validateSession(this.database, sessionId, csrfToken);
  }

  async refreshSession(sessionId: string): Promise<Date | null> {
    return userRepo.refreshSession(this.database, sessionId);
  }

  async revokeSession(sessionId: string): Promise<void> {
    return userRepo.revokeSession(this.database, sessionId);
  }

  async getPartners() { return partnerRepo.getPartners(this.database); }
  async getPartner(id: string) { return partnerRepo.getPartner(this.database, id); }
  async createPartner(partner: InsertPartner) { return partnerRepo.createPartner(this.database, partner); }
  async updatePartner(id: string, partner: Partial<InsertPartner>) { return partnerRepo.updatePartner(this.database, id, partner); }
  async deletePartner(id: string) { return partnerRepo.deletePartner(this.database, id); }
  async getPartnerClients(partnerId: string) { return partnerRepo.getPartnerClients(this.database, partnerId); }

  async getClients(scope: ClientCollectionScope) { return clientRepo.getClients(this.database, scope); }
  async getClient(id: string) { return clientRepo.getClient(this.database, id); }
  async createClient(client: InsertClient) { return clientRepo.createClient(this.database, client); }
  async updateClient(id: string, client: Partial<InsertClient>) { return clientRepo.updateClient(this.database, id, client); }
  async getClientWithPartner(id: string) { return clientRepo.getClientWithPartner(this.database, id); }
  async getClientPartners(clientId: string) { return clientRepo.getClientPartners(this.database, clientId); }
  async getClientsWithPartners(scope: ClientCollectionScope) { return clientRepo.getClientsWithPartners(this.database, scope); }
  async setClientPartners(clientId: string, partnerIds: string[]) { return clientRepo.setClientPartners(this.database, clientId, partnerIds); }
  async deleteClient(id: string) { return clientRepo.deleteClient(this.database, id); }

  invoiceExportPages(actor: import('./invoiceAccess').InvoiceActor, query: Partial<import('./invoiceQuery').InvoiceQuery>) { return exportRepo.invoiceExportPages(this.database, actor, query); }
  expenseExportPages(invoiceIds: string[]) { return exportRepo.expenseExportPages(this.database, invoiceIds); }
  async getInvoices(role: UserRole, partnerId?: string, clientId?: string, filters?: import("./invoiceQuery").InvoiceQuery) { return invoiceRepo.getInvoices(this.database, role, partnerId, clientId, filters); }
  async getInvoice(id: string) { return invoiceRepo.getInvoice(this.database, id); }
  async getInvoiceForRole(id: string, role: UserRole, partnerId?: string, clientId?: string) { return invoiceRepo.getInvoice(this.database, id, role, partnerId, clientId); }
  async getInvoicesWithCalculations() { return invoiceRepo.getInvoicesWithCalculations(this.database); }
  async createInvoice(invoice: InsertInvoice, calculations: Partial<InvoiceCalculation>) { return invoiceRepo.createInvoice(this.database, invoice, calculations); }
  async updateInvoice(id: string, invoice: Partial<InsertInvoice>, calculations?: Partial<InvoiceCalculation>) { return invoiceRepo.updateInvoice(this.database, id, invoice, calculations); }
  async updateInvoiceCalculations(invoiceId: string, calculations: Partial<InvoiceCalculation>) { return invoiceRepo.updateInvoiceCalculations(this.database, invoiceId, calculations); }
  async getInvoiceExpenses(invoiceId: string) { return invoiceRepo.getInvoiceExpenses(this.database, invoiceId); }
  async getInvoiceExpense(id: string) { return invoiceRepo.getInvoiceExpense(this.database, id); }
  async getAllExpenses(invoiceIds?: string[]) { return invoiceRepo.getAllExpenses(this.database, invoiceIds); }
  async createInvoiceExpense(expense: InsertInvoiceExpense) { return invoiceRepo.createInvoiceExpense(this.database, expense); }
  async updateInvoiceExpense(id: string, updates: Partial<InsertInvoiceExpense>) { return invoiceRepo.updateInvoiceExpense(this.database, id, updates); }
  async deleteInvoiceExpense(id: string) { return invoiceRepo.deleteInvoiceExpense(this.database, id); }
  async createInvoiceTransfer(args: Parameters<typeof invoiceRepo.createInvoiceTransfer>[1]) { return invoiceRepo.createInvoiceTransfer(this.database, args); }
  async deleteInvoiceTransfer(id: string) { return invoiceRepo.deleteInvoiceTransfer(this.database, id); }
  async getInvoiceTransfers(invoiceId: string) { return invoiceRepo.getInvoiceTransfers(this.database, invoiceId); }
  async deleteInvoice(id: string) { return invoiceRepo.deleteInvoice(this.database, id); }

  async getPartnerPayment(id: string) { return partnerRepo.getPartnerPayment(this.database, id); }
  async createPartnerPayment(payment: InsertPartnerPayment) { return partnerRepo.createPartnerPayment(this.database, payment); }
  async updatePartnerPayment(id: string, updates: Partial<InsertPartnerPayment>) { return partnerRepo.updatePartnerPayment(this.database, id, updates); }
  async deletePartnerPayment(id: string) { return partnerRepo.deletePartnerPayment(this.database, id); }
  async getPartnerPaymentHistory(partnerId: string) { return partnerRepo.getPartnerPaymentHistory(this.database, partnerId); }

  async getAccessTokens() { return userRepo.getAccessTokens(this.database); }
  async createAccessToken(code: string, role: UserRole, partnerId?: string, clientId?: string) { return userRepo.createAccessToken(this.database, code, role, partnerId, clientId); }
  async deleteAccessToken(id: string) { return userRepo.deleteAccessToken(this.database, id); }

  async getDashboardStats(role: UserRole, partnerId?: string, clientId?: string): Promise<DashboardStats> {
    const query = this.database
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
        
        if (inv.paymentDate && new Date(inv.paymentDate) < today) {
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
    return recurringRepo.getRecurringExpectedAmounts(this.database);
  }

  async getPartnerDebtSummaries() {
    return dashboardRepo.getPartnerDebtSummaries(this.database);
  }

  async getDoNotSpendData(partnerId?: string) {
    return reportsRepo.getDoNotSpendData(this.database, partnerId);
  }

  async getPartnerSchemeDoNotSpendData(partnerId?: string, role?: string) {
    return dashboardRepo.getPartnerSchemeDoNotSpendData(this.database, partnerId, role);
  }

  async getExpectedCommission(partnerId?: string) {
    return reportsRepo.getExpectedCommission(this.database, partnerId);
  }

  async getExpectedAdminProfit() {
    return reportsRepo.getExpectedAdminProfit(this.database);
  }
  
  async getAdminDashboardStats(year?: number, month?: number) {
    return dashboardRepo.getAdminDashboardStats(this.database, (y: number, m: number) => this.getRecurringExpectedForMonth(y, m), year, month);
  }
  
  async getRecurringExpectedForMonth(year: number, month: number) {
    return recurringRepo.getRecurringExpectedForMonth(this.database, year, month);
  }
  
  async getRecurringInvoicesForMonth(year: number, month: number) {
    return recurringRepo.getRecurringInvoicesForMonth(this.database, year, month);
  }
  
  async getAlertCounts(role: string) {
    return alertsRepo.getAlertCounts(this.database, role);
  }

  async globalSearch(
    query: string,
    role: string,
    options: { clientId?: string } = {},
  ) {
    return searchRepo.globalSearch(this.database, query, role, options);
  }

  async getPriorityActions() {
    return alertsRepo.getPriorityActions(this.database);
  }

  async getOverdueInvoicesDetailed() {
    return alertsRepo.getOverdueInvoicesDetailed(this.database);
  }

  async getPartnerTerms(partnerId: string) {
    return partnerRepo.getPartnerTerms(this.database, partnerId);
  }

  async getPartnerPayments(partnerId: string) {
    return partnerRepo.getPartnerPayments(this.database, partnerId);
  }

  async getClientBudget(clientId: string) {
    return dashboardRepo.getClientBudget(this.database, clientId);
  }

  /**
   * Три блока для клиентского «Обзора»:
   *   1) agency  — открытая комиссия (agency_30/40): Σ доступно/потрачено/осталось + таблица счетов.
   *   2) recurring — счета из шаблонов recurring_invoices: «осталось N мес ≈ M ₽» на услугу.
   *   3) oneTime — неагентские разовые: оплачено / к оплате (X из Y · ₽).
   * Любая сумма приходит как number с защитой от NaN.
   */
  async getClientOverviewBuckets(clientId: string, dateFrom?: string, dateTo?: string) {
    return dashboardRepo.getClientOverviewBuckets(this.database, clientId, dateFrom, dateTo);
  }

  async getPartnerInvoicesDetail(partnerId: string) {
    return dashboardRepo.getPartnerInvoicesDetail(this.database, partnerId);
  }

  async getClientAgency30Report(clientId: string) {
    return reportsRepo.getClientAgency30Report(this.database, clientId);
  }

  async getAdminMonthlyData(year: number): Promise<MonthlyData[]> { return dashboardRepo.getAdminMonthlyData(this.database, year); }
  
  async getAdminForecast(monthsAhead: number) {
    return planningRepo.getAdminForecast(this.database, monthsAhead);
  }
  
  async getInvoicesByMonth(month: number, year: number, type?: string) {
    return reportsRepo.getInvoicesByMonth(this.database, month, year, type);
  }
  
  async getOverdueInvoices() {
    return alertsRepo.getOverdueInvoices(this.database);
  }
  
  async getPartnerDebtDetails(partnerId: string) {
    return dashboardRepo.getPartnerDebtDetails(this.database, partnerId);
  }

  async getAdminPlanFact(year: number) {
    return planningRepo.getAdminPlanFact(this.database, year);
  }

  async getMonthlyPlans(year: number) {
    return planningRepo.getMonthlyPlans(this.database, year);
  }

  async getMonthlyPlan(year: number, month: number) {
    return planningRepo.getMonthlyPlan(this.database, year, month);
  }

  async upsertMonthlyPlan(input: MonthlyPlanInput) {
    return planningRepo.upsertMonthlyPlan(this.database, input);
  }
  
  async recalculateAllInvoices() { return invoiceRepo.recalculateAllInvoices(this.database); }

  // Signed Acts methods
  async createSignedAct(act: InsertSignedAct)                        { return actsRepo.createSignedAct(this.database, act); }
  async getSignedActsByInvoice(invoiceId: string, actType?: ActType)  { return actsRepo.getSignedActsByInvoice(this.database, invoiceId, actType); }
  async openSignedActFile(id: string) { return actsRepo.openSignedActFile(this.database, id); }
  async readSignedActData(id: string) { return actsRepo.readSignedActData(this.database, id); }
  async getSignedAct(id: string)                                      { return actsRepo.getSignedAct(this.database, id); }
  async deleteSignedAct(id: string)                                   { return actsRepo.deleteSignedAct(this.database, id); }
  async getActsStatistics(excludeHidden = false)                      { return actsRepo.getActsStatistics(this.database, excludeHidden); }
  async getAssistantStats()                                           { return actsRepo.getAssistantStats(this.database); }
  async getAssistantBonusPayments()                                   { return actsRepo.getAssistantBonusPayments(this.database); }
  async createAssistantBonusPayment(payment: InsertAssistantBonusPayment) { return actsRepo.createAssistantBonusPayment(this.database, payment); }
  async getUnpaidBonusTotal()                                         { return actsRepo.getUnpaidBonusTotal(this.database); }
  async markBonusesAsPaid(invoiceIds: string[])                       { return actsRepo.markBonusesAsPaid(this.database, invoiceIds); }

  async getDraftsStats() {
    return reportsRepo.getDraftsStats(this.database);
  }

  async getRecurringInvoices(scope?: recurringRepo.RecurringScope)                                           { return recurringRepo.getRecurringInvoices(this.database, scope); }
  async getRecurringInvoice(id: string, scope?: recurringRepo.RecurringScope)                                  { return recurringRepo.getRecurringInvoice(this.database, id, scope); }
  async createRecurringInvoice(data: InsertRecurringInvoice)                                { return recurringRepo.createRecurringInvoice(this.database, data); }
  async getDueRecurringInvoices(upToDate?: Date, scope?: recurringRepo.RecurringScope)                         { return recurringRepo.getDueRecurringInvoices(this.database, upToDate, scope); }
  async getActiveRecurringInvoicesForCashFlow(scope?: recurringRepo.RecurringScope)                          { return recurringRepo.getActiveRecurringInvoicesForCashFlow(this.database, scope); }
  async generateInvoiceNumber()                                          { return invoiceRepo.generateInvoiceNumber(this.database); }
  async createDraftFromRecurring(recurringId: string, invoiceDate?: string, scope?: recurringRepo.RecurringScope) { return recurringRepo.createDraftFromRecurring(this.database, recurringId, invoiceDate, scope); }
  async processAllDueRecurringInvoices()                                 { return recurringRepo.processAllDueRecurringInvoices(this.database); }
  async generateBackdatedInvoices(recurringId: string, fromDate: string) { return recurringRepo.generateBackdatedInvoices(this.database, recurringId, fromDate); }
  async updateRecurringInvoice(id: string, data: Partial<InsertRecurringInvoice>, scope?: recurringRepo.RecurringScope)                    { return recurringRepo.updateRecurringInvoice(this.database, id, data, scope); }
  async deleteRecurringInvoice(id: string)                               { return recurringRepo.deleteRecurringInvoice(this.database, id); }

  async getPartnerClientStats(partnerId: string, year: number) {
    return partnerRepo.getPartnerClientStats(this.database, partnerId, year);
  }

  async getPartnerDocumentRisk(partnerId: string) {
    return partnerRepo.getPartnerDocumentRisk(this.database, partnerId);
  }

  async getPartnerAgency30Funds(partnerId: string) {
    return partnerRepo.getPartnerAgency30Funds(this.database, partnerId);
  }

  async getPartnerHeroMetrics(partnerId: string): Promise<PartnerHeroMetricsData> { return dashboardRepo.getPartnerHeroMetrics(this.database, partnerId); }

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
    return reportsRepo.getClientLTV(this.database, year);
  }

  async getDashboardInvoices(year: number, month: number, category: 'received' | 'expected' | 'drafts' | 'overdue' | 'drafts_no_date') {
    return dashboardRepo.getDashboardInvoices(this.database, year, month, category);
  }

  async logAssistantAction(log: InsertAssistantActionLog) { return actionLogRepo.logAssistantAction(this.database, log); }
  async getAssistantActionLogs(filters: AssistantActionLogFilters) { return actionLogRepo.getAssistantActionLogs(this.database, filters); }
}

export const storage = new DatabaseStorage();
