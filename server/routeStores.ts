/** Narrow capabilities consumed by HTTP modules. No runtime singleton imports. */
import type { StorageOperations } from "./storagePorts";
export type InvoicesStore = Pick<
  StorageOperations,
  | "getInvoice"
  | "getInvoiceExpense"
  | "getInvoiceExpenses"
  | "getInvoiceForRole"
  | "getInvoiceTransfers"
  | "getInvoices"
>;
export type MessagesStore = Pick<StorageOperations, "getInvoiceForRole">;
export type ActionLogStore = Pick<StorageOperations, "getAssistantActionLogs">;
export type ClientsStore = Pick<
  StorageOperations,
  | "createClient"
  | "deleteClient"
  | "getClient"
  | "getClientAgency30Report"
  | "getClientBudget"
  | "getClientOverviewBuckets"
  | "getClientPartners"
  | "getClientWithPartner"
  | "getClients"
  | "getClientsWithPartners"
  | "getInvoices"
  | "getSignedActsByInvoice"
  | "logAssistantAction"
  | "setClientPartners"
  | "updateClient"
>;
export type DashboardStore = Pick<
  StorageOperations,
  | "getAdminDashboardStats"
  | "getAdminForecast"
  | "getAdminMonthlyData"
  | "getAdminPlanFact"
  | "getAlertCounts"
  | "getClientLTV"
  | "getDashboardInvoices"
  | "getDashboardStats"
  | "getDraftsStats"
  | "getInvoices"
  | "getInvoicesByMonth"
  | "getInvoicesWithCalculations"
  | "getMonthlyPlans"
  | "getOverdueInvoices"
  | "getOverdueInvoicesDetailed"
  | "getPartnerDebtSummaries"
  | "getPartnerInvoicesDetail"
  | "getPriorityActions"
  | "getRecurringInvoicesForMonth"
  | "getWorkingCapital"
  | "globalSearch"
  | "recalculateAllInvoices"
  | "updateWorkingCapital"
  | "upsertMonthlyPlan"
>;
export type ExportStore = Pick<
  StorageOperations,
  | "invoiceExportPages"
  | "expenseExportPages"
  | "getAllExpenses"
  | "getClients"
  | "getInvoices"
  | "getPartnerDebtSummaries"
  | "getPartners"
>;
export type RecurringStore = Pick<
  StorageOperations,
  | "createDraftFromRecurring"
  | "createRecurringInvoice"
  | "deleteRecurringInvoice"
  | "generateBackdatedInvoices"
  | "getActiveRecurringInvoicesForCashFlow"
  | "getDueRecurringInvoices"
  | "getRecurringInvoice"
  | "getRecurringInvoices"
  | "processAllDueRecurringInvoices"
  | "updateRecurringInvoice"
>;
export type MeStore = Pick<StorageOperations, never>;
export type ActsStore = Pick<
  StorageOperations,
  | "openSignedActFile"
  | "readSignedActData"
  | "createAccessToken"
  | "createAssistantBonusPayment"
  | "createSignedAct"
  | "deleteAccessToken"
  | "deleteSignedAct"
  | "getAccessTokens"
  | "getActsStatistics"
  | "getAssistantBonusPayments"
  | "getAssistantStats"
  | "getClient"
  | "getInvoiceForRole"
  | "getPartner"
  | "getSignedAct"
  | "getSignedActsByInvoice"
  | "getUnpaidBonusTotal"
  | "logAssistantAction"
  | "markBonusesAsPaid"
>;
export type MyInvoicesStore = Pick<
  StorageOperations,
  "invoiceExportPages" | "expenseExportPages"
>;
export type PartnersStore = Pick<
  StorageOperations,
  | "createPartner"
  | "deletePartner"
  | "getClient"
  | "getClientPartners"
  | "getDoNotSpendData"
  | "getExpectedAdminProfit"
  | "getExpectedCommission"
  | "getPartner"
  | "getPartnerAgency30Funds"
  | "getPartnerClientStats"
  | "getPartnerClients"
  | "getPartnerDebtDetails"
  | "getPartnerDebtSummaries"
  | "getPartnerDocumentRisk"
  | "getPartnerHeroMetrics"
  | "getPartnerPaymentHistory"
  | "getPartnerPayments"
  | "getPartnerSchemeDoNotSpendData"
  | "getPartnerTerms"
  | "getPartners"
  | "logAssistantAction"
  | "updatePartner"
>;
export type AuthStore = Pick<
  StorageOperations,
  | "createSession"
  | "refreshSession"
  | "revokeSession"
  | "validateSession"
  | "verifyAccessCode"
>;
