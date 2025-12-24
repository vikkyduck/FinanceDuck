import { pgTable, text, uuid, timestamp, boolean, numeric, date, pgEnum, index } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum('user_role', ['assistant', 'partner', 'admin', 'client']);
export const invoiceSchemeEnum = pgEnum('invoice_scheme', ['partner_10', 'partner_15', 'agency_30', 'agency_40', 'commission_based']);
export const invoiceStatusEnum = pgEnum('invoice_status', ['draft', 'sent', 'paid', 'cancelled']);
export const actTypeEnum = pgEnum('act_type', ['executor', 'company']);

export const partners = pgTable("partners", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  telegram: text("telegram"),
  commissionRate: numeric("commission_rate", { precision: 5, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const clients = pgTable("clients", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  telegram: text("telegram"),
  partnerId: uuid("partner_id").references(() => partners.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const clientPartners = pgTable("client_partners", {
  id: uuid("id").defaultRandom().primaryKey(),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: 'cascade' }).notNull(),
  partnerId: uuid("partner_id").references(() => partners.id, { onDelete: 'cascade' }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("idx_client_partners_client").on(table.clientId),
  index("idx_client_partners_partner").on(table.partnerId),
]);

export const accessTokens = pgTable("access_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull().unique(),
  role: userRoleEnum("role").notNull(),
  partnerId: uuid("partner_id").references(() => partners.id, { onDelete: 'cascade' }),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: 'cascade' }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});

export const userSessions = pgTable("user_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: text("session_id").notNull().unique(),
  accessTokenId: uuid("access_token_id").notNull().references(() => accessTokens.id, { onDelete: 'cascade' }),
  csrfToken: text("csrf_token").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastActivity: timestamp("last_activity", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revoked: boolean("revoked").default(false),
}, (table) => [
  index("idx_user_sessions_session_id").on(table.sessionId),
  index("idx_user_sessions_token_id").on(table.accessTokenId),
]);

export const invoices = pgTable("invoices", {
  id: uuid("id").defaultRandom().primaryKey(),
  invoiceNumber: text("invoice_number").notNull().unique(),
  clientId: uuid("client_id").references(() => clients.id).notNull(),
  partnerId: uuid("partner_id").references(() => partners.id).notNull(),
  scheme: invoiceSchemeEnum("scheme").notNull(),
  status: invoiceStatusEnum("status").default('draft').notNull(),
  clientBill: numeric("client_bill", { precision: 15, scale: 2 }),
  commissionAmount: numeric("commission_amount", { precision: 15, scale: 2 }),
  partnerCommissionRate: numeric("partner_commission_rate", { precision: 5, scale: 2 }),
  description: text("description"),
  issueDate: date("issue_date"),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  paymentDate: date("payment_date"),
  actualPaymentDate: date("actual_payment_date"),
  notes: text("notes"),
  hideFromAssistant: boolean("hide_from_assistant").default(false).notNull(),
  recurringInvoiceId: uuid("recurring_invoice_id"),
  plannedExpenses: numeric("planned_expenses", { precision: 15, scale: 2 }),
});

export const assistantBonusPayments = pgTable("assistant_bonus_payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  paymentDate: date("payment_date").notNull(),
  notes: text("notes"),
  paidBy: uuid("paid_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("idx_bonus_payments_date").on(table.paymentDate),
]);

export const invoiceCalculations = pgTable("invoice_calculations", {
  id: uuid("id").defaultRandom().primaryKey(),
  invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: 'cascade' }).notNull(),
  clientBill: numeric("client_bill", { precision: 15, scale: 2 }).notNull(),
  commissionRate: numeric("commission_rate", { precision: 5, scale: 2 }),
  commissionAmount: numeric("commission_amount", { precision: 15, scale: 2 }),
  amountToAdmin: numeric("amount_to_admin", { precision: 15, scale: 2 }),
  agencyMargin: numeric("agency_margin", { precision: 15, scale: 2 }),
  partnerShareFromMargin: numeric("partner_share_from_margin", { precision: 15, scale: 2 }),
  adminShareFromMargin: numeric("admin_share_from_margin", { precision: 15, scale: 2 }),
  clientBaseAfterMargin: numeric("client_base_after_margin", { precision: 15, scale: 2 }),
  clientSpent: numeric("client_spent", { precision: 15, scale: 2 }).default("0"),
  clientRemaining: numeric("client_remaining", { precision: 15, scale: 2 }),
  executorExpensesTotal: numeric("executor_expenses_total", { precision: 15, scale: 2 }).default("0"),
  partnerTransferDue: numeric("partner_transfer_due", { precision: 15, scale: 2 }),
  netProfitAdmin: numeric("net_profit_admin", { precision: 15, scale: 2 }),
  adminShare50: numeric("admin_share_50", { precision: 15, scale: 2 }),
  catShare50: numeric("cat_share_50", { precision: 15, scale: 2 }),
  assistantBonusActs: numeric("assistant_bonus_acts", { precision: 15, scale: 2 }).default("0"),
  assistantBonusPaid: boolean("assistant_bonus_paid").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const invoiceExpenses = pgTable("invoice_expenses", {
  id: uuid("id").defaultRandom().primaryKey(),
  invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: 'cascade' }).notNull(),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  paidByAdmin: boolean("paid_by_admin").default(false).notNull(),
  date: date("date").defaultNow().notNull(),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const partnerPayments = pgTable("partner_payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  partnerId: uuid("partner_id").references(() => partners.id).notNull(),
  invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: 'cascade' }),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  paymentDate: date("payment_date").notNull(),
  notes: text("notes"),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const signedActs = pgTable("signed_acts", {
  id: uuid("id").defaultRandom().primaryKey(),
  invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: 'cascade' }).notNull(),
  actType: actTypeEnum("act_type").notNull(),
  fileName: text("file_name").notNull(),
  fileData: text("file_data"),
  mimeType: text("mime_type"),
  isLink: boolean("is_link").default(false).notNull(),
  url: text("url"),
  uploadedBy: uuid("uploaded_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("idx_signed_acts_invoice").on(table.invoiceId),
  index("idx_signed_acts_type").on(table.actType),
]);

