import { USER_ROLES, INVOICE_SCHEMES, INVOICE_STATUSES } from "./domainTypes";
import { sql } from "drizzle-orm";
import { pgTable, text, uuid, timestamp, boolean, numeric, date, pgEnum, index, uniqueIndex, integer, bigint, check } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum('user_role', USER_ROLES);
export const invoiceSchemeEnum = pgEnum('invoice_scheme', INVOICE_SCHEMES);
export const invoiceStatusEnum = pgEnum('invoice_status', INVOICE_STATUSES);
export const actTypeEnum = pgEnum('act_type', ['executor', 'company']);
export const serviceTypeEnum = pgEnum('service_type', ['one_time', 'periodic']);
export const periodUnitEnum = pgEnum('period_unit', ['month', 'day', 'hour']);

export const partners = pgTable("partners", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  telegram: text("telegram"),
  commissionRate: numeric("commission_rate", { precision: 5, scale: 2 }),
  // Роль для коэффициента эффективности (плечо владельца):
  //   'external'      — обычный партнёр (делегирование) → числитель;
  //   'managed_asset' — виртуальный партнёр-актив под управлением владельца → числитель;
  //   'owner'         — личная работа владельца (самозанятость) → знаменатель.
  // Раньше роль угадывалась по подстрокам имени — хрупко и зашивало
  // личные данные владельца в код.
  leverageRole: text("leverage_role").notNull().default("external"),
  // Клиенты этого партнера платят напрямую на счет владельца (владелец сам
  // исполнитель или ведет проект своей компании). Его "сумма к переводу" не
  // долг: деньги уже у владельца, поэтому в расчетах с партнерами его нет.
  directToOwner: boolean("direct_to_owner").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const clients = pgTable("clients", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  telegram: text("telegram"),
  // Имя контактного лица — кто конкретно от клиента на стороне переговоров
  // (бывает важно, когда «клиент» — это юрлицо или большая команда).
  contactPerson: text("contact_person"),
  partnerId: uuid("partner_id").references(() => partners.id),
  // Telegram-интеграция для уведомлений: chat_id обязателен, токен бота —
  // опциональный (если не задан, берётся общий из переменной окружения
  // FALLBACK_TG_BOT_TOKEN). Так можно либо «своего бренд-бота» на клиента,
  // либо одного общего на всех.
  tgChatId: text("tg_chat_id"),
  tgBotToken: text("tg_bot_token"),
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
  // Обратимо зашифрованный код для показа админу (AES-256-GCM). NULL пока
  // крипта выключена или строка ещё не мигрирована. См. server/lib/accessCode.ts.
  codeEnc: text("code_enc"),
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
  // Название для клиента: то, что видно ему в кабинете. Отдельно от
  // внутреннего description и от notes (служебных заметок).
  clientTitle: text("client_title"),
  issueDate: date("issue_date"),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  paymentDate: date("payment_date"),
  actualPaymentDate: date("actual_payment_date"),
  notes: text("notes"),
  hideFromAssistant: boolean("hide_from_assistant").default(false).notNull(),
  // Administrative work-list marker only; never changes financial status or role access.
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  recurringInvoiceId: uuid("recurring_invoice_id"),
  // Immutable generation identity; legacy duplicate invoices retain a null key.
  recurringOccurrenceKey: text("recurring_occurrence_key"),
  plannedExpenses: numeric("planned_expenses", { precision: 15, scale: 2 }),
  closingDocumentUrl: text("closing_document_url"),
  // Тип услуги. Для 'periodic' клиент оплачивает pricePerPeriod × totalPeriods
  // целиком, а «использовано/осталось» считается по закрытым периодам — это
  // клиентская проекция и существует отдельно от админской денежной математики.
  serviceType: serviceTypeEnum("service_type").default('one_time').notNull(),
  periodUnit: periodUnitEnum("period_unit").default('month').notNull(),
  pricePerPeriod: numeric("price_per_period", { precision: 15, scale: 2 }),
  totalPeriods: integer("total_periods"),
  periodsUsed: integer("periods_used").default(0).notNull(),
}, (table) => [
  index("idx_invoices_status").on(table.status),
  index("idx_invoices_payment_date").on(table.paymentDate),
  index("idx_invoices_created_at").on(table.createdAt),
  index("idx_invoices_partner_id").on(table.partnerId),
  index("idx_invoices_client_id").on(table.clientId),
  index("idx_invoices_recurring_id").on(table.recurringInvoiceId),
  uniqueIndex("uq_invoices_recurring_occurrence").on(table.recurringOccurrenceKey),
  index("idx_invoices_status_payment_date").on(table.status, table.paymentDate),
]);

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
}, (table) => [
  // Джойнится к invoices в каждом запросе дашборда — без индекса был seq scan.
  uniqueIndex("idx_invoice_calculations_invoice").on(table.invoiceId),
]);

