import * as schema from "../../shared/schema";
// Foreign-key order. Every persisted application table belongs here.
export const backupTables = {
  partners: schema.partners, clients: schema.clients,
  clientPartners: schema.clientPartners, accessTokens: schema.accessTokens,
  recurringInvoices: schema.recurringInvoices, invoices: schema.invoices,
  serviceUsage: schema.serviceUsage,
  invoiceCalculations: schema.invoiceCalculations, invoiceExpenses: schema.invoiceExpenses,
  invoiceTransfers: schema.invoiceTransfers, partnerPayments: schema.partnerPayments,
  signedActs: schema.signedActs, invoiceMessages: schema.invoiceMessages,
  assistantBonusPayments: schema.assistantBonusPayments,
  monthlyFinancialPlans: schema.monthlyFinancialPlans,
  assistantActionLogs: schema.assistantActionLogs, loginRateLimits: schema.loginRateLimits,
  userSessions: schema.userSessions,
  invoiceNumberCounters: schema.invoiceNumberCounters,
  notificationOutbox: schema.notificationOutbox,
  commandReceipts: schema.commandReceipts,
  scheduledJobs: schema.scheduledJobs,
  // Last: archives up to schema 7 predate it, and the reader appends it empty.
  ownerTransfers: schema.ownerTransfers,
} as const;
export type TableKey = keyof typeof backupTables;
export type Rows = Record<string, unknown>[];

