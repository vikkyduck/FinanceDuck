import * as financialReportsRepo from './repositories/financialReportsRepo';
import type * as exportRepo from "./repositories/exportRepo";
import type { InvoiceActor } from './invoiceAccess';

import type {
  partners,
  Partner,
  Client,
  Invoice,
  InvoiceCalculation,
  InvoiceExpense,
  PartnerPayment,
  MonthlyFinancialPlan,
  SignedAct,
  AssistantBonusPayment,
  AssistantActionLog,
  InsertPartner,
  InsertClient,
  InsertInvoice,
  InsertInvoiceExpense,
  InsertPartnerPayment,
  InsertSignedAct,
  InsertAssistantBonusPayment,
  InsertAssistantActionLog,
  RecurringInvoice,
  InsertRecurringInvoice,
  AccessToken,
  UserRole,
  ActType,
} from "../shared/schema";

import type * as partnerRepo from "./repositories/partnerRepo";

import type * as invoiceRepo from "./repositories/invoiceRepo";
import type * as recurringRepo from "./repositories/recurringRepo";
import type * as actsRepo from "./repositories/actsRepo";

import type * as dashboardRepo from "./repositories/dashboardRepo";
import type * as alertsRepo from "./repositories/alertsRepo";

import type * as reportsRepo from "./repositories/reportsRepo";
import type * as searchRepo from "./repositories/searchRepo";

import type { ClientCollectionScope } from "./tenantAccess";
import type {
  RecurringInvoiceForMonth,
  AssistantActionLogFilters,
  AssistantActionLogWithDetails,
  WorkingCapitalData,
  ClientLTVData,
  PartnerClientStatsData,
  PartnerDocumentRiskData,
  PartnerAgency30FundsData,
  PartnerHeroMetricsData,
  DashboardInvoiceDetail,
  MonthlyData,
  MonthInvoiceDetail,
  DraftsStats,
  ForecastData,
  OverdueInvoice,
  PaymentHistoryEntry,
  PlanFactData,
  MonthlyPlanInput,
  DashboardStats,
} from "./storageTypes";
export interface SessionStore {
  verifyAccessCode(code: string): Promise<AccessToken | null>;
  createSession(
    tokenId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ sessionId: string; csrfToken: string; expiresAt: Date }>;
  validateSession(
    sessionId: string,
    csrfToken?: string,
  ): Promise<{
    isValid: boolean;
    token?: AccessToken;
    csrfToken?: string;
  } | null>;
  refreshSession(sessionId: string): Promise<Date | null>;
  revokeSession(sessionId: string): Promise<void>;
  getAccessTokens(): Promise<AccessToken[]>;
  createAccessToken(
    code: string,
    role: UserRole,
    partnerId?: string,
    clientId?: string,
  ): Promise<AccessToken>;
  deleteAccessToken(id: string): Promise<void>;
}