// One row per numbered service period. Legacy dates remain unknown, not fabricated.
export const serviceUsage = pgTable("service_usage", {
  id: uuid("id").defaultRandom().primaryKey(),
  invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: 'cascade' }).notNull(),
  period: integer("period").notNull(),
  closed: boolean("closed").default(true).notNull(),
  source: text("source").notNull().default("manual"),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  updatedBy: uuid("updated_by").references(() => accessTokens.id, { onDelete: 'set null' }),
}, table => [uniqueIndex("service_usage_invoice_period").on(table.invoiceId, table.period)]);

export const invoiceExpenses = pgTable("invoice_expenses", {
  id: uuid("id").defaultRandom().primaryKey(),
  invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: 'cascade' }).notNull(),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  paidByAdmin: boolean("paid_by_admin").default(false).notNull(),
  date: date("date").defaultNow().notNull(),
  // Когда расход оплачен исполнителю. NULL - еще не оплачен, и если его платит
  // владелец, он попадает в "Мы должны". Миграция считает старые расходы
  // оплаченными в их дату.
  paidAt: date("paid_at"),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  // Фильтруется/джойнится по invoiceId (inArray в дашбордах, расходы счёта).
  index("idx_invoice_expenses_invoice").on(table.invoiceId),
]);

// Внутренний перенос средств между счетами ОДНОГО клиента.
// НЕ затрагивает client_bill и админскую математику (комиссия, перевод
// партнёру, чистая прибыль — считаются от реальных денег клиента).
// Влияет ТОЛЬКО на «доступно к расходованию» в клиентском представлении:
// со счёта-источника бюджет уменьшается, на счёт-получатель — увеличивается.
export const invoiceTransfers = pgTable("invoice_transfers", {
  id: uuid("id").defaultRandom().primaryKey(),
  fromInvoiceId: uuid("from_invoice_id").references(() => invoices.id, { onDelete: 'cascade' }).notNull(),
  toInvoiceId: uuid("to_invoice_id").references(() => invoices.id, { onDelete: 'cascade' }).notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  notes: text("notes"),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  index("idx_invoice_transfers_from").on(table.fromInvoiceId),
  index("idx_invoice_transfers_to").on(table.toInvoiceId),
]);

export const invoiceNumberCounters = pgTable("invoice_number_counters", {
  year: integer("year").primaryKey(),
  lastNumber: integer("last_number").notNull(),
});

export const notificationOutbox = pgTable("notification_outbox", {
  id: uuid("id").defaultRandom().primaryKey(),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: 'set null' }),
  body: text("body").notNull(),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [index("idx_outbox_pending").on(table.deliveredAt, table.nextAttemptAt)]);

export const commandReceipts = pgTable("command_receipts", {
  key: text("key").primaryKey(),
  fingerprint: text("fingerprint").notNull(),
  result: text("result"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Durable scheduling state shared by worker processes. Business jobs are retry-safe.
export const scheduledJobs = pgTable("scheduled_jobs", {
  key: text("key").primaryKey(),
  state: text("state").notNull().default('idle'),
  leaseToken: uuid("lease_token"),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull().defaultNow(),
  attempts: integer("attempts").notNull().default(0),
  lastStartedAt: timestamp("last_started_at", { withTimezone: true }),
  lastFinishedAt: timestamp("last_finished_at", { withTimezone: true }),
  lastError: text("last_error"),
  result: text("result"),
});

export const partnerPayments = pgTable("partner_payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  partnerId: uuid("partner_id").references(() => partners.id).notNull(),
  invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: 'restrict' }),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  paymentDate: date("payment_date").notNull(),
  notes: text("notes"),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  // getPartnerPayments фильтрует по partnerId; долги/остатки — по invoiceId.
  index("idx_partner_payments_partner").on(table.partnerId),
  index("idx_partner_payments_invoice").on(table.invoiceId),
]);

