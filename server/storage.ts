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
  getClientLTV(year?: number): Promise<{ data: ClientLTVData[]; availableYears: number[] }>;
  
  // Assistant action logs
  logAssistantAction(log: InsertAssistantActionLog): Promise<AssistantActionLog>;
  getAssistantActionLogs(filters: AssistantActionLogFilters): Promise<{ logs: AssistantActionLogWithDetails[]; total: number }>;
  
  // Dashboard invoice details for expandable cards
  getDashboardInvoices(year: number, month: number, category: 'received' | 'expected' | 'drafts'): Promise<DashboardInvoiceDetail[]>;
  
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
  async deleteInvoice(id: string) { return invoiceRepo.deleteInvoice(db, id); }
  async deleteDocument(id: string) { return invoiceRepo.deleteDocument(db, id);
  }

  async getPartnerPayments(partnerId?: string) { return partnerRepo.getPartnerPayments(db, partnerId); }
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
        
        if (scheme === 'agency_30' || scheme === 'agency_40') {
          // Agency schemes: partner & admin get from margin
          totalPartnerCommission += parseNum(calc.partnerShareFromMargin);
          totalAdminShare += parseNum(calc.adminShareFromMargin);
          clientRemaining += parseNum(calc.clientBaseAfterMargin) - expenses;
        } else {
          // partner_10, partner_15, commission_based
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
      const totalPaid = payments.reduce((sum, p) => sum + parseNum(p.amount), 0);
      
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
      const amount = parseNum(recurring.amount);
      if (amount <= 0) continue;
      
      const scheme = recurring.scheme as InvoiceScheme;
      const partnerCommissionRate = recurring.partnerCommissionRate 
        ? parseNum(recurring.partnerCommissionRate) 
        : undefined;
      const defaultExpenses = parseNum(recurring.defaultExpenses);
      
      // Calculate expected admin profit (including default expenses)
      const calculation = calculateInvoiceServer(scheme, amount, partnerCommissionRate, 0, 0, 0, defaultExpenses);
      const expectedProfit = parseNum(calculation.netProfitAdmin);
      
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
      const debt = parseNum(row.calculations.partnerTransferDue) || 0;
      const commission = parseNum(row.calculations.commissionAmount) || 0;

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
        summary.totalPaid += parseNum(payment.amount) || 0;
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
      const clientBill = parseNum(row.calculations.clientBill);
      const executorExpenses = parseNum(row.calculations.executorExpensesTotal);
      
      // Use stored clientBaseAfterMargin if available, else calculate based on scheme
      const scheme = row.invoice.scheme;
      const clientBaseRate = scheme === 'agency_40' ? 0.6 : 0.7; // agency_40: 60%, agency_30: 70%
      const clientBase = parseNum(row.calculations.clientBaseAfterMargin) || (clientBill * clientBaseRate);
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
      const amount = parseNum(expense.amount);
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
      const clientBill = parseNum(row.calculations.clientBill);
      const plannedExpenses = parseNum(row.invoice.plannedExpenses);
      const commissionRate = row.calculations.commissionRate ? parseNum(row.calculations.commissionRate) : 10;
      
      // Get ACTUAL spent expenses from invoice_expenses table (partner-paid only)
      const invoiceExpensesData = expensesByInvoice.get(row.invoice.id) || { paidByPartner: 0, paidByAdmin: 0 };
      const spent = invoiceExpensesData.paidByPartner;
      const remaining = Math.max(0, plannedExpenses - spent);
      
      // Commission is partner's share (what they keep): clientBill * (commissionRate / 100)
      const commission = clientBill * (commissionRate / 100);
      
      // Partner debt comes from stored calculation (FIXED value, doesn't change with expenses)
      const partnerDebt = parseNum(row.calculations.partnerTransferDue);
      
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
      summary.totalCommission += (role === 'assistant' || role === 'accountant') ? 0 : commission;
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
        commission: (role === 'assistant' || role === 'accountant') ? 0 : commission,
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
        totalCommission: (role === 'assistant' || role === 'accountant') ? 0 : s.totalCommission,
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
      const clientBill = parseNum(row.calculations.clientBill);
      const scheme = row.invoice.scheme || 'commission_based';
      
      // Calculate commission based on scheme
      let commission = 0;
      if (scheme === 'agency_30' || scheme === 'agency_40') {
        // For agency schemes: partner gets partnerShareFromMargin
        commission = parseNum(row.calculations.partnerShareFromMargin);
      } else {
        // For partner_10, partner_15, commission_based: use commissionAmount
        commission = parseNum(row.calculations.commissionAmount);
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
      const clientBill = parseNum(row.calculations.clientBill);
      const netProfitAdmin = parseNum(row.calculations.netProfitAdmin);
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

    // Build ISO date-string bounds for SQL date comparisons
    const pad = (n: number) => String(n).padStart(2, '0');
    const lastDayOfMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const monthStartStr = `${selectedYear}-${pad(selectedMonth + 1)}-01`;
    const monthEndStr   = `${selectedYear}-${pad(selectedMonth + 1)}-${pad(lastDayOfMonth)}`;
    const yearStartStr  = `${selectedYear}-01-01`;
    const yearEndStr    = `${selectedYear}-12-31`;

    // Effective date expression: paymentDate when set, otherwise DATE(createdAt)
    const effectiveDate = sql`COALESCE(${invoices.paymentDate}, DATE(${invoices.createdAt}))`;

    // Run all aggregation queries in parallel for performance
    const [
      yearlyRows,
      monthlyPaidRows,
      monthlyExpectedRows,
      leverageRows,
      salesRows,
      availableYearsRows,
    ] = await Promise.all([
      // 1. Yearly metrics — paid invoices whose effective date falls within the selected year
      db.select({
        revenue: sql<string>`COALESCE(SUM(${invoiceCalculations.clientBill}::numeric), 0)`,
        profit:  sql<string>`COALESCE(SUM(${invoiceCalculations.netProfitAdmin}::numeric), 0)`,
      })
        .from(invoices)
        .innerJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
        .where(and(
          eq(invoices.status, 'paid'),
          sql`${effectiveDate} BETWEEN ${yearStartStr}::date AND ${yearEndStr}::date`,
        )),

      // 2. Monthly received — paid invoices whose effective date falls within the selected month
      db.select({
        profit: sql<string>`COALESCE(SUM(${invoiceCalculations.netProfitAdmin}::numeric), 0)`,
      })
        .from(invoices)
        .innerJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
        .where(and(
          eq(invoices.status, 'paid'),
          sql`${effectiveDate} BETWEEN ${monthStartStr}::date AND ${monthEndStr}::date`,
        )),

      // 3. Monthly expected — non-paid, non-cancelled with effective date in month
      db.select({
        profit: sql<string>`COALESCE(SUM(${invoiceCalculations.netProfitAdmin}::numeric), 0)`,
      })
        .from(invoices)
        .innerJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
        .where(and(
          sql`${invoices.status} NOT IN ('paid', 'cancelled')`,
          sql`${effectiveDate} BETWEEN ${monthStartStr}::date AND ${monthEndStr}::date`,
        )),

      // 4. Leverage — non-cancelled with effective date in month, split by Vika Utkina
      db.select({
        vikaProfit: sql<string>`COALESCE(SUM(
          CASE WHEN LOWER(${partners.name}) LIKE '%вика уткина%'
                 OR LOWER(${partners.name}) LIKE '%vika utkina%'
               THEN ${invoiceCalculations.netProfitAdmin}::numeric
               ELSE 0
          END), 0)`,
        othersProfit: sql<string>`COALESCE(SUM(
          CASE WHEN LOWER(${partners.name}) NOT LIKE '%вика уткина%'
               AND (${partners.name} IS NULL OR LOWER(${partners.name}) NOT LIKE '%vika utkina%')
               THEN ${invoiceCalculations.netProfitAdmin}::numeric
               ELSE 0
          END), 0)`,
      })
        .from(invoices)
        .innerJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
        .leftJoin(partners, eq(invoices.partnerId, partners.id))
        .where(and(
          sql`${invoices.status} != 'cancelled'`,
          sql`${effectiveDate} BETWEEN ${monthStartStr}::date AND ${monthEndStr}::date`,
        )),

      // 5. Monthly sales — non-cancelled, non-recurring invoices created this month
      db.select({
        draftsCount: sql<string>`COUNT(*)`,
        draftsTotal: sql<string>`COALESCE(SUM(${invoiceCalculations.netProfitAdmin}::numeric), 0)`,
      })
        .from(invoices)
        .innerJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
        .where(and(
          sql`${invoices.status} != 'cancelled'`,
          isNull(invoices.recurringInvoiceId),
          sql`DATE(${invoices.createdAt}) BETWEEN ${monthStartStr}::date AND ${monthEndStr}::date`,
        )),

      // 6. Available years — one row per distinct year found in effective dates
      db.select({
        yr: sql<number>`EXTRACT(YEAR FROM ${effectiveDate})::integer`,
      })
        .from(invoices)
        .groupBy(sql`EXTRACT(YEAR FROM ${effectiveDate})`),
    ]);

    // Unpack SQL results
    const yearlyRevenue     = parseNum(yearlyRows[0]?.revenue     ?? '0');
    const yearlyProfit      = parseNum(yearlyRows[0]?.profit      ?? '0');
    const monthlyReceived   = parseNum(monthlyPaidRows[0]?.profit ?? '0');
    const monthlyExpected   = parseNum(monthlyExpectedRows[0]?.profit ?? '0');
    const monthlyVikaProfit   = parseNum(String(leverageRows[0]?.vikaProfit   ?? '0'));
    const monthlyOthersProfit = parseNum(String(leverageRows[0]?.othersProfit ?? '0'));
    const draftsCount = parseInt(String(salesRows[0]?.draftsCount ?? '0'), 10);
    const draftsTotal = parseNum(String(salesRows[0]?.draftsTotal ?? '0'));
    const monthlyProfit = monthlyReceived;

    // Net Profit Margin = (Net Profit / Revenue) * 100
    const netProfitMargin = yearlyRevenue > 0 ? (yearlyProfit / yearlyRevenue) * 100 : 0;

    // Leverage ratio for selected month
    const leverageRatio = monthlyVikaProfit > 0 ? monthlyOthersProfit / monthlyVikaProfit : 0;

    // Available years — ensure current year is always present
    const yearsSet = new Set(availableYearsRows.map(r => r.yr).filter(Boolean));
    if (!yearsSet.has(now.getFullYear())) yearsSet.add(now.getFullYear());
    const availableYears = Array.from(yearsSet).sort((a, b) => b - a);

    // Owner shares: split profit 50/50
    const yearlyOwnerShare  = yearlyProfit / 2;
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
    
    const existingFromRecurring = await db
      .select({
        recurringInvoiceId: invoices.recurringInvoiceId,
        paymentDate: invoices.paymentDate,
        createdAt: invoices.createdAt,
      })
      .from(invoices)
      .where(and(
        isNotNull(invoices.recurringInvoiceId),
        sql`${invoices.status} != 'cancelled'`
      ));
    
    const createdKeys = new Set<string>();
    for (const inv of existingFromRecurring) {
      const dateStr = inv.paymentDate || inv.createdAt;
      if (!dateStr || !inv.recurringInvoiceId) continue;
      const d = new Date(dateStr);
      const key = `${inv.recurringInvoiceId}:${d.getFullYear()}-${d.getMonth()}`;
      createdKeys.add(key);
    }
    
    let monthlyAmount = 0;
    let yearlyTotal = 0;
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31);
    
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
    
    const generateOccurrences = function*(
      scheduleStart: Date,
      frequency: 'monthly' | 'quarterly' | 'yearly',
      dayOfMonth: number,
      rangeStart: Date,
      rangeEnd: Date,
      scheduleEnd: Date | null
    ): Generator<Date> {
      let cursor = new Date(scheduleStart.getFullYear(), scheduleStart.getMonth(), dayOfMonth);
      
      if (cursor < scheduleStart) {
        cursor = new Date(scheduleStart.getFullYear(), scheduleStart.getMonth(), dayOfMonth);
      }
      
      let iterations = 0;
      while (cursor <= rangeEnd && iterations < 500) {
        iterations++;
        if (scheduleEnd && cursor > scheduleEnd) break;
        
        if (cursor >= scheduleStart && cursor >= rangeStart && cursor <= rangeEnd) {
          yield cursor;
        }
        
        cursor = advanceByFrequency(cursor, frequency, dayOfMonth);
      }
    };
    
    for (const recurring of activeRecurring) {
      const amount = parseNum(recurring.amount);
      if (amount <= 0) continue;
      
      const scheme = recurring.scheme as InvoiceScheme;
      const partnerCommissionRate = recurring.partnerCommissionRate 
        ? parseNum(recurring.partnerCommissionRate) 
        : undefined;
      const defaultExpenses = parseNum(recurring.defaultExpenses);
      
      const calculation = calculateInvoiceServer(scheme, amount, partnerCommissionRate, 0, 0, 0, defaultExpenses);
      const expectedProfit = parseNum(calculation.netProfitAdmin);
      
      if (expectedProfit <= 0) continue;
      
      const dayOfMonth = parseInt(recurring.dayOfMonth || "1");
      const frequency = recurring.frequency as 'monthly' | 'quarterly' | 'yearly';
      const endDateValue = recurring.endDate ? new Date(recurring.endDate) : null;
      const baseStartDate = recurring.startDate ? new Date(recurring.startDate) : new Date();
      
      const nextInvoiceDate = recurring.nextInvoiceDate ? new Date(recurring.nextInvoiceDate) : null;
      const effectiveStartDate = nextInvoiceDate && nextInvoiceDate > baseStartDate ? nextInvoiceDate : baseStartDate;
      
      if (effectiveStartDate > yearEnd) continue;
      if (endDateValue && endDateValue < yearStart) continue;
      
      for (const occurrence of generateOccurrences(effectiveStartDate, frequency, dayOfMonth, monthStart, monthEnd, endDateValue)) {
        const key = `${recurring.id}:${occurrence.getFullYear()}-${occurrence.getMonth()}`;
        if (!createdKeys.has(key)) {
          monthlyAmount += expectedProfit;
        }
      }
      
      for (const occurrence of generateOccurrences(effectiveStartDate, frequency, dayOfMonth, yearStart, yearEnd, endDateValue)) {
        const key = `${recurring.id}:${occurrence.getFullYear()}-${occurrence.getMonth()}`;
        if (!createdKeys.has(key)) {
          yearlyTotal += expectedProfit;
        }
      }
    }
    
    return { monthlyAmount, yearlyTotal };
  }
  
  async getRecurringInvoicesForMonth(year: number, month: number): Promise<RecurringInvoiceForMonth[]> {
    const activeRecurring = await db
      .select({
        recurring: recurringInvoices,
        clientName: clients.name,
        partnerName: partners.name,
      })
      .from(recurringInvoices)
      .leftJoin(clients, eq(recurringInvoices.clientId, clients.id))
      .leftJoin(partners, eq(recurringInvoices.partnerId, partners.id))
      .where(eq(recurringInvoices.isActive, true));
    
    const existingFromRecurring = await db
      .select({
        recurringInvoiceId: invoices.recurringInvoiceId,
        paymentDate: invoices.paymentDate,
        createdAt: invoices.createdAt,
      })
      .from(invoices)
      .where(and(
        isNotNull(invoices.recurringInvoiceId),
        sql`${invoices.status} != 'cancelled'`
      ));
    
    const createdKeys = new Set<string>();
    for (const inv of existingFromRecurring) {
      const dateStr = inv.paymentDate || inv.createdAt;
      if (!dateStr || !inv.recurringInvoiceId) continue;
      const d = new Date(dateStr);
      const key = `${inv.recurringInvoiceId}:${d.getFullYear()}-${d.getMonth()}`;
      createdKeys.add(key);
    }
    
    const result: RecurringInvoiceForMonth[] = [];
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);
    
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
    
    const hasOccurrenceInMonth = (
      scheduleStart: Date,
      frequency: 'monthly' | 'quarterly' | 'yearly',
      dayOfMonth: number,
      scheduleEnd: Date | null
    ): boolean => {
      let cursor = new Date(scheduleStart.getFullYear(), scheduleStart.getMonth(), dayOfMonth);
      if (cursor < scheduleStart) {
        cursor = new Date(scheduleStart.getFullYear(), scheduleStart.getMonth(), dayOfMonth);
      }
      
      let iterations = 0;
      while (cursor <= monthEnd && iterations < 500) {
        iterations++;
        if (scheduleEnd && cursor > scheduleEnd) break;
        
        if (cursor >= scheduleStart && cursor >= monthStart && cursor <= monthEnd) {
          return true;
        }
        cursor = advanceByFrequency(cursor, frequency, dayOfMonth);
      }
      return false;
    };
    
    for (const row of activeRecurring) {
      const recurring = row.recurring;
      const amount = parseNum(recurring.amount);
      if (amount <= 0) continue;
      
      const scheme = recurring.scheme as InvoiceScheme;
      const partnerCommissionRate = recurring.partnerCommissionRate 
        ? parseNum(recurring.partnerCommissionRate) 
        : undefined;
      const defaultExpenses = parseNum(recurring.defaultExpenses);
      
      const calculation = calculateInvoiceServer(scheme, amount, partnerCommissionRate, 0, 0, 0, defaultExpenses);
      const expectedProfit = parseNum(calculation.netProfitAdmin);
      
      if (expectedProfit <= 0) continue;
      
      const dayOfMonth = parseInt(recurring.dayOfMonth || "1");
      const frequency = recurring.frequency as 'monthly' | 'quarterly' | 'yearly';
      const endDateValue = recurring.endDate ? new Date(recurring.endDate) : null;
      const baseStartDate = recurring.startDate ? new Date(recurring.startDate) : new Date();
      
      const nextInvoiceDateValue = recurring.nextInvoiceDate ? new Date(recurring.nextInvoiceDate) : null;
      const effectiveStartDate = nextInvoiceDateValue && nextInvoiceDateValue > baseStartDate ? nextInvoiceDateValue : baseStartDate;
      
      if (effectiveStartDate > monthEnd) continue;
      if (endDateValue && endDateValue < monthStart) continue;
      
      const key = `${recurring.id}:${year}-${month}`;
      if (createdKeys.has(key)) continue;
      
      if (hasOccurrenceInMonth(effectiveStartDate, frequency, dayOfMonth, endDateValue)) {
        result.push({
          id: recurring.id,
          clientName: row.clientName,
          partnerName: row.partnerName,
          amount,
          expectedProfit,
          frequency,
          dayOfMonth,
          scheme,
        });
      }
    }
    
    return result;
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
      const clientBill = calculations ? parseNum(calculations.clientBill) : 0;

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
      const clientBill = parseNum(inv.clientBill);
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
        amount: parseNum(inv.clientBill),
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
        amount: parseNum(inv.clientBill),
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
        client_bill: parseNum(inv.clientBill),
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
          amount: parseNum(p.amount),
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
        amount: parseNum(exp.amount),
        date: exp.date || '',
      });
    }

    return clientInvoices
      .filter(row => row.calculations?.clientBaseAfterMargin)
      .map(row => ({
        invoiceId: row.invoice.id,
        invoiceNumber: row.invoice.invoiceNumber || '',
        partnerName: row.invoice.partnerId ? partnerMap.get(row.invoice.partnerId) || '—' : '—',
        totalBudget: parseNum(row.calculations?.clientBaseAfterMargin),
        spent: parseNum(row.calculations?.executorExpensesTotal),
        remaining: parseNum(row.calculations?.clientRemaining),
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
        paymentsByInvoice.set(p.invoiceId, current + parseNum(p.amount));
      }
    }

    return partnerInvoices
      .map(row => {
        const calc = row.calculations;
        const clientBill = parseNum(calc?.clientBill);
        const partnerCommission = parseNum(calc?.commissionAmount) || parseNum(calc?.partnerShareFromMargin);
        const storedDebt = parseNum(calc?.partnerTransferDue);
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
      totalPaid += parseNum(row.calculations.clientBill);
      agencyMargin += parseNum(row.calculations.agencyMargin);
      clientBudget += parseNum(row.calculations.clientBaseAfterMargin);
      totalSpent += parseNum(row.calculations.clientSpent);
      remainingBudget += parseNum(row.calculations.clientRemaining);
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
      expensesByInvoice.set(exp.invoiceId, current + parseNum(exp.amount));
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
      const profit = parseNum(row.calculations.netProfitAdmin);
      
      const clientBill = parseNum(row.calculations.clientBill);
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
      const profit = parseNum(row.calculations.netProfitAdmin);
      
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
      const amount = parseNum(recurring.amount);
      if (amount <= 0) continue;
      
      const scheme = recurring.scheme as InvoiceScheme;
      const partnerCommissionRate = recurring.partnerCommissionRate 
        ? parseNum(recurring.partnerCommissionRate) 
        : undefined;
      const defaultExpenses = parseNum(recurring.defaultExpenses);
      
      // Calculate expected admin profit for this recurring invoice (including default expenses)
      const calculation = calculateInvoiceServer(scheme, amount, partnerCommissionRate, 0, 0, 0, defaultExpenses);
      const expectedProfit = parseNum(calculation.netProfitAdmin);
      
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
      clientBill: parseNum(row.calculations?.clientBill),
      netProfitAdmin: parseNum(row.calculations?.netProfitAdmin),
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
        amount: parseNum(row.calculations?.clientBill),
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
      const amount = parseNum(exp.amount);
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
      const cBill = parseNum(row.calculations.clientBill);
      const expenses = expensesByInvoice.get(row.invoice.id) || { byPartner: 0, byAdmin: 0 };
      
      // Use stored values as single source of truth
      const storedDebt = parseNum(row.calculations.partnerTransferDue);
      const partnerCommission = parseNum(row.calculations.commissionAmount);
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
    const totalPaid = partnerPaymentsList.reduce((sum, p) => sum + parseNum(p.amount), 0);
    
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
        planFactData[monthIndex].salesTarget = parseNum(plan.salesTarget);
        planFactData[monthIndex].receiptsTarget = parseNum(plan.receiptsTarget);
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
      
      const clientBill = parseNum(row.calculations.clientBill);
      
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
      const clientBill = parseNum(row.calculations?.clientBill);
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
      
      const clientBill = parseNum(row.calculations.clientBill);
      const scheme = row.invoice.scheme;
      
      let commission = 0;
      let clientRemaining = 0;
      
      if (scheme === 'agency_30' || scheme === 'agency_40') {
        commission = parseNum(row.calculations.partnerShareFromMargin);
        const clientPercent = scheme === 'agency_40' ? 0.60 : 0.70;
        const clientBase = clientBill * clientPercent;
        const expenses = parseNum(row.calculations.executorExpensesTotal);
        clientRemaining = Math.max(0, clientBase - expenses);
      } else {
        commission = parseNum(row.calculations.commissionAmount);
        clientRemaining = parseNum(row.calculations.clientRemaining);
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
      const clientBill = parseNum(row.calculations.clientBill);
      const executorExpenses = parseNum(row.calculations.executorExpensesTotal);
      
      // Client money that partner must not spend (70% for agency_30, 60% for agency_40)
      const scheme = row.invoice.scheme;
      const clientBaseRate = scheme === 'agency_40' ? 0.6 : 0.7;
      const clientBase = parseNum(row.calculations.clientBaseAfterMargin) || (clientBill * clientBaseRate);
      
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
      
      const partnerTransferDue = parseNum(row.calculations.partnerTransferDue);
      const plannedExpenses = parseNum(row.calculations.plannedExpenses);
      const expensesPaidByPartner = parseNum(row.calculations.expensesPaidByPartner);
      
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
      const commission = parseNum(row.calculations.partnerCommission);
      yearlyCommission += commission;
    }
    
    // Get payments made to reduce debt
    const payments = await db.select().from(partnerPayments)
      .where(eq(partnerPayments.partnerId, partnerId));
    
    const totalPaid = payments.reduce((sum, p) => sum + parseNum(p.amount), 0);
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

  async getClientLTV(year?: number): Promise<{ data: ClientLTVData[]; availableYears: number[] }> {
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

    // Collect available years from paid invoices (use paymentDate with fallback to createdAt)
    const yearsSet = new Set<number>();
    for (const row of allInvoices) {
      if (row.invoice.status === 'paid') {
        const dateStr = row.invoice.paymentDate || row.invoice.createdAt;
        if (dateStr) {
          yearsSet.add(new Date(dateStr).getFullYear());
        }
      }
    }
    const availableYears = Array.from(yearsSet).sort((a, b) => b - a);

    // Filter by year if specified
    let yearStart: Date | null = null;
    let yearEnd: Date | null = null;
    if (year !== undefined) {
      yearStart = new Date(year, 0, 1);
      yearEnd = new Date(year, 11, 31, 23, 59, 59);
    }

    const clientMap = new Map<string, ClientLTVData>();

    for (const row of allInvoices) {
      if (!row.invoice.clientId) continue;

      const clientId = row.invoice.clientId;
      const clientName = row.clientName || 'Неизвестный клиент';
      const adminProfit = parseNum(row.calculations?.netProfitAdmin);
      const isPaid = row.invoice.status === 'paid';
      const isSent = row.invoice.status === 'sent';

      // For year filter, get payment date with fallback
      const paymentDateStr = row.invoice.paymentDate || row.invoice.createdAt;
      const paymentDate = paymentDateStr ? new Date(paymentDateStr) : null;

      // When year filter is applied, skip paid invoices outside the year entirely
      if (year !== undefined && yearStart && yearEnd && isPaid) {
        if (!paymentDate || paymentDate < yearStart || paymentDate > yearEnd) {
          continue; // Skip this invoice completely
        }
      }

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
        client.paid_invoices += 1;
        client.total_admin_profit += adminProfit;
      } else if (isSent) {
        // Потенциальная прибыль - не фильтруем по году, если год не указан
        // При фильтре по году показываем только текущие ожидающие счета
        client.potential_profit += adminProfit;
      }
    }

    // Filter out clients with no activity in the selected period
    let data = Array.from(clientMap.values());
    if (year !== undefined) {
      // When filtering by year, only show clients with paid invoices or potential profit
      data = data.filter(c => c.paid_invoices > 0 || c.potential_profit > 0);
    }

    // Sort by total_admin_profit (realized profit)
    data.sort((a, b) => b.total_admin_profit - a.total_admin_profit);
    
    return { data, availableYears };
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
      const netProfitAdmin = parseNum(row.calculations.netProfitAdmin);
      const clientBill = parseNum(row.calculations.clientBill);
      
      if (category === 'received') {
        // Paid invoices in selected month - MUST match getAdminDashboardStats logic
        // Uses paymentDate, falls back to createdAt if not set
        if (status !== 'paid') continue;
        const paymentDateStr = row.invoice.paymentDate 
          ? row.invoice.paymentDate 
          : (row.invoice.createdAt ? row.invoice.createdAt : null);
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
        // Sent/pending invoices with expected payment in selected month - MUST match getAdminDashboardStats logic
        // Uses paymentDate (which is the planned payment date), falls back to createdAt
        if (status === 'paid' || status === 'cancelled') continue;
        const paymentDateStr = row.invoice.paymentDate 
          ? row.invoice.paymentDate 
          : (row.invoice.createdAt ? row.invoice.createdAt : null);
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
        // Sales: non-cancelled, non-recurring invoices created in selected month
        if (status === 'cancelled') continue;
        if (row.invoice.recurringInvoiceId) continue; // auto-generated, not a new sale
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

  async logAssistantAction(log: InsertAssistantActionLog) { return actionLogRepo.logAssistantAction(db, log); }
  async getAssistantActionLogs(filters: AssistantActionLogFilters) { return actionLogRepo.getAssistantActionLogs(db, filters); }
}

export const storage = new DatabaseStorage();