export interface InvoiceRepository {
  getInvoices(
    role: UserRole,
    partnerId?: string,
    clientId?: string,
    filters?: import("./invoiceQuery").InvoiceQuery,
  ): Promise<
    (Invoice & {
      calculations?: InvoiceCalculation;
      partner?: Partner;
      client?: Client;
    })[]
  >;
  getInvoice(id: string): Promise<
    | (Invoice & {
        calculations?: InvoiceCalculation;
        partner?: Partner;
        client?: Client;
      })
    | null
  >;
  getInvoiceForRole(
    id: string,
    role: UserRole,
    partnerId?: string,
    clientId?: string,
  ): Promise<
    | (Invoice & {
        calculations?: InvoiceCalculation;
        partner?: Partner;
        client?: Client;
      })
    | null
  >;
  createInvoice(
    invoice: InsertInvoice,
    calculations: Partial<InvoiceCalculation>,
  ): Promise<Invoice>;
  updateInvoice(
    id: string,
    invoice: Partial<InsertInvoice>,
    calculations?: Partial<InvoiceCalculation>,
  ): Promise<Invoice | null>;
  updateInvoiceCalculations(
    invoiceId: string,
    calculations: Partial<InvoiceCalculation>,
  ): Promise<InvoiceCalculation | null>;
  deleteInvoice(id: string): Promise<void>;
  getInvoiceExpenses(invoiceId: string): Promise<InvoiceExpense[]>;
  getInvoiceExpense(id: string): Promise<InvoiceExpense | null>;
  getAllExpenses(invoiceIds?: string[]): Promise<InvoiceExpense[]>;
  createInvoiceExpense(expense: InsertInvoiceExpense): Promise<InvoiceExpense>;
  updateInvoiceExpense(
    id: string,
    updates: Partial<InsertInvoiceExpense>,
  ): Promise<InvoiceExpense | null>;
  deleteInvoiceExpense(id: string): Promise<void>;
  recalculateAllInvoices(): Promise<{ updated: number; errors: number }>;
  createInvoiceTransfer(
    args: Parameters<typeof invoiceRepo.createInvoiceTransfer>[1],
  ): ReturnType<typeof invoiceRepo.createInvoiceTransfer>;
  deleteInvoiceTransfer(
    id: string,
  ): ReturnType<typeof invoiceRepo.deleteInvoiceTransfer>;
  getInvoiceTransfers(
    invoiceId: string,
  ): ReturnType<typeof invoiceRepo.getInvoiceTransfers>;
  generateInvoiceNumber(): ReturnType<typeof invoiceRepo.generateInvoiceNumber>;
}

export interface DirectoryStore {
  getPartners(): Promise<Partner[]>;
  getPartner(id: string): Promise<Partner | null>;
  createPartner(partner: InsertPartner): Promise<Partner>;
  updatePartner(
    id: string,
    partner: Partial<InsertPartner>,
  ): Promise<Partner | null>;
  deletePartner(id: string): Promise<{ success: boolean; error?: string }>;
  getPartnerClients(partnerId: string): Promise<Client[]>;
  getClients(scope: ClientCollectionScope): Promise<Client[]>;
  getClient(id: string): Promise<Client | null>;
  getClientWithPartner(
    id: string,
  ): Promise<(Client & { partner?: Partner }) | null>;
  getClientPartners(clientId: string): Promise<Partner[]>;
  getClientsWithPartners(
    scope: ClientCollectionScope,
  ): Promise<(Client & { partners: Partner[] })[]>;
  setClientPartners(clientId: string, partnerIds: string[]): Promise<void>;
  createClient(client: InsertClient): Promise<Client>;
  updateClient(
    id: string,
    client: Partial<InsertClient>,
  ): Promise<Client | null>;
  deleteClient(id: string): Promise<{ success: boolean; error?: string }>;
  getPartnerPayments(partnerId: string): Promise<
    Array<{
      id: string;
      amount: number;
      paymentDate: string;
      notes: string | null;
      invoiceId: string | null;
      invoiceNumber: string | null;
    }>
  >;
  getPartnerPaymentHistory(partnerId: string): Promise<PaymentHistoryEntry[]>;
}