export const monthlyFinancialPlans = pgTable("monthly_financial_plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  year: numeric("year", { precision: 4, scale: 0 }).notNull(),
  month: numeric("month", { precision: 2, scale: 0 }).notNull(),
  salesTarget: numeric("sales_target", { precision: 15, scale: 2 }).default("0"),
  profitTarget: numeric("profit_target", { precision: 15, scale: 2 }).default("0"),
  receiptsTarget: numeric("receipts_target", { precision: 15, scale: 2 }).default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("idx_monthly_plans_year_month").on(table.year, table.month),
]);

export const frequencyEnum = pgEnum('frequency', ['monthly', 'quarterly', 'yearly']);

export const recurringInvoices = pgTable("recurring_invoices", {
  id: uuid("id").defaultRandom().primaryKey(),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: 'cascade' }).notNull(),
  partnerId: uuid("partner_id").references(() => partners.id, { onDelete: 'cascade' }).notNull(),
  scheme: invoiceSchemeEnum("scheme").notNull(),
  partnerCommissionRate: numeric("partner_commission_rate", { precision: 5, scale: 2 }),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  defaultExpenses: numeric("default_expenses", { precision: 15, scale: 2 }).default("0"),
  description: text("description"),
  frequency: frequencyEnum("frequency").default('monthly').notNull(),
  dayOfMonth: numeric("day_of_month", { precision: 2, scale: 0 }).default("1").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  nextInvoiceDate: date("next_invoice_date").notNull(),
  notes: text("notes"),
  hideFromAssistant: boolean("hide_from_assistant").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("idx_recurring_invoices_next_date").on(table.nextInvoiceDate),
  index("idx_recurring_invoices_client").on(table.clientId),
  index("idx_recurring_invoices_active").on(table.isActive),
]);

export const assistantActionTypeEnum = pgEnum('assistant_action_type', [
  'create_invoice',
  'update_invoice', 
  'delete_invoice',
  'create_expense',
  'update_expense',
  'delete_expense',
  'create_client',
  'update_client',
  'delete_client',
  'create_partner',
  'update_partner',
  'delete_partner',
  'upload_act',
  'delete_act',
  'create_recurring_invoice',
  'update_recurring_invoice',
  'delete_recurring_invoice',
  'other'
]);

export const assistantActionLogs = pgTable("assistant_action_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  accessTokenId: uuid("access_token_id").references(() => accessTokens.id, { onDelete: 'set null' }),
  actionType: assistantActionTypeEnum("action_type").notNull(),
  entityType: text("entity_type"),
  entityId: uuid("entity_id"),
  description: text("description").notNull(),
  details: text("details"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("idx_assistant_action_logs_token").on(table.accessTokenId),
  index("idx_assistant_action_logs_type").on(table.actionType),
  index("idx_assistant_action_logs_created").on(table.createdAt),
]);

export type Partner = typeof partners.$inferSelect;
export type InsertPartner = typeof partners.$inferInsert;
export type Client = typeof clients.$inferSelect;
export type InsertClient = typeof clients.$inferInsert;
export type ClientPartner = typeof clientPartners.$inferSelect;
export type InsertClientPartner = typeof clientPartners.$inferInsert;
export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = typeof invoices.$inferInsert;
export type InvoiceCalculation = typeof invoiceCalculations.$inferSelect;
export type InvoiceExpense = typeof invoiceExpenses.$inferSelect;
export type InsertInvoiceExpense = typeof invoiceExpenses.$inferInsert;
export type PartnerPayment = typeof partnerPayments.$inferSelect;
export type InsertPartnerPayment = typeof partnerPayments.$inferInsert;
export type MonthlyFinancialPlan = typeof monthlyFinancialPlans.$inferSelect;
export type InsertMonthlyFinancialPlan = typeof monthlyFinancialPlans.$inferInsert;
export type SignedAct = typeof signedActs.$inferSelect;
export type InsertSignedAct = typeof signedActs.$inferInsert;
export type AssistantBonusPayment = typeof assistantBonusPayments.$inferSelect;
export type InsertAssistantBonusPayment = typeof assistantBonusPayments.$inferInsert;
export type AccessToken = typeof accessTokens.$inferSelect;
export type UserSession = typeof userSessions.$inferSelect;
export type RecurringInvoice = typeof recurringInvoices.$inferSelect;
export type InsertRecurringInvoice = typeof recurringInvoices.$inferInsert;
export type AssistantActionLog = typeof assistantActionLogs.$inferSelect;
export type InsertAssistantActionLog = typeof assistantActionLogs.$inferInsert;
export type UserRole = 'admin' | 'assistant' | 'partner' | 'client';
export type InvoiceScheme = 'partner_10' | 'partner_15' | 'agency_30' | 'agency_40' | 'commission_based';
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'cancelled';
export type ActType = 'executor' | 'company';
export type Frequency = 'monthly' | 'quarterly' | 'yearly';
export type AssistantActionType = 'create_invoice' | 'update_invoice' | 'delete_invoice' | 'create_expense' | 'update_expense' | 'delete_expense' | 'create_client' | 'update_client' | 'delete_client' | 'create_partner' | 'update_partner' | 'delete_partner' | 'upload_act' | 'delete_act' | 'create_recurring_invoice' | 'update_recurring_invoice' | 'delete_recurring_invoice' | 'other';