// Деньги владельцев со счета ИП. kind 'payout' - перевод Коту или себе,
// 'opening' - остаток на дату начала учета (одна строка на владельца).
// Балансы считает ownerLedgerRepo.
export const ownerTransfers = pgTable("owner_transfers", {
  id: uuid("id").defaultRandom().primaryKey(),
  owner: text("owner").notNull(),
  kind: text("kind").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  transferDate: date("transfer_date").notNull(),
  notes: text("notes"),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("idx_owner_transfers_owner_date").on(table.owner, table.transferDate),
  uniqueIndex("uq_owner_transfers_opening").on(table.owner).where(sql`${table.kind} = 'opening'`),
  check("owner_transfers_owner_check", sql`${table.owner} IN ('krya', 'kot')`),
  check("owner_transfers_kind_check", sql`${table.kind} IN ('opening', 'payout')`),
  check("owner_transfers_payout_positive", sql`${table.kind} <> 'payout' OR ${table.amount} > 0`),
]);

export const signedActs = pgTable("signed_acts", {
  id: uuid("id").defaultRandom().primaryKey(),
  invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: 'cascade' }).notNull(),
  actType: actTypeEnum("act_type").notNull(),
  fileName: text("file_name").notNull(),
  fileData: text("file_data"), // legacy documents, migrated without breaking old backups
  objectKey: text("object_key"),
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

// Сообщения внутри кабинета. Один тред = (invoice_id, expense_id?) —
// либо общий по счёту, либо привязанный к конкретному списанию.
// Клиент пишет в свои треды, admin и assistant видят все входящие.
export const invoiceMessages = pgTable("invoice_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: 'cascade' }).notNull(),
  expenseId: uuid("expense_id").references(() => invoiceExpenses.id, { onDelete: 'cascade' }),
  authorRole: userRoleEnum("author_role").notNull(),
  authorTokenId: uuid("author_token_id").references(() => accessTokens.id, { onDelete: 'set null' }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  // Когда другая сторона прочитала это сообщение. Симметрично:
  // staff_read_at заполняется, когда admin/assistant открыл тред;
  // client_read_at — когда клиент. Свои сообщения помечаются прочитанными
  // автоматически в момент создания (см. POST /api/messages).
  clientReadAt: timestamp("client_read_at", { withTimezone: true }),
  staffReadAt:  timestamp("staff_read_at",  { withTimezone: true }),
}, (table) => [
  index("idx_invoice_messages_invoice").on(table.invoiceId),
  index("idx_invoice_messages_expense").on(table.expenseId),
  index("idx_invoice_messages_created").on(table.createdAt),
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
  'transfer_funds',
  'transfer_funds_delete',
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

// Persistent login rate limiter (used by server/rateLimiter.ts).
// Survives restarts; locks code after 5 failed attempts for 15 minutes.
export const loginRateLimits = pgTable("login_rate_limits", {
  code: text("code").primaryKey(),
  attemptCount: integer("attempt_count").default(0).notNull(),
  lastAttempt: bigint("last_attempt", { mode: "number" }).notNull(),
  lockedUntil: bigint("locked_until", { mode: "number" }),
}, table => [index("idx_login_rate_limits_expiry").on(table.lastAttempt)]);

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
export type OwnerTransfer = typeof ownerTransfers.$inferSelect;
export type AssistantBonusPayment = typeof assistantBonusPayments.$inferSelect;
export type InsertAssistantBonusPayment = typeof assistantBonusPayments.$inferInsert;
export type AccessToken = typeof accessTokens.$inferSelect;
export type UserSession = typeof userSessions.$inferSelect;
export type RecurringInvoice = typeof recurringInvoices.$inferSelect;
export type InsertRecurringInvoice = typeof recurringInvoices.$inferInsert;
export type AssistantActionLog = typeof assistantActionLogs.$inferSelect;
export type InsertAssistantActionLog = typeof assistantActionLogs.$inferInsert;
export type InvoiceMessage = typeof invoiceMessages.$inferSelect;
export type InsertInvoiceMessage = typeof invoiceMessages.$inferInsert;
export type UserRole = import("./domainTypes").UserRole;
export type InvoiceScheme = import("./domainTypes").InvoiceScheme;
export type InvoiceStatus = import("./domainTypes").InvoiceStatus;
export type ActType = 'executor' | 'company';
export type ServiceType = 'one_time' | 'periodic';
export type PeriodUnit = 'month' | 'day' | 'hour';
export type Frequency = 'monthly' | 'quarterly' | 'yearly';
export type AssistantActionType = 'transfer_funds' | 'transfer_funds_delete' | 'create_invoice' | 'update_invoice' | 'delete_invoice' | 'create_expense' | 'update_expense' | 'delete_expense' | 'create_client' | 'update_client' | 'delete_client' | 'create_partner' | 'update_partner' | 'delete_partner' | 'upload_act' | 'delete_act' | 'create_recurring_invoice' | 'update_recurring_invoice' | 'delete_recurring_invoice' | 'other';