export interface ReportingQueries {
  invoiceExportPages(
    actor: import("./invoiceAccess").InvoiceActor,
    query: Partial<import("./invoiceQuery").InvoiceQuery>,
  ): ReturnType<typeof exportRepo.invoiceExportPages>;
  expenseExportPages(
    invoiceIds: string[],
  ): ReturnType<typeof exportRepo.expenseExportPages>;
  getInvoicesWithCalculations(): Promise<
    Array<{
      id: string;
      status: string;
      paymentDate: string | null;
      adminShare50: string | null;
      catShare50: string | null;
      netProfitAdmin: string | null;
    }>
  >;
  getDashboardStats(
    role: UserRole,
    partnerId?: string,
    clientId?: string,
  ): Promise<DashboardStats>;
  getAdminMonthlyData(year: number): Promise<MonthlyData[]>;
  getAdminForecast(monthsAhead: number): Promise<ForecastData[]>;
  getInvoicesByMonth(
    month: number,
    year: number,
    type?: string,
  ): Promise<MonthInvoiceDetail[]>;
  getOverdueInvoices(): Promise<OverdueInvoice[]>;
  getAdminPlanFact(year: number): Promise<PlanFactData[]>;
  getMonthlyPlans(year: number): Promise<MonthlyFinancialPlan[]>;
  getMonthlyPlan(
    year: number,
    month: number,
  ): Promise<MonthlyFinancialPlan | null>;
  upsertMonthlyPlan(input: MonthlyPlanInput): Promise<MonthlyFinancialPlan>;
  getDraftsStats(): Promise<DraftsStats>;
  getPartnerClientStats(
    partnerId: string,
    year: number,
  ): Promise<PartnerClientStatsData[]>;
  getPartnerDocumentRisk(partnerId: string): Promise<PartnerDocumentRiskData>;
  getPartnerAgency30Funds(
    partnerId: string,
  ): Promise<PartnerAgency30FundsData[]>;
  getPartnerHeroMetrics(partnerId: string): Promise<PartnerHeroMetricsData>;
  getWorkingCapital(): Promise<WorkingCapitalData | null>;
  updateWorkingCapital(
    amount: number,
    notes: string | null,
    updatedBy: string,
  ): Promise<WorkingCapitalData>;
  getClientLTV(
    year?: number,
  ): Promise<{ data: ClientLTVData[]; availableYears: number[] }>;
  getDashboardInvoices(
    year: number,
    month: number,
    category: "received" | "expected" | "drafts" | "overdue" | "drafts_no_date",
  ): Promise<DashboardInvoiceDetail[]>;
  getPartnerDebtSummaries(): ReturnType<
    typeof dashboardRepo.getPartnerDebtSummaries
  >;
  getDoNotSpendData(actor: InvoiceActor): ReturnType<typeof financialReportsRepo.getDoNotSpendData>;
  getPartnerSchemeDoNotSpendData(actor: InvoiceActor): ReturnType<typeof financialReportsRepo.getPartnerSchemeDoNotSpendData>;
  getExpectedCommission(actor: InvoiceActor): ReturnType<typeof financialReportsRepo.getExpectedCommission>;
  getExpectedAdminProfit(): ReturnType<
    typeof reportsRepo.getExpectedAdminProfit
  >;
  getAdminDashboardStats(
    year?: number,
    month?: number,
  ): ReturnType<typeof dashboardRepo.getAdminDashboardStats>;
  getAlertCounts(actor: InvoiceActor): ReturnType<typeof alertsRepo.getAlertCounts>;
  globalSearch(
    query: string,
    role: string,
    options?: {
      clientId?: string;
    },
  ): ReturnType<typeof searchRepo.globalSearch>;
  getPriorityActions(actor: InvoiceActor): ReturnType<typeof alertsRepo.getPriorityActions>;
  getOverdueInvoicesDetailed(actor: InvoiceActor): ReturnType<
    typeof alertsRepo.getOverdueInvoicesDetailed
  >;
  getPartnerTerms(
    partnerId: string,
  ): ReturnType<typeof partnerRepo.getPartnerTerms>;
  getClientBudget(
    clientId: string,
  ): ReturnType<typeof dashboardRepo.getClientBudget>;
  getClientOverviewBuckets(
    clientId: string,
    dateFrom?: string,
    dateTo?: string,
  ): ReturnType<typeof dashboardRepo.getClientOverviewBuckets>;
  getPartnerInvoicesDetail(
    partnerId: string,
  ): ReturnType<typeof dashboardRepo.getPartnerInvoicesDetail>;
  getClientAgency30Report(
    clientId: string,
  ): ReturnType<typeof reportsRepo.getClientAgency30Report>;
  getPartnerDebtDetails(
    partnerId: string,
  ): ReturnType<typeof dashboardRepo.getPartnerDebtDetails>;
  getAssistantStats(): ReturnType<typeof actsRepo.getAssistantStats>;
}

export interface DocumentsRepository {
  openSignedActFile(id: string): ReturnType<typeof actsRepo.openSignedActFile>;
  readSignedActData(id: string): ReturnType<typeof actsRepo.readSignedActData>;
  getAssistantBonusPayments(): Promise<AssistantBonusPayment[]>;
  createAssistantBonusPayment(
    payment: InsertAssistantBonusPayment,
  ): Promise<AssistantBonusPayment>;
  getUnpaidBonusTotal(): Promise<{
    total: number;
    invoiceCount: number;
    invoiceIds: string[];
    executorActs: number;
    companyActs: number;
    totalEarned: number;
    totalPaid: number;
  }>;
  markBonusesAsPaid(invoiceIds: string[]): Promise<void>;
  createSignedAct(act: InsertSignedAct): Promise<SignedAct>;
  getSignedActsByInvoice(
    invoiceId: string,
    actType?: ActType,
  ): Promise<Omit<SignedAct, "fileData" | "objectKey">[]>;
  getSignedAct(id: string): Promise<SignedAct | null>;
  deleteSignedAct(id: string): Promise<void>;
  getActsStatistics(excludeHidden?: boolean): Promise<{
    executorActs: number;
    companyActs: number;
    totalPaidInvoices: number;
  }>;
}

export interface RecurringRepository {
  getRecurringInvoices(
    scope?: recurringRepo.RecurringScope,
  ): Promise<RecurringInvoice[]>;
  getRecurringInvoice(
    id: string,
    scope?: recurringRepo.RecurringScope,
  ): Promise<RecurringInvoice | null>;
  createRecurringInvoice(
    data: InsertRecurringInvoice,
  ): Promise<RecurringInvoice>;
  updateRecurringInvoice(
    id: string,
    data: Partial<InsertRecurringInvoice>,
    scope?: recurringRepo.RecurringScope,
  ): Promise<RecurringInvoice | null>;
  deleteRecurringInvoice(id: string): Promise<void>;
  getRecurringInvoicesForMonth(
    year: number,
    month: number,
  ): Promise<RecurringInvoiceForMonth[]>;
  getRecurringExpectedAmounts(): ReturnType<
    typeof recurringRepo.getRecurringExpectedAmounts
  >;
  getRecurringExpectedForMonth(
    year: number,
    month: number,
  ): ReturnType<typeof recurringRepo.getRecurringExpectedForMonth>;
  getDueRecurringInvoices(
    upToDate?: Date,
    scope?: recurringRepo.RecurringScope,
  ): ReturnType<typeof recurringRepo.getDueRecurringInvoices>;
  getActiveRecurringInvoicesForCashFlow(
    scope?: recurringRepo.RecurringScope,
  ): ReturnType<typeof recurringRepo.getActiveRecurringInvoicesForCashFlow>;
  createDraftFromRecurring(
    recurringId: string,
    invoiceDate?: string,
    scope?: recurringRepo.RecurringScope,
    actorId?: string,
  ): ReturnType<typeof recurringRepo.createDraftFromRecurring>;
  processAllDueRecurringInvoices(actorId?: string): ReturnType<
    typeof recurringRepo.processAllDueRecurringInvoices
  >;
  generateBackdatedInvoices(
    recurringId: string,
    fromDate: string,
    actorId?: string,
  ): ReturnType<typeof recurringRepo.generateBackdatedInvoices>;
}

export interface AuditWriter {
  logAssistantAction(
    log: InsertAssistantActionLog,
  ): Promise<AssistantActionLog>;
  getAssistantActionLogs(
    filters: AssistantActionLogFilters,
  ): Promise<{ logs: AssistantActionLogWithDetails[]; total: number }>;
}
export type StorageOperations = SessionStore &
  InvoiceRepository &
  DirectoryStore &
  ReportingQueries &
  DocumentsRepository &
  RecurringRepository &
  AuditWriter;
