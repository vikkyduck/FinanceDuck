var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/vite.ts
import express2 from "express";
import fs2 from "fs";
import path2 from "path";
import { createServer as createViteServer } from "vite";

// server/index.ts
import express from "express";
import cookieParser from "cookie-parser";

// server/routes/auth.ts
import { Router } from "express";

// server/db.ts
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

// shared/schema.ts
var schema_exports = {};
__export(schema_exports, {
  accessTokens: () => accessTokens,
  actTypeEnum: () => actTypeEnum,
  assistantActionLogs: () => assistantActionLogs,
  assistantActionTypeEnum: () => assistantActionTypeEnum,
  assistantBonusPayments: () => assistantBonusPayments,
  clientPartners: () => clientPartners,
  clients: () => clients,
  frequencyEnum: () => frequencyEnum,
  invoiceCalculations: () => invoiceCalculations,
  invoiceExpenses: () => invoiceExpenses,
  invoiceSchemeEnum: () => invoiceSchemeEnum,
  invoiceStatusEnum: () => invoiceStatusEnum,
  invoices: () => invoices,
  monthlyFinancialPlans: () => monthlyFinancialPlans,
  partnerPayments: () => partnerPayments,
  partners: () => partners,
  recurringInvoices: () => recurringInvoices,
  signedActs: () => signedActs,
  userRoleEnum: () => userRoleEnum,
  userSessions: () => userSessions
});
import { pgTable, text, uuid, timestamp, boolean, numeric, date, pgEnum, index } from "drizzle-orm/pg-core";
var userRoleEnum = pgEnum("user_role", ["assistant", "partner", "admin", "client", "accountant"]);
var invoiceSchemeEnum = pgEnum("invoice_scheme", ["partner_10", "partner_15", "agency_30", "agency_40", "commission_based"]);
var invoiceStatusEnum = pgEnum("invoice_status", ["draft", "sent", "paid", "cancelled"]);
var actTypeEnum = pgEnum("act_type", ["executor", "company"]);
var partners = pgTable("partners", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  telegram: text("telegram"),
  commissionRate: numeric("commission_rate", { precision: 5, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});
var clients = pgTable("clients", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  telegram: text("telegram"),
  partnerId: uuid("partner_id").references(() => partners.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});
var clientPartners = pgTable("client_partners", {
  id: uuid("id").defaultRandom().primaryKey(),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }).notNull(),
  partnerId: uuid("partner_id").references(() => partners.id, { onDelete: "cascade" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => [
  index("idx_client_partners_client").on(table.clientId),
  index("idx_client_partners_partner").on(table.partnerId)
]);
var accessTokens = pgTable("access_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull().unique(),
  role: userRoleEnum("role").notNull(),
  partnerId: uuid("partner_id").references(() => partners.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true })
});
var userSessions = pgTable("user_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: text("session_id").notNull().unique(),
  accessTokenId: uuid("access_token_id").notNull().references(() => accessTokens.id, { onDelete: "cascade" }),
  csrfToken: text("csrf_token").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastActivity: timestamp("last_activity", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revoked: boolean("revoked").default(false)
}, (table) => [
  index("idx_user_sessions_session_id").on(table.sessionId),
  index("idx_user_sessions_token_id").on(table.accessTokenId)
]);
var invoices = pgTable("invoices", {
  id: uuid("id").defaultRandom().primaryKey(),
  invoiceNumber: text("invoice_number").notNull().unique(),
  clientId: uuid("client_id").references(() => clients.id).notNull(),
  partnerId: uuid("partner_id").references(() => partners.id).notNull(),
  scheme: invoiceSchemeEnum("scheme").notNull(),
  status: invoiceStatusEnum("status").default("draft").notNull(),
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
  closingDocumentUrl: text("closing_document_url")
}, (table) => [
  index("idx_invoices_status").on(table.status),
  index("idx_invoices_payment_date").on(table.paymentDate),
  index("idx_invoices_created_at").on(table.createdAt),
  index("idx_invoices_partner_id").on(table.partnerId),
  index("idx_invoices_client_id").on(table.clientId),
  index("idx_invoices_recurring_id").on(table.recurringInvoiceId),
  index("idx_invoices_status_payment_date").on(table.status, table.paymentDate)
]);
var assistantBonusPayments = pgTable("assistant_bonus_payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  paymentDate: date("payment_date").notNull(),
  notes: text("notes"),
  paidBy: uuid("paid_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => [
  index("idx_bonus_payments_date").on(table.paymentDate)
]);
var invoiceCalculations = pgTable("invoice_calculations", {
  id: uuid("id").defaultRandom().primaryKey(),
  invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "cascade" }).notNull(),
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
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});
var invoiceExpenses = pgTable("invoice_expenses", {
  id: uuid("id").defaultRandom().primaryKey(),
  invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "cascade" }).notNull(),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  paidByAdmin: boolean("paid_by_admin").default(false).notNull(),
  date: date("date").defaultNow().notNull(),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});
var partnerPayments = pgTable("partner_payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  partnerId: uuid("partner_id").references(() => partners.id).notNull(),
  invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  paymentDate: date("payment_date").notNull(),
  notes: text("notes"),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});
var signedActs = pgTable("signed_acts", {
  id: uuid("id").defaultRandom().primaryKey(),
  invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "cascade" }).notNull(),
  actType: actTypeEnum("act_type").notNull(),
  fileName: text("file_name").notNull(),
  fileData: text("file_data"),
  mimeType: text("mime_type"),
  isLink: boolean("is_link").default(false).notNull(),
  url: text("url"),
  uploadedBy: uuid("uploaded_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => [
  index("idx_signed_acts_invoice").on(table.invoiceId),
  index("idx_signed_acts_type").on(table.actType)
]);
var monthlyFinancialPlans = pgTable("monthly_financial_plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  year: numeric("year", { precision: 4, scale: 0 }).notNull(),
  month: numeric("month", { precision: 2, scale: 0 }).notNull(),
  salesTarget: numeric("sales_target", { precision: 15, scale: 2 }).default("0"),
  profitTarget: numeric("profit_target", { precision: 15, scale: 2 }).default("0"),
  receiptsTarget: numeric("receipts_target", { precision: 15, scale: 2 }).default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => [
  index("idx_monthly_plans_year_month").on(table.year, table.month)
]);
var frequencyEnum = pgEnum("frequency", ["monthly", "quarterly", "yearly"]);
var recurringInvoices = pgTable("recurring_invoices", {
  id: uuid("id").defaultRandom().primaryKey(),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }).notNull(),
  partnerId: uuid("partner_id").references(() => partners.id, { onDelete: "cascade" }).notNull(),
  scheme: invoiceSchemeEnum("scheme").notNull(),
  partnerCommissionRate: numeric("partner_commission_rate", { precision: 5, scale: 2 }),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  defaultExpenses: numeric("default_expenses", { precision: 15, scale: 2 }).default("0"),
  description: text("description"),
  frequency: frequencyEnum("frequency").default("monthly").notNull(),
  dayOfMonth: numeric("day_of_month", { precision: 2, scale: 0 }).default("1").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  nextInvoiceDate: date("next_invoice_date").notNull(),
  notes: text("notes"),
  hideFromAssistant: boolean("hide_from_assistant").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => [
  index("idx_recurring_invoices_next_date").on(table.nextInvoiceDate),
  index("idx_recurring_invoices_client").on(table.clientId),
  index("idx_recurring_invoices_active").on(table.isActive)
]);
var assistantActionTypeEnum = pgEnum("assistant_action_type", [
  "create_invoice",
  "update_invoice",
  "delete_invoice",
  "create_expense",
  "update_expense",
  "delete_expense",
  "create_client",
  "update_client",
  "delete_client",
  "create_partner",
  "update_partner",
  "delete_partner",
  "upload_act",
  "delete_act",
  "create_recurring_invoice",
  "update_recurring_invoice",
  "delete_recurring_invoice",
  "other"
]);
var assistantActionLogs = pgTable("assistant_action_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  accessTokenId: uuid("access_token_id").references(() => accessTokens.id, { onDelete: "set null" }),
  actionType: assistantActionTypeEnum("action_type").notNull(),
  entityType: text("entity_type"),
  entityId: uuid("entity_id"),
  description: text("description").notNull(),
  details: text("details"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => [
  index("idx_assistant_action_logs_token").on(table.accessTokenId),
  index("idx_assistant_action_logs_type").on(table.actionType),
  index("idx_assistant_action_logs_created").on(table.createdAt)
]);

// server/db.ts
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}
var pool = new Pool({
  connectionString: process.env.DATABASE_URL
});
var db = drizzle(pool, { schema: schema_exports });

// server/storage.ts
import { eq as eq8, and as and7, desc as desc6, isNull as isNull3, isNotNull as isNotNull3, gte as gte2, sql as sql5, inArray as inArray3, or as or3 } from "drizzle-orm";

// shared/financialEngine.ts
function calculateFinancials(scheme, clientBill, partnerCommRate = 0, executorExpenses = 0, expensesByPartner = 0, expensesByAdmin = 0, plannedExpenses = 0) {
  const base = {
    clientBill,
    executorExpensesTotal: executorExpenses,
    partnerTransferDue: 0,
    netProfitAdmin: 0,
    adminShare50: 0,
    catShare50: 0
  };
  switch (scheme) {
    case "agency_30": {
      const agencyMargin = clientBill * 0.3;
      const partnerShareFromMargin = clientBill * 0.15;
      const adminShareFromMargin = clientBill * 0.15;
      const clientBaseAfterMargin = clientBill * 0.7;
      const clientRemaining = clientBaseAfterMargin - executorExpenses;
      const partnerTransferDue = adminShareFromMargin;
      const netProfitAdmin = adminShareFromMargin;
      return {
        ...base,
        agencyMargin,
        partnerShareFromMargin,
        adminShareFromMargin,
        clientBaseAfterMargin,
        clientSpent: executorExpenses,
        clientRemaining,
        partnerTransferDue,
        netProfitAdmin,
        adminShare50: netProfitAdmin / 2,
        catShare50: netProfitAdmin / 2
      };
    }
    case "agency_40": {
      const agencyMargin = clientBill * 0.4;
      const partnerShareFromMargin = clientBill * 0.16;
      const adminShareFromMargin = clientBill * 0.24;
      const clientBaseAfterMargin = clientBill * 0.6;
      const clientRemaining = clientBaseAfterMargin - executorExpenses;
      const partnerTransferDue = adminShareFromMargin;
      const netProfitAdmin = adminShareFromMargin;
      return {
        ...base,
        agencyMargin,
        partnerShareFromMargin,
        adminShareFromMargin,
        clientBaseAfterMargin,
        clientSpent: executorExpenses,
        clientRemaining,
        partnerTransferDue,
        netProfitAdmin,
        adminShare50: netProfitAdmin / 2,
        catShare50: netProfitAdmin / 2
      };
    }
    case "partner_10": {
      const commissionRate = 10;
      const commissionAmount = clientBill * 0.1;
      const amountToAdmin = clientBill * 0.9;
      const partnerTransferDue = plannedExpenses > 0 ? Math.max(0, amountToAdmin - plannedExpenses) : Math.max(0, amountToAdmin - expensesByPartner);
      const netProfitAdmin = partnerTransferDue - expensesByAdmin;
      const clientRemaining = plannedExpenses > 0 ? Math.max(0, clientBill * (1 - executorExpenses / plannedExpenses)) : 0;
      return {
        ...base,
        commissionRate,
        commissionAmount,
        amountToAdmin,
        clientRemaining,
        partnerTransferDue,
        netProfitAdmin,
        adminShare50: netProfitAdmin / 2,
        catShare50: netProfitAdmin / 2
      };
    }
    case "partner_15": {
      const commissionRate = 15;
      const commissionAmount = clientBill * 0.15;
      const amountToAdmin = clientBill * 0.85;
      const partnerTransferDue = plannedExpenses > 0 ? Math.max(0, amountToAdmin - plannedExpenses) : Math.max(0, amountToAdmin - expensesByPartner);
      const netProfitAdmin = partnerTransferDue - expensesByAdmin;
      const clientRemaining = plannedExpenses > 0 ? Math.max(0, clientBill * (1 - executorExpenses / plannedExpenses)) : 0;
      return {
        ...base,
        commissionRate,
        commissionAmount,
        amountToAdmin,
        clientRemaining,
        partnerTransferDue,
        netProfitAdmin,
        adminShare50: netProfitAdmin / 2,
        catShare50: netProfitAdmin / 2
      };
    }
    case "commission_based":
    default: {
      const commissionRate = partnerCommRate ?? 0;
      const commissionAmount = clientBill * (commissionRate / 100);
      const amountToAdmin = clientBill - commissionAmount;
      const partnerTransferDue = plannedExpenses > 0 ? Math.max(0, amountToAdmin - plannedExpenses) : Math.max(0, amountToAdmin - expensesByPartner);
      const netProfitAdmin = partnerTransferDue - expensesByAdmin;
      const clientRemaining = plannedExpenses > 0 ? Math.max(0, clientBill * (1 - executorExpenses / plannedExpenses)) : 0;
      return {
        ...base,
        commissionRate,
        commissionAmount,
        amountToAdmin,
        clientRemaining,
        partnerTransferDue,
        netProfitAdmin,
        adminShare50: netProfitAdmin / 2,
        catShare50: netProfitAdmin / 2
      };
    }
  }
}
function parseNum(value) {
  if (value === null || value === void 0 || value === "") return 0;
  const n = parseFloat(value);
  return isNaN(n) ? 0 : n;
}

// server/repositories/userRepo.ts
import { randomBytes } from "crypto";
import { eq, and, desc, gte } from "drizzle-orm";
async function verifyAccessCode(db2, code) {
  const [token] = await db2.select().from(accessTokens).where(and(eq(accessTokens.code, code), eq(accessTokens.isActive, true))).limit(1);
  if (token) {
    await db2.update(accessTokens).set({ lastUsedAt: /* @__PURE__ */ new Date() }).where(eq(accessTokens.id, token.id));
  }
  return token ?? null;
}
async function createSession(db2, tokenId, ipAddress, userAgent) {
  const sessionId = randomBytes(32).toString("base64");
  const csrfToken = randomBytes(32).toString("base64");
  const expiresAt = new Date(Date.now() + 30 * 60 * 1e3);
  await db2.insert(userSessions).values({
    sessionId,
    accessTokenId: tokenId,
    csrfToken,
    ipAddress,
    userAgent,
    expiresAt
  });
  return { sessionId, csrfToken, expiresAt };
}
async function validateSession(db2, sessionId, csrfToken) {
  const [session] = await db2.select().from(userSessions).where(and(
    eq(userSessions.sessionId, sessionId),
    eq(userSessions.revoked, false),
    gte(userSessions.expiresAt, /* @__PURE__ */ new Date())
  )).limit(1);
  if (!session) return { isValid: false };
  if (csrfToken && session.csrfToken !== csrfToken) return { isValid: false };
  await db2.update(userSessions).set({ lastActivity: /* @__PURE__ */ new Date() }).where(eq(userSessions.id, session.id));
  const [token] = await db2.select().from(accessTokens).where(and(eq(accessTokens.id, session.accessTokenId), eq(accessTokens.isActive, true))).limit(1);
  if (!token) return { isValid: false };
  return { isValid: true, token };
}
async function refreshSession(db2, sessionId) {
  const newExpiresAt = new Date(Date.now() + 30 * 60 * 1e3);
  const result = await db2.update(userSessions).set({ expiresAt: newExpiresAt, lastActivity: /* @__PURE__ */ new Date() }).where(and(
    eq(userSessions.sessionId, sessionId),
    eq(userSessions.revoked, false),
    gte(userSessions.expiresAt, /* @__PURE__ */ new Date())
  )).returning();
  return result.length > 0 ? newExpiresAt : null;
}
async function revokeSession(db2, sessionId) {
  await db2.update(userSessions).set({ revoked: true }).where(eq(userSessions.sessionId, sessionId));
}
async function getAccessTokens(db2) {
  const results = await db2.select({ token: accessTokens, partnerName: partners.name, clientName: clients.name }).from(accessTokens).leftJoin(partners, eq(accessTokens.partnerId, partners.id)).leftJoin(clients, eq(accessTokens.clientId, clients.id)).orderBy(desc(accessTokens.createdAt));
  return results.map((r) => ({
    ...r.token,
    partnerName: r.partnerName ?? void 0,
    clientName: r.clientName ?? void 0
  }));
}
async function createAccessToken(db2, code, role, partnerId, clientId) {
  const [created] = await db2.insert(accessTokens).values({ code, role, partnerId, clientId }).returning();
  return created;
}
async function deleteAccessToken(db2, id) {
  await db2.delete(accessTokens).where(eq(accessTokens.id, id));
}

// server/repositories/partnerRepo.ts
import { eq as eq2, and as and2, desc as desc2 } from "drizzle-orm";
async function getPartners(db2) {
  return db2.select().from(partners).orderBy(partners.name);
}
async function getPartner(db2, id) {
  const [p] = await db2.select().from(partners).where(eq2(partners.id, id)).limit(1);
  return p ?? null;
}
async function createPartner(db2, partner) {
  const [created] = await db2.insert(partners).values(partner).returning();
  return created;
}
async function updatePartner(db2, id, partner) {
  const [updated] = await db2.update(partners).set({ ...partner, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(partners.id, id)).returning();
  return updated ?? null;
}
async function deletePartner(db2, id) {
  const linked = await db2.select({ id: invoices.id }).from(invoices).where(eq2(invoices.partnerId, id)).limit(1);
  if (linked.length > 0) {
    return { success: false, error: "\u041D\u0435\u043B\u044C\u0437\u044F \u0443\u0434\u0430\u043B\u0438\u0442\u044C \u043F\u0430\u0440\u0442\u043D\u0451\u0440\u0430: \u0435\u0441\u0442\u044C \u0441\u0432\u044F\u0437\u0430\u043D\u043D\u044B\u0435 \u0441\u0447\u0435\u0442\u0430" };
  }
  const linkedClients = await db2.select({ id: clientPartners.clientId }).from(clientPartners).where(eq2(clientPartners.partnerId, id)).limit(1);
  if (linkedClients.length > 0) {
    return { success: false, error: "\u041D\u0435\u043B\u044C\u0437\u044F \u0443\u0434\u0430\u043B\u0438\u0442\u044C \u043F\u0430\u0440\u0442\u043D\u0451\u0440\u0430: \u0435\u0441\u0442\u044C \u0441\u0432\u044F\u0437\u0430\u043D\u043D\u044B\u0435 \u043A\u043B\u0438\u0435\u043D\u0442\u044B" };
  }
  await db2.delete(accessTokens).where(eq2(accessTokens.partnerId, id));
  await db2.delete(partners).where(eq2(partners.id, id));
  return { success: true };
}
async function getPartnerClients(db2, partnerId) {
  const results = await db2.select({ client: clients }).from(clientPartners).innerJoin(clients, eq2(clientPartners.clientId, clients.id)).where(eq2(clientPartners.partnerId, partnerId)).orderBy(clients.name);
  return results.map((r) => r.client);
}
async function getPartnerPayments(db2, partnerId) {
  if (partnerId) {
    return db2.select().from(partnerPayments).where(eq2(partnerPayments.partnerId, partnerId)).orderBy(desc2(partnerPayments.paymentDate));
  }
  return db2.select().from(partnerPayments).orderBy(desc2(partnerPayments.paymentDate));
}
async function getPartnerPayment(db2, id) {
  const [p] = await db2.select().from(partnerPayments).where(eq2(partnerPayments.id, id)).limit(1);
  return p ?? null;
}
async function createPartnerPayment(db2, payment) {
  const [created] = await db2.insert(partnerPayments).values(payment).returning();
  return created;
}
async function updatePartnerPayment(db2, id, updates) {
  const [updated] = await db2.update(partnerPayments).set(updates).where(eq2(partnerPayments.id, id)).returning();
  return updated ?? null;
}
async function deletePartnerPayment(db2, id) {
  await db2.delete(partnerPayments).where(eq2(partnerPayments.id, id));
}
async function getPartnerPaymentHistory(db2, partnerId) {
  const paidInvoices = await db2.select({ invoice: invoices, calculations: invoiceCalculations }).from(invoices).leftJoin(invoiceCalculations, eq2(invoices.id, invoiceCalculations.invoiceId)).where(and2(eq2(invoices.partnerId, partnerId), eq2(invoices.status, "paid")));
  let totalDebt = 0;
  for (const r of paidInvoices) {
    if (r.calculations) {
      totalDebt += Math.max(0, parseNum(r.calculations.partnerTransferDue ?? "0"));
    }
  }
  const payments = await db2.select().from(partnerPayments).where(eq2(partnerPayments.partnerId, partnerId)).orderBy(partnerPayments.paymentDate);
  let runningBalance = totalDebt;
  const history = [];
  for (const payment of payments) {
    const amount = parseNum(payment.amount);
    runningBalance -= amount;
    history.push({
      id: payment.id,
      paymentDate: payment.paymentDate,
      amount,
      notes: payment.notes,
      runningBalance
    });
  }
  return history.reverse();
}

// server/repositories/clientRepo.ts
import { eq as eq3 } from "drizzle-orm";
async function getClients(db2, partnerId) {
  if (partnerId) {
    return db2.select().from(clients).where(eq3(clients.partnerId, partnerId)).orderBy(clients.name);
  }
  return db2.select().from(clients).orderBy(clients.name);
}
async function getClient(db2, id) {
  const [c] = await db2.select().from(clients).where(eq3(clients.id, id)).limit(1);
  return c ?? null;
}
async function createClient(db2, client) {
  const [created] = await db2.insert(clients).values(client).returning();
  return created;
}
async function updateClient(db2, id, client) {
  const [updated] = await db2.update(clients).set({ ...client, updatedAt: /* @__PURE__ */ new Date() }).where(eq3(clients.id, id)).returning();
  return updated ?? null;
}
async function getClientWithPartner(db2, id) {
  const [result] = await db2.select({ client: clients, partner: partners }).from(clients).leftJoin(partners, eq3(clients.partnerId, partners.id)).where(eq3(clients.id, id)).limit(1);
  if (!result) return null;
  return { ...result.client, partner: result.partner ?? void 0 };
}
async function getClientPartners(db2, clientId) {
  const results = await db2.select({ partner: partners }).from(clientPartners).innerJoin(partners, eq3(clientPartners.partnerId, partners.id)).where(eq3(clientPartners.clientId, clientId)).orderBy(partners.name);
  return results.map((r) => r.partner);
}
async function getClientsWithPartners(db2) {
  const allClients = await db2.select().from(clients).orderBy(clients.name);
  return Promise.all(
    allClients.map(async (client) => ({
      ...client,
      partners: await getClientPartners(db2, client.id)
    }))
  );
}
async function setClientPartners(db2, clientId, partnerIds) {
  await db2.delete(clientPartners).where(eq3(clientPartners.clientId, clientId));
  if (partnerIds.length > 0) {
    await db2.insert(clientPartners).values(partnerIds.map((partnerId) => ({ clientId, partnerId })));
  }
  if (partnerIds.length === 1) {
    await db2.update(clients).set({ partnerId: partnerIds[0], updatedAt: /* @__PURE__ */ new Date() }).where(eq3(clients.id, clientId));
  } else if (partnerIds.length === 0) {
    await db2.update(clients).set({ partnerId: null, updatedAt: /* @__PURE__ */ new Date() }).where(eq3(clients.id, clientId));
  }
}
async function deleteClient(db2, id) {
  const linked = await db2.select({ id: invoices.id }).from(invoices).where(eq3(invoices.clientId, id)).limit(1);
  if (linked.length > 0) {
    return { success: false, error: "\u041D\u0435\u043B\u044C\u0437\u044F \u0443\u0434\u0430\u043B\u0438\u0442\u044C \u043A\u043B\u0438\u0435\u043D\u0442\u0430: \u0435\u0441\u0442\u044C \u0441\u0432\u044F\u0437\u0430\u043D\u043D\u044B\u0435 \u0441\u0447\u0435\u0442\u0430" };
  }
  await db2.delete(clientPartners).where(eq3(clientPartners.clientId, id));
  await db2.delete(accessTokens).where(eq3(accessTokens.clientId, id));
  await db2.delete(clients).where(eq3(clients.id, id));
  return { success: true };
}

// server/repositories/invoiceRepo.ts
import {
  eq as eq4,
  and as and3,
  desc as desc3,
  isNull,
  or,
  isNotNull,
  sql
} from "drizzle-orm";
function calculateInvoiceServer(scheme, clientBill, partnerCommissionRate, executorExpenses = 0, expensesPaidByPartner = 0, expensesPaidByAdmin = 0, plannedExpenses = 0) {
  const f = calculateFinancials(
    scheme,
    clientBill,
    partnerCommissionRate ?? 0,
    executorExpenses,
    expensesPaidByPartner,
    expensesPaidByAdmin,
    plannedExpenses
  );
  const r = {
    clientBill: f.clientBill.toString(),
    executorExpensesTotal: f.executorExpensesTotal.toString(),
    partnerTransferDue: f.partnerTransferDue.toString(),
    netProfitAdmin: f.netProfitAdmin.toString(),
    adminShare50: f.adminShare50.toString(),
    catShare50: f.catShare50.toString()
  };
  if (f.commissionRate !== void 0) r.commissionRate = f.commissionRate.toString();
  if (f.commissionAmount !== void 0) r.commissionAmount = f.commissionAmount.toString();
  if (f.amountToAdmin !== void 0) r.amountToAdmin = f.amountToAdmin.toString();
  if (f.agencyMargin !== void 0) r.agencyMargin = f.agencyMargin.toString();
  if (f.partnerShareFromMargin !== void 0) r.partnerShareFromMargin = f.partnerShareFromMargin.toString();
  if (f.adminShareFromMargin !== void 0) r.adminShareFromMargin = f.adminShareFromMargin.toString();
  if (f.clientBaseAfterMargin !== void 0) r.clientBaseAfterMargin = f.clientBaseAfterMargin.toString();
  if (f.clientRemaining !== void 0) r.clientRemaining = f.clientRemaining.toString();
  return r;
}
async function _getInvoiceExpenses(db2, invoiceId) {
  return db2.select().from(invoiceExpenses).where(eq4(invoiceExpenses.invoiceId, invoiceId)).orderBy(desc3(invoiceExpenses.date));
}
async function _getInvoiceRaw(db2, id) {
  const [result] = await db2.select({ invoice: invoices, calculations: invoiceCalculations, partner: partners, client: clients }).from(invoices).leftJoin(invoiceCalculations, eq4(invoices.id, invoiceCalculations.invoiceId)).leftJoin(partners, eq4(invoices.partnerId, partners.id)).leftJoin(clients, eq4(invoices.clientId, clients.id)).where(eq4(invoices.id, id)).limit(1);
  if (!result) return null;
  return {
    ...result.invoice,
    calculations: result.calculations || void 0,
    partner: result.partner || void 0,
    client: result.client || void 0
  };
}
async function _recalculateInvoiceExpenses(db2, invoiceId) {
  const expenses = await _getInvoiceExpenses(db2, invoiceId);
  const total = expenses.reduce((s, e) => s + parseNum(e.amount), 0);
  const expensesPaidByPartner = expenses.filter((e) => e.paidByAdmin !== true).reduce((s, e) => s + parseNum(e.amount), 0);
  const expensesPaidByAdmin = expenses.filter((e) => e.paidByAdmin === true).reduce((s, e) => s + parseNum(e.amount), 0);
  const invoice = await _getInvoiceRaw(db2, invoiceId);
  if (!invoice) return;
  const [existing] = await db2.select().from(invoiceCalculations).where(eq4(invoiceCalculations.invoiceId, invoiceId)).limit(1);
  if (!existing) return;
  const clientBill = parseNum(existing.clientBill);
  const commissionRate = existing.commissionRate ? parseNum(existing.commissionRate) : void 0;
  const plannedExp = parseNum(invoice.plannedExpenses);
  const computed = calculateInvoiceServer(
    invoice.scheme,
    clientBill,
    commissionRate,
    total,
    expensesPaidByPartner,
    expensesPaidByAdmin,
    plannedExp
  );
  await db2.update(invoiceCalculations).set({ ...computed, updatedAt: /* @__PURE__ */ new Date() }).where(eq4(invoiceCalculations.invoiceId, invoiceId));
}
async function getInvoices(db2, role, partnerId, clientId) {
  const baseQuery = db2.select({ invoice: invoices, calculations: invoiceCalculations, partner: partners, client: clients }).from(invoices).leftJoin(invoiceCalculations, eq4(invoices.id, invoiceCalculations.invoiceId)).leftJoin(partners, eq4(invoices.partnerId, partners.id)).leftJoin(clients, eq4(invoices.clientId, clients.id)).orderBy(desc3(invoices.createdAt));
  let results;
  if (partnerId) {
    results = await baseQuery.where(eq4(invoices.partnerId, partnerId));
  } else if (role === "client" && clientId) {
    results = await baseQuery.where(eq4(invoices.clientId, clientId));
  } else if (role === "assistant") {
    results = await baseQuery.where(or(isNull(invoices.hideFromAssistant), eq4(invoices.hideFromAssistant, false)));
  } else if (role === "accountant") {
    results = await baseQuery.where(eq4(invoices.hideFromAssistant, true));
  } else {
    results = await baseQuery;
  }
  return results.map((r) => ({
    ...r.invoice,
    calculations: r.calculations || void 0,
    partner: r.partner || void 0,
    client: r.client || void 0
  }));
}
async function getInvoice(db2, id, role, partnerId, clientId) {
  let ownerFilter;
  if (role === "partner" && partnerId) {
    ownerFilter = and3(eq4(invoices.id, id), eq4(invoices.partnerId, partnerId));
  } else if (role === "client" && clientId) {
    ownerFilter = and3(eq4(invoices.id, id), eq4(invoices.clientId, clientId));
  } else if (role === "assistant") {
    ownerFilter = and3(
      eq4(invoices.id, id),
      or(isNull(invoices.hideFromAssistant), eq4(invoices.hideFromAssistant, false))
    );
  } else if (role === "accountant") {
    ownerFilter = and3(eq4(invoices.id, id), eq4(invoices.hideFromAssistant, true));
  } else {
    ownerFilter = eq4(invoices.id, id);
  }
  const [result] = await db2.select({ invoice: invoices, calculations: invoiceCalculations, partner: partners, client: clients }).from(invoices).leftJoin(invoiceCalculations, eq4(invoices.id, invoiceCalculations.invoiceId)).leftJoin(partners, eq4(invoices.partnerId, partners.id)).leftJoin(clients, eq4(invoices.clientId, clients.id)).where(ownerFilter).limit(1);
  if (!result) return null;
  return {
    ...result.invoice,
    calculations: result.calculations || void 0,
    partner: result.partner || void 0,
    client: result.client || void 0
  };
}
async function getInvoicesWithCalculations(db2) {
  const results = await db2.select({
    id: invoices.id,
    status: invoices.status,
    actualPaymentDate: invoices.actualPaymentDate,
    paymentDate: invoices.paymentDate,
    adminShare50: invoiceCalculations.adminShare50,
    catShare50: invoiceCalculations.catShare50,
    netProfitAdmin: invoiceCalculations.netProfitAdmin
  }).from(invoices).leftJoin(invoiceCalculations, eq4(invoices.id, invoiceCalculations.invoiceId)).where(or(eq4(invoices.status, "paid"), isNotNull(invoices.actualPaymentDate)));
  return results.map((r) => ({
    id: r.id,
    status: r.status,
    paymentDate: r.actualPaymentDate || r.paymentDate || null,
    adminShare50: r.adminShare50,
    catShare50: r.catShare50,
    netProfitAdmin: r.netProfitAdmin
  }));
}
async function createInvoice(db2, invoice, calculations) {
  const [created] = await db2.insert(invoices).values(invoice).returning();
  const clientBill = parseNum(calculations.clientBill);
  const commissionRate = calculations.commissionRate ? parseNum(calculations.commissionRate) : void 0;
  const executorExpenses = parseNum(calculations.executorExpensesTotal);
  const plannedExp = parseNum(created.plannedExpenses);
  const computed = calculateInvoiceServer(
    created.scheme,
    clientBill,
    commissionRate,
    executorExpenses,
    0,
    0,
    plannedExp
  );
  await db2.insert(invoiceCalculations).values({ invoiceId: created.id, clientBill: computed.clientBill || "0", ...computed });
  return created;
}
async function updateInvoice(db2, id, invoice) {
  const [updated] = await db2.update(invoices).set({ ...invoice, updatedAt: /* @__PURE__ */ new Date() }).where(eq4(invoices.id, id)).returning();
  return updated || null;
}
async function updateInvoiceCalculations(db2, invoiceId, calculations) {
  const invoice = await _getInvoiceRaw(db2, invoiceId);
  if (!invoice) return null;
  const [existing] = await db2.select().from(invoiceCalculations).where(eq4(invoiceCalculations.invoiceId, invoiceId)).limit(1);
  const clientBill = parseNum(calculations.clientBill ?? existing?.clientBill);
  const commissionRate = calculations.commissionRate ? parseNum(calculations.commissionRate) : existing?.commissionRate ? parseNum(existing.commissionRate) : void 0;
  const executorExpenses = parseNum(calculations.executorExpensesTotal ?? existing?.executorExpensesTotal);
  const expenses = await _getInvoiceExpenses(db2, invoiceId);
  const expensesPaidByPartner = expenses.filter((e) => e.paidByAdmin !== true).reduce((s, e) => s + parseNum(e.amount), 0);
  const expensesPaidByAdmin = expenses.filter((e) => e.paidByAdmin === true).reduce((s, e) => s + parseNum(e.amount), 0);
  const plannedExp = parseNum(invoice.plannedExpenses);
  const computed = calculateInvoiceServer(
    invoice.scheme,
    clientBill,
    commissionRate,
    executorExpenses,
    expensesPaidByPartner,
    expensesPaidByAdmin,
    plannedExp
  );
  if (existing) {
    const [updated] = await db2.update(invoiceCalculations).set({ ...computed, updatedAt: /* @__PURE__ */ new Date() }).where(eq4(invoiceCalculations.invoiceId, invoiceId)).returning();
    return updated || null;
  } else {
    const [created] = await db2.insert(invoiceCalculations).values({ invoiceId, clientBill: computed.clientBill || "0", ...computed }).returning();
    return created;
  }
}
async function getInvoiceExpenses(db2, invoiceId) {
  return _getInvoiceExpenses(db2, invoiceId);
}
async function getAllExpenses(db2) {
  return db2.select().from(invoiceExpenses).orderBy(desc3(invoiceExpenses.date));
}
async function createInvoiceExpense(db2, expense) {
  const [created] = await db2.insert(invoiceExpenses).values(expense).returning();
  await _recalculateInvoiceExpenses(db2, expense.invoiceId);
  return created;
}
async function updateInvoiceExpense(db2, id, updates) {
  const [expense] = await db2.select().from(invoiceExpenses).where(eq4(invoiceExpenses.id, id)).limit(1);
  if (!expense) return null;
  const [updated] = await db2.update(invoiceExpenses).set(updates).where(eq4(invoiceExpenses.id, id)).returning();
  await _recalculateInvoiceExpenses(db2, expense.invoiceId);
  return updated || null;
}
async function deleteInvoiceExpense(db2, id) {
  const [expense] = await db2.select().from(invoiceExpenses).where(eq4(invoiceExpenses.id, id)).limit(1);
  if (expense) {
    await db2.delete(invoiceExpenses).where(eq4(invoiceExpenses.id, id));
    await _recalculateInvoiceExpenses(db2, expense.invoiceId);
  }
}
async function deleteInvoice(db2, id) {
  await db2.delete(invoiceExpenses).where(eq4(invoiceExpenses.invoiceId, id));
  await db2.delete(invoiceCalculations).where(eq4(invoiceCalculations.invoiceId, id));
  await db2.delete(invoices).where(eq4(invoices.id, id));
}
async function deleteDocument(db2, id) {
  await db2.execute(sql`DELETE FROM invoice_documents WHERE id = ${id}`);
}
async function generateInvoiceNumber(db2) {
  const result = await db2.select({ count: sql`count(*)` }).from(invoices);
  const n = Number(result[0]?.count || 0) + 1;
  return `INV-${(/* @__PURE__ */ new Date()).getFullYear()}-${String(n).padStart(4, "0")}`;
}
async function recalculateAllInvoices(db2) {
  console.log("[recalculateAllInvoices] Starting...");
  let updated = 0;
  let errors = 0;
  const allInvoices = await db2.select().from(invoices);
  console.log(`[recalculateAllInvoices] ${allInvoices.length} invoices`);
  for (const invoice of allInvoices) {
    try {
      const [existing] = await db2.select().from(invoiceCalculations).where(eq4(invoiceCalculations.invoiceId, invoice.id)).limit(1);
      if (!existing) continue;
      const expenses = await _getInvoiceExpenses(db2, invoice.id);
      const totalExpenses = expenses.reduce((s, e) => s + parseNum(e.amount), 0);
      const expensesPaidByPartner = expenses.filter((e) => e.paidByAdmin !== true).reduce((s, e) => s + parseNum(e.amount), 0);
      const expensesPaidByAdmin = expenses.filter((e) => e.paidByAdmin === true).reduce((s, e) => s + parseNum(e.amount), 0);
      const clientBill = parseNum(existing.clientBill);
      const commissionRate = existing.commissionRate ? parseNum(existing.commissionRate) : void 0;
      const plannedExp = parseNum(invoice.plannedExpenses);
      const computed = calculateInvoiceServer(
        invoice.scheme,
        clientBill,
        commissionRate,
        totalExpenses,
        expensesPaidByPartner,
        expensesPaidByAdmin,
        plannedExp
      );
      await db2.update(invoiceCalculations).set({ ...computed, updatedAt: /* @__PURE__ */ new Date() }).where(eq4(invoiceCalculations.invoiceId, invoice.id));
      updated++;
    } catch (err) {
      console.error(`[recalculateAllInvoices] Error for invoice ${invoice.id}:`, err);
      errors++;
    }
  }
  console.log(`[recalculateAllInvoices] Done: ${updated} updated, ${errors} errors`);
  return { updated, errors };
}

// server/repositories/recurringRepo.ts
import { eq as eq5, and as and4, asc, lte, isNotNull as isNotNull2, sql as sql2 } from "drizzle-orm";
function _calculateNextInvoiceDate(currentDate, frequency) {
  const date2 = new Date(currentDate);
  switch (frequency) {
    case "monthly":
      date2.setMonth(date2.getMonth() + 1);
      break;
    case "quarterly":
      date2.setMonth(date2.getMonth() + 3);
      break;
    case "yearly":
      date2.setFullYear(date2.getFullYear() + 1);
      break;
  }
  return date2.toISOString().split("T")[0];
}
function _mapRow(r) {
  return {
    ...r.recurring,
    clients: { name: r.clientName },
    partners: { name: r.partnerName }
  };
}
async function getRecurringInvoices(db2) {
  const result = await db2.select({
    recurring: recurringInvoices,
    clientName: clients.name,
    partnerName: partners.name
  }).from(recurringInvoices).leftJoin(clients, eq5(recurringInvoices.clientId, clients.id)).leftJoin(partners, eq5(recurringInvoices.partnerId, partners.id)).orderBy(asc(recurringInvoices.nextInvoiceDate));
  return result.map(_mapRow);
}
async function getRecurringInvoice(db2, id) {
  const [result] = await db2.select().from(recurringInvoices).where(eq5(recurringInvoices.id, id));
  return result || null;
}
async function createRecurringInvoice(db2, data) {
  const [created] = await db2.insert(recurringInvoices).values({
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
    createdBy: data.createdBy
  }).returning();
  return created;
}
async function getDueRecurringInvoices(db2, upToDate) {
  const checkDate = upToDate || /* @__PURE__ */ new Date();
  const dateStr = checkDate.toISOString().split("T")[0];
  const result = await db2.select({
    recurring: recurringInvoices,
    clientName: clients.name,
    partnerName: partners.name
  }).from(recurringInvoices).leftJoin(clients, eq5(recurringInvoices.clientId, clients.id)).leftJoin(partners, eq5(recurringInvoices.partnerId, partners.id)).where(and4(eq5(recurringInvoices.isActive, true), lte(recurringInvoices.nextInvoiceDate, dateStr))).orderBy(asc(recurringInvoices.nextInvoiceDate));
  return result.map(_mapRow);
}
async function getActiveRecurringInvoicesForCashFlow(db2) {
  const result = await db2.select({
    recurring: recurringInvoices,
    clientName: clients.name,
    partnerName: partners.name
  }).from(recurringInvoices).leftJoin(clients, eq5(recurringInvoices.clientId, clients.id)).leftJoin(partners, eq5(recurringInvoices.partnerId, partners.id)).where(eq5(recurringInvoices.isActive, true)).orderBy(asc(recurringInvoices.nextInvoiceDate));
  return result.map(_mapRow);
}
async function updateRecurringInvoice(db2, id, data) {
  const [updated] = await db2.update(recurringInvoices).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq5(recurringInvoices.id, id)).returning();
  return updated || null;
}
async function deleteRecurringInvoice(db2, id) {
  await db2.delete(recurringInvoices).where(eq5(recurringInvoices.id, id));
}
async function createDraftFromRecurring(db2, recurringId, invoiceDate) {
  const recurring = await getRecurringInvoice(db2, recurringId);
  if (!recurring) throw new Error("Recurring invoice not found");
  const targetDate = invoiceDate || recurring.nextInvoiceDate;
  const invoiceNumber = await generateInvoiceNumber(db2);
  const invoice = await createInvoice(db2, {
    invoiceNumber,
    clientId: recurring.clientId,
    partnerId: recurring.partnerId,
    scheme: recurring.scheme,
    partnerCommissionRate: recurring.partnerCommissionRate,
    clientBill: recurring.amount,
    description: recurring.description || `Recurring invoice for ${targetDate}`,
    issueDate: targetDate,
    status: "draft",
    hideFromAssistant: recurring.hideFromAssistant ?? false,
    recurringInvoiceId: recurring.id,
    createdBy: recurring.createdBy
  }, { clientBill: recurring.amount });
  const defaultExpenses = Number(recurring.defaultExpenses) || 0;
  if (defaultExpenses > 0 && invoice?.id) {
    await createInvoiceExpense(db2, {
      invoiceId: invoice.id,
      description: "\u0420\u0430\u0441\u0445\u043E\u0434\u044B \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E",
      amount: String(defaultExpenses),
      paidByAdmin: true,
      createdBy: recurring.createdBy
    });
  }
  const newNextDate = _calculateNextInvoiceDate(recurring.nextInvoiceDate, recurring.frequency);
  const shouldDeactivate = recurring.endDate && new Date(newNextDate) > new Date(recurring.endDate);
  await db2.update(recurringInvoices).set({ nextInvoiceDate: newNextDate, isActive: !shouldDeactivate, updatedAt: /* @__PURE__ */ new Date() }).where(eq5(recurringInvoices.id, recurringId));
  return invoice;
}
async function processAllDueRecurringInvoices(db2) {
  const dueInvoices = await getDueRecurringInvoices(db2);
  let created = 0;
  const errors = [];
  for (const recurring of dueInvoices) {
    try {
      await createDraftFromRecurring(db2, recurring.id);
      created++;
    } catch (error) {
      errors.push(`Failed for recurring ${recurring.id}: ${error.message}`);
    }
  }
  return { created, errors };
}
async function generateBackdatedInvoices(db2, recurringId, fromDate) {
  const recurring = await getRecurringInvoice(db2, recurringId);
  if (!recurring) throw new Error("Recurring invoice not found");
  const createdInvoices = [];
  let currentDate = new Date(fromDate);
  const today = /* @__PURE__ */ new Date();
  today.setHours(23, 59, 59, 999);
  const dayOfMonth = parseInt(recurring.dayOfMonth) || 1;
  const defaultExpenses = Number(recurring.defaultExpenses) || 0;
  currentDate.setDate(dayOfMonth);
  while (currentDate <= today) {
    if (recurring.endDate && currentDate > new Date(recurring.endDate)) break;
    const invoiceDate = currentDate.toISOString().split("T")[0];
    const invoiceNumber = await generateInvoiceNumber(db2);
    const invoice = await createInvoice(db2, {
      invoiceNumber,
      clientId: recurring.clientId,
      partnerId: recurring.partnerId,
      scheme: recurring.scheme,
      partnerCommissionRate: recurring.partnerCommissionRate,
      clientBill: recurring.amount,
      description: recurring.description || `Backdated invoice for ${invoiceDate}`,
      issueDate: invoiceDate,
      status: "draft",
      hideFromAssistant: recurring.hideFromAssistant ?? false,
      recurringInvoiceId: recurring.id,
      createdBy: recurring.createdBy
    }, { clientBill: recurring.amount });
    if (defaultExpenses > 0 && invoice?.id) {
      await createInvoiceExpense(db2, {
        invoiceId: invoice.id,
        description: "\u0420\u0430\u0441\u0445\u043E\u0434\u044B \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E",
        amount: String(defaultExpenses),
        paidByAdmin: true,
        createdBy: recurring.createdBy
      });
    }
    createdInvoices.push(invoice);
    switch (recurring.frequency) {
      case "monthly":
        currentDate.setMonth(currentDate.getMonth() + 1);
        break;
      case "quarterly":
        currentDate.setMonth(currentDate.getMonth() + 3);
        break;
      case "yearly":
        currentDate.setFullYear(currentDate.getFullYear() + 1);
        break;
    }
  }
  return { created: createdInvoices.length, invoices: createdInvoices };
}

// server/repositories/actsRepo.ts
import {
  eq as eq6,
  and as and5,
  desc as desc4,
  isNull as isNull2,
  or as or2,
  inArray,
  sql as sql3
} from "drizzle-orm";
async function createSignedAct(db2, act) {
  const [created] = await db2.insert(signedActs).values(act).returning();
  return created;
}
async function getSignedActsByInvoice(db2, invoiceId, actType) {
  if (actType) {
    return db2.select().from(signedActs).where(and5(eq6(signedActs.invoiceId, invoiceId), eq6(signedActs.actType, actType))).orderBy(desc4(signedActs.createdAt));
  }
  return db2.select().from(signedActs).where(eq6(signedActs.invoiceId, invoiceId)).orderBy(desc4(signedActs.createdAt));
}
async function getSignedAct(db2, id) {
  const [act] = await db2.select().from(signedActs).where(eq6(signedActs.id, id)).limit(1);
  return act || null;
}
async function deleteSignedAct(db2, id) {
  await db2.delete(signedActs).where(eq6(signedActs.id, id));
}
async function getActsStatistics(db2, excludeHidden = false) {
  const visibleCondition = excludeHidden ? and5(eq6(invoices.status, "paid"), or2(isNull2(invoices.hideFromAssistant), eq6(invoices.hideFromAssistant, false))) : eq6(invoices.status, "paid");
  const paidInvoicesCount = await db2.select({ count: sql3`count(*)` }).from(invoices).where(visibleCondition);
  const visibleInvoices = await db2.select({ id: invoices.id }).from(invoices).where(visibleCondition);
  const visibleInvoiceIds = visibleInvoices.map((inv) => inv.id.toString());
  let executorActsCount = 0;
  let companyActsCount = 0;
  if (visibleInvoiceIds.length > 0) {
    const [executorResult] = await db2.select({ count: sql3`count(*)` }).from(signedActs).where(and5(eq6(signedActs.actType, "executor"), inArray(signedActs.invoiceId, visibleInvoiceIds)));
    executorActsCount = Number(executorResult?.count || 0);
    const [companyResult] = await db2.select({ count: sql3`count(*)` }).from(signedActs).where(and5(eq6(signedActs.actType, "company"), inArray(signedActs.invoiceId, visibleInvoiceIds)));
    companyActsCount = Number(companyResult?.count || 0);
  }
  return {
    executorActs: executorActsCount,
    companyActs: companyActsCount,
    totalPaidInvoices: Number(paidInvoicesCount[0]?.count || 0)
  };
}
async function getAssistantStats(db2) {
  const stats = await getActsStatistics(db2, true);
  const totalEarned = stats.executorActs * 1e3 + stats.companyActs * 2e3;
  const [paymentsResult] = await db2.select({
    totalPaid: sql3`COALESCE(SUM(amount::numeric), 0)`
  }).from(assistantBonusPayments);
  const totalPaid = parseNum(paymentsResult?.totalPaid);
  const assistantBonus = Math.max(0, totalEarned - totalPaid);
  return {
    paidInvoicesCount: stats.totalPaidInvoices,
    executorActsCount: stats.executorActs,
    companyActsCount: stats.companyActs,
    totalPaidInvoices: stats.totalPaidInvoices,
    assistantBonus,
    totalEarned,
    totalPaid
  };
}
async function getAssistantBonusPayments(db2) {
  return db2.select().from(assistantBonusPayments).orderBy(desc4(assistantBonusPayments.paymentDate));
}
async function createAssistantBonusPayment(db2, payment) {
  const [created] = await db2.insert(assistantBonusPayments).values(payment).returning();
  return created;
}
async function getUnpaidBonusTotal(db2) {
  const stats = await getActsStatistics(db2, true);
  const totalEarned = stats.executorActs * 1e3 + stats.companyActs * 2e3;
  const [paymentsResult] = await db2.select({
    totalPaid: sql3`COALESCE(SUM(amount::numeric), 0)`
  }).from(assistantBonusPayments);
  const totalPaid = parseNum(paymentsResult?.totalPaid);
  const unpaidTotal = Math.max(0, totalEarned - totalPaid);
  const invoicesWithActs = await db2.selectDistinct({ invoiceId: signedActs.invoiceId }).from(signedActs).innerJoin(invoices, eq6(invoices.id, signedActs.invoiceId)).where(eq6(invoices.status, "paid"));
  return {
    total: unpaidTotal,
    invoiceCount: invoicesWithActs.length,
    invoiceIds: invoicesWithActs.map((r) => r.invoiceId),
    executorActs: stats.executorActs,
    companyActs: stats.companyActs,
    totalEarned,
    totalPaid
  };
}
async function markBonusesAsPaid(_db, _invoiceIds) {
}

// server/repositories/actionLogRepo.ts
import { eq as eq7, and as and6, desc as desc5, inArray as inArray2, sql as sql4 } from "drizzle-orm";
async function logAssistantAction(db2, log) {
  if (log.actionType === "update_invoice" && log.entityId && log.accessTokenId) {
    const recentLogs = await db2.select().from(assistantActionLogs).where(and6(
      eq7(assistantActionLogs.accessTokenId, log.accessTokenId),
      eq7(assistantActionLogs.entityId, log.entityId),
      eq7(assistantActionLogs.actionType, "update_invoice"),
      sql4`${assistantActionLogs.createdAt} > NOW() - INTERVAL '10 seconds'`
    )).orderBy(desc5(assistantActionLogs.createdAt)).limit(1);
    if (recentLogs.length > 0) {
      const existing = recentLogs[0];
      let mergedDetails = {};
      if (existing.details) {
        try {
          mergedDetails = JSON.parse(existing.details);
        } catch {
        }
      }
      if (log.details) {
        try {
          const newDetails = JSON.parse(log.details);
          mergedDetails = { ...mergedDetails, ...newDetails };
        } catch {
        }
      }
      const [updated] = await db2.update(assistantActionLogs).set({
        details: JSON.stringify(mergedDetails),
        description: log.description || existing.description
      }).where(eq7(assistantActionLogs.id, existing.id)).returning();
      return updated;
    }
  }
  const [created] = await db2.insert(assistantActionLogs).values(log).returning();
  return created;
}
async function getAssistantActionLogs(db2, filters) {
  const { limit = 100, offset = 0, role, dateFrom, dateTo } = filters;
  const conditions = [];
  if (role) conditions.push(eq7(accessTokens.role, role));
  if (dateFrom) conditions.push(sql4`${assistantActionLogs.createdAt} >= ${dateFrom}::timestamp`);
  if (dateTo) conditions.push(sql4`${assistantActionLogs.createdAt} <= ${dateTo}::timestamp + interval '1 day'`);
  const whereClause = conditions.length > 0 ? and6(...conditions) : void 0;
  const baseFrom = db2.select({ count: sql4`count(*)::int` }).from(assistantActionLogs).leftJoin(accessTokens, eq7(assistantActionLogs.accessTokenId, accessTokens.id));
  const [countResult] = whereClause ? await baseFrom.where(whereClause) : await baseFrom;
  const dataBase = db2.select({
    log: assistantActionLogs,
    tokenCode: accessTokens.code,
    tokenRole: accessTokens.role
  }).from(assistantActionLogs).leftJoin(accessTokens, eq7(assistantActionLogs.accessTokenId, accessTokens.id));
  const logsData = await (whereClause ? dataBase.where(whereClause) : dataBase).orderBy(desc5(assistantActionLogs.createdAt)).limit(limit).offset(offset);
  const clientIds = /* @__PURE__ */ new Set();
  const partnerIds = /* @__PURE__ */ new Set();
  const invoiceIds = /* @__PURE__ */ new Set();
  for (const row of logsData) {
    if (row.log.details) {
      try {
        const parsed = JSON.parse(row.log.details);
        if (parsed.clientId) clientIds.add(parsed.clientId);
        if (parsed.partnerId) partnerIds.add(parsed.partnerId);
        if (parsed.invoiceId) invoiceIds.add(parsed.invoiceId);
      } catch {
      }
    }
    if (row.log.entityId && row.log.actionType.includes("invoice")) {
      invoiceIds.add(row.log.entityId);
    }
  }
  const clientMap = /* @__PURE__ */ new Map();
  const partnerMap = /* @__PURE__ */ new Map();
  const invoiceMap = /* @__PURE__ */ new Map();
  if (clientIds.size > 0) {
    const data = await db2.select({ id: clients.id, name: clients.name }).from(clients).where(inArray2(clients.id, Array.from(clientIds)));
    for (const c of data) clientMap.set(c.id, c.name);
  }
  if (partnerIds.size > 0) {
    const data = await db2.select({ id: partners.id, name: partners.name }).from(partners).where(inArray2(partners.id, Array.from(partnerIds)));
    for (const p of data) partnerMap.set(p.id, p.name);
  }
  if (invoiceIds.size > 0) {
    const data = await db2.select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      status: invoices.status,
      clientId: invoices.clientId,
      description: invoices.description,
      clientName: clients.name
    }).from(invoices).leftJoin(clients, eq7(invoices.clientId, clients.id)).where(inArray2(invoices.id, Array.from(invoiceIds)));
    for (const inv of data) {
      const displayName = inv.invoiceNumber || inv.clientName || inv.description || inv.id;
      invoiceMap.set(inv.id, { number: displayName, status: inv.status });
    }
  }
  const isUUID = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
  const logs = logsData.map((row) => {
    let enrichedDetails = row.log.details;
    let enrichedDescription = row.log.description;
    let parsedDetails = null;
    if (row.log.details) {
      try {
        parsedDetails = JSON.parse(row.log.details);
      } catch {
      }
    }
    if (parsedDetails) {
      if (parsedDetails.clientId && clientMap.has(parsedDetails.clientId) && !parsedDetails.clientName)
        parsedDetails.clientName = clientMap.get(parsedDetails.clientId);
      if (parsedDetails.partnerId && partnerMap.has(parsedDetails.partnerId) && !parsedDetails.partnerName)
        parsedDetails.partnerName = partnerMap.get(parsedDetails.partnerId);
      if (parsedDetails.invoiceId && invoiceMap.has(parsedDetails.invoiceId)) {
        const inv = invoiceMap.get(parsedDetails.invoiceId);
        if (!parsedDetails.invoiceNumber) parsedDetails.invoiceNumber = inv.number;
        parsedDetails.invoiceStatus = inv.status;
      }
      if (row.log.entityId && invoiceMap.has(row.log.entityId) && !parsedDetails.status)
        parsedDetails.invoiceStatus = invoiceMap.get(row.log.entityId).status;
      enrichedDetails = JSON.stringify(parsedDetails);
    }
    if (row.log.entityId && row.log.entityType === "invoice") {
      let displayName = parsedDetails ? parsedDetails.invoiceNumber || parsedDetails.clientName || parsedDetails.partnerName || parsedDetails.description || null : null;
      if (!displayName && invoiceMap.has(row.log.entityId)) {
        const num = invoiceMap.get(row.log.entityId).number;
        if (!isUUID(num)) displayName = num;
      }
      if (displayName && enrichedDescription.includes(row.log.entityId)) {
        enrichedDescription = enrichedDescription.replace(row.log.entityId, displayName);
      }
    }
    return {
      ...row.log,
      description: enrichedDescription,
      details: enrichedDetails,
      tokenCode: row.tokenCode || void 0,
      tokenRole: row.tokenRole || void 0
    };
  });
  return { logs, total: countResult?.count || 0 };
}

// server/storage.ts
var DatabaseStorage = class {
  async verifyAccessCode(code) {
    return verifyAccessCode(db, code);
  }
  async createSession(tokenId, ipAddress, userAgent) {
    return createSession(db, tokenId, ipAddress, userAgent);
  }
  async validateSession(sessionId, csrfToken) {
    return validateSession(db, sessionId, csrfToken);
  }
  async refreshSession(sessionId) {
    return refreshSession(db, sessionId);
  }
  async revokeSession(sessionId) {
    return revokeSession(db, sessionId);
  }
  async getPartners() {
    return getPartners(db);
  }
  async getPartner(id) {
    return getPartner(db, id);
  }
  async createPartner(partner) {
    return createPartner(db, partner);
  }
  async updatePartner(id, partner) {
    return updatePartner(db, id, partner);
  }
  async deletePartner(id) {
    return deletePartner(db, id);
  }
  async getPartnerClients(partnerId) {
    return getPartnerClients(db, partnerId);
  }
  async getClients(partnerId) {
    return getClients(db, partnerId);
  }
  async getClient(id) {
    return getClient(db, id);
  }
  async createClient(client) {
    return createClient(db, client);
  }
  async updateClient(id, client) {
    return updateClient(db, id, client);
  }
  async getClientWithPartner(id) {
    return getClientWithPartner(db, id);
  }
  async getClientPartners(clientId) {
    return getClientPartners(db, clientId);
  }
  async getClientsWithPartners() {
    return getClientsWithPartners(db);
  }
  async setClientPartners(clientId, partnerIds) {
    return setClientPartners(db, clientId, partnerIds);
  }
  async deleteClient(id) {
    return deleteClient(db, id);
  }
  async getInvoices(role, partnerId, clientId) {
    return getInvoices(db, role, partnerId, clientId);
  }
  async getInvoice(id) {
    return getInvoice(db, id);
  }
  async getInvoiceForRole(id, role, partnerId, clientId) {
    return getInvoice(db, id, role, partnerId, clientId);
  }
  async getInvoicesWithCalculations() {
    return getInvoicesWithCalculations(db);
  }
  async createInvoice(invoice, calculations) {
    return createInvoice(db, invoice, calculations);
  }
  async updateInvoice(id, invoice) {
    return updateInvoice(db, id, invoice);
  }
  async updateInvoiceCalculations(invoiceId, calculations) {
    return updateInvoiceCalculations(db, invoiceId, calculations);
  }
  async getInvoiceExpenses(invoiceId) {
    return getInvoiceExpenses(db, invoiceId);
  }
  async getAllExpenses() {
    return getAllExpenses(db);
  }
  async createInvoiceExpense(expense) {
    return createInvoiceExpense(db, expense);
  }
  async updateInvoiceExpense(id, updates) {
    return updateInvoiceExpense(db, id, updates);
  }
  async deleteInvoiceExpense(id) {
    return deleteInvoiceExpense(db, id);
  }
  async deleteInvoice(id) {
    return deleteInvoice(db, id);
  }
  async deleteDocument(id) {
    return deleteDocument(db, id);
  }
  async getPartnerPayments(partnerId) {
    return getPartnerPayments(db, partnerId);
  }
  async getPartnerPayment(id) {
    return getPartnerPayment(db, id);
  }
  async createPartnerPayment(payment) {
    return createPartnerPayment(db, payment);
  }
  async updatePartnerPayment(id, updates) {
    return updatePartnerPayment(db, id, updates);
  }
  async deletePartnerPayment(id) {
    return deletePartnerPayment(db, id);
  }
  async getPartnerPaymentHistory(partnerId) {
    return getPartnerPaymentHistory(db, partnerId);
  }
  async getAccessTokens() {
    return getAccessTokens(db);
  }
  async createAccessToken(code, role, partnerId, clientId) {
    return createAccessToken(db, code, role, partnerId, clientId);
  }
  async deleteAccessToken(id) {
    return deleteAccessToken(db, id);
  }
  async getDashboardStats(role, partnerId, clientId) {
    let query = db.select({
      invoice: invoices,
      calculations: invoiceCalculations
    }).from(invoices).leftJoin(invoiceCalculations, eq8(invoices.id, invoiceCalculations.invoiceId));
    let results;
    if (role === "partner" && partnerId) {
      results = await query.where(eq8(invoices.partnerId, partnerId));
    } else if (role === "client" && clientId) {
      results = await query.where(eq8(invoices.clientId, clientId));
    } else {
      results = await query;
    }
    const today = /* @__PURE__ */ new Date();
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
    let expectedProfit = 0;
    let receivedProfit = 0;
    let clientRemaining = 0;
    let totalPlannedExpenses = 0;
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
      if (inv.status === "paid") {
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
        if (scheme === "agency_30" || scheme === "agency_40") {
          totalPartnerCommission += parseNum(calc.partnerShareFromMargin);
          totalAdminShare += parseNum(calc.adminShareFromMargin);
          clientRemaining += parseNum(calc.clientBaseAfterMargin) - expenses;
        } else {
          totalPartnerCommission += parseNum(calc.commissionAmount);
          totalAdminShare += parseNum(calc.amountToAdmin);
          clientRemaining += parseNum(calc.clientRemaining);
        }
        totalNetProfit += netProfit;
        if (inv.status === "paid") {
          receivedProfit += netProfit;
        } else {
          expectedProfit += netProfit;
        }
      }
    }
    let partnerDebt = 0;
    if (role === "partner" && partnerId) {
      const payments = await this.getPartnerPayments(partnerId);
      const totalPaid = payments.reduce((sum2, p) => sum2 + parseNum(p.amount), 0);
      let totalDebtToAdmin = 0;
      for (const r of results) {
        if (r.invoice.status === "paid" && r.calculations) {
          const storedDebt = parseNum(r.calculations.partnerTransferDue);
          totalDebtToAdmin += Math.max(0, storedDebt);
        }
      }
      partnerDebt = Math.max(0, totalDebtToAdmin - totalPaid);
    }
    const stats = {
      totalInvoices,
      paidInvoices,
      pendingInvoices,
      overdueInvoices,
      totalClientBill,
      paidClientBill,
      pendingClientBill,
      totalExpenses
    };
    if (role === "admin") {
      stats.totalPartnerCommission = totalPartnerCommission;
      stats.totalAdminShare = totalAdminShare;
      stats.totalNetProfit = totalNetProfit;
      stats.expectedProfit = expectedProfit;
      stats.receivedProfit = receivedProfit;
      stats.totalPlannedExpenses = totalPlannedExpenses;
      stats.clientRemaining = clientRemaining;
      const recurringStats = await this.getRecurringExpectedAmounts();
      stats.recurringExpectedMonthly = recurringStats.monthly;
      stats.recurringExpectedYearly = recurringStats.yearly;
    } else if (role === "partner") {
      stats.totalPartnerCommission = totalPartnerCommission;
      stats.partnerDebt = partnerDebt;
      stats.clientRemaining = clientRemaining;
    } else if (role === "client") {
      stats.clientRemaining = Math.max(0, clientRemaining);
    }
    return stats;
  }
  async getRecurringExpectedAmounts() {
    const activeRecurring = await db.select().from(recurringInvoices).where(eq8(recurringInvoices.isActive, true));
    let monthlyTotal = 0;
    let yearlyTotal = 0;
    const now = /* @__PURE__ */ new Date();
    const yearEnd = new Date(now.getFullYear(), 11, 31);
    for (const recurring of activeRecurring) {
      const amount = parseNum(recurring.amount);
      if (amount <= 0) continue;
      const scheme = recurring.scheme;
      const partnerCommissionRate = recurring.partnerCommissionRate ? parseNum(recurring.partnerCommissionRate) : void 0;
      const defaultExpenses = parseNum(recurring.defaultExpenses);
      const calculation = calculateInvoiceServer(scheme, amount, partnerCommissionRate, 0, 0, 0, defaultExpenses);
      const expectedProfit = parseNum(calculation.netProfitAdmin);
      if (expectedProfit <= 0) continue;
      const frequency = recurring.frequency;
      const endDateValue = recurring.endDate ? new Date(recurring.endDate) : null;
      if (!endDateValue || endDateValue >= now) {
        switch (frequency) {
          case "monthly":
            monthlyTotal += expectedProfit;
            break;
          case "quarterly":
            monthlyTotal += expectedProfit / 3;
            break;
          case "yearly":
            monthlyTotal += expectedProfit / 12;
            break;
        }
      }
      const dayOfMonth = parseInt(recurring.dayOfMonth || "1");
      let checkDate = recurring.nextInvoiceDate ? new Date(recurring.nextInvoiceDate) : new Date(now.getFullYear(), now.getMonth(), dayOfMonth);
      if (checkDate < now) {
        switch (frequency) {
          case "monthly":
            checkDate = new Date(now.getFullYear(), now.getMonth() + 1, dayOfMonth);
            break;
          case "quarterly":
            checkDate.setMonth(checkDate.getMonth() + 3);
            break;
          case "yearly":
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
          case "monthly":
            checkDate = new Date(nextYear, nextMonth + 1, dayOfMonth);
            break;
          case "quarterly":
            checkDate = new Date(nextYear, nextMonth + 3, dayOfMonth);
            break;
          case "yearly":
            checkDate = new Date(nextYear + 1, nextMonth, dayOfMonth);
            break;
        }
      }
    }
    return { monthly: monthlyTotal, yearly: yearlyTotal };
  }
  async getPartnerDebtSummaries() {
    const allInvoicesList = await db.select({
      invoice: invoices,
      calculations: invoiceCalculations,
      partnerName: partners.name,
      partnerEmail: partners.email,
      partnerPhone: partners.phone
    }).from(invoices).leftJoin(invoiceCalculations, eq8(invoices.id, invoiceCalculations.invoiceId)).leftJoin(partners, eq8(invoices.partnerId, partners.id));
    const paidInvoices = allInvoicesList.filter((r) => r.invoice.status === "paid");
    const allPayments = await db.select().from(partnerPayments);
    const partnerMap = /* @__PURE__ */ new Map();
    for (const row of allInvoicesList) {
      if (!row.invoice.partnerId) continue;
      const pid = row.invoice.partnerId;
      const pName = row.partnerName || "Unknown";
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
          phone: row.partnerPhone
        });
      }
      const summary = partnerMap.get(pid);
      summary.totalInvoiceCount += 1;
    }
    for (const row of paidInvoices) {
      if (!row.invoice.partnerId || !row.calculations) continue;
      const pid = row.invoice.partnerId;
      const pName = row.partnerName || "Unknown";
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
          phone: row.partnerPhone
        });
      }
      const summary = partnerMap.get(pid);
      summary.totalToTransfer += debt;
      summary.invoiceCount += 1;
      summary.paidCommission += commission;
    }
    for (const payment of allPayments) {
      if (partnerMap.has(payment.partnerId)) {
        const summary = partnerMap.get(payment.partnerId);
        summary.totalPaid += parseNum(payment.amount) || 0;
      }
    }
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
          phone: partner.phone
        });
      }
    }
    for (const payment of allPayments) {
      if (partnerMap.has(payment.partnerId)) {
        const summary = partnerMap.get(payment.partnerId);
      }
    }
    return Array.from(partnerMap.values()).map((s) => ({
      ...s,
      remaining: Math.max(0, s.totalToTransfer - s.totalPaid)
    })).sort((a, b) => {
      if (b.remaining !== a.remaining) return b.remaining - a.remaining;
      return a.partnerName.localeCompare(b.partnerName);
    });
  }
  async getDoNotSpendData(partnerId) {
    const conditions = [
      inArray3(invoices.scheme, ["agency_30", "agency_40"]),
      eq8(invoices.status, "paid")
    ];
    if (partnerId) {
      conditions.push(eq8(invoices.partnerId, partnerId));
    }
    const agencyInvoices = await db.select({
      invoice: invoices,
      calculations: invoiceCalculations,
      clientName: clients.name
    }).from(invoices).leftJoin(invoiceCalculations, eq8(invoices.id, invoiceCalculations.invoiceId)).leftJoin(clients, eq8(invoices.clientId, clients.id)).where(and7(...conditions));
    const clientMap = /* @__PURE__ */ new Map();
    for (const row of agencyInvoices) {
      if (!row.invoice.clientId || !row.calculations) continue;
      const clientId = row.invoice.clientId;
      const clientName = row.clientName || "Unknown";
      const clientBill = parseNum(row.calculations.clientBill);
      const executorExpenses = parseNum(row.calculations.executorExpensesTotal);
      const scheme = row.invoice.scheme;
      const clientBaseRate = scheme === "agency_40" ? 0.6 : 0.7;
      const clientBase = parseNum(row.calculations.clientBaseAfterMargin) || clientBill * clientBaseRate;
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
          invoices: []
        });
      }
      const summary = clientMap.get(clientId);
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
        createdAt: row.invoice.createdAt
      });
    }
    return Array.from(clientMap.values()).map((s) => ({
      ...s,
      remaining: Math.max(0, s.totalBudget - s.totalSpent),
      invoices: s.invoices.sort((a, b) => {
        if (!a.createdAt || !b.createdAt) return 0;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      })
    })).filter((s) => s.totalBudget > 0).sort((a, b) => b.remaining - a.remaining);
  }
  async getPartnerSchemeDoNotSpendData(partnerId, role) {
    const conditions = [
      inArray3(invoices.scheme, ["commission_based", "partner_10", "partner_15"]),
      inArray3(invoices.status, ["paid", "sent"])
    ];
    if (partnerId) {
      conditions.push(eq8(invoices.partnerId, partnerId));
    }
    const partnerInvoices = await db.select({
      invoice: invoices,
      calculations: invoiceCalculations,
      partnerName: partners.name
    }).from(invoices).leftJoin(invoiceCalculations, eq8(invoices.id, invoiceCalculations.invoiceId)).leftJoin(partners, eq8(invoices.partnerId, partners.id)).where(and7(...conditions));
    const invoiceIds = partnerInvoices.map((row) => row.invoice.id);
    const allExpenses = invoiceIds.length > 0 ? await db.select().from(invoiceExpenses).where(inArray3(invoiceExpenses.invoiceId, invoiceIds)) : [];
    const expensesByInvoice = /* @__PURE__ */ new Map();
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
    const partnerMap = /* @__PURE__ */ new Map();
    for (const row of partnerInvoices) {
      if (!row.invoice.partnerId || !row.calculations) continue;
      const pId = row.invoice.partnerId;
      const partnerName = row.partnerName || "Unknown";
      const clientBill = parseNum(row.calculations.clientBill);
      const plannedExpenses = parseNum(row.invoice.plannedExpenses);
      const commissionRate = row.calculations.commissionRate ? parseNum(row.calculations.commissionRate) : 10;
      const invoiceExpensesData = expensesByInvoice.get(row.invoice.id) || { paidByPartner: 0, paidByAdmin: 0 };
      const spent = invoiceExpensesData.paidByPartner;
      const remaining = Math.max(0, plannedExpenses - spent);
      const commission = clientBill * (commissionRate / 100);
      const partnerDebt = parseNum(row.calculations.partnerTransferDue);
      const doNotSpend = remaining;
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
          invoices: []
        });
      }
      const summary = partnerMap.get(pId);
      summary.totalPlannedExpenses += plannedExpenses;
      summary.totalSpent += spent;
      summary.totalCommission += role === "assistant" || role === "accountant" ? 0 : commission;
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
        commission: role === "assistant" || role === "accountant" ? 0 : commission,
        partnerDebt,
        doNotSpend,
        createdAt: row.invoice.createdAt
      });
    }
    return Array.from(partnerMap.values()).map((s) => ({
      ...s,
      // Ensure assistant never sees any commission data
      totalCommission: role === "assistant" || role === "accountant" ? 0 : s.totalCommission,
      invoices: s.invoices.sort((a, b) => {
        if (!a.createdAt || !b.createdAt) return 0;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      })
    })).filter((s) => s.totalDoNotSpend > 0).sort((a, b) => b.totalDoNotSpend - a.totalDoNotSpend);
  }
  async getExpectedCommission(partnerId) {
    const conditions = [
      inArray3(invoices.scheme, ["commission_based", "partner_10", "partner_15", "agency_30", "agency_40"]),
      eq8(invoices.status, "sent")
    ];
    if (partnerId) {
      conditions.push(eq8(invoices.partnerId, partnerId));
    }
    const unpaidInvoices = await db.select({
      invoice: invoices,
      calculations: invoiceCalculations,
      partnerName: partners.name,
      clientName: clients.name
    }).from(invoices).leftJoin(invoiceCalculations, eq8(invoices.id, invoiceCalculations.invoiceId)).leftJoin(partners, eq8(invoices.partnerId, partners.id)).leftJoin(clients, eq8(invoices.clientId, clients.id)).where(and7(...conditions));
    const partnerMap = /* @__PURE__ */ new Map();
    for (const row of unpaidInvoices) {
      if (!row.invoice.partnerId || !row.calculations) continue;
      const pId = row.invoice.partnerId;
      const partnerName = row.partnerName || "Unknown";
      const clientBill = parseNum(row.calculations.clientBill);
      const scheme = row.invoice.scheme || "commission_based";
      let commission = 0;
      if (scheme === "agency_30" || scheme === "agency_40") {
        commission = parseNum(row.calculations.partnerShareFromMargin);
      } else {
        commission = parseNum(row.calculations.commissionAmount);
      }
      if (commission <= 0) continue;
      if (!partnerMap.has(pId)) {
        partnerMap.set(pId, {
          partnerId: pId,
          partnerName,
          totalExpectedCommission: 0,
          invoiceCount: 0,
          invoices: []
        });
      }
      const summary = partnerMap.get(pId);
      summary.totalExpectedCommission += commission;
      summary.invoiceCount += 1;
      summary.invoices.push({
        id: row.invoice.id,
        number: row.invoice.invoiceNumber || `INV-${row.invoice.id}`,
        clientName: row.clientName,
        clientBill,
        commission,
        scheme,
        createdAt: row.invoice.createdAt
      });
    }
    return Array.from(partnerMap.values()).map((s) => ({
      ...s,
      invoices: s.invoices.sort((a, b) => {
        if (!a.createdAt || !b.createdAt) return 0;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      })
    })).filter((s) => s.totalExpectedCommission > 0).sort((a, b) => b.totalExpectedCommission - a.totalExpectedCommission);
  }
  async getExpectedAdminProfit() {
    const conditions = [
      inArray3(invoices.status, ["sent", "draft"])
    ];
    const unpaidInvoices = await db.select({
      invoice: invoices,
      calculations: invoiceCalculations,
      partnerName: partners.name,
      clientName: clients.name
    }).from(invoices).leftJoin(invoiceCalculations, eq8(invoices.id, invoiceCalculations.invoiceId)).leftJoin(partners, eq8(invoices.partnerId, partners.id)).leftJoin(clients, eq8(invoices.clientId, clients.id)).where(and7(...conditions));
    const partnerMap = /* @__PURE__ */ new Map();
    for (const row of unpaidInvoices) {
      if (!row.calculations) continue;
      const pId = row.invoice.partnerId || "no-partner";
      const partnerName = row.partnerName || "\u0411\u0435\u0437 \u043F\u0430\u0440\u0442\u043D\u0451\u0440\u0430";
      const clientBill = parseNum(row.calculations.clientBill);
      const netProfitAdmin = parseNum(row.calculations.netProfitAdmin);
      const scheme = row.invoice.scheme || "commission_based";
      if (netProfitAdmin <= 0) continue;
      if (!partnerMap.has(pId)) {
        partnerMap.set(pId, {
          partnerId: pId,
          partnerName,
          totalExpectedProfit: 0,
          invoiceCount: 0,
          invoices: []
        });
      }
      const summary = partnerMap.get(pId);
      summary.totalExpectedProfit += netProfitAdmin;
      summary.invoiceCount += 1;
      summary.invoices.push({
        id: row.invoice.id,
        number: row.invoice.invoiceNumber || `INV-${row.invoice.id}`,
        clientName: row.clientName,
        clientBill,
        netProfitAdmin,
        scheme,
        createdAt: row.invoice.createdAt
      });
    }
    return Array.from(partnerMap.values()).map((s) => ({
      ...s,
      invoices: s.invoices.sort((a, b) => {
        if (!a.createdAt || !b.createdAt) return 0;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      })
    })).filter((s) => s.totalExpectedProfit > 0).sort((a, b) => b.totalExpectedProfit - a.totalExpectedProfit);
  }
  async getAdminDashboardStats(year, month) {
    const now = /* @__PURE__ */ new Date();
    const selectedYear = year ?? now.getFullYear();
    const selectedMonth = month ?? now.getMonth();
    const pad = (n) => String(n).padStart(2, "0");
    const lastDayOfMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const monthStartStr = `${selectedYear}-${pad(selectedMonth + 1)}-01`;
    const monthEndStr = `${selectedYear}-${pad(selectedMonth + 1)}-${pad(lastDayOfMonth)}`;
    const yearStartStr = `${selectedYear}-01-01`;
    const yearEndStr = `${selectedYear}-12-31`;
    const effectiveDate = sql5`COALESCE(${invoices.paymentDate}, DATE(${invoices.createdAt}))`;
    const [
      yearlyRows,
      monthlyPaidRows,
      monthlyExpectedRows,
      leverageRows,
      salesRows,
      availableYearsRows
    ] = await Promise.all([
      // 1. Yearly metrics — paid invoices whose effective date falls within the selected year
      db.select({
        revenue: sql5`COALESCE(SUM(${invoiceCalculations.clientBill}::numeric), 0)`,
        profit: sql5`COALESCE(SUM(${invoiceCalculations.netProfitAdmin}::numeric), 0)`
      }).from(invoices).innerJoin(invoiceCalculations, eq8(invoices.id, invoiceCalculations.invoiceId)).where(and7(
        eq8(invoices.status, "paid"),
        sql5`${effectiveDate} BETWEEN ${yearStartStr}::date AND ${yearEndStr}::date`
      )),
      // 2. Monthly received — paid invoices whose effective date falls within the selected month
      db.select({
        profit: sql5`COALESCE(SUM(${invoiceCalculations.netProfitAdmin}::numeric), 0)`
      }).from(invoices).innerJoin(invoiceCalculations, eq8(invoices.id, invoiceCalculations.invoiceId)).where(and7(
        eq8(invoices.status, "paid"),
        sql5`${effectiveDate} BETWEEN ${monthStartStr}::date AND ${monthEndStr}::date`
      )),
      // 3. Monthly expected — non-paid, non-cancelled with effective date in month
      db.select({
        profit: sql5`COALESCE(SUM(${invoiceCalculations.netProfitAdmin}::numeric), 0)`
      }).from(invoices).innerJoin(invoiceCalculations, eq8(invoices.id, invoiceCalculations.invoiceId)).where(and7(
        sql5`${invoices.status} NOT IN ('paid', 'cancelled')`,
        sql5`${effectiveDate} BETWEEN ${monthStartStr}::date AND ${monthEndStr}::date`
      )),
      // 4. Leverage — non-cancelled with effective date in month, split by Vika Utkina
      db.select({
        vikaProfit: sql5`COALESCE(SUM(
          CASE WHEN LOWER(${partners.name}) LIKE '%вика уткина%'
                 OR LOWER(${partners.name}) LIKE '%vika utkina%'
               THEN ${invoiceCalculations.netProfitAdmin}::numeric
               ELSE 0
          END), 0)`,
        othersProfit: sql5`COALESCE(SUM(
          CASE WHEN LOWER(${partners.name}) NOT LIKE '%вика уткина%'
               AND (${partners.name} IS NULL OR LOWER(${partners.name}) NOT LIKE '%vika utkina%')
               THEN ${invoiceCalculations.netProfitAdmin}::numeric
               ELSE 0
          END), 0)`
      }).from(invoices).innerJoin(invoiceCalculations, eq8(invoices.id, invoiceCalculations.invoiceId)).leftJoin(partners, eq8(invoices.partnerId, partners.id)).where(and7(
        sql5`${invoices.status} != 'cancelled'`,
        sql5`${effectiveDate} BETWEEN ${monthStartStr}::date AND ${monthEndStr}::date`
      )),
      // 5. Monthly sales — non-cancelled, non-recurring invoices created this month
      db.select({
        draftsCount: sql5`COUNT(*)`,
        draftsTotal: sql5`COALESCE(SUM(${invoiceCalculations.netProfitAdmin}::numeric), 0)`
      }).from(invoices).innerJoin(invoiceCalculations, eq8(invoices.id, invoiceCalculations.invoiceId)).where(and7(
        sql5`${invoices.status} != 'cancelled'`,
        isNull3(invoices.recurringInvoiceId),
        sql5`DATE(${invoices.createdAt}) BETWEEN ${monthStartStr}::date AND ${monthEndStr}::date`
      )),
      // 6. Available years — one row per distinct year found in effective dates
      db.select({
        yr: sql5`EXTRACT(YEAR FROM ${effectiveDate})::integer`
      }).from(invoices).groupBy(sql5`EXTRACT(YEAR FROM ${effectiveDate})`)
    ]);
    const yearlyRevenue = parseNum(yearlyRows[0]?.revenue ?? "0");
    const yearlyProfit = parseNum(yearlyRows[0]?.profit ?? "0");
    const monthlyReceived = parseNum(monthlyPaidRows[0]?.profit ?? "0");
    const monthlyExpected = parseNum(monthlyExpectedRows[0]?.profit ?? "0");
    const monthlyVikaProfit = parseNum(String(leverageRows[0]?.vikaProfit ?? "0"));
    const monthlyOthersProfit = parseNum(String(leverageRows[0]?.othersProfit ?? "0"));
    const draftsCount = parseInt(String(salesRows[0]?.draftsCount ?? "0"), 10);
    const draftsTotal = parseNum(String(salesRows[0]?.draftsTotal ?? "0"));
    const monthlyProfit = monthlyReceived;
    const netProfitMargin = yearlyRevenue > 0 ? yearlyProfit / yearlyRevenue * 100 : 0;
    const leverageRatio = monthlyVikaProfit > 0 ? monthlyOthersProfit / monthlyVikaProfit : 0;
    const yearsSet = new Set(availableYearsRows.map((r) => r.yr).filter(Boolean));
    if (!yearsSet.has(now.getFullYear())) yearsSet.add(now.getFullYear());
    const availableYears = Array.from(yearsSet).sort((a, b) => b - a);
    const yearlyOwnerShare = yearlyProfit / 2;
    const monthlyOwnerShare = monthlyProfit / 2;
    const recurringStats = await this.getRecurringExpectedForMonth(selectedYear, selectedMonth);
    return {
      yearlySummary: {
        totalRevenue: yearlyRevenue,
        totalProfit: yearlyProfit,
        netProfitMargin
      },
      monthlyCashFlow: {
        received: monthlyReceived,
        expected: monthlyExpected,
        recurring: recurringStats.monthlyAmount
      },
      monthlyProfit,
      ownerShares: {
        yearlyKrya: yearlyOwnerShare,
        yearlyKot: yearlyOwnerShare,
        monthlyKrya: monthlyOwnerShare,
        monthlyKot: monthlyOwnerShare
      },
      monthlySales: {
        draftsCount,
        draftsTotal
      },
      leverage: {
        othersProfit: monthlyOthersProfit,
        vikaProfit: monthlyVikaProfit,
        ratio: leverageRatio
      },
      recurringExpected: recurringStats,
      selectedYear,
      selectedMonth,
      availableYears
    };
  }
  async getRecurringExpectedForMonth(year, month) {
    const activeRecurring = await db.select().from(recurringInvoices).where(eq8(recurringInvoices.isActive, true));
    const existingFromRecurring = await db.select({
      recurringInvoiceId: invoices.recurringInvoiceId,
      paymentDate: invoices.paymentDate,
      createdAt: invoices.createdAt
    }).from(invoices).where(and7(
      isNotNull3(invoices.recurringInvoiceId),
      sql5`${invoices.status} != 'cancelled'`
    ));
    const createdKeys = /* @__PURE__ */ new Set();
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
    const advanceByFrequency = (date2, freq, day) => {
      switch (freq) {
        case "monthly":
          return new Date(date2.getFullYear(), date2.getMonth() + 1, day);
        case "quarterly":
          return new Date(date2.getFullYear(), date2.getMonth() + 3, day);
        case "yearly":
          return new Date(date2.getFullYear() + 1, date2.getMonth(), day);
      }
    };
    const generateOccurrences = function* (scheduleStart, frequency, dayOfMonth, rangeStart, rangeEnd, scheduleEnd) {
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
      const scheme = recurring.scheme;
      const partnerCommissionRate = recurring.partnerCommissionRate ? parseNum(recurring.partnerCommissionRate) : void 0;
      const defaultExpenses = parseNum(recurring.defaultExpenses);
      const calculation = calculateInvoiceServer(scheme, amount, partnerCommissionRate, 0, 0, 0, defaultExpenses);
      const expectedProfit = parseNum(calculation.netProfitAdmin);
      if (expectedProfit <= 0) continue;
      const dayOfMonth = parseInt(recurring.dayOfMonth || "1");
      const frequency = recurring.frequency;
      const endDateValue = recurring.endDate ? new Date(recurring.endDate) : null;
      const baseStartDate = recurring.startDate ? new Date(recurring.startDate) : /* @__PURE__ */ new Date();
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
  async getRecurringInvoicesForMonth(year, month) {
    const activeRecurring = await db.select({
      recurring: recurringInvoices,
      clientName: clients.name,
      partnerName: partners.name
    }).from(recurringInvoices).leftJoin(clients, eq8(recurringInvoices.clientId, clients.id)).leftJoin(partners, eq8(recurringInvoices.partnerId, partners.id)).where(eq8(recurringInvoices.isActive, true));
    const existingFromRecurring = await db.select({
      recurringInvoiceId: invoices.recurringInvoiceId,
      paymentDate: invoices.paymentDate,
      createdAt: invoices.createdAt
    }).from(invoices).where(and7(
      isNotNull3(invoices.recurringInvoiceId),
      sql5`${invoices.status} != 'cancelled'`
    ));
    const createdKeys = /* @__PURE__ */ new Set();
    for (const inv of existingFromRecurring) {
      const dateStr = inv.paymentDate || inv.createdAt;
      if (!dateStr || !inv.recurringInvoiceId) continue;
      const d = new Date(dateStr);
      const key = `${inv.recurringInvoiceId}:${d.getFullYear()}-${d.getMonth()}`;
      createdKeys.add(key);
    }
    const result = [];
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);
    const advanceByFrequency = (date2, freq, day) => {
      switch (freq) {
        case "monthly":
          return new Date(date2.getFullYear(), date2.getMonth() + 1, day);
        case "quarterly":
          return new Date(date2.getFullYear(), date2.getMonth() + 3, day);
        case "yearly":
          return new Date(date2.getFullYear() + 1, date2.getMonth(), day);
      }
    };
    const hasOccurrenceInMonth = (scheduleStart, frequency, dayOfMonth, scheduleEnd) => {
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
      const scheme = recurring.scheme;
      const partnerCommissionRate = recurring.partnerCommissionRate ? parseNum(recurring.partnerCommissionRate) : void 0;
      const defaultExpenses = parseNum(recurring.defaultExpenses);
      const calculation = calculateInvoiceServer(scheme, amount, partnerCommissionRate, 0, 0, 0, defaultExpenses);
      const expectedProfit = parseNum(calculation.netProfitAdmin);
      if (expectedProfit <= 0) continue;
      const dayOfMonth = parseInt(recurring.dayOfMonth || "1");
      const frequency = recurring.frequency;
      const endDateValue = recurring.endDate ? new Date(recurring.endDate) : null;
      const baseStartDate = recurring.startDate ? new Date(recurring.startDate) : /* @__PURE__ */ new Date();
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
          scheme
        });
      }
    }
    return result;
  }
  async getCriticalAlerts() {
    const today = /* @__PURE__ */ new Date();
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1e3);
    const alerts = [];
    const allInvoices = await db.select({
      invoice: invoices,
      calculations: invoiceCalculations,
      clientName: clients.name,
      partnerName: partners.name
    }).from(invoices).leftJoin(invoiceCalculations, eq8(invoices.id, invoiceCalculations.invoiceId)).leftJoin(clients, eq8(invoices.clientId, clients.id)).leftJoin(partners, eq8(invoices.partnerId, partners.id));
    for (const row of allInvoices) {
      const { invoice, calculations, clientName, partnerName } = row;
      const clientBill = calculations ? parseNum(calculations.clientBill) : 0;
      if (invoice.status === "sent" && !invoice.actualPaymentDate && invoice.paymentDate) {
        const dueDate = new Date(invoice.paymentDate);
        if (dueDate < today) {
          const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (24 * 60 * 60 * 1e3));
          const severity = daysOverdue > 30 ? "critical" : daysOverdue > 14 ? "high" : "medium";
          alerts.push({
            id: invoice.id,
            type: "overdue",
            severity,
            title: `\u041F\u0440\u043E\u0441\u0440\u043E\u0447\u043A\u0430 ${daysOverdue} ${daysOverdue === 1 ? "\u0434\u0435\u043D\u044C" : "\u0434\u043D\u0435\u0439"}`,
            description: `${invoice.invoiceNumber} \u2022 ${clientName || "N/A"} \u2192 ${partnerName || "N/A"}`,
            amount: clientBill,
            daysCount: daysOverdue,
            invoiceNumber: invoice.invoiceNumber || "",
            clientName: clientName || ""
          });
        }
      }
      if (invoice.status === "draft" && !invoice.paymentDate) {
        alerts.push({
          id: invoice.id,
          type: "draft",
          severity: "medium",
          title: "\u041D\u0435\u0442 \u0434\u0430\u0442\u044B \u043E\u043F\u043B\u0430\u0442\u044B",
          description: `${invoice.invoiceNumber} \u2022 ${clientName || "N/A"}`,
          amount: clientBill,
          invoiceNumber: invoice.invoiceNumber || "",
          clientName: clientName || ""
        });
      }
      if (invoice.status === "sent" && !invoice.actualPaymentDate && invoice.createdAt) {
        const createdAt = new Date(invoice.createdAt);
        if (createdAt < thirtyDaysAgo) {
          const daysWaiting = Math.floor((today.getTime() - createdAt.getTime()) / (24 * 60 * 60 * 1e3));
          alerts.push({
            id: invoice.id,
            type: "long_sent",
            severity: "medium",
            title: `\u0412 \u043E\u0436\u0438\u0434\u0430\u043D\u0438\u0438 ${daysWaiting} \u0434\u043D\u0435\u0439`,
            description: `${invoice.invoiceNumber} \u2022 ${clientName || "N/A"}`,
            amount: clientBill,
            daysCount: daysWaiting,
            invoiceNumber: invoice.invoiceNumber || "",
            clientName: clientName || ""
          });
        }
      }
    }
    alerts.sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2 };
      if (severityOrder[a.severity] !== severityOrder[b.severity]) {
        return severityOrder[a.severity] - severityOrder[b.severity];
      }
      return (b.daysCount || 0) - (a.daysCount || 0);
    });
    return alerts;
  }
  async getAlertCounts(role) {
    const today = /* @__PURE__ */ new Date();
    let overdueCount = 0;
    let pendingCount = 0;
    if (role === "admin" || role === "assistant") {
      const overdueInvoices = await db.select({ id: invoices.id }).from(invoices).where(
        and7(
          eq8(invoices.status, "sent"),
          isNull3(invoices.actualPaymentDate),
          sql5`${invoices.paymentDate} < ${today.toISOString().split("T")[0]}`
        )
      );
      overdueCount = overdueInvoices.length;
    }
    const pendingInvoices = await db.select({ id: invoices.id }).from(invoices).where(eq8(invoices.status, "draft"));
    pendingCount = pendingInvoices.length;
    return {
      overdueInvoices: overdueCount,
      pendingInvoices: pendingCount,
      unresolvedSecurityEvents: 0
      // security_events table not in Neon
    };
  }
  async globalSearch(query, role) {
    const results = [];
    if (role !== "admin" && role !== "assistant") {
      return results;
    }
    const searchPattern = `%${query.toLowerCase()}%`;
    const invoiceResults = await db.select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      clientName: clients.name,
      partnerName: partners.name
    }).from(invoices).leftJoin(clients, eq8(invoices.clientId, clients.id)).leftJoin(partners, eq8(invoices.partnerId, partners.id)).where(sql5`LOWER(${invoices.invoiceNumber}) LIKE ${searchPattern}`).limit(5);
    for (const inv of invoiceResults) {
      results.push({
        id: inv.id,
        type: "invoice",
        title: inv.invoiceNumber || `\u0421\u0447\u0451\u0442 ${inv.id.slice(0, 8)}`,
        subtitle: `${inv.clientName || "\u041A\u043B\u0438\u0435\u043D\u0442"} \u2022 ${inv.partnerName || "\u041F\u0430\u0440\u0442\u043D\u0451\u0440"}`,
        url: `/invoices?invoice=${inv.id}`
      });
    }
    const partnerResults = await db.select({ id: partners.id, name: partners.name }).from(partners).where(sql5`LOWER(${partners.name}) LIKE ${searchPattern}`).limit(5);
    for (const p of partnerResults) {
      results.push({
        id: p.id,
        type: "partner",
        title: p.name,
        url: "/partners"
      });
    }
    const clientResults = await db.select({ id: clients.id, name: clients.name }).from(clients).where(sql5`LOWER(${clients.name}) LIKE ${searchPattern}`).limit(5);
    for (const c of clientResults) {
      results.push({
        id: c.id,
        type: "client",
        title: c.name,
        url: "/clients"
      });
    }
    return results;
  }
  async getPriorityActions() {
    const today = /* @__PURE__ */ new Date();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1e3);
    const actions = [];
    const overdueInvoices = await db.select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      paymentDate: invoices.paymentDate,
      clientName: clients.name,
      clientBill: invoiceCalculations.clientBill
    }).from(invoices).leftJoin(clients, eq8(invoices.clientId, clients.id)).leftJoin(invoiceCalculations, eq8(invoices.id, invoiceCalculations.invoiceId)).where(
      and7(
        eq8(invoices.status, "sent"),
        isNull3(invoices.actualPaymentDate),
        sql5`${invoices.paymentDate} < ${today.toISOString().split("T")[0]}`
      )
    );
    for (const inv of overdueInvoices) {
      const daysOverdue = Math.floor((today.getTime() - new Date(inv.paymentDate).getTime()) / (1e3 * 60 * 60 * 24));
      const clientBill = parseNum(inv.clientBill);
      actions.push({
        id: inv.id,
        type: "overdue",
        priority: daysOverdue * clientBill,
        title: `\u041F\u0440\u043E\u0441\u0440\u043E\u0447\u0435\u043D \u043D\u0430 ${daysOverdue} \u0434\u043D.`,
        description: `\u0421\u0447\u0435\u0442 ${inv.invoiceNumber} \u2022 ${inv.clientName || "N/A"}`,
        amount: clientBill,
        actionType: "mark_paid"
      });
    }
    const draftInvoices = await db.select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      clientName: clients.name,
      clientBill: invoiceCalculations.clientBill
    }).from(invoices).leftJoin(clients, eq8(invoices.clientId, clients.id)).leftJoin(invoiceCalculations, eq8(invoices.id, invoiceCalculations.invoiceId)).where(
      and7(
        eq8(invoices.status, "draft"),
        isNull3(invoices.paymentDate)
      )
    );
    for (const inv of draftInvoices) {
      actions.push({
        id: inv.id,
        type: "draft",
        priority: 50,
        title: "\u0417\u0430\u043F\u043E\u043B\u043D\u0438\u0442\u0435 \u0434\u0430\u0442\u0443 \u043E\u043F\u043B\u0430\u0442\u044B",
        description: `\u0421\u0447\u0435\u0442 ${inv.invoiceNumber} \u2022 ${inv.clientName || "N/A"}`,
        amount: parseNum(inv.clientBill),
        actionType: "edit"
      });
    }
    const longSentInvoices = await db.select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      createdAt: invoices.createdAt,
      clientName: clients.name,
      clientBill: invoiceCalculations.clientBill
    }).from(invoices).leftJoin(clients, eq8(invoices.clientId, clients.id)).leftJoin(invoiceCalculations, eq8(invoices.id, invoiceCalculations.invoiceId)).where(
      and7(
        eq8(invoices.status, "sent"),
        isNull3(invoices.actualPaymentDate),
        sql5`${invoices.createdAt} < ${thirtyDaysAgo.toISOString()}`
      )
    );
    for (const inv of longSentInvoices) {
      const daysWaiting = Math.floor((today.getTime() - new Date(inv.createdAt).getTime()) / (1e3 * 60 * 60 * 24));
      actions.push({
        id: inv.id,
        type: "long_sent",
        priority: daysWaiting,
        title: `\u041E\u0436\u0438\u0434\u0430\u0435\u0442 ${daysWaiting} \u0434\u043D\u0435\u0439`,
        description: `\u0421\u0447\u0435\u0442 ${inv.invoiceNumber} \u2022 ${inv.clientName || "N/A"}`,
        amount: parseNum(inv.clientBill),
        actionType: "remind"
      });
    }
    actions.sort((a, b) => b.priority - a.priority);
    return actions.slice(0, 5);
  }
  async getOverdueInvoicesDetailed() {
    const today = /* @__PURE__ */ new Date();
    const overdueInvoices = await db.select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      paymentDate: invoices.paymentDate,
      priorityLevel: invoices.priorityLevel,
      clientName: clients.name,
      partnerName: partners.name,
      clientBill: invoiceCalculations.clientBill
    }).from(invoices).leftJoin(clients, eq8(invoices.clientId, clients.id)).leftJoin(partners, eq8(invoices.partnerId, partners.id)).leftJoin(invoiceCalculations, eq8(invoices.id, invoiceCalculations.invoiceId)).where(
      and7(
        eq8(invoices.status, "sent"),
        sql5`${invoices.paymentDate} < ${today.toISOString().split("T")[0]}`
      )
    ).orderBy(invoices.paymentDate);
    return overdueInvoices.map((inv) => {
      const paymentDate = new Date(inv.paymentDate);
      const overdueDays = Math.floor((today.getTime() - paymentDate.getTime()) / (1e3 * 60 * 60 * 24));
      return {
        id: inv.id,
        invoice_number: inv.invoiceNumber || "",
        payment_date: inv.paymentDate || "",
        overdue_days: overdueDays,
        priority_level: inv.priorityLevel || "normal",
        client_name: inv.clientName || "",
        partner_name: inv.partnerName || "",
        client_bill: parseNum(inv.clientBill)
      };
    });
  }
  async getPartnerTerms(partnerId) {
    const invoicesData = await db.select({
      scheme: invoices.scheme,
      partnerCommissionRate: invoices.partnerCommissionRate
    }).from(invoices).where(eq8(invoices.partnerId, partnerId));
    const termsMap = /* @__PURE__ */ new Map();
    for (const inv of invoicesData) {
      const key = `${inv.scheme}-${inv.partnerCommissionRate}`;
      if (!termsMap.has(key)) {
        termsMap.set(key, {
          scheme: inv.scheme,
          partnerCommissionRate: inv.partnerCommissionRate
        });
      }
    }
    return Array.from(termsMap.values()).sort((a, b) => a.scheme.localeCompare(b.scheme));
  }
  async getPartnerPayments(partnerId) {
    const partnerInvoices = await db.select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber
    }).from(invoices).where(eq8(invoices.partnerId, partnerId));
    const invoiceMap = /* @__PURE__ */ new Map();
    for (const inv of partnerInvoices) {
      invoiceMap.set(inv.id, inv.invoiceNumber || "");
    }
    const invoiceIds = Array.from(invoiceMap.keys());
    let paymentsData = [];
    if (invoiceIds.length > 0) {
      paymentsData = await db.select().from(partnerPayments).where(
        or3(
          inArray3(partnerPayments.invoiceId, invoiceIds),
          eq8(partnerPayments.partnerId, partnerId)
        )
      ).orderBy(desc6(partnerPayments.paymentDate));
    } else {
      paymentsData = await db.select().from(partnerPayments).where(eq8(partnerPayments.partnerId, partnerId)).orderBy(desc6(partnerPayments.paymentDate));
    }
    const paymentsMap = /* @__PURE__ */ new Map();
    for (const p of paymentsData) {
      if (!paymentsMap.has(p.id)) {
        paymentsMap.set(p.id, {
          id: p.id,
          amount: parseNum(p.amount),
          paymentDate: p.paymentDate,
          notes: p.notes,
          invoiceId: p.invoiceId,
          invoiceNumber: p.invoiceId ? invoiceMap.get(p.invoiceId) || null : null
        });
      }
    }
    return Array.from(paymentsMap.values()).sort(
      (a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime()
    );
  }
  async getClientBudget(clientId) {
    const clientInvoices = await db.select({
      invoice: invoices,
      calculations: invoiceCalculations
    }).from(invoices).leftJoin(invoiceCalculations, eq8(invoices.id, invoiceCalculations.invoiceId)).where(
      and7(
        eq8(invoices.clientId, clientId),
        inArray3(invoices.status, ["sent", "paid"])
      )
    ).orderBy(desc6(invoices.createdAt));
    const partnerIds = [...new Set(clientInvoices.map((i) => i.invoice.partnerId).filter(Boolean))];
    const partnerData = partnerIds.length > 0 ? await db.select().from(partners).where(inArray3(partners.id, partnerIds)) : [];
    const partnerMap = new Map(partnerData.map((p) => [p.id, p.name]));
    const invoiceIds = clientInvoices.map((i) => i.invoice.id);
    const allExpenses = invoiceIds.length > 0 ? await db.select().from(invoiceExpenses).where(inArray3(invoiceExpenses.invoiceId, invoiceIds)) : [];
    const expensesByInvoice = /* @__PURE__ */ new Map();
    for (const exp of allExpenses) {
      if (!expensesByInvoice.has(exp.invoiceId)) {
        expensesByInvoice.set(exp.invoiceId, []);
      }
      expensesByInvoice.get(exp.invoiceId).push({
        description: exp.description || "",
        amount: parseNum(exp.amount),
        date: exp.date || ""
      });
    }
    return clientInvoices.filter((row) => row.calculations?.clientBaseAfterMargin).map((row) => ({
      invoiceId: row.invoice.id,
      invoiceNumber: row.invoice.invoiceNumber || "",
      partnerName: row.invoice.partnerId ? partnerMap.get(row.invoice.partnerId) || "\u2014" : "\u2014",
      totalBudget: parseNum(row.calculations?.clientBaseAfterMargin),
      spent: parseNum(row.calculations?.executorExpensesTotal),
      remaining: parseNum(row.calculations?.clientRemaining),
      expenses: expensesByInvoice.get(row.invoice.id) || []
    }));
  }
  async getPartnerInvoicesDetail(partnerId) {
    const partnerInvoices = await db.select({
      invoice: invoices,
      calculations: invoiceCalculations
    }).from(invoices).leftJoin(invoiceCalculations, eq8(invoices.id, invoiceCalculations.invoiceId)).where(eq8(invoices.partnerId, partnerId)).orderBy(desc6(invoices.createdAt));
    const clientIds = [...new Set(partnerInvoices.map((i) => i.invoice.clientId).filter(Boolean))];
    const clientData = clientIds.length > 0 ? await db.select().from(clients).where(inArray3(clients.id, clientIds)) : [];
    const clientMap = new Map(clientData.map((c) => [c.id, c.name]));
    const invoiceIds = partnerInvoices.map((i) => i.invoice.id);
    const paymentsData = invoiceIds.length > 0 ? await db.select().from(partnerPayments).where(inArray3(partnerPayments.invoiceId, invoiceIds)) : [];
    const paymentsByInvoice = /* @__PURE__ */ new Map();
    for (const p of paymentsData) {
      if (p.invoiceId) {
        const current = paymentsByInvoice.get(p.invoiceId) || 0;
        paymentsByInvoice.set(p.invoiceId, current + parseNum(p.amount));
      }
    }
    return partnerInvoices.map((row) => {
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
        client_name: row.invoice.clientId ? clientMap.get(row.invoice.clientId) || "\u041A\u043B\u0438\u0435\u043D\u0442" : "\u041A\u043B\u0438\u0435\u043D\u0442",
        client_bill: clientBill,
        partner_commission: partnerCommission,
        debt_to_admin: debtToAdmin,
        paid_amount: paidAmount,
        remaining,
        status: row.invoice.status,
        created_at: row.invoice.createdAt || ""
      };
    }).filter((inv) => inv.remaining > 0);
  }
  async getClientAgency30Report(clientId) {
    const agencyInvoices = await db.select({
      calculations: invoiceCalculations
    }).from(invoices).leftJoin(invoiceCalculations, eq8(invoices.id, invoiceCalculations.invoiceId)).where(
      and7(
        eq8(invoices.clientId, clientId),
        inArray3(invoices.scheme, ["agency_30", "agency_40"])
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
      remaining_budget: remainingBudget
    };
  }
  async getAdminMonthlyData(year) {
    const monthNames = [
      "\u042F\u043D\u0432\u0430\u0440\u044C",
      "\u0424\u0435\u0432\u0440\u0430\u043B\u044C",
      "\u041C\u0430\u0440\u0442",
      "\u0410\u043F\u0440\u0435\u043B\u044C",
      "\u041C\u0430\u0439",
      "\u0418\u044E\u043D\u044C",
      "\u0418\u044E\u043B\u044C",
      "\u0410\u0432\u0433\u0443\u0441\u0442",
      "\u0421\u0435\u043D\u0442\u044F\u0431\u0440\u044C",
      "\u041E\u043A\u0442\u044F\u0431\u0440\u044C",
      "\u041D\u043E\u044F\u0431\u0440\u044C",
      "\u0414\u0435\u043A\u0430\u0431\u0440\u044C"
    ];
    const monthlyData = monthNames.map((_, i) => ({
      monthNumber: i + 1,
      totalSales: 0,
      totalProfit: 0,
      invoiceCount: 0,
      expenses: 0
    }));
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31, 23, 59, 59);
    const allInvoices = await db.select({
      invoice: invoices,
      calculations: invoiceCalculations
    }).from(invoices).leftJoin(invoiceCalculations, eq8(invoices.id, invoiceCalculations.invoiceId)).where(eq8(invoices.status, "paid"));
    const allExpenses = await db.select().from(invoiceExpenses);
    const expensesByInvoice = /* @__PURE__ */ new Map();
    for (const exp of allExpenses) {
      const current = expensesByInvoice.get(exp.invoiceId) || 0;
      expensesByInvoice.set(exp.invoiceId, current + parseNum(exp.amount));
    }
    for (const row of allInvoices) {
      if (!row.calculations) continue;
      const paymentDateStr = row.invoice.actualPaymentDate || row.invoice.paymentDate;
      const paymentDate = paymentDateStr ? new Date(paymentDateStr) : null;
      if (!paymentDate || paymentDate < yearStart || paymentDate > yearEnd) continue;
      const monthIndex = paymentDate.getMonth();
      const scheme = row.invoice.scheme;
      const profit = parseNum(row.calculations.netProfitAdmin);
      const clientBill = parseNum(row.calculations.clientBill);
      const invoiceExpenses2 = expensesByInvoice.get(row.invoice.id) || 0;
      monthlyData[monthIndex].totalSales += clientBill;
      monthlyData[monthIndex].totalProfit += profit;
      monthlyData[monthIndex].invoiceCount += 1;
      monthlyData[monthIndex].expenses += invoiceExpenses2;
    }
    return monthlyData;
  }
  async getAdminForecast(monthsAhead) {
    const monthNames = [
      "\u042F\u043D\u0432\u0430\u0440\u044C",
      "\u0424\u0435\u0432\u0440\u0430\u043B\u044C",
      "\u041C\u0430\u0440\u0442",
      "\u0410\u043F\u0440\u0435\u043B\u044C",
      "\u041C\u0430\u0439",
      "\u0418\u044E\u043D\u044C",
      "\u0418\u044E\u043B\u044C",
      "\u0410\u0432\u0433\u0443\u0441\u0442",
      "\u0421\u0435\u043D\u0442\u044F\u0431\u0440\u044C",
      "\u041E\u043A\u0442\u044F\u0431\u0440\u044C",
      "\u041D\u043E\u044F\u0431\u0440\u044C",
      "\u0414\u0435\u043A\u0430\u0431\u0440\u044C"
    ];
    const now = /* @__PURE__ */ new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const forecastData = [];
    for (let i = 0; i < monthsAhead; i++) {
      const targetMonth = (currentMonth + i) % 12;
      const targetYear = currentYear + Math.floor((currentMonth + i) / 12);
      forecastData.push({
        monthIndex: targetMonth + 1,
        monthName: monthNames[targetMonth],
        yearNum: targetYear,
        expectedAmount: 0,
        receivedAmount: 0,
        recurringAmount: 0
      });
    }
    const allInvoices = await db.select({
      invoice: invoices,
      calculations: invoiceCalculations
    }).from(invoices).leftJoin(invoiceCalculations, eq8(invoices.id, invoiceCalculations.invoiceId));
    for (const row of allInvoices) {
      if (!row.calculations) continue;
      const isPaid = row.invoice.status === "paid";
      let dateStr;
      if (isPaid) {
        dateStr = row.invoice.actualPaymentDate || row.invoice.paymentDate;
      } else {
        dateStr = row.invoice.plannedPaymentDate || row.invoice.paymentDate || row.invoice.issueDate;
      }
      const paymentDate = dateStr ? new Date(dateStr) : null;
      if (!paymentDate) continue;
      const paymentMonth = paymentDate.getMonth();
      const paymentYear = paymentDate.getFullYear();
      const profit = parseNum(row.calculations.netProfitAdmin);
      const forecastIndex = forecastData.findIndex(
        (f) => f.monthIndex === paymentMonth + 1 && f.yearNum === paymentYear
      );
      if (forecastIndex === -1) continue;
      if (isPaid) {
        forecastData[forecastIndex].receivedAmount += profit;
      } else if (row.invoice.status === "sent") {
        forecastData[forecastIndex].expectedAmount += profit;
      }
    }
    const activeRecurring = await db.select().from(recurringInvoices).where(eq8(recurringInvoices.isActive, true));
    for (const recurring of activeRecurring) {
      const amount = parseNum(recurring.amount);
      if (amount <= 0) continue;
      const scheme = recurring.scheme;
      const partnerCommissionRate = recurring.partnerCommissionRate ? parseNum(recurring.partnerCommissionRate) : void 0;
      const defaultExpenses = parseNum(recurring.defaultExpenses);
      const calculation = calculateInvoiceServer(scheme, amount, partnerCommissionRate, 0, 0, 0, defaultExpenses);
      const expectedProfit = parseNum(calculation.netProfitAdmin);
      if (expectedProfit <= 0) continue;
      const startDate = recurring.startDate ? new Date(recurring.startDate) : /* @__PURE__ */ new Date();
      const endDateValue = recurring.endDate ? new Date(recurring.endDate) : null;
      const nextInvoiceDateValue = recurring.nextInvoiceDate ? new Date(recurring.nextInvoiceDate) : null;
      const lastForecast = forecastData[forecastData.length - 1];
      const forecastEndDate = new Date(lastForecast.yearNum, lastForecast.monthIndex, 0);
      const dayOfMonth = parseInt(recurring.dayOfMonth || "1");
      const frequency = recurring.frequency;
      let checkDate;
      if (nextInvoiceDateValue && !isNaN(nextInvoiceDateValue.getTime())) {
        checkDate = new Date(nextInvoiceDateValue.getTime());
      } else {
        checkDate = new Date(startDate.getFullYear(), startDate.getMonth(), dayOfMonth);
        if (checkDate < startDate) {
          checkDate.setMonth(checkDate.getMonth() + 1);
        }
      }
      let iterations = 0;
      const maxIterations = 100;
      while (checkDate <= forecastEndDate && iterations < maxIterations) {
        iterations++;
        if (endDateValue && checkDate > endDateValue) break;
        const checkMonth = checkDate.getMonth();
        const checkYear = checkDate.getFullYear();
        const forecastIndex = forecastData.findIndex(
          (f) => f.monthIndex === checkMonth + 1 && f.yearNum === checkYear
        );
        if (forecastIndex !== -1) {
          forecastData[forecastIndex].recurringAmount = (forecastData[forecastIndex].recurringAmount || 0) + expectedProfit;
        }
        const nextYear = checkDate.getFullYear();
        const nextMonth = checkDate.getMonth();
        switch (frequency) {
          case "monthly":
            checkDate = new Date(nextYear, nextMonth + 1, dayOfMonth);
            break;
          case "quarterly":
            checkDate = new Date(nextYear, nextMonth + 3, dayOfMonth);
            break;
          case "yearly":
            checkDate = new Date(nextYear + 1, nextMonth, dayOfMonth);
            break;
        }
      }
    }
    return forecastData;
  }
  async getInvoicesByMonth(month, year, type) {
    const startDateStr = `${year}-${String(month).padStart(2, "0")}-01`;
    const endDate = new Date(year, month, 0);
    const endDateStr = `${year}-${String(month).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;
    const results = await db.select({
      invoice: invoices,
      calculations: invoiceCalculations,
      clientName: clients.name
    }).from(invoices).leftJoin(invoiceCalculations, eq8(invoices.id, invoiceCalculations.invoiceId)).leftJoin(clients, eq8(invoices.clientId, clients.id)).where(
      type === "forecast" ? and7(
        or3(eq8(invoices.status, "sent"), eq8(invoices.status, "paid")),
        sql5`COALESCE(${invoices.actualPaymentDate}::date, ${invoices.paymentDate}::date, ${invoices.plannedPaymentDate}::date, ${invoices.issueDate}::date) >= ${startDateStr}::date`,
        sql5`COALESCE(${invoices.actualPaymentDate}::date, ${invoices.paymentDate}::date, ${invoices.plannedPaymentDate}::date, ${invoices.issueDate}::date) <= ${endDateStr}::date`
      ) : and7(
        eq8(invoices.status, "paid"),
        sql5`COALESCE(${invoices.actualPaymentDate}::date, ${invoices.paymentDate}::date) >= ${startDateStr}::date`,
        sql5`COALESCE(${invoices.actualPaymentDate}::date, ${invoices.paymentDate}::date) <= ${endDateStr}::date`
      )
    );
    return results.map((row) => ({
      id: row.invoice.id,
      invoiceNumber: row.invoice.invoiceNumber,
      clientName: row.clientName,
      clientBill: parseNum(row.calculations?.clientBill),
      netProfitAdmin: parseNum(row.calculations?.netProfitAdmin),
      status: row.invoice.status,
      paymentDate: row.invoice.paymentDate,
      isExpected: row.invoice.status === "sent",
      isPaid: row.invoice.status === "paid"
    }));
  }
  async getOverdueInvoices() {
    const today = /* @__PURE__ */ new Date();
    today.setHours(0, 0, 0, 0);
    const overdueResults = await db.select({
      invoice: invoices,
      calculations: invoiceCalculations,
      clientName: clients.name,
      partnerName: partners.name
    }).from(invoices).leftJoin(invoiceCalculations, eq8(invoices.id, invoiceCalculations.invoiceId)).leftJoin(clients, eq8(invoices.clientId, clients.id)).leftJoin(partners, eq8(invoices.partnerId, partners.id)).where(eq8(invoices.status, "sent"));
    const overdueInvoices = [];
    for (const row of overdueResults) {
      if (!row.invoice.paymentDate) continue;
      const paymentDate = new Date(row.invoice.paymentDate);
      paymentDate.setHours(0, 0, 0, 0);
      if (paymentDate >= today) continue;
      const daysOverdue = Math.floor((today.getTime() - paymentDate.getTime()) / (1e3 * 60 * 60 * 24));
      overdueInvoices.push({
        id: row.invoice.id,
        invoiceNumber: row.invoice.invoiceNumber,
        paymentDate: row.invoice.paymentDate,
        clientName: row.clientName || "\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u043E",
        partnerName: row.partnerName || "\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u043E",
        amount: parseNum(row.calculations?.clientBill),
        daysOverdue
      });
    }
    return overdueInvoices.sort((a, b) => b.daysOverdue - a.daysOverdue);
  }
  async getPartnerDebtDetails(partnerId) {
    const partnerInvoices = await db.select({
      invoice: invoices,
      calculations: invoiceCalculations
    }).from(invoices).leftJoin(invoiceCalculations, eq8(invoices.id, invoiceCalculations.invoiceId)).where(and7(
      eq8(invoices.partnerId, partnerId),
      eq8(invoices.status, "paid")
    ));
    const allExpenses = await db.select().from(invoiceExpenses);
    const expensesByInvoice = /* @__PURE__ */ new Map();
    for (const exp of allExpenses) {
      if (!expensesByInvoice.has(exp.invoiceId)) {
        expensesByInvoice.set(exp.invoiceId, { byPartner: 0, byAdmin: 0 });
      }
      const amounts = expensesByInvoice.get(exp.invoiceId);
      const amount = parseNum(exp.amount);
      if (exp.paidByAdmin) {
        amounts.byAdmin += amount;
      } else {
        amounts.byPartner += amount;
      }
    }
    const partnerPaymentsList = await db.select().from(partnerPayments).where(eq8(partnerPayments.partnerId, partnerId)).orderBy(partnerPayments.paymentDate);
    let totalDebt = 0;
    const invoiceDetails = [];
    for (const row of partnerInvoices) {
      if (!row.calculations) continue;
      const scheme = row.invoice.scheme;
      const cBill = parseNum(row.calculations.clientBill);
      const expenses = expensesByInvoice.get(row.invoice.id) || { byPartner: 0, byAdmin: 0 };
      const storedDebt = parseNum(row.calculations.partnerTransferDue);
      const partnerCommission = parseNum(row.calculations.commissionAmount);
      const debt = Math.max(0, storedDebt);
      totalDebt += debt;
      invoiceDetails.push({
        id: row.invoice.id,
        invoiceNumber: row.invoice.invoiceNumber,
        scheme,
        clientBill: cBill,
        partnerCommission,
        amountToAdmin: debt,
        expensesByPartner: expenses.byPartner,
        expensesByAdmin: expenses.byAdmin
      });
    }
    const totalPaid = partnerPaymentsList.reduce((sum2, p) => sum2 + parseNum(p.amount), 0);
    const paymentDetails = await Promise.all(
      partnerPaymentsList.map(async (p) => {
        let invoiceNumber = null;
        if (p.invoiceId) {
          const inv = await db.select({ invoiceNumber: invoices.invoiceNumber }).from(invoices).where(eq8(invoices.id, p.invoiceId)).limit(1);
          invoiceNumber = inv[0]?.invoiceNumber || null;
        }
        return {
          id: p.id,
          amount: p.amount,
          paymentDate: p.paymentDate,
          notes: p.notes,
          invoiceNumber
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
        invoiceCount: invoiceDetails.length
      },
      invoices: invoiceDetails,
      payments: paymentDetails
    };
  }
  async getAdminPlanFact(year) {
    const monthNames = [
      "\u042F\u043D\u0432\u0430\u0440\u044C",
      "\u0424\u0435\u0432\u0440\u0430\u043B\u044C",
      "\u041C\u0430\u0440\u0442",
      "\u0410\u043F\u0440\u0435\u043B\u044C",
      "\u041C\u0430\u0439",
      "\u0418\u044E\u043D\u044C",
      "\u0418\u044E\u043B\u044C",
      "\u0410\u0432\u0433\u0443\u0441\u0442",
      "\u0421\u0435\u043D\u0442\u044F\u0431\u0440\u044C",
      "\u041E\u043A\u0442\u044F\u0431\u0440\u044C",
      "\u041D\u043E\u044F\u0431\u0440\u044C",
      "\u0414\u0435\u043A\u0430\u0431\u0440\u044C"
    ];
    const planFactData = monthNames.map((name, i) => ({
      monthNumber: i + 1,
      monthName: name,
      salesTarget: 0,
      receiptsTarget: 0,
      actualSales: 0,
      actualReceipts: 0
    }));
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31, 23, 59, 59);
    const plans = await this.getMonthlyPlans(year);
    for (const plan of plans) {
      const monthIndex = parseInt(plan.month) - 1;
      if (monthIndex >= 0 && monthIndex < 12) {
        planFactData[monthIndex].salesTarget = parseNum(plan.salesTarget);
        planFactData[monthIndex].receiptsTarget = parseNum(plan.receiptsTarget);
      }
    }
    const sentOrPaidInvoices = await db.select({
      invoice: invoices,
      calculations: invoiceCalculations
    }).from(invoices).leftJoin(invoiceCalculations, eq8(invoices.id, invoiceCalculations.invoiceId)).where(
      sql5`${invoices.status} IN ('sent', 'paid')`
    );
    for (const row of sentOrPaidInvoices) {
      if (!row.calculations) continue;
      const clientBill = parseNum(row.calculations.clientBill);
      const createdDate = row.invoice.createdAt ? new Date(row.invoice.createdAt) : null;
      if (createdDate && createdDate >= yearStart && createdDate <= yearEnd) {
        const salesMonth = createdDate.getMonth();
        planFactData[salesMonth].actualSales += clientBill;
      }
      if (row.invoice.status === "paid" && row.invoice.paymentDate) {
        const paymentDate = new Date(row.invoice.paymentDate);
        if (paymentDate >= yearStart && paymentDate <= yearEnd) {
          const receiptMonth = paymentDate.getMonth();
          planFactData[receiptMonth].actualReceipts += clientBill;
        }
      }
    }
    return planFactData;
  }
  async getMonthlyPlans(year) {
    return await db.select().from(monthlyFinancialPlans).where(eq8(monthlyFinancialPlans.year, year.toString())).orderBy(monthlyFinancialPlans.month);
  }
  async getMonthlyPlan(year, month) {
    const [plan] = await db.select().from(monthlyFinancialPlans).where(and7(
      eq8(monthlyFinancialPlans.year, year.toString()),
      eq8(monthlyFinancialPlans.month, month.toString())
    )).limit(1);
    return plan || null;
  }
  async upsertMonthlyPlan(input) {
    const existing = await this.getMonthlyPlan(input.year, input.month);
    if (existing) {
      const [updated] = await db.update(monthlyFinancialPlans).set({
        salesTarget: input.salesTarget?.toString() || existing.salesTarget,
        profitTarget: input.profitTarget?.toString() || existing.profitTarget,
        receiptsTarget: input.receiptsTarget?.toString() || existing.receiptsTarget,
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq8(monthlyFinancialPlans.id, existing.id)).returning();
      return updated;
    } else {
      const [created] = await db.insert(monthlyFinancialPlans).values({
        year: input.year.toString(),
        month: input.month.toString(),
        salesTarget: input.salesTarget?.toString() || "0",
        profitTarget: input.profitTarget?.toString() || "0",
        receiptsTarget: input.receiptsTarget?.toString() || "0"
      }).returning();
      return created;
    }
  }
  async recalculateAllInvoices() {
    return recalculateAllInvoices(db);
  }
  // Signed Acts methods
  async createSignedAct(act) {
    return createSignedAct(db, act);
  }
  async getSignedActsByInvoice(invoiceId, actType) {
    return getSignedActsByInvoice(db, invoiceId, actType);
  }
  async getSignedAct(id) {
    return getSignedAct(db, id);
  }
  async deleteSignedAct(id) {
    return deleteSignedAct(db, id);
  }
  async getActsStatistics(excludeHidden = false) {
    return getActsStatistics(db, excludeHidden);
  }
  async getAssistantStats() {
    return getAssistantStats(db);
  }
  async getAssistantBonusPayments() {
    return getAssistantBonusPayments(db);
  }
  async createAssistantBonusPayment(payment) {
    return createAssistantBonusPayment(db, payment);
  }
  async getUnpaidBonusTotal() {
    return getUnpaidBonusTotal(db);
  }
  async markBonusesAsPaid(invoiceIds) {
    return markBonusesAsPaid(db, invoiceIds);
  }
  async getDraftsStats() {
    const now = /* @__PURE__ */ new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const draftInvoices = await db.select({
      invoice: invoices,
      calculations: invoiceCalculations
    }).from(invoices).leftJoin(invoiceCalculations, eq8(invoices.id, invoiceCalculations.invoiceId)).where(eq8(invoices.status, "draft"));
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
      fromRecurringAmount
    };
  }
  async getRecurringInvoices() {
    return getRecurringInvoices(db);
  }
  async getRecurringInvoice(id) {
    return getRecurringInvoice(db, id);
  }
  async createRecurringInvoice(data) {
    return createRecurringInvoice(db, data);
  }
  async getDueRecurringInvoices(upToDate) {
    return getDueRecurringInvoices(db, upToDate);
  }
  async getActiveRecurringInvoicesForCashFlow() {
    return getActiveRecurringInvoicesForCashFlow(db);
  }
  async generateInvoiceNumber() {
    return generateInvoiceNumber(db);
  }
  async createDraftFromRecurring(recurringId, invoiceDate) {
    return createDraftFromRecurring(db, recurringId, invoiceDate);
  }
  async processAllDueRecurringInvoices() {
    return processAllDueRecurringInvoices(db);
  }
  async generateBackdatedInvoices(recurringId, fromDate) {
    return generateBackdatedInvoices(db, recurringId, fromDate);
  }
  async updateRecurringInvoice(id, data) {
    return updateRecurringInvoice(db, id, data);
  }
  async deleteRecurringInvoice(id) {
    return deleteRecurringInvoice(db, id);
  }
  async getPartnerClientStats(partnerId, year) {
    const monthNames = [
      "\u042F\u043D\u0432\u0430\u0440\u044C",
      "\u0424\u0435\u0432\u0440\u0430\u043B\u044C",
      "\u041C\u0430\u0440\u0442",
      "\u0410\u043F\u0440\u0435\u043B\u044C",
      "\u041C\u0430\u0439",
      "\u0418\u044E\u043D\u044C",
      "\u0418\u044E\u043B\u044C",
      "\u0410\u0432\u0433\u0443\u0441\u0442",
      "\u0421\u0435\u043D\u0442\u044F\u0431\u0440\u044C",
      "\u041E\u043A\u0442\u044F\u0431\u0440\u044C",
      "\u041D\u043E\u044F\u0431\u0440\u044C",
      "\u0414\u0435\u043A\u0430\u0431\u0440\u044C"
    ];
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31, 23, 59, 59);
    const partnerInvoices = await db.select({
      invoice: invoices,
      calculations: invoiceCalculations,
      clientName: clients.name
    }).from(invoices).leftJoin(invoiceCalculations, eq8(invoices.id, invoiceCalculations.invoiceId)).leftJoin(clients, eq8(invoices.clientId, clients.id)).where(and7(
      eq8(invoices.partnerId, partnerId),
      eq8(invoices.status, "paid"),
      gte2(invoices.actualPaymentDate, yearStart.toISOString().split("T")[0])
    ));
    const statsMap = /* @__PURE__ */ new Map();
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
      if (scheme === "agency_30" || scheme === "agency_40") {
        commission = parseNum(row.calculations.partnerShareFromMargin);
        const clientPercent = scheme === "agency_40" ? 0.6 : 0.7;
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
          clientName: row.clientName || "Unknown",
          month,
          monthName: monthNames[month],
          clientBill: 0,
          partnerCommission: 0,
          clientRemaining: 0,
          invoiceCount: 0
        });
      }
      const stats = statsMap.get(key);
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
  async getPartnerDocumentRisk(partnerId) {
    const paidInvoices = await db.select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber
    }).from(invoices).where(and7(
      eq8(invoices.partnerId, partnerId),
      eq8(invoices.status, "paid")
    ));
    if (paidInvoices.length === 0) {
      return { status: "green", missingActsCount: 0, missingActsInvoices: [] };
    }
    const invoiceIds = paidInvoices.map((i) => i.id);
    const acts = await db.select({
      invoiceId: signedActs.invoiceId
    }).from(signedActs).where(inArray3(signedActs.invoiceId, invoiceIds));
    const invoicesWithActs = new Set(acts.map((a) => a.invoiceId));
    const missingActs = paidInvoices.filter((i) => !invoicesWithActs.has(i.id));
    return {
      status: missingActs.length > 0 ? "red" : "green",
      missingActsCount: missingActs.length,
      missingActsInvoices: missingActs.map((i) => ({
        id: i.id,
        invoiceNumber: i.invoiceNumber || "Unknown"
      }))
    };
  }
  async getPartnerAgency30Funds(partnerId) {
    const agencyInvoices = await db.select({
      invoice: invoices,
      calculations: invoiceCalculations,
      clientName: clients.name
    }).from(invoices).leftJoin(invoiceCalculations, eq8(invoices.id, invoiceCalculations.invoiceId)).leftJoin(clients, eq8(invoices.clientId, clients.id)).where(and7(
      eq8(invoices.partnerId, partnerId),
      inArray3(invoices.scheme, ["agency_30", "agency_40"]),
      inArray3(invoices.status, ["paid", "sent"])
    ));
    const clientMap = /* @__PURE__ */ new Map();
    for (const row of agencyInvoices) {
      if (!row.invoice.clientId || !row.calculations) continue;
      const clientId = row.invoice.clientId;
      const clientName = row.clientName || "Unknown";
      const clientBill = parseNum(row.calculations.clientBill);
      const executorExpenses = parseNum(row.calculations.executorExpensesTotal);
      const scheme = row.invoice.scheme;
      const clientBaseRate = scheme === "agency_40" ? 0.6 : 0.7;
      const clientBase = parseNum(row.calculations.clientBaseAfterMargin) || clientBill * clientBaseRate;
      if (!clientMap.has(clientId)) {
        clientMap.set(clientId, {
          clientId,
          clientName,
          totalBudget: 0,
          totalSpent: 0,
          remaining: 0,
          invoiceCount: 0
        });
      }
      const summary = clientMap.get(clientId);
      summary.totalBudget += clientBase;
      summary.totalSpent += executorExpenses;
      summary.invoiceCount += 1;
    }
    return Array.from(clientMap.values()).map((s) => ({
      ...s,
      remaining: Math.max(0, s.totalBudget - s.totalSpent)
    })).filter((s) => s.totalBudget > 0).sort((a, b) => b.remaining - a.remaining);
  }
  async getPartnerHeroMetrics(partnerId) {
    const currentYear = (/* @__PURE__ */ new Date()).getFullYear();
    const yearStart = new Date(currentYear, 0, 1);
    const partnerInvoices = await db.select({
      invoice: invoices,
      calculations: invoiceCalculations
    }).from(invoices).leftJoin(invoiceCalculations, eq8(invoices.id, invoiceCalculations.invoiceId)).where(and7(
      eq8(invoices.partnerId, partnerId),
      eq8(invoices.status, "paid"),
      sql5`${invoices.createdAt} >= ${yearStart.toISOString()}`
    ));
    const allPartnerInvoices = await db.select({
      invoice: invoices,
      calculations: invoiceCalculations
    }).from(invoices).leftJoin(invoiceCalculations, eq8(invoices.id, invoiceCalculations.invoiceId)).where(and7(
      eq8(invoices.partnerId, partnerId),
      eq8(invoices.status, "paid")
    ));
    let debtToAdmin = 0;
    let reservedForExpenses = 0;
    let yearlyCommission = 0;
    const invoicesWithDebt = [];
    for (const row of allPartnerInvoices) {
      if (!row.calculations) continue;
      const partnerTransferDue = parseNum(row.calculations.partnerTransferDue);
      const plannedExpenses = parseNum(row.calculations.plannedExpenses);
      const expensesPaidByPartner = parseNum(row.calculations.expensesPaidByPartner);
      if (partnerTransferDue > 0) {
        debtToAdmin += partnerTransferDue;
        invoicesWithDebt.push({
          id: row.invoice.id,
          number: row.invoice.invoiceNumber || `INV-${row.invoice.id}`,
          amount: partnerTransferDue
        });
      }
      if (plannedExpenses > 0) {
        const reserved = Math.max(0, plannedExpenses - expensesPaidByPartner);
        reservedForExpenses += reserved;
      }
    }
    for (const row of partnerInvoices) {
      if (!row.calculations) continue;
      const commission = parseNum(row.calculations.partnerCommission);
      yearlyCommission += commission;
    }
    const payments = await db.select().from(partnerPayments).where(eq8(partnerPayments.partnerId, partnerId));
    const totalPaid = payments.reduce((sum2, p) => sum2 + parseNum(p.amount), 0);
    debtToAdmin = Math.max(0, debtToAdmin - totalPaid);
    const paidInvoiceIds = allPartnerInvoices.map((r) => r.invoice.id);
    let signedActsCount = 0;
    if (paidInvoiceIds.length > 0) {
      const actsResult = await db.select({ count: sql5`count(*)` }).from(signedActs).where(inArray3(signedActs.invoiceId, paidInvoiceIds));
      signedActsCount = Number(actsResult[0]?.count || 0);
    }
    return {
      debtToAdmin,
      reservedForExpenses,
      yearlyCommission,
      signedActsCount,
      totalPaidInvoices: allPartnerInvoices.length,
      invoicesWithDebt
    };
  }
  async getWorkingCapital() {
    return {
      id: "wc-1",
      amount: 0,
      notes: "\u0414\u0430\u043D\u043D\u044B\u0435 \u0432\u0440\u0435\u043C\u0435\u043D\u043D\u043E \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B - \u0442\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F \u043C\u0438\u0433\u0440\u0430\u0446\u0438\u044F \u0442\u0430\u0431\u043B\u0438\u0446\u044B",
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  async updateWorkingCapital(amount, notes, updatedBy) {
    return {
      id: "wc-1",
      amount,
      notes,
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  async getClientLTV(year) {
    const allInvoices = await db.select({
      invoice: invoices,
      calculations: invoiceCalculations,
      clientName: clients.name
    }).from(invoices).leftJoin(invoiceCalculations, eq8(invoices.id, invoiceCalculations.invoiceId)).leftJoin(clients, eq8(invoices.clientId, clients.id)).where(isNotNull3(invoices.clientId));
    const yearsSet = /* @__PURE__ */ new Set();
    for (const row of allInvoices) {
      if (row.invoice.status === "paid") {
        const dateStr = row.invoice.paymentDate || row.invoice.createdAt;
        if (dateStr) {
          yearsSet.add(new Date(dateStr).getFullYear());
        }
      }
    }
    const availableYears = Array.from(yearsSet).sort((a, b) => b - a);
    let yearStart = null;
    let yearEnd = null;
    if (year !== void 0) {
      yearStart = new Date(year, 0, 1);
      yearEnd = new Date(year, 11, 31, 23, 59, 59);
    }
    const clientMap = /* @__PURE__ */ new Map();
    for (const row of allInvoices) {
      if (!row.invoice.clientId) continue;
      const clientId = row.invoice.clientId;
      const clientName = row.clientName || "\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u044B\u0439 \u043A\u043B\u0438\u0435\u043D\u0442";
      const adminProfit = parseNum(row.calculations?.netProfitAdmin);
      const isPaid = row.invoice.status === "paid";
      const isSent = row.invoice.status === "sent";
      const paymentDateStr = row.invoice.paymentDate || row.invoice.createdAt;
      const paymentDate = paymentDateStr ? new Date(paymentDateStr) : null;
      if (year !== void 0 && yearStart && yearEnd && isPaid) {
        if (!paymentDate || paymentDate < yearStart || paymentDate > yearEnd) {
          continue;
        }
      }
      if (!clientMap.has(clientId)) {
        clientMap.set(clientId, {
          client_id: clientId,
          client_name: clientName,
          total_invoices: 0,
          paid_invoices: 0,
          total_admin_profit: 0,
          potential_profit: 0
        });
      }
      const client = clientMap.get(clientId);
      client.total_invoices += 1;
      if (isPaid) {
        client.paid_invoices += 1;
        client.total_admin_profit += adminProfit;
      } else if (isSent) {
        client.potential_profit += adminProfit;
      }
    }
    let data = Array.from(clientMap.values());
    if (year !== void 0) {
      data = data.filter((c) => c.paid_invoices > 0 || c.potential_profit > 0);
    }
    data.sort((a, b) => b.total_admin_profit - a.total_admin_profit);
    return { data, availableYears };
  }
  async getDashboardInvoices(year, month, category) {
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0, 23, 59, 59);
    const allInvoices = await db.select({
      invoice: invoices,
      calculations: invoiceCalculations,
      clientName: clients.name
    }).from(invoices).leftJoin(invoiceCalculations, eq8(invoices.id, invoiceCalculations.invoiceId)).leftJoin(clients, eq8(invoices.clientId, clients.id));
    const result = [];
    for (const row of allInvoices) {
      if (!row.calculations) continue;
      const status = row.invoice.status;
      const netProfitAdmin = parseNum(row.calculations.netProfitAdmin);
      const clientBill = parseNum(row.calculations.clientBill);
      if (category === "received") {
        if (status !== "paid") continue;
        const paymentDateStr = row.invoice.paymentDate ? row.invoice.paymentDate : row.invoice.createdAt ? row.invoice.createdAt : null;
        const paymentDate = paymentDateStr ? new Date(paymentDateStr) : null;
        if (!paymentDate || paymentDate < monthStart || paymentDate > monthEnd) continue;
        result.push({
          id: row.invoice.id,
          invoiceNumber: row.invoice.invoiceNumber || `INV-${row.invoice.id}`,
          clientName: row.clientName,
          netProfitAdmin,
          clientBill,
          status,
          paymentDate: paymentDateStr?.toString() || null
        });
      } else if (category === "expected") {
        if (status === "paid" || status === "cancelled") continue;
        const paymentDateStr = row.invoice.paymentDate ? row.invoice.paymentDate : row.invoice.createdAt ? row.invoice.createdAt : null;
        const paymentDate = paymentDateStr ? new Date(paymentDateStr) : null;
        if (!paymentDate || paymentDate < monthStart || paymentDate > monthEnd) continue;
        result.push({
          id: row.invoice.id,
          invoiceNumber: row.invoice.invoiceNumber || `INV-${row.invoice.id}`,
          clientName: row.clientName,
          netProfitAdmin,
          clientBill,
          status,
          paymentDate: paymentDateStr?.toString() || null
        });
      } else if (category === "drafts") {
        if (status === "cancelled") continue;
        if (row.invoice.recurringInvoiceId) continue;
        const createdAt = row.invoice.createdAt ? new Date(row.invoice.createdAt) : null;
        if (!createdAt || createdAt < monthStart || createdAt > monthEnd) continue;
        result.push({
          id: row.invoice.id,
          invoiceNumber: row.invoice.invoiceNumber || `INV-${row.invoice.id}`,
          clientName: row.clientName,
          netProfitAdmin,
          clientBill,
          status,
          paymentDate: null
        });
      }
    }
    return result.sort((a, b) => b.netProfitAdmin - a.netProfitAdmin);
  }
  async logAssistantAction(log) {
    return logAssistantAction(db, log);
  }
  async getAssistantActionLogs(filters) {
    return getAssistantActionLogs(db, filters);
  }
};
var storage = new DatabaseStorage();

// server/middleware.ts
var SESSION_COOKIE = "session_id";
async function authMiddleware(req, res, next) {
  const sessionId = req.cookies[SESSION_COOKIE];
  if (!sessionId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  const csrfToken = req.headers["x-csrf-token"];
  const isModifying = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method);
  const result = await storage.validateSession(sessionId, isModifying ? csrfToken : void 0);
  if (!result?.isValid || !result.token) {
    res.clearCookie(SESSION_COOKIE);
    return res.status(401).json({ error: "Session expired" });
  }
  req.user = {
    token: result.token,
    role: result.token.role,
    partnerId: result.token.partnerId || void 0,
    clientId: result.token.clientId || void 0
  };
  next();
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}

// server/rateLimiter.ts
import { sql as sql6 } from "drizzle-orm";
var MAX_LOGIN_ATTEMPTS = 5;
var LOCKOUT_DURATION_MS = 15 * 60 * 1e3;
var ATTEMPT_WINDOW_MS = 60 * 60 * 1e3;
async function getRow(code) {
  const rows = await db.execute(
    sql6`SELECT attempt_count, last_attempt, locked_until
        FROM login_rate_limits
        WHERE code = ${code.toUpperCase()}`
  );
  return rows.rows[0] ?? null;
}
async function getLoginAttemptStatus(code) {
  const now = Date.now();
  const row = await getRow(code);
  if (!row) {
    return { isLocked: false, attemptsRemaining: MAX_LOGIN_ATTEMPTS };
  }
  const lastAttempt = Number(row.last_attempt);
  const lockedUntil = row.locked_until ? Number(row.locked_until) : null;
  if (lockedUntil && now < lockedUntil) {
    return { isLocked: true, attemptsRemaining: 0, lockedUntil };
  }
  if (lockedUntil && now >= lockedUntil || now - lastAttempt > ATTEMPT_WINDOW_MS) {
    await db.execute(sql6`DELETE FROM login_rate_limits WHERE code = ${code.toUpperCase()}`);
    return { isLocked: false, attemptsRemaining: MAX_LOGIN_ATTEMPTS };
  }
  return {
    isLocked: false,
    attemptsRemaining: Math.max(0, MAX_LOGIN_ATTEMPTS - row.attempt_count)
  };
}
async function recordFailedLogin(code) {
  const upper = code.toUpperCase();
  const now = Date.now();
  const row = await getRow(upper);
  let newCount = 1;
  let lockedUntil = null;
  if (row) {
    const lastAttempt = Number(row.last_attempt);
    newCount = now - lastAttempt > ATTEMPT_WINDOW_MS ? 1 : row.attempt_count + 1;
  }
  if (newCount >= MAX_LOGIN_ATTEMPTS) {
    lockedUntil = now + LOCKOUT_DURATION_MS;
  }
  await db.execute(
    sql6`INSERT INTO login_rate_limits (code, attempt_count, last_attempt, locked_until)
        VALUES (${upper}, ${newCount}, ${now}, ${lockedUntil})
        ON CONFLICT (code) DO UPDATE SET
          attempt_count = ${newCount},
          last_attempt  = ${now},
          locked_until  = ${lockedUntil}`
  );
  return {
    attemptsRemaining: Math.max(0, MAX_LOGIN_ATTEMPTS - newCount),
    lockedUntil: lockedUntil ?? void 0
  };
}
async function clearLoginAttempts(code) {
  const result = await db.execute(
    sql6`DELETE FROM login_rate_limits WHERE code = ${code.toUpperCase()}`
  );
  return (result.rowCount ?? 0) > 0;
}
async function clearAllLoginAttempts() {
  const result = await db.execute(sql6`DELETE FROM login_rate_limits`);
  return result.rowCount ?? 0;
}
async function getLockedCodes() {
  const now = Date.now();
  const rows = await db.execute(
    sql6`SELECT code, locked_until, attempt_count
        FROM login_rate_limits
        WHERE locked_until IS NOT NULL AND locked_until > ${now}`
  );
  return rows.rows.map((r) => ({
    code: r.code,
    lockedUntil: Number(r.locked_until),
    attempts: r.attempt_count
  }));
}

// server/routes/auth.ts
var authRouter = Router();
authRouter.post("/api/admin/unlock-user", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: "Code is required" });
    const cleared = await clearLoginAttempts(code);
    res.json({
      success: true,
      message: cleared ? `Unlocked code: ${code.toUpperCase()}` : `Code ${code.toUpperCase()} was not locked`
    });
  } catch (error) {
    console.error("Unlock user error:", error);
    res.status(500).json({ error: "Failed to unlock user" });
  }
});
authRouter.get("/api/admin/locked-codes", authMiddleware, requireRole("admin"), async (_req, res) => {
  try {
    const locked = await getLockedCodes();
    res.json({ locked, count: locked.length });
  } catch (error) {
    console.error("Get locked codes error:", error);
    res.status(500).json({ error: "Failed to get locked codes" });
  }
});
authRouter.post("/api/admin/clear-all-lockouts", authMiddleware, requireRole("admin"), async (_req, res) => {
  try {
    const count2 = await clearAllLoginAttempts();
    res.json({ success: true, message: `Cleared ${count2} login attempt records` });
  } catch (error) {
    console.error("Clear all lockouts error:", error);
    res.status(500).json({ error: "Failed to clear lockouts" });
  }
});
authRouter.post("/api/auth/login", async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ success: false, error: "missing_code", message: "\u041A\u043E\u0434 \u0434\u043E\u0441\u0442\u0443\u043F\u0430 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u0435\u043D" });
    }
    const attemptStatus = await getLoginAttemptStatus(code);
    if (attemptStatus.isLocked) {
      return res.status(429).json({
        success: false,
        error: "account_locked",
        message: "\u0421\u043B\u0438\u0448\u043A\u043E\u043C \u043C\u043D\u043E\u0433\u043E \u043D\u0435\u0443\u0434\u0430\u0447\u043D\u044B\u0445 \u043F\u043E\u043F\u044B\u0442\u043E\u043A. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u043F\u043E\u0437\u0436\u0435.",
        locked_until: new Date(attemptStatus.lockedUntil).toISOString(),
        attempts_remaining: 0
      });
    }
    const token = await storage.verifyAccessCode(code);
    if (!token) {
      const result = await recordFailedLogin(code);
      return res.status(401).json({
        success: false,
        error: "invalid_code",
        message: "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u043A\u043E\u0434 \u0434\u043E\u0441\u0442\u0443\u043F\u0430",
        attempts_remaining: result.attemptsRemaining,
        locked_until: result.lockedUntil ? new Date(result.lockedUntil).toISOString() : void 0
      });
    }
    await clearLoginAttempts(code);
    const session = await storage.createSession(token.id, req.ip, req.headers["user-agent"]);
    const isProxied = req.headers["x-forwarded-proto"] === "https";
    const isSecure = isProxied || req.secure;
    res.cookie(SESSION_COOKIE, session.sessionId, {
      httpOnly: true,
      secure: isSecure,
      sameSite: isSecure ? "none" : "lax",
      maxAge: 30 * 60 * 1e3,
      path: "/"
    });
    res.json({ success: true, csrfToken: session.csrfToken, user: { role: token.role, partnerId: token.partnerId, clientId: token.clientId } });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ success: false, error: "server_error", message: "\u041E\u0448\u0438\u0431\u043A\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0430 \u043F\u0440\u0438 \u0432\u0445\u043E\u0434\u0435" });
  }
});
authRouter.post("/api/auth/logout", async (req, res) => {
  const sessionId = req.cookies[SESSION_COOKIE];
  if (sessionId) await storage.revokeSession(sessionId);
  res.clearCookie(SESSION_COOKIE);
  res.json({ success: true });
});
authRouter.get("/api/auth/validate", async (req, res) => {
  const sessionId = req.cookies[SESSION_COOKIE];
  if (!sessionId) return res.json({ valid: false });
  const result = await storage.validateSession(sessionId);
  if (!result?.isValid || !result.token) {
    res.clearCookie(SESSION_COOKIE);
    return res.json({ valid: false });
  }
  res.json({ valid: true, user: { role: result.token.role, partnerId: result.token.partnerId, clientId: result.token.clientId } });
});
authRouter.post("/api/auth/refresh", async (req, res) => {
  const sessionId = req.cookies[SESSION_COOKIE];
  if (!sessionId) return res.status(401).json({ error: "Not authenticated" });
  const newExpiresAt = await storage.refreshSession(sessionId);
  if (!newExpiresAt) {
    res.clearCookie(SESSION_COOKIE);
    return res.status(401).json({ error: "Session expired" });
  }
  const isProxied = req.headers["x-forwarded-proto"] === "https";
  const isSecure = isProxied || req.secure;
  res.cookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: isSecure,
    sameSite: isSecure ? "none" : "lax",
    maxAge: 30 * 60 * 1e3,
    path: "/"
  });
  res.json({ success: true, expiresAt: newExpiresAt });
});

// server/routes/clients.ts
import { Router as Router2 } from "express";

// server/permissions.ts
var ROLE_INVOICE_PERMISSIONS = {
  admin: [
    "id",
    "invoiceNumber",
    "partnerId",
    "clientId",
    "status",
    "description",
    "clientBill",
    "scheme",
    "createdAt",
    "updatedAt",
    "createdBy",
    "paymentDate",
    "actualPaymentDate",
    "issueDate",
    "notes",
    "hideFromAssistant",
    "plannedExpenses",
    "closingDocumentUrl"
  ],
  partner: [
    "id",
    "invoiceNumber",
    "clientId",
    "status",
    "description",
    "clientBill",
    "scheme",
    "createdAt",
    "updatedAt",
    "paymentDate",
    "actualPaymentDate",
    "issueDate",
    "notes",
    "plannedExpenses"
  ],
  client: [
    "id",
    "invoiceNumber",
    "status",
    "description",
    "clientBill",
    "scheme",
    "createdAt",
    "updatedAt",
    "paymentDate",
    "actualPaymentDate",
    "issueDate",
    "notes"
  ],
  assistant: [
    "id",
    "invoiceNumber",
    "clientId",
    "status",
    "description",
    "clientBill",
    "createdAt",
    "updatedAt",
    "createdBy",
    "paymentDate",
    "actualPaymentDate",
    "issueDate",
    "notes",
    "scheme",
    "plannedExpenses"
  ],
  accountant: [
    "id",
    "invoiceNumber",
    "clientId",
    "status",
    "description",
    "clientBill",
    "createdAt",
    "updatedAt",
    "createdBy",
    "paymentDate",
    "actualPaymentDate",
    "issueDate",
    "notes",
    "scheme",
    "plannedExpenses",
    "closingDocumentUrl"
  ]
};
var ROLE_CALCULATION_PERMISSIONS = {
  admin: [
    "id",
    "invoiceId",
    "clientBill",
    "commissionRate",
    "commissionAmount",
    "amountToAdmin",
    "agencyMargin",
    "partnerShareFromMargin",
    "adminShareFromMargin",
    "clientBaseAfterMargin",
    "clientSpent",
    "clientRemaining",
    "executorExpensesTotal",
    "partnerTransferDue",
    "netProfitAdmin",
    "adminShare50",
    "catShare50",
    "assistantBonusActs",
    "assistantBonusPaid"
  ],
  partner: [
    "id",
    "invoiceId",
    "clientBill",
    "commissionRate",
    "commissionAmount",
    "amountToAdmin",
    "agencyMargin",
    "partnerShareFromMargin",
    "adminShareFromMargin",
    "clientBaseAfterMargin",
    "clientSpent",
    "clientRemaining",
    "executorExpensesTotal",
    "partnerTransferDue"
  ],
  client: [
    "id",
    "invoiceId",
    "clientBill",
    "clientBaseAfterMargin",
    "clientSpent",
    "clientRemaining",
    "executorExpensesTotal"
  ],
  assistant: [
    "id",
    "invoiceId",
    "clientBill",
    "executorExpensesTotal",
    "agencyMargin",
    "clientBaseAfterMargin",
    "clientRemaining"
  ],
  accountant: [
    "id",
    "invoiceId",
    "clientBill",
    "executorExpensesTotal",
    "agencyMargin",
    "clientBaseAfterMargin",
    "clientRemaining"
  ]
};
var ROLE_STATS_PERMISSIONS = {
  admin: [
    "totalInvoices",
    "paidInvoices",
    "pendingInvoices",
    "overdueInvoices",
    "totalClientBill",
    "paidClientBill",
    "pendingClientBill",
    "totalExpenses",
    "totalPartnerCommission",
    "totalAdminShare",
    "totalNetProfit",
    "clientRemaining"
  ],
  partner: [
    "totalInvoices",
    "paidInvoices",
    "pendingInvoices",
    "overdueInvoices",
    "totalClientBill",
    "paidClientBill",
    "pendingClientBill",
    "totalExpenses",
    "totalPartnerCommission",
    "partnerDebt",
    "clientRemaining"
  ],
  client: [
    "totalInvoices",
    "paidInvoices",
    "pendingInvoices",
    "overdueInvoices",
    "totalClientBill",
    "totalExpenses",
    "clientRemaining"
  ],
  assistant: [
    "totalInvoices",
    "paidInvoices",
    "pendingInvoices",
    "overdueInvoices",
    "totalClientBill",
    "paidClientBill",
    "pendingClientBill",
    "totalExpenses"
  ],
  accountant: [
    "totalInvoices",
    "paidInvoices",
    "pendingInvoices",
    "overdueInvoices",
    "totalClientBill",
    "paidClientBill",
    "pendingClientBill",
    "totalExpenses"
  ]
};
var ASSISTANT_ALLOWED_INVOICE_FIELDS = ROLE_INVOICE_PERMISSIONS.assistant;
var ASSISTANT_ALLOWED_CALCULATION_FIELDS = ROLE_CALCULATION_PERMISSIONS.assistant;
function projectInvoiceForRole(invoice, role) {
  const allowedInvoiceFields = ROLE_INVOICE_PERMISSIONS[role];
  const allowedCalcFields = ROLE_CALCULATION_PERMISSIONS[role];
  const result = {};
  for (const field of allowedInvoiceFields) {
    if (field in invoice) result[field] = invoice[field];
  }
  if (invoice.calculations && typeof invoice.calculations === "object") {
    const calc = {};
    for (const field of allowedCalcFields) {
      if (field in invoice.calculations) calc[field] = invoice.calculations[field];
    }
    result.calculations = calc;
  }
  if (invoice.partner) {
    if (role === "admin") {
      result.partner = invoice.partner;
    } else if (role === "partner") {
      result.partner = { id: invoice.partner.id, name: invoice.partner.name };
    }
  }
  if (invoice.client) {
    result.client = role === "assistant" || role === "accountant" ? { id: invoice.client.id, name: invoice.client.name } : invoice.client;
  }
  return result;
}
function stripSensitiveFieldsForRole(data, role) {
  return projectInvoiceForRole(data, role);
}
function stripSensitiveFieldsFromList(data, role) {
  return data.map((item) => projectInvoiceForRole(item, role));
}
function projectStatsForRole(stats, role) {
  const allowedFields = ROLE_STATS_PERMISSIONS[role];
  const result = {};
  for (const field of allowedFields) {
    if (field in stats) result[field] = stats[field];
  }
  return result;
}
function stripPartnerInfoFromClient(client, role) {
  if (role !== "assistant" && role !== "accountant") return client;
  const { partnerId, partner, ...rest } = client;
  return rest;
}
function stripPartnerInfoFromClients(clients2, role) {
  if (role !== "assistant" && role !== "accountant") return clients2;
  return clients2.map((client) => {
    const { partnerId, partner, ...rest } = client;
    return rest;
  });
}

// server/routes/clients.ts
var clientsRouter = Router2();
clientsRouter.get("/api/clients", authMiddleware, async (req, res) => {
  try {
    const role = req.user?.role || "client";
    const partnerId = role === "partner" ? req.user?.partnerId : void 0;
    const result = await storage.getClients(partnerId);
    res.json(stripPartnerInfoFromClients(result, role));
  } catch (error) {
    console.error("Get clients error:", error);
    res.status(500).json({ error: "Failed to get clients" });
  }
});
clientsRouter.get("/api/closing-docs-status", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const clients2 = await storage.getClients();
    const allInvoices = await storage.getInvoices("admin");
    const hiddenInvoices = allInvoices.filter((inv) => inv.hideFromAssistant);
    const clientDocsMap = /* @__PURE__ */ new Map();
    for (const client of clients2) {
      clientDocsMap.set(client.id, { clientId: client.id, clientName: client.name, totalInvoices: 0, invoicesWithDoc: 0, invoicesWithoutDoc: 0, invoiceDetails: [] });
    }
    for (const invoice of hiddenInvoices) {
      if (!invoice.clientId) continue;
      const clientData = clientDocsMap.get(invoice.clientId);
      if (!clientData) continue;
      const hasDoc = !!invoice.closingDocumentUrl;
      clientData.totalInvoices++;
      if (hasDoc) clientData.invoicesWithDoc++;
      else clientData.invoicesWithoutDoc++;
      clientData.invoiceDetails.push({ id: invoice.id, invoiceNumber: invoice.invoiceNumber, status: invoice.status || "draft", hasClosingDoc: hasDoc, closingDocumentUrl: invoice.closingDocumentUrl || null, paymentDate: invoice.paymentDate });
    }
    const result = Array.from(clientDocsMap.values()).filter((c) => c.totalInvoices > 0).sort((a, b) => b.invoicesWithoutDoc - a.invoicesWithoutDoc || b.totalInvoices - a.totalInvoices);
    res.json(result);
  } catch (error) {
    console.error("Get closing docs status error:", error);
    res.status(500).json({ error: "Failed to get closing docs status" });
  }
});
clientsRouter.get("/api/clients/acts-status", authMiddleware, requireRole("admin", "assistant", "accountant"), async (req, res) => {
  try {
    const role = req.user?.role || "client";
    const clients2 = await storage.getClients();
    const allInvoices = await storage.getInvoices(role);
    const paidInvoices = allInvoices.filter((inv) => inv.status === "paid");
    const clientActsMap = /* @__PURE__ */ new Map();
    for (const client of clients2) {
      clientActsMap.set(client.id, { clientId: client.id, clientName: client.name, totalInvoices: 0, invoicesWithCompanyAct: 0, invoicesWithExecutorAct: 0, invoicesWithBothActs: 0, invoicesWithoutActs: 0, invoiceDetails: [] });
    }
    for (const invoice of paidInvoices) {
      if (!invoice.clientId) continue;
      const clientData = clientActsMap.get(invoice.clientId);
      if (!clientData) continue;
      const acts = await storage.getSignedActsByInvoice(invoice.id);
      const hasCompanyAct = acts.some((a) => a.actType === "company");
      const hasExecutorAct = acts.some((a) => a.actType === "executor");
      clientData.totalInvoices++;
      if (hasCompanyAct) clientData.invoicesWithCompanyAct++;
      if (hasExecutorAct) clientData.invoicesWithExecutorAct++;
      if (hasCompanyAct && hasExecutorAct) clientData.invoicesWithBothActs++;
      if (!hasCompanyAct && !hasExecutorAct) clientData.invoicesWithoutActs++;
      clientData.invoiceDetails.push({ id: invoice.id, invoiceNumber: invoice.invoiceNumber, hasCompanyAct, hasExecutorAct, paymentDate: invoice.paymentDate });
    }
    const result = Array.from(clientActsMap.values()).filter((c) => c.totalInvoices > 0).sort((a, b) => b.invoicesWithoutActs - a.invoicesWithoutActs || b.totalInvoices - a.totalInvoices);
    res.json(result);
  } catch (error) {
    console.error("Get clients acts status error:", error);
    res.status(500).json({ error: "Failed to get clients acts status" });
  }
});
clientsRouter.get("/api/clients/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const role = req.user?.role || "client";
    const client = await storage.getClient(id);
    if (!client) return res.status(404).json({ error: "Client not found" });
    if (role === "partner" && client.partnerId !== req.user?.partnerId) return res.status(403).json({ error: "Forbidden" });
    res.json(stripPartnerInfoFromClient(client, role));
  } catch (error) {
    console.error("Get client error:", error);
    res.status(500).json({ error: "Failed to get client" });
  }
});
clientsRouter.post("/api/clients", authMiddleware, requireRole("admin", "assistant", "accountant"), async (req, res) => {
  try {
    const role = req.user?.role || "client";
    const client = await storage.createClient(req.body);
    if (role === "assistant" || role === "admin" || role === "accountant") {
      await storage.logAssistantAction({ accessTokenId: req.user.token.id, actionType: "create_client", entityType: "client", entityId: client.id, description: `\u0421\u043E\u0437\u0434\u0430\u043D \u043A\u043B\u0438\u0435\u043D\u0442: ${client.name}`, details: JSON.stringify(req.body), ipAddress: req.ip || req.headers["x-forwarded-for"] || null, userAgent: req.headers["user-agent"] || null });
    }
    res.status(201).json(stripPartnerInfoFromClient(client, role));
  } catch (error) {
    console.error("Create client error:", error);
    res.status(500).json({ error: "Failed to create client" });
  }
});
clientsRouter.patch("/api/clients/:id", authMiddleware, requireRole("admin", "assistant", "accountant"), async (req, res) => {
  try {
    const { id } = req.params;
    const role = req.user?.role || "client";
    const client = await storage.updateClient(id, req.body);
    if (!client) return res.status(404).json({ error: "Client not found" });
    if (role === "assistant" || role === "admin" || role === "accountant") {
      await storage.logAssistantAction({ accessTokenId: req.user.token.id, actionType: "update_client", entityType: "client", entityId: id, description: `\u041E\u0431\u043D\u043E\u0432\u043B\u0451\u043D \u043A\u043B\u0438\u0435\u043D\u0442: ${client.name}`, details: JSON.stringify(req.body), ipAddress: req.ip || req.headers["x-forwarded-for"] || null, userAgent: req.headers["user-agent"] || null });
    }
    res.json(stripPartnerInfoFromClient(client, role));
  } catch (error) {
    console.error("Update client error:", error);
    res.status(500).json({ error: "Failed to update client" });
  }
});
clientsRouter.delete("/api/clients/:id", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const result = await storage.deleteClient(id);
    if (!result.success) return res.status(400).json({ error: result.error });
    res.json({ success: true });
  } catch (error) {
    console.error("Delete client error:", error);
    res.status(500).json({ error: "Failed to delete client" });
  }
});
clientsRouter.get("/api/clients/:id/with-partner", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const role = req.user?.role || "client";
    if (role === "assistant" || role === "accountant") return res.status(403).json({ error: "Forbidden: cannot view partner-client relationships" });
    const client = await storage.getClientWithPartner(id);
    if (!client) return res.status(404).json({ error: "Client not found" });
    if (role === "partner" && client.partnerId !== req.user?.partnerId) return res.status(403).json({ error: "Forbidden" });
    res.json(client);
  } catch (error) {
    console.error("Get client with partner error:", error);
    res.status(500).json({ error: "Failed to get client" });
  }
});
clientsRouter.get("/api/clients/:id/partners", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const role = req.user?.role || "client";
    if (role === "assistant" || role === "accountant") return res.status(403).json({ error: "Forbidden: cannot view partner-client relationships" });
    const partners2 = await storage.getClientPartners(id);
    res.json(partners2);
  } catch (error) {
    console.error("Get client partners error:", error);
    res.status(500).json({ error: "Failed to get client partners" });
  }
});
clientsRouter.put("/api/clients/:id/partners", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const { partnerIds } = req.body;
    if (!Array.isArray(partnerIds)) return res.status(400).json({ error: "partnerIds must be an array" });
    await storage.setClientPartners(id, partnerIds);
    const updatedPartners = await storage.getClientPartners(id);
    res.json(updatedPartners);
  } catch (error) {
    console.error("Set client partners error:", error);
    res.status(500).json({ error: "Failed to set client partners" });
  }
});
clientsRouter.get("/api/clients-with-partners", authMiddleware, async (req, res) => {
  try {
    const role = req.user?.role || "client";
    if (role === "assistant" || role === "accountant") return res.status(403).json({ error: "Forbidden: cannot view partner-client relationships" });
    const clients2 = await storage.getClientsWithPartners();
    res.json(clients2);
  } catch (error) {
    console.error("Get clients with partners error:", error);
    res.status(500).json({ error: "Failed to get clients" });
  }
});
clientsRouter.get("/api/client/budget", authMiddleware, requireRole("client"), async (req, res) => {
  try {
    const clientId = req.user?.clientId;
    if (!clientId) return res.status(403).json({ error: "No client ID found" });
    res.json(await storage.getClientBudget(clientId));
  } catch (error) {
    console.error("Get client budget error:", error);
    res.status(500).json({ error: "Failed to get client budget" });
  }
});
clientsRouter.get("/api/client/agency30", authMiddleware, requireRole("client"), async (req, res) => {
  try {
    const clientId = req.user?.clientId;
    if (!clientId) return res.status(403).json({ error: "No client ID found" });
    res.json(await storage.getClientAgency30Report(clientId));
  } catch (error) {
    console.error("Get client agency30 report error:", error);
    res.status(500).json({ error: "Failed to get agency30 report" });
  }
});

// server/routes/partners.ts
import { Router as Router3 } from "express";
var partnersRouter = Router3();
partnersRouter.get("/api/partners", authMiddleware, requireRole("admin", "assistant", "accountant"), async (_req, res) => {
  try {
    res.json(await storage.getPartners());
  } catch (error) {
    console.error("Get partners error:", error);
    res.status(500).json({ error: "Failed to get partners" });
  }
});
partnersRouter.get("/api/partners/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    if (req.user?.role === "partner" && req.user.partnerId !== id) return res.status(403).json({ error: "Forbidden" });
    const partner = await storage.getPartner(id);
    if (!partner) return res.status(404).json({ error: "Partner not found" });
    res.json(partner);
  } catch (error) {
    console.error("Get partner error:", error);
    res.status(500).json({ error: "Failed to get partner" });
  }
});
partnersRouter.post("/api/partners", authMiddleware, requireRole("admin", "assistant", "accountant"), async (req, res) => {
  try {
    const role = req.user?.role || "client";
    const partner = await storage.createPartner(req.body);
    if (role === "assistant" || role === "admin" || role === "accountant") {
      await storage.logAssistantAction({ accessTokenId: req.user.token.id, actionType: "create_partner", entityType: "partner", entityId: partner.id, description: `\u0421\u043E\u0437\u0434\u0430\u043D \u043F\u0430\u0440\u0442\u043D\u0451\u0440: ${partner.name}`, details: JSON.stringify(req.body), ipAddress: req.ip || req.headers["x-forwarded-for"] || null, userAgent: req.headers["user-agent"] || null });
    }
    res.status(201).json(partner);
  } catch (error) {
    console.error("Create partner error:", error);
    res.status(500).json({ error: "Failed to create partner" });
  }
});
partnersRouter.patch("/api/partners/:id", authMiddleware, requireRole("admin", "assistant", "accountant"), async (req, res) => {
  try {
    const { id } = req.params;
    const role = req.user?.role || "client";
    const partner = await storage.updatePartner(id, req.body);
    if (!partner) return res.status(404).json({ error: "Partner not found" });
    if (role === "assistant" || role === "admin" || role === "accountant") {
      await storage.logAssistantAction({ accessTokenId: req.user.token.id, actionType: "update_partner", entityType: "partner", entityId: id, description: `\u041E\u0431\u043D\u043E\u0432\u043B\u0451\u043D \u043F\u0430\u0440\u0442\u043D\u0451\u0440: ${partner.name}`, details: JSON.stringify(req.body), ipAddress: req.ip || req.headers["x-forwarded-for"] || null, userAgent: req.headers["user-agent"] || null });
    }
    res.json(partner);
  } catch (error) {
    console.error("Update partner error:", error);
    res.status(500).json({ error: "Failed to update partner" });
  }
});
partnersRouter.delete("/api/partners/:id", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const result = await storage.deletePartner(id);
    if (!result.success) return res.status(400).json({ error: result.error });
    res.json({ success: true });
  } catch (error) {
    console.error("Delete partner error:", error);
    res.status(500).json({ error: "Failed to delete partner" });
  }
});
partnersRouter.get("/api/partners/:id/clients", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const role = req.user?.role;
    if (role === "assistant" || role === "accountant") return res.status(403).json({ error: "Forbidden: cannot view partner-client relationships" });
    if (role === "partner" && req.user?.partnerId !== id) return res.status(403).json({ error: "Forbidden" });
    res.json(await storage.getPartnerClients(id));
  } catch (error) {
    console.error("Get partner clients error:", error);
    res.status(500).json({ error: "Failed to get partner clients" });
  }
});
partnersRouter.get("/api/partner-payments", authMiddleware, async (req, res) => {
  try {
    const role = req.user?.role;
    if (role === "assistant" || role === "accountant") return res.status(403).json({ error: "Forbidden" });
    let partnerId;
    if (role === "partner") partnerId = req.user?.partnerId;
    else if (role === "admin" && req.query.partnerId) partnerId = req.query.partnerId;
    res.json(await storage.getPartnerPayments(partnerId));
  } catch (error) {
    console.error("Get payments error:", error);
    res.status(500).json({ error: "Failed to get payments" });
  }
});
partnersRouter.post("/api/partner-payments", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const payment = await storage.createPartnerPayment({ ...req.body, createdBy: req.user.token.id });
    res.status(201).json(payment);
  } catch (error) {
    console.error("Create payment error:", error);
    res.status(500).json({ error: "Failed to create payment" });
  }
});
partnersRouter.put("/api/partner-payments/:id", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, paymentDate, notes } = req.body;
    const parsedAmount = parseNum(String(amount));
    if (isNaN(parsedAmount) || parsedAmount <= 0) return res.status(400).json({ error: "Invalid amount: must be a positive number" });
    if (!paymentDate || !/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) return res.status(400).json({ error: "Invalid paymentDate: must be in YYYY-MM-DD format" });
    const sanitizedNotes = notes ? String(notes).trim() : null;
    const existing = await storage.getPartnerPayment(id);
    if (!existing) return res.status(404).json({ error: "Payment not found" });
    res.json(await storage.updatePartnerPayment(id, { amount: parsedAmount.toString(), paymentDate, notes: sanitizedNotes }));
  } catch (error) {
    console.error("Update payment error:", error);
    res.status(500).json({ error: "Failed to update payment" });
  }
});
partnersRouter.delete("/api/partner-payments/:id", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await storage.getPartnerPayment(id);
    if (!existing) return res.status(404).json({ error: "Payment not found" });
    await storage.deletePartnerPayment(id);
    res.status(204).send();
  } catch (error) {
    console.error("Delete payment error:", error);
    res.status(500).json({ error: "Failed to delete payment" });
  }
});
partnersRouter.get("/api/partner-debt", authMiddleware, requireRole("admin", "partner"), async (req, res) => {
  try {
    const summaries = await storage.getPartnerDebtSummaries();
    if (req.user?.role === "partner") {
      return res.json(summaries.filter((s) => s.partnerId === req.user?.partnerId));
    }
    res.json(summaries);
  } catch (error) {
    console.error("Get partner debt error:", error);
    res.status(500).json({ error: "Failed to get partner debt data" });
  }
});
partnersRouter.get("/api/my-debt", authMiddleware, requireRole("partner"), async (req, res) => {
  try {
    const partnerId = req.user?.partnerId;
    if (!partnerId) return res.status(400).json({ error: "Partner ID not found in session" });
    res.json(await storage.getPartnerDebtDetails(partnerId));
  } catch (error) {
    console.error("Get my debt error:", error);
    res.status(500).json({ error: "Failed to get debt details" });
  }
});
partnersRouter.get("/api/partners/:id/payment-history", authMiddleware, requireRole("admin", "partner"), async (req, res) => {
  try {
    const partnerId = req.params.id;
    if (req.user?.role === "partner" && req.user?.partnerId !== partnerId) return res.status(403).json({ error: "Access denied" });
    res.json(await storage.getPartnerPaymentHistory(partnerId));
  } catch (error) {
    console.error("Get partner payment history error:", error);
    res.status(500).json({ error: "Failed to get payment history" });
  }
});
partnersRouter.get("/api/my-payment-history", authMiddleware, requireRole("partner"), async (req, res) => {
  try {
    const partnerId = req.user?.partnerId;
    if (!partnerId) return res.status(400).json({ error: "Partner ID not found in session" });
    res.json(await storage.getPartnerPaymentHistory(partnerId));
  } catch (error) {
    console.error("Get my payment history error:", error);
    res.status(500).json({ error: "Failed to get payment history" });
  }
});
partnersRouter.get("/api/partner/terms", authMiddleware, requireRole("partner"), async (req, res) => {
  try {
    const partnerId = req.user?.partnerId;
    if (!partnerId) return res.status(403).json({ error: "No partner ID found" });
    res.json(await storage.getPartnerTerms(partnerId));
  } catch (error) {
    console.error("Get partner terms error:", error);
    res.status(500).json({ error: "Failed to get partner terms" });
  }
});
partnersRouter.get("/api/partner/payments", authMiddleware, requireRole("partner"), async (req, res) => {
  try {
    const partnerId = req.user?.partnerId;
    if (!partnerId) return res.status(403).json({ error: "No partner ID found" });
    res.json(await storage.getPartnerPayments(partnerId));
  } catch (error) {
    console.error("Get partner payments error:", error);
    res.status(500).json({ error: "Failed to get partner payments" });
  }
});
partnersRouter.get("/api/partner/client-stats", authMiddleware, requireRole("partner"), async (req, res) => {
  try {
    const partnerId = req.user?.partnerId;
    if (!partnerId) return res.status(400).json({ error: "Partner ID not found in session" });
    const year = req.query.year ? parseInt(req.query.year) : (/* @__PURE__ */ new Date()).getFullYear();
    const stats = await storage.getPartnerClientStats(partnerId, year);
    const currentYear = (/* @__PURE__ */ new Date()).getFullYear();
    res.json({ stats, selectedYear: year, availableYears: [currentYear - 2, currentYear - 1, currentYear, currentYear + 1] });
  } catch (error) {
    console.error("Get partner client stats error:", error);
    res.status(500).json({ error: "Failed to get client stats" });
  }
});
partnersRouter.get("/api/partner/document-risk", authMiddleware, requireRole("partner"), async (req, res) => {
  try {
    const partnerId = req.user?.partnerId;
    if (!partnerId) return res.status(400).json({ error: "Partner ID not found in session" });
    res.json(await storage.getPartnerDocumentRisk(partnerId));
  } catch (error) {
    console.error("Get partner document risk error:", error);
    res.status(500).json({ error: "Failed to get document risk" });
  }
});
partnersRouter.get("/api/partner/agency30-funds", authMiddleware, requireRole("partner"), async (req, res) => {
  try {
    const partnerId = req.user?.partnerId;
    if (!partnerId) return res.status(400).json({ error: "Partner ID not found in session" });
    const funds = await storage.getPartnerAgency30Funds(partnerId);
    res.json({ clients: funds, totalRemaining: funds.reduce((sum2, f) => sum2 + f.remaining, 0) });
  } catch (error) {
    console.error("Get partner agency30 funds error:", error);
    res.status(500).json({ error: "Failed to get agency 30 funds" });
  }
});
partnersRouter.get("/api/partner/hero-metrics", authMiddleware, requireRole("partner"), async (req, res) => {
  try {
    const partnerId = req.user?.partnerId;
    if (!partnerId) return res.status(400).json({ error: "Partner ID not found in session" });
    res.json(await storage.getPartnerHeroMetrics(partnerId));
  } catch (error) {
    console.error("Get partner hero metrics error:", error);
    res.status(500).json({ error: "Failed to get partner metrics" });
  }
});
partnersRouter.get("/api/do-not-spend", authMiddleware, requireRole("admin", "assistant", "partner"), async (req, res) => {
  try {
    const role = req.user?.role;
    res.json(await storage.getDoNotSpendData(role === "partner" ? req.user?.partnerId : void 0));
  } catch (error) {
    console.error("Get do-not-spend error:", error);
    res.status(500).json({ error: "Failed to get do-not-spend data" });
  }
});
partnersRouter.get("/api/do-not-spend/partner-schemes", authMiddleware, requireRole("admin", "assistant", "partner"), async (req, res) => {
  try {
    const role = req.user?.role;
    res.json(await storage.getPartnerSchemeDoNotSpendData(role === "partner" ? req.user?.partnerId : void 0, role));
  } catch (error) {
    console.error("Get partner scheme do-not-spend error:", error);
    res.status(500).json({ error: "Failed to get partner scheme do-not-spend data" });
  }
});
partnersRouter.get("/api/expected-commission", authMiddleware, requireRole("admin", "partner"), async (req, res) => {
  try {
    const role = req.user?.role;
    res.json(await storage.getExpectedCommission(role === "partner" ? req.user?.partnerId : void 0));
  } catch (error) {
    console.error("Get expected commission error:", error);
    res.status(500).json({ error: "Failed to get expected commission data" });
  }
});
partnersRouter.get("/api/expected-admin-profit", authMiddleware, requireRole("admin"), async (_req, res) => {
  try {
    res.json(await storage.getExpectedAdminProfit());
  } catch (error) {
    console.error("Get expected admin profit error:", error);
    res.status(500).json({ error: "Failed to get expected admin profit data" });
  }
});

// server/routes/dashboard.ts
import { Router as Router4 } from "express";
var dashboardRouter = Router4();
dashboardRouter.get("/api/dashboard/stats", authMiddleware, async (req, res) => {
  try {
    const role = req.user?.role || "client";
    const stats = await storage.getDashboardStats(role, req.user?.partnerId, req.user?.clientId);
    res.json(projectStatsForRole(stats, role));
  } catch (error) {
    console.error("Get dashboard stats error:", error);
    res.status(500).json({ error: "Failed to get dashboard stats" });
  }
});
dashboardRouter.get("/api/admin/monthly-data", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    res.json(await storage.getAdminMonthlyData(parseInt(req.query.year) || (/* @__PURE__ */ new Date()).getFullYear()));
  } catch (error) {
    console.error("Get admin monthly data error:", error);
    res.status(500).json({ error: "Failed to get monthly data" });
  }
});
dashboardRouter.get("/api/admin/forecast", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    res.json(await storage.getAdminForecast(parseInt(req.query.months) || 6));
  } catch (error) {
    console.error("Get admin forecast error:", error);
    res.status(500).json({ error: "Failed to get forecast" });
  }
});
dashboardRouter.get("/api/admin/drafts-stats", authMiddleware, requireRole("admin"), async (_req, res) => {
  try {
    res.json(await storage.getDraftsStats());
  } catch (error) {
    console.error("Get drafts stats error:", error);
    res.status(500).json({ error: "Failed to get drafts stats" });
  }
});
dashboardRouter.get("/api/admin/invoices-by-month", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const month = parseInt(req.query.month);
    const year = parseInt(req.query.year);
    if (!month || !year) return res.status(400).json({ error: "Month and year are required" });
    res.json(await storage.getInvoicesByMonth(month, year, req.query.type));
  } catch (error) {
    console.error("Get invoices by month error:", error);
    res.status(500).json({ error: "Failed to get invoices by month" });
  }
});
dashboardRouter.get("/api/invoices/overdue", authMiddleware, requireRole("admin"), async (_req, res) => {
  try {
    res.json(await storage.getOverdueInvoices());
  } catch (error) {
    console.error("Get overdue invoices error:", error);
    res.status(500).json({ error: "Failed to get overdue invoices" });
  }
});
dashboardRouter.get("/api/alert-counts", authMiddleware, async (req, res) => {
  try {
    res.json(await storage.getAlertCounts(req.user?.role || "client"));
  } catch (error) {
    console.error("Get alert counts error:", error);
    res.status(500).json({ error: "Failed to get alert counts" });
  }
});
dashboardRouter.get("/api/search", authMiddleware, async (req, res) => {
  try {
    const query = req.query.q || "";
    if (!query.trim()) return res.json([]);
    res.json(await storage.globalSearch(query, req.user?.role || "client"));
  } catch (error) {
    console.error("Global search error:", error);
    res.status(500).json({ error: "Failed to search" });
  }
});
dashboardRouter.get("/api/priority-actions", authMiddleware, requireRole("admin", "assistant"), async (_req, res) => {
  try {
    res.json(await storage.getPriorityActions());
  } catch (error) {
    console.error("Get priority actions error:", error);
    res.status(500).json({ error: "Failed to get priority actions" });
  }
});
dashboardRouter.get("/api/overdue-invoices", authMiddleware, requireRole("admin", "assistant"), async (_req, res) => {
  try {
    res.json(await storage.getOverdueInvoicesDetailed());
  } catch (error) {
    console.error("Get overdue invoices detailed error:", error);
    res.status(500).json({ error: "Failed to get overdue invoices" });
  }
});
dashboardRouter.get("/api/admin/partner-invoices/:partnerId", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    res.json(await storage.getPartnerInvoicesDetail(req.params.partnerId));
  } catch (error) {
    console.error("Get partner invoices detail error:", error);
    res.status(500).json({ error: "Failed to get partner invoices" });
  }
});
dashboardRouter.get("/api/admin/working-capital", authMiddleware, requireRole("admin"), async (_req, res) => {
  try {
    res.json(await storage.getWorkingCapital());
  } catch (error) {
    console.error("Get working capital error:", error);
    res.status(500).json({ error: "Failed to get working capital" });
  }
});
dashboardRouter.patch("/api/admin/working-capital", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const { amount, notes } = req.body;
    res.json(await storage.updateWorkingCapital(amount, notes, req.user.token.id));
  } catch (error) {
    console.error("Update working capital error:", error);
    res.status(500).json({ error: "Failed to update working capital" });
  }
});
dashboardRouter.get("/api/admin/client-ltv", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    res.json(await storage.getClientLTV(req.query.year ? parseInt(req.query.year) : void 0));
  } catch (error) {
    console.error("Get client LTV error:", error);
    res.status(500).json({ error: "Failed to get client LTV" });
  }
});
dashboardRouter.get("/api/admin/plan-fact", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    res.json(await storage.getAdminPlanFact(parseInt(req.query.year) || (/* @__PURE__ */ new Date()).getFullYear()));
  } catch (error) {
    console.error("Get admin plan-fact error:", error);
    res.status(500).json({ error: "Failed to get plan-fact data" });
  }
});
dashboardRouter.get("/api/admin/monthly-plans", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    res.json(await storage.getMonthlyPlans(parseInt(req.query.year) || (/* @__PURE__ */ new Date()).getFullYear()));
  } catch (error) {
    console.error("Get monthly plans error:", error);
    res.status(500).json({ error: "Failed to get monthly plans" });
  }
});
dashboardRouter.get("/api/financial-plans/history", authMiddleware, requireRole("admin"), async (_req, res) => {
  try {
    const currentYear = (/* @__PURE__ */ new Date()).getFullYear();
    const lastYear = currentYear - 1;
    const [currentYearPlans, lastYearPlans] = await Promise.all([storage.getMonthlyPlans(currentYear), storage.getMonthlyPlans(lastYear)]);
    const allPlans = [...currentYearPlans, ...lastYearPlans].sort((a, b) => {
      if (a.year !== b.year) return parseInt(b.year) - parseInt(a.year);
      return parseInt(b.month) - parseInt(a.month);
    });
    const getActualsForYear = async (year) => {
      const yearStart = new Date(year, 0, 1);
      const yearEnd = new Date(year, 11, 31, 23, 59, 59);
      const paidInvoices = await storage.getInvoicesWithCalculations();
      const monthlyActuals = {};
      for (let m = 1; m <= 12; m++) monthlyActuals[m] = { admin: 0, cat: 0 };
      for (const invoice of paidInvoices) {
        if (!invoice.paymentDate) continue;
        const paymentDate = new Date(invoice.paymentDate);
        if (paymentDate < yearStart || paymentDate > yearEnd) continue;
        const month = paymentDate.getMonth() + 1;
        const parseShare = (val) => {
          if (!val || val.trim() === "") return 0;
          const num = parseNum(val);
          return isNaN(num) || Math.abs(num) < 0.01 ? 0 : num;
        };
        let adminShare = parseShare(invoice.adminShare50);
        let catShare = parseShare(invoice.catShare50);
        if (adminShare === 0 && catShare === 0 && invoice.netProfitAdmin) {
          const netProfit = parseShare(invoice.netProfitAdmin);
          if (netProfit > 0) {
            adminShare = netProfit / 2;
            catShare = netProfit / 2;
          }
        }
        monthlyActuals[month].admin += adminShare;
        monthlyActuals[month].cat += catShare;
      }
      return monthlyActuals;
    };
    const [currentYearActuals, lastYearActuals] = await Promise.all([getActualsForYear(currentYear), getActualsForYear(lastYear)]);
    const result = allPlans.map((plan) => {
      const year = parseInt(plan.year);
      const month = parseInt(plan.month);
      const actuals = year === currentYear ? currentYearActuals : lastYearActuals;
      const halfTarget = parseNum(plan.profitTarget || "0") / 2;
      return { id: plan.id, year, month, plannedAdminShare: halfTarget.toString(), plannedCatShare: halfTarget.toString(), actualAdminShare: actuals[month]?.admin || 0, actualCatShare: actuals[month]?.cat || 0 };
    });
    res.json(result);
  } catch (error) {
    console.error("Get financial plans history error:", error);
    res.status(500).json({ error: "Failed to get plans history" });
  }
});
dashboardRouter.post("/api/admin/monthly-plans", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const { year, month, salesTarget, profitTarget, receiptsTarget } = req.body;
    const plan = await storage.upsertMonthlyPlan({
      year: parseInt(year),
      month: parseInt(month),
      salesTarget: salesTarget ? parseNum(salesTarget) : void 0,
      profitTarget: profitTarget ? parseNum(profitTarget) : void 0,
      receiptsTarget: receiptsTarget ? parseNum(receiptsTarget) : void 0
    });
    res.json(plan);
  } catch (error) {
    console.error("Upsert monthly plan error:", error);
    res.status(500).json({ error: "Failed to save monthly plan" });
  }
});
dashboardRouter.post("/api/admin/recalculate-invoices", authMiddleware, requireRole("admin"), async (_req, res) => {
  console.log("[API] Recalculate invoices request received");
  try {
    const result = await storage.recalculateAllInvoices();
    console.log("[API] Recalculate invoices result:", result);
    res.json({ success: true, message: `Recalculated ${result.updated} invoices with ${result.errors} errors`, ...result });
  } catch (error) {
    console.error("[API] Recalculate invoices error:", error);
    res.status(500).json({ error: "Failed to recalculate invoices" });
  }
});
dashboardRouter.get("/api/financial-summary", authMiddleware, async (req, res) => {
  try {
    const role = req.user?.role || "client";
    const partnerId = req.user?.partnerId;
    const clientId = req.user?.clientId;
    const stats = await storage.getDashboardStats(role, partnerId, clientId);
    const filteredStats = projectStatsForRole(stats, role);
    const invoices2 = await storage.getInvoices(role, partnerId, clientId);
    const filteredInvoices = invoices2.map((inv) => projectInvoiceForRole(inv, role));
    const summary = { stats: filteredStats, invoices: filteredInvoices, role, dataSource: "invoice_calculations" };
    if (role === "admin") summary.partnerDebts = await storage.getPartnerDebtSummaries();
    if (role === "partner" && partnerId) {
      const partnerDebts = await storage.getPartnerDebtSummaries();
      summary.myDebt = partnerDebts.find((d) => d.partnerId === partnerId) || { totalToTransfer: 0, totalPaid: 0, remaining: 0 };
    }
    res.json(summary);
  } catch (error) {
    console.error("Get financial summary error:", error);
    res.status(500).json({ error: "Failed to get financial summary" });
  }
});
dashboardRouter.get("/api/admin/dashboard-stats", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const year = req.query.year ? parseInt(req.query.year) : void 0;
    const month = req.query.month ? parseInt(req.query.month) : void 0;
    res.json(await storage.getAdminDashboardStats(year, month));
  } catch (error) {
    console.error("Get admin dashboard stats error:", error);
    res.status(500).json({ error: "Failed to get dashboard stats" });
  }
});
dashboardRouter.get("/api/admin/critical-alerts", authMiddleware, requireRole("admin"), async (_req, res) => {
  try {
    res.json(await storage.getCriticalAlerts());
  } catch (error) {
    console.error("Get critical alerts error:", error);
    res.status(500).json({ error: "Failed to get critical alerts" });
  }
});
dashboardRouter.get("/api/admin/dashboard-invoices", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const year = req.query.year ? parseInt(req.query.year) : (/* @__PURE__ */ new Date()).getFullYear();
    const month = req.query.month !== void 0 ? parseInt(req.query.month) : (/* @__PURE__ */ new Date()).getMonth();
    const category = req.query.category;
    if (!category || !["received", "expected", "drafts"].includes(category)) {
      return res.status(400).json({ error: "Invalid category. Must be 'received', 'expected', or 'drafts'" });
    }
    res.json(await storage.getDashboardInvoices(year, month, category));
  } catch (error) {
    console.error("Get dashboard invoices error:", error);
    res.status(500).json({ error: "Failed to get dashboard invoices" });
  }
});
dashboardRouter.get("/api/admin/dashboard-recurring", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const year = req.query.year ? parseInt(req.query.year) : (/* @__PURE__ */ new Date()).getFullYear();
    const month = req.query.month !== void 0 ? parseInt(req.query.month) : (/* @__PURE__ */ new Date()).getMonth();
    res.json(await storage.getRecurringInvoicesForMonth(year, month));
  } catch (error) {
    console.error("Get dashboard recurring error:", error);
    res.status(500).json({ error: "Failed to get recurring invoices" });
  }
});

// server/routes/invoices.ts
import { Router as Router5 } from "express";
var invoicesRouter = Router5();
invoicesRouter.get("/api/invoices", authMiddleware, async (req, res) => {
  try {
    const role = req.user?.role || "client";
    let partnerId = req.user?.partnerId;
    const clientId = req.user?.clientId;
    if (role === "admin" && req.query.partnerId) partnerId = req.query.partnerId;
    const result = await storage.getInvoices(role, partnerId, clientId);
    res.json(stripSensitiveFieldsFromList(result, role));
  } catch (error) {
    console.error("Get invoices error:", error);
    res.status(500).json({ error: "Failed to get invoices" });
  }
});
invoicesRouter.get("/api/invoices/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const role = req.user?.role || "client";
    const invoice = await storage.getInvoiceForRole(id, role, req.user?.partnerId, req.user?.clientId);
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    res.json(stripSensitiveFieldsForRole(invoice, role));
  } catch (error) {
    console.error("Get invoice error:", error);
    res.status(500).json({ error: "Failed to get invoice" });
  }
});
invoicesRouter.post("/api/invoices", authMiddleware, requireRole("admin", "assistant", "accountant"), async (req, res) => {
  try {
    const role = req.user?.role || "client";
    const { calculations, ...invoiceData } = req.body;
    const invoice = await storage.createInvoice({ ...invoiceData, createdBy: req.user.token.id }, calculations || {});
    const fullInvoice = await storage.getInvoice(invoice.id);
    const filtered = stripSensitiveFieldsForRole(fullInvoice || invoice, role);
    if (role === "assistant" || role === "admin" || role === "accountant") {
      const client = invoiceData.clientId ? await storage.getClient(invoiceData.clientId) : null;
      const partner = invoiceData.partnerId ? await storage.getPartner(invoiceData.partnerId) : null;
      const invoiceNumber = fullInvoice?.invoiceNumber;
      const displayName = invoiceNumber || client?.name || partner?.name || fullInvoice?.description || invoice.id;
      await storage.logAssistantAction({ accessTokenId: req.user.token.id, actionType: "create_invoice", entityType: "invoice", entityId: invoice.id, description: `\u0421\u043E\u0437\u0434\u0430\u043D \u0441\u0447\u0451\u0442: ${displayName}`, details: JSON.stringify({ invoiceNumber, clientName: client?.name, partnerName: partner?.name, description: fullInvoice?.description, clientBill: invoiceData.clientBill, status: invoice.status }), ipAddress: req.ip || req.headers["x-forwarded-for"] || null, userAgent: req.headers["user-agent"] || null });
    }
    res.status(201).json(filtered);
  } catch (error) {
    console.error("Create invoice error:", error);
    res.status(500).json({ error: "Failed to create invoice" });
  }
});
invoicesRouter.patch("/api/invoices/:id", authMiddleware, requireRole("admin", "assistant", "accountant"), async (req, res) => {
  try {
    const { id } = req.params;
    const role = req.user?.role || "client";
    const { calculations, ...invoiceData } = req.body;
    if (role === "accountant") {
      const existing = await storage.getInvoice(id);
      if (!existing || !existing.hideFromAssistant) return res.status(403).json({ error: "Forbidden" });
    }
    const invoice = await storage.updateInvoice(id, invoiceData);
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    if (calculations || invoiceData.plannedExpenses !== void 0) await storage.updateInvoiceCalculations(id, calculations || {});
    const fullInvoice = await storage.getInvoice(id);
    const filtered = stripSensitiveFieldsForRole(fullInvoice || invoice, role);
    if (role === "assistant" || role === "admin" || role === "accountant") {
      const client = fullInvoice?.clientId ? await storage.getClient(fullInvoice.clientId) : null;
      const partner = fullInvoice?.partnerId ? await storage.getPartner(fullInvoice.partnerId) : null;
      const invoiceNumber = fullInvoice?.invoiceNumber;
      const displayName = invoiceNumber || client?.name || partner?.name || fullInvoice?.description || id;
      await storage.logAssistantAction({ accessTokenId: req.user.token.id, actionType: "update_invoice", entityType: "invoice", entityId: id, description: `\u041E\u0431\u043D\u043E\u0432\u043B\u0451\u043D \u0441\u0447\u0451\u0442: ${displayName}`, details: JSON.stringify({ invoiceNumber, clientName: client?.name, partnerName: partner?.name, description: fullInvoice?.description, status: fullInvoice?.status, ...invoiceData }), ipAddress: req.ip || req.headers["x-forwarded-for"] || null, userAgent: req.headers["user-agent"] || null });
    }
    res.json(filtered);
  } catch (error) {
    console.error("Update invoice error:", error);
    res.status(500).json({ error: "Failed to update invoice" });
  }
});
invoicesRouter.delete("/api/invoices/:id", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const role = req.user?.role || "client";
    const invoice = await storage.getInvoice(id);
    if (role === "assistant" || role === "admin" || role === "accountant") {
      const invoiceNumber = invoice?.invoiceNumber;
      const clientName = invoice?.clientId ? (await storage.getClient(invoice.clientId))?.name : null;
      const partnerName = invoice?.partnerId ? (await storage.getPartner(invoice.partnerId))?.name : null;
      const displayName = invoiceNumber || clientName || partnerName || invoice?.description || id;
      await storage.logAssistantAction({ accessTokenId: req.user.token.id, actionType: "delete_invoice", entityType: "invoice", entityId: id, description: `\u0423\u0434\u0430\u043B\u0451\u043D \u0441\u0447\u0451\u0442: ${displayName}`, details: JSON.stringify({ invoiceNumber, clientName, partnerName, description: invoice?.description, clientBill: invoice?.clientBill, status: invoice?.status }), ipAddress: req.ip || req.headers["x-forwarded-for"] || null, userAgent: req.headers["user-agent"] || null });
    }
    await storage.deleteInvoice(id);
    res.json({ success: true });
  } catch (error) {
    console.error("Delete invoice error:", error);
    res.status(500).json({ error: "Failed to delete invoice" });
  }
});
invoicesRouter.get("/api/invoices/:id/expenses", authMiddleware, async (req, res) => {
  try {
    res.json(await storage.getInvoiceExpenses(req.params.id));
  } catch (error) {
    console.error("Get expenses error:", error);
    res.status(500).json({ error: "Failed to get expenses" });
  }
});
invoicesRouter.post("/api/invoices/:id/expenses", authMiddleware, requireRole("admin", "assistant", "accountant"), async (req, res) => {
  try {
    const { id } = req.params;
    const role = req.user?.role || "client";
    if (role === "accountant") {
      const inv = await storage.getInvoice(id);
      if (!inv || !inv.hideFromAssistant) return res.status(403).json({ error: "Forbidden" });
    }
    const expense = await storage.createInvoiceExpense({ ...req.body, invoiceId: id, createdBy: req.user.token.id });
    if (role === "assistant" || role === "admin" || role === "accountant") {
      await storage.logAssistantAction({ accessTokenId: req.user.token.id, actionType: "create_expense", entityType: "expense", entityId: expense.id, description: `\u0421\u043E\u0437\u0434\u0430\u043D \u0440\u0430\u0441\u0445\u043E\u0434: ${req.body.description || expense.id}`, details: JSON.stringify({ invoiceId: id, amount: req.body.amount, paidByPartner: req.body.paidByPartner }), ipAddress: req.ip || req.headers["x-forwarded-for"] || null, userAgent: req.headers["user-agent"] || null });
    }
    res.status(201).json(expense);
  } catch (error) {
    console.error("Create expense error:", error);
    res.status(500).json({ error: "Failed to create expense" });
  }
});
invoicesRouter.patch("/api/expenses/:id", authMiddleware, requireRole("admin", "assistant", "accountant"), async (req, res) => {
  try {
    const { id } = req.params;
    const role = req.user?.role || "client";
    const expense = await storage.updateInvoiceExpense(id, req.body);
    if (!expense) return res.status(404).json({ error: "Expense not found" });
    if (role === "assistant" || role === "admin" || role === "accountant") {
      await storage.logAssistantAction({ accessTokenId: req.user.token.id, actionType: "update_expense", entityType: "expense", entityId: id, description: `\u041E\u0431\u043D\u043E\u0432\u043B\u0451\u043D \u0440\u0430\u0441\u0445\u043E\u0434: ${expense.description || id}`, details: JSON.stringify(req.body), ipAddress: req.ip || req.headers["x-forwarded-for"] || null, userAgent: req.headers["user-agent"] || null });
    }
    res.json(expense);
  } catch (error) {
    console.error("Update expense error:", error);
    res.status(500).json({ error: "Failed to update expense" });
  }
});
invoicesRouter.delete("/api/expenses/:id", authMiddleware, requireRole("admin", "assistant", "accountant"), async (req, res) => {
  try {
    const { id } = req.params;
    const role = req.user?.role || "client";
    if (role === "assistant" || role === "admin" || role === "accountant") {
      await storage.logAssistantAction({ accessTokenId: req.user.token.id, actionType: "delete_expense", entityType: "expense", entityId: id, description: `\u0423\u0434\u0430\u043B\u0451\u043D \u0440\u0430\u0441\u0445\u043E\u0434: ${id}`, details: null, ipAddress: req.ip || req.headers["x-forwarded-for"] || null, userAgent: req.headers["user-agent"] || null });
    }
    await storage.deleteInvoiceExpense(id);
    res.json({ success: true });
  } catch (error) {
    console.error("Delete expense error:", error);
    res.status(500).json({ error: "Failed to delete expense" });
  }
});
invoicesRouter.delete("/api/documents/:id", authMiddleware, requireRole("admin", "assistant", "accountant"), async (req, res) => {
  try {
    await storage.deleteDocument(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error("Delete document error:", error);
    res.status(500).json({ error: "Failed to delete document" });
  }
});
invoicesRouter.patch("/api/invoices/:id/closing-document", authMiddleware, requireRole("admin", "accountant"), async (req, res) => {
  try {
    const { id } = req.params;
    const { closingDocumentUrl } = req.body;
    const role = req.user?.role || "client";
    const invoice = await storage.getInvoice(id);
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    if (role === "accountant" && !invoice.hideFromAssistant) return res.status(403).json({ error: "Forbidden" });
    const updated = await storage.updateInvoice(id, { closingDocumentUrl });
    await storage.logAssistantAction({ accessTokenId: req.user.token.id, actionType: "update_invoice", entityType: "invoice", entityId: id, description: `${closingDocumentUrl ? "\u041F\u0440\u0438\u043A\u0440\u0435\u043F\u043B\u0451\u043D" : "\u0423\u0434\u0430\u043B\u0451\u043D"} \u0437\u0430\u043A\u0440\u044B\u0432\u0430\u044E\u0449\u0438\u0439 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442: ${invoice.invoiceNumber || id}`, details: JSON.stringify({ closingDocumentUrl, invoiceNumber: invoice.invoiceNumber }), ipAddress: req.ip || req.headers["x-forwarded-for"] || null, userAgent: req.headers["user-agent"] || null });
    res.json(updated);
  } catch (error) {
    console.error("Update closing document error:", error);
    res.status(500).json({ error: "Failed to update closing document" });
  }
});

// server/routes/acts.ts
import { Router as Router6 } from "express";
var actsRouter = Router6();
actsRouter.get("/api/admin/bonus-payments", authMiddleware, requireRole("admin"), async (_req, res) => {
  try {
    res.json(await storage.getAssistantBonusPayments());
  } catch (error) {
    console.error("Get bonus payments error:", error);
    res.status(500).json({ error: "Failed to get bonus payments" });
  }
});
actsRouter.get("/api/admin/unpaid-bonus", authMiddleware, requireRole("admin"), async (_req, res) => {
  try {
    res.json(await storage.getUnpaidBonusTotal());
  } catch (error) {
    console.error("Get unpaid bonus error:", error);
    res.status(500).json({ error: "Failed to get unpaid bonus" });
  }
});
actsRouter.post("/api/admin/bonus-payout", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const { amount, notes, invoiceIds } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: "Invalid amount" });
    const payment = await storage.createAssistantBonusPayment({ amount: amount.toString(), paymentDate: (/* @__PURE__ */ new Date()).toISOString().split("T")[0], notes: notes || null, paidBy: req.user.token.id });
    if (invoiceIds && invoiceIds.length > 0) await storage.markBonusesAsPaid(invoiceIds);
    res.status(201).json(payment);
  } catch (error) {
    console.error("Create bonus payout error:", error);
    res.status(500).json({ error: "Failed to create bonus payout" });
  }
});
actsRouter.get("/api/my-bonus-payments", authMiddleware, requireRole("admin", "assistant"), async (_req, res) => {
  try {
    res.json(await storage.getAssistantBonusPayments());
  } catch (error) {
    console.error("Get my bonus payments error:", error);
    res.status(500).json({ error: "Failed to get bonus payments" });
  }
});
actsRouter.get("/api/acts-statistics", authMiddleware, requireRole("admin", "assistant"), async (req, res) => {
  try {
    const excludeHidden = req.user?.role === "assistant";
    res.json(await storage.getActsStatistics(excludeHidden));
  } catch (error) {
    console.error("Get acts statistics error:", error);
    res.status(500).json({ error: "Failed to get acts statistics" });
  }
});
actsRouter.get("/api/access-tokens", authMiddleware, requireRole("admin"), async (_req, res) => {
  try {
    res.json(await storage.getAccessTokens());
  } catch (error) {
    console.error("Get tokens error:", error);
    res.status(500).json({ error: "Failed to get tokens" });
  }
});
actsRouter.post("/api/access-tokens", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const { code, role, partnerId, clientId } = req.body;
    res.status(201).json(await storage.createAccessToken(code, role, partnerId, clientId));
  } catch (error) {
    console.error("Create token error:", error);
    res.status(500).json({ error: "Failed to create token" });
  }
});
actsRouter.delete("/api/access-tokens/:id", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    await storage.deleteAccessToken(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error("Delete token error:", error);
    res.status(500).json({ error: "Failed to delete token" });
  }
});
actsRouter.get("/api/assistant/stats", authMiddleware, requireRole("admin", "assistant"), async (_req, res) => {
  try {
    res.json(await storage.getAssistantStats());
  } catch (error) {
    console.error("Get assistant stats error:", error);
    res.status(500).json({ error: "Failed to get assistant stats" });
  }
});
actsRouter.get("/api/invoices/:id/acts", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const role = req.user?.role || "client";
    const actType = req.query.type;
    const invoice = await storage.getInvoice(id);
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    if (role === "assistant" && invoice.hideFromAssistant) return res.status(403).json({ error: "Forbidden" });
    if (role === "accountant" && !invoice.hideFromAssistant) return res.status(403).json({ error: "Forbidden" });
    if (role === "partner" && invoice.partnerId !== req.user?.partnerId) return res.status(403).json({ error: "Forbidden" });
    if (role === "client" && invoice.clientId !== req.user?.clientId) return res.status(403).json({ error: "Forbidden" });
    let acts = await storage.getSignedActsByInvoice(id, actType);
    if (role === "partner" || role === "client") acts = acts.filter((a) => a.actType === "company");
    res.json(acts.map(({ fileData, ...rest }) => rest));
  } catch (error) {
    console.error("Get acts error:", error);
    res.status(500).json({ error: "Failed to get acts" });
  }
});
actsRouter.post("/api/invoices/:id/acts", authMiddleware, requireRole("admin", "assistant", "accountant"), async (req, res) => {
  try {
    const { id } = req.params;
    const { actType, fileName, fileData, mimeType, isLink, url } = req.body;
    console.log("[Upload Act] Request received - invoiceId:", id, "actType:", actType, "fileName:", fileName, "role:", req.user?.role, "tokenId:", req.user?.token?.id);
    const invoice = await storage.getInvoice(id);
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    if (req.user?.role === "accountant" && !invoice.hideFromAssistant) return res.status(403).json({ error: "Forbidden" });
    if (isLink) {
      if (!url) return res.status(400).json({ error: "URL is required for link-type acts" });
    } else {
      if (!fileData || !mimeType) return res.status(400).json({ error: "File data and mime type are required for file uploads" });
    }
    const act = await storage.createSignedAct({ invoiceId: id, actType, fileName, fileData: isLink ? null : fileData, mimeType: isLink ? null : mimeType, isLink: isLink || false, url: isLink ? url : null, uploadedBy: req.user.token.id });
    const client = invoice.clientId ? await storage.getClient(invoice.clientId) : null;
    const partner = invoice.partnerId ? await storage.getPartner(invoice.partnerId) : null;
    const invoiceNumber = invoice.invoiceNumber;
    const displayName = invoiceNumber || client?.name || partner?.name || invoice.description || id;
    const actTypeLabel = actType === "company" ? "\u043A\u043E\u043C\u043F\u0430\u043D\u0438\u0438" : "\u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044F";
    console.log("[Upload Act] About to log action for act:", act.id, "token:", req.user.token.id);
    try {
      await storage.logAssistantAction({ accessTokenId: req.user.token.id, actionType: "upload_act", entityType: "act", entityId: act.id, description: `\u0417\u0430\u0433\u0440\u0443\u0436\u0435\u043D \u0430\u043A\u0442 ${actTypeLabel}: ${displayName}`, details: JSON.stringify({ invoiceId: id, invoiceNumber, clientName: client?.name, partnerName: partner?.name, actType, fileName, isLink: isLink || false }), ipAddress: req.ip || req.headers["x-forwarded-for"] || null, userAgent: req.headers["user-agent"] || null });
      console.log("[Upload Act] Action logged successfully");
    } catch (logError) {
      console.error("[Upload Act] Failed to log action:", logError);
    }
    const { fileData: _, ...actWithoutData } = act;
    res.status(201).json(actWithoutData);
  } catch (error) {
    console.error("Create act error:", error);
    res.status(500).json({ error: "Failed to upload act" });
  }
});
actsRouter.get("/api/acts/:id/download", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const role = req.user?.role || "client";
    const act = await storage.getSignedAct(id);
    if (!act) return res.status(404).json({ error: "Act not found" });
    if ((role === "partner" || role === "client") && act.actType === "executor") return res.status(403).json({ error: "Forbidden" });
    const invoice = await storage.getInvoice(act.invoiceId);
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    if (role === "partner" && invoice.partnerId !== req.user?.partnerId) return res.status(403).json({ error: "Forbidden" });
    if (role === "client" && invoice.clientId !== req.user?.clientId) return res.status(403).json({ error: "Forbidden" });
    res.json({ fileName: act.fileName, fileData: act.fileData, mimeType: act.mimeType });
  } catch (error) {
    console.error("Download act error:", error);
    res.status(500).json({ error: "Failed to download act" });
  }
});
actsRouter.delete("/api/acts/:id", authMiddleware, requireRole("admin", "assistant", "accountant"), async (req, res) => {
  try {
    const { id } = req.params;
    const act = await storage.getSignedAct(id);
    if (!act) return res.status(404).json({ error: "Act not found" });
    const invoice = await storage.getInvoice(act.invoiceId);
    const client = invoice?.clientId ? await storage.getClient(invoice.clientId) : null;
    const partner = invoice?.partnerId ? await storage.getPartner(invoice.partnerId) : null;
    const invoiceNumber = invoice?.invoiceNumber;
    const displayName = invoiceNumber || client?.name || partner?.name || invoice?.description || act.invoiceId;
    const actTypeLabel = act.actType === "company" ? "\u043A\u043E\u043C\u043F\u0430\u043D\u0438\u0438" : "\u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044F";
    await storage.logAssistantAction({ accessTokenId: req.user.token.id, actionType: "delete_act", entityType: "act", entityId: id, description: `\u0423\u0434\u0430\u043B\u0451\u043D \u0430\u043A\u0442 ${actTypeLabel}: ${displayName}`, details: JSON.stringify({ invoiceId: act.invoiceId, invoiceNumber, clientName: client?.name, partnerName: partner?.name, actType: act.actType, fileName: act.fileName }), ipAddress: req.ip || req.headers["x-forwarded-for"] || null, userAgent: req.headers["user-agent"] || null });
    await storage.deleteSignedAct(id);
    res.json({ success: true });
  } catch (error) {
    console.error("Delete act error:", error);
    res.status(500).json({ error: "Failed to delete act" });
  }
});

// server/routes/recurring.ts
import { Router as Router7 } from "express";
var recurringRouter = Router7();
recurringRouter.get("/api/recurring-invoices", authMiddleware, requireRole("admin", "assistant"), async (_req, res) => {
  try {
    res.json(await storage.getRecurringInvoices());
  } catch (error) {
    console.error("Get recurring invoices error:", error);
    res.status(500).json({ error: "Failed to get recurring invoices" });
  }
});
recurringRouter.post("/api/recurring-invoices", authMiddleware, requireRole("admin", "assistant"), async (req, res) => {
  try {
    const { clientId, partnerId, scheme, partnerCommissionRate, amount, description, frequency, dayOfMonth, startDate, endDate, nextInvoiceDate, notes, hideFromAssistant } = req.body;
    const created = await storage.createRecurringInvoice({ clientId, partnerId, scheme, partnerCommissionRate: partnerCommissionRate ? partnerCommissionRate.toString() : null, amount: amount?.toString() || "0", description, frequency: frequency || "monthly", dayOfMonth: dayOfMonth?.toString() || "1", startDate: startDate || (/* @__PURE__ */ new Date()).toISOString().split("T")[0], endDate: endDate || null, nextInvoiceDate: nextInvoiceDate || startDate, notes, hideFromAssistant: hideFromAssistant ?? false, createdBy: req.user.token.id });
    res.status(201).json(created);
  } catch (error) {
    console.error("Create recurring invoice error:", error);
    res.status(500).json({ error: "Failed to create recurring invoice" });
  }
});
recurringRouter.get("/api/recurring-invoices/due", authMiddleware, requireRole("admin", "assistant"), async (_req, res) => {
  try {
    res.json(await storage.getDueRecurringInvoices());
  } catch (error) {
    console.error("Get due recurring invoices error:", error);
    res.status(500).json({ error: "Failed to get due recurring invoices" });
  }
});
recurringRouter.post("/api/recurring-invoices/process", authMiddleware, requireRole("admin"), async (_req, res) => {
  try {
    res.json(await storage.processAllDueRecurringInvoices());
  } catch (error) {
    console.error("Process recurring invoices error:", error);
    res.status(500).json({ error: "Failed to process recurring invoices" });
  }
});
recurringRouter.get("/api/recurring-invoices/cashflow", authMiddleware, requireRole("admin", "assistant"), async (_req, res) => {
  try {
    res.json(await storage.getActiveRecurringInvoicesForCashFlow());
  } catch (error) {
    console.error("Get recurring for cashflow error:", error);
    res.status(500).json({ error: "Failed to get recurring invoices for cashflow" });
  }
});
recurringRouter.post("/api/recurring-invoices/:id/create-draft", authMiddleware, requireRole("admin", "assistant"), async (req, res) => {
  try {
    const { id } = req.params;
    const { invoiceDate } = req.body;
    res.status(201).json(await storage.createDraftFromRecurring(id, invoiceDate));
  } catch (error) {
    console.error("Create draft from recurring error:", error);
    res.status(500).json({ error: error.message || "Failed to create draft" });
  }
});
recurringRouter.post("/api/recurring-invoices/:id/backdate", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const { fromDate } = req.body;
    if (!fromDate) return res.status(400).json({ error: "fromDate is required" });
    res.json(await storage.generateBackdatedInvoices(id, fromDate));
  } catch (error) {
    console.error("Generate backdated invoices error:", error);
    res.status(500).json({ error: error.message || "Failed to generate backdated invoices" });
  }
});
recurringRouter.patch("/api/recurring-invoices/:id", authMiddleware, requireRole("admin", "assistant"), async (req, res) => {
  try {
    const updated = await storage.updateRecurringInvoice(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: "Recurring invoice not found" });
    res.json(updated);
  } catch (error) {
    console.error("Update recurring invoice error:", error);
    res.status(500).json({ error: "Failed to update recurring invoice" });
  }
});
recurringRouter.delete("/api/recurring-invoices/:id", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    await storage.deleteRecurringInvoice(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error("Delete recurring invoice error:", error);
    res.status(500).json({ error: "Failed to delete recurring invoice" });
  }
});
recurringRouter.post("/api/my-invoices/export", authMiddleware, requireRole("assistant", "accountant"), async (req, res) => {
  try {
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Invoice Management System";
    workbook.created = /* @__PURE__ */ new Date();
    const role = req.user?.role;
    const invoices2 = await storage.getInvoices(role);
    const allClients = await storage.getClients();
    const clientMap = new Map(allClients.map((c) => [c.id, c.name]));
    const statusMap = { draft: "\u0427\u0435\u0440\u043D\u043E\u0432\u0438\u043A", sent: "\u041E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D", paid: "\u041E\u043F\u043B\u0430\u0447\u0435\u043D", cancelled: "\u041E\u0442\u043C\u0435\u043D\u0451\u043D" };
    const schemeMap = { agency_30: "\u0410\u0433\u0435\u043D\u0442\u0441\u0442\u0432\u043E 30%", agency_40: "\u0410\u0433\u0435\u043D\u0442\u0441\u0442\u0432\u043E 40%", partner_10: "\u041F\u0430\u0440\u0442\u043D\u0451\u0440\u0441\u043A\u043E\u0435 10%", partner_15: "\u041F\u0430\u0440\u0442\u043D\u0451\u0440\u0441\u043A\u043E\u0435 15%", commission_based: "\u041F\u0430\u0440\u0442\u043D\u0451\u0440\u0441\u043A\u043E\u0435 \u0441\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435" };
    const sheet = workbook.addWorksheet("\u0421\u0447\u0435\u0442\u0430");
    sheet.columns = [
      { header: "\u041D\u043E\u043C\u0435\u0440 \u0441\u0447\u0451\u0442\u0430", key: "number", width: 20 },
      { header: "\u041A\u043B\u0438\u0435\u043D\u0442", key: "client", width: 25 },
      { header: "\u0421\u0442\u0430\u0442\u0443\u0441", key: "status", width: 14 },
      { header: "\u0421\u0445\u0435\u043C\u0430", key: "scheme", width: 22 },
      { header: "\u0421\u0443\u043C\u043C\u0430 \u043A\u043B\u0438\u0435\u043D\u0442\u0443", key: "clientBill", width: 18, style: { numFmt: "#,##0.00 \u20BD" } },
      { header: "\u041F\u043B\u0430\u043D. \u0440\u0430\u0441\u0445\u043E\u0434\u044B", key: "plannedExpenses", width: 18, style: { numFmt: "#,##0.00 \u20BD" } },
      { header: "\u0424\u0430\u043A\u0442. \u0440\u0430\u0441\u0445\u043E\u0434\u044B", key: "actualExpenses", width: 18, style: { numFmt: "#,##0.00 \u20BD" } },
      { header: "\u041E\u0441\u0442\u0430\u0442\u043E\u043A", key: "remaining", width: 18, style: { numFmt: "#,##0.00 \u20BD" } },
      { header: "\u0414\u0430\u0442\u0430 \u043E\u043F\u043B\u0430\u0442\u044B", key: "paymentDate", width: 14 },
      { header: "\u041F\u0440\u0438\u043C\u0435\u0447\u0430\u043D\u0438\u0435", key: "notes", width: 30 },
      { header: "\u0417\u0430\u043A\u0440\u044B\u0432\u0430\u044E\u0449\u0438\u0439 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442", key: "closingDoc", width: 40 }
    ];
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };
    for (const inv of invoices2) {
      const clientBill = parseNum(inv.calculations?.clientBill || inv.clientBill || "0");
      const actualExpenses = parseNum(inv.calculations?.executorExpensesTotal || "0");
      const plannedExpenses = parseNum(inv.plannedExpenses || "0");
      let remaining;
      if (inv.scheme === "agency_30" || inv.scheme === "agency_40") {
        remaining = parseNum(inv.calculations?.clientBaseAfterMargin || "0") - actualExpenses;
      } else {
        remaining = clientBill - actualExpenses;
      }
      sheet.addRow({ number: inv.invoiceNumber || "\u2014", client: clientMap.get(inv.clientId || "") || "\u2014", status: statusMap[inv.status || ""] || inv.status, scheme: schemeMap[inv.scheme || ""] || inv.scheme || "\u2014", clientBill, plannedExpenses: plannedExpenses || 0, actualExpenses, remaining, paymentDate: inv.paymentDate ? new Date(inv.paymentDate).toLocaleDateString("ru-RU") : "\u2014", notes: inv.notes || "", closingDoc: inv.closingDocumentUrl || "" });
    }
    const expSheet = workbook.addWorksheet("\u0420\u0430\u0441\u0445\u043E\u0434\u044B");
    expSheet.columns = [
      { header: "\u041D\u043E\u043C\u0435\u0440 \u0441\u0447\u0451\u0442\u0430", key: "invoiceNumber", width: 20 },
      { header: "\u041A\u043B\u0438\u0435\u043D\u0442", key: "client", width: 25 },
      { header: "\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u0440\u0430\u0441\u0445\u043E\u0434\u0430", key: "description", width: 30 },
      { header: "\u0421\u0443\u043C\u043C\u0430", key: "amount", width: 18, style: { numFmt: "#,##0.00 \u20BD" } },
      { header: "\u0414\u0430\u0442\u0430", key: "date", width: 14 },
      { header: "\u041E\u043F\u043B\u0430\u0447\u0435\u043D\u043E \u0430\u0434\u043C\u0438\u043D\u043E\u043C", key: "paidByAdmin", width: 16 }
    ];
    const expHeaderRow = expSheet.getRow(1);
    expHeaderRow.font = { bold: true };
    expHeaderRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };
    for (const inv of invoices2) {
      const expenses = await storage.getInvoiceExpenses(inv.id);
      for (const exp of expenses) {
        expSheet.addRow({ invoiceNumber: inv.invoiceNumber || "\u2014", client: clientMap.get(inv.clientId || "") || "\u2014", description: exp.description || "\u2014", amount: parseNum(exp.amount || "0"), date: exp.date ? new Date(exp.date).toLocaleDateString("ru-RU") : "\u2014", paidByAdmin: exp.paidByAdmin ? "\u0414\u0430" : "\u041D\u0435\u0442" });
      }
    }
    const buffer = await workbook.xlsx.writeBuffer();
    const roleLabel = role === "accountant" ? "accountant" : "assistant";
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=export_${roleLabel}_${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.xlsx`);
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error("Export my invoices error:", error);
    res.status(500).json({ error: "Failed to export data" });
  }
});

// server/routes/export.ts
import { Router as Router8 } from "express";
var exportRouter = Router8();
exportRouter.post("/api/admin/export", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Invoice Management System";
    workbook.created = /* @__PURE__ */ new Date();
    const { exportTypes = ["invoices"], dateFrom, dateTo, actualDateFrom, actualDateTo, statuses = [], partnerIds = [] } = req.body;
    const allInvoices = await storage.getInvoices("admin");
    const allClients = await storage.getClients();
    const allPartners = await storage.getPartners();
    const allExpenses = await storage.getAllExpenses();
    let filteredInvoices = allInvoices;
    if (statuses.length > 0) filteredInvoices = filteredInvoices.filter((inv) => statuses.includes(inv.status));
    if (partnerIds.length > 0) filteredInvoices = filteredInvoices.filter((inv) => inv.partnerId && partnerIds.includes(inv.partnerId));
    if (dateFrom) {
      const fromDate = new Date(dateFrom);
      filteredInvoices = filteredInvoices.filter((inv) => inv.paymentDate && new Date(inv.paymentDate) >= fromDate);
    }
    if (dateTo) {
      const toDate = new Date(dateTo);
      filteredInvoices = filteredInvoices.filter((inv) => inv.paymentDate && new Date(inv.paymentDate) <= toDate);
    }
    if (actualDateFrom) {
      const fromDate = new Date(actualDateFrom);
      filteredInvoices = filteredInvoices.filter((inv) => inv.actualPaymentDate && new Date(inv.actualPaymentDate) >= fromDate);
    }
    if (actualDateTo) {
      const toDate = new Date(actualDateTo);
      filteredInvoices = filteredInvoices.filter((inv) => inv.actualPaymentDate && new Date(inv.actualPaymentDate) <= toDate);
    }
    if (exportTypes.includes("invoices")) {
      const sheet = workbook.addWorksheet("\u0421\u0447\u0435\u0442\u0430");
      sheet.columns = [
        { header: "\u041D\u043E\u043C\u0435\u0440", key: "number", width: 15 },
        { header: "\u041A\u043B\u0438\u0435\u043D\u0442", key: "client", width: 25 },
        { header: "\u041F\u0430\u0440\u0442\u043D\u0451\u0440", key: "partner", width: 25 },
        { header: "\u0421\u0442\u0430\u0442\u0443\u0441", key: "status", width: 12 },
        { header: "\u0421\u0443\u043C\u043C\u0430 \u043A\u043B\u0438\u0435\u043D\u0442\u0430", key: "clientBill", width: 18, style: { numFmt: "#,##0.00 \u20BD" } },
        { header: "\u0421\u0445\u0435\u043C\u0430", key: "scheme", width: 15 },
        { header: "\u041A\u043E\u043C\u0438\u0441\u0441\u0438\u044F %", key: "commissionRate", width: 12 },
        { header: "\u041A\u043E\u043C\u0438\u0441\u0441\u0438\u044F", key: "commissionAmount", width: 18, style: { numFmt: "#,##0.00 \u20BD" } },
        { header: "\u0420\u0430\u0441\u0445\u043E\u0434\u044B", key: "expenses", width: 18, style: { numFmt: "#,##0.00 \u20BD" } },
        { header: "\u0427\u0438\u0441\u0442\u0430\u044F \u043F\u0440\u0438\u0431\u044B\u043B\u044C", key: "netProfit", width: 18, style: { numFmt: "#,##0.00 \u20BD" } },
        { header: "\u0414\u043E\u043B\u0433 \u043F\u0430\u0440\u0442\u043D\u0451\u0440\u0430", key: "partnerDebt", width: 18, style: { numFmt: "#,##0.00 \u20BD" } },
        { header: "\u041E\u0441\u0442\u0430\u0442\u043E\u043A \u043A\u043B\u0438\u0435\u043D\u0442\u0430", key: "clientRemaining", width: 18, style: { numFmt: "#,##0.00 \u20BD" } },
        { header: "\u041F\u043B\u0430\u043D. \u0434\u0430\u0442\u0430", key: "paymentDate", width: 14 },
        { header: "\u0424\u0430\u043A\u0442. \u0434\u0430\u0442\u0430", key: "actualPaymentDate", width: 14 },
        { header: "\u041F\u0440\u0438\u043C\u0435\u0447\u0430\u043D\u0438\u0435", key: "notes", width: 30 }
      ];
      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };
      const statusMap = { draft: "\u0427\u0435\u0440\u043D\u043E\u0432\u0438\u043A", sent: "\u041E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D", paid: "\u041E\u043F\u043B\u0430\u0447\u0435\u043D", cancelled: "\u041E\u0442\u043C\u0435\u043D\u0451\u043D" };
      const schemeMap = { partner_10: "\u041F\u0430\u0440\u0442\u043D\u0451\u0440 10%", partner_15: "\u041F\u0430\u0440\u0442\u043D\u0451\u0440 15%", agency_30: "\u0410\u0433\u0435\u043D\u0442\u0441\u043A\u0438\u0439 30%", commission_based: "\u041A\u043E\u043C\u0438\u0441\u0441\u0438\u043E\u043D\u043D\u044B\u0439" };
      for (const inv of filteredInvoices) {
        const client = allClients.find((c) => c.id === inv.clientId);
        const partner = allPartners.find((p) => p.id === inv.partnerId);
        const calc = inv.calculations;
        sheet.addRow({ number: inv.invoiceNumber, client: client?.name || "", partner: partner?.name || "", status: statusMap[inv.status] || inv.status, clientBill: Number(calc?.clientBill || inv.clientBill || 0), scheme: schemeMap[inv.scheme] || inv.scheme, commissionRate: calc?.commissionRate ? `${calc.commissionRate}%` : "", commissionAmount: Number(calc?.commissionAmount || 0), expenses: Number(calc?.executorExpensesTotal || 0), netProfit: Number(calc?.netProfitAdmin || 0), partnerDebt: Number(calc?.partnerTransferDue || 0), clientRemaining: Number(calc?.clientRemaining || 0), paymentDate: inv.paymentDate ? new Date(inv.paymentDate).toLocaleDateString("ru-RU") : "", actualPaymentDate: inv.actualPaymentDate ? new Date(inv.actualPaymentDate).toLocaleDateString("ru-RU") : "", notes: inv.notes || "" });
      }
    }
    if (exportTypes.includes("clients")) {
      const sheet = workbook.addWorksheet("\u041A\u043B\u0438\u0435\u043D\u0442\u044B");
      sheet.columns = [
        { header: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435", key: "name", width: 30 },
        { header: "\u041A\u043E\u043D\u0442\u0430\u043A\u0442\u043D\u043E\u0435 \u043B\u0438\u0446\u043E", key: "contact", width: 25 },
        { header: "Email", key: "email", width: 25 },
        { header: "\u0422\u0435\u043B\u0435\u0444\u043E\u043D", key: "phone", width: 18 },
        { header: "\u0421\u0447\u0435\u0442\u043E\u0432", key: "invoicesCount", width: 10 },
        { header: "\u041E\u0431\u0449\u0430\u044F \u0441\u0443\u043C\u043C\u0430", key: "totalBilled", width: 18, style: { numFmt: "#,##0.00 \u20BD" } }
      ];
      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };
      for (const client of allClients) {
        const clientInvoices = allInvoices.filter((inv) => inv.clientId === client.id);
        const totalBilled = clientInvoices.reduce((sum2, inv) => sum2 + Number(inv.calculations?.clientBill || inv.clientBill || 0), 0);
        sheet.addRow({ name: client.name, contact: "", email: client.email || "", phone: client.phone || "", invoicesCount: clientInvoices.length, totalBilled });
      }
    }
    if (exportTypes.includes("partners")) {
      const sheet = workbook.addWorksheet("\u041F\u0430\u0440\u0442\u043D\u0451\u0440\u044B");
      sheet.columns = [
        { header: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435", key: "name", width: 30 },
        { header: "Email", key: "email", width: 25 },
        { header: "\u0422\u0435\u043B\u0435\u0444\u043E\u043D", key: "phone", width: 18 },
        { header: "\u0421\u0447\u0435\u0442\u043E\u0432 (\u0432\u0441\u0435\u0433\u043E)", key: "invoicesCount", width: 12 },
        { header: "\u0421\u0447\u0435\u0442\u043E\u0432 (\u043E\u043F\u043B\u0430\u0447.)", key: "paidCount", width: 12 },
        { header: "\u041A\u043E\u043C\u0438\u0441\u0441\u0438\u044F (\u043E\u043F\u043B\u0430\u0447.)", key: "paidCommission", width: 18, style: { numFmt: "#,##0.00 \u20BD" } },
        { header: "\u0414\u043E\u043B\u0436\u0435\u043D \u043F\u0435\u0440\u0435\u0432\u0435\u0441\u0442\u0438", key: "totalToTransfer", width: 18, style: { numFmt: "#,##0.00 \u20BD" } },
        { header: "\u0423\u0436\u0435 \u043E\u043F\u043B\u0430\u0442\u0438\u043B", key: "totalPaid", width: 18, style: { numFmt: "#,##0.00 \u20BD" } },
        { header: "\u041E\u0441\u0442\u0430\u0442\u043E\u043A \u0434\u043E\u043B\u0433\u0430", key: "remaining", width: 18, style: { numFmt: "#,##0.00 \u20BD" } }
      ];
      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };
      const partnerDebts = await storage.getPartnerDebtSummaries();
      for (const pd of partnerDebts) {
        sheet.addRow({ name: pd.partnerName, email: pd.email || "", phone: pd.phone || "", invoicesCount: pd.totalInvoiceCount, paidCount: pd.invoiceCount, paidCommission: pd.paidCommission, totalToTransfer: pd.totalToTransfer, totalPaid: pd.totalPaid, remaining: pd.remaining });
      }
    }
    if (exportTypes.includes("expenses")) {
      const sheet = workbook.addWorksheet("\u0420\u0430\u0441\u0445\u043E\u0434\u044B");
      sheet.columns = [
        { header: "\u041D\u043E\u043C\u0435\u0440 \u0441\u0447\u0451\u0442\u0430", key: "invoiceNumber", width: 15 },
        { header: "\u041A\u043B\u0438\u0435\u043D\u0442", key: "client", width: 25 },
        { header: "\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435", key: "description", width: 35 },
        { header: "\u0421\u0443\u043C\u043C\u0430", key: "amount", width: 18, style: { numFmt: "#,##0.00 \u20BD" } },
        { header: "\u041E\u043F\u043B\u0430\u0442\u0438\u043B", key: "paidBy", width: 15 },
        { header: "\u0414\u0430\u0442\u0430", key: "date", width: 14 },
        { header: "\u041F\u0440\u0438\u043C\u0435\u0447\u0430\u043D\u0438\u0435", key: "notes", width: 30 }
      ];
      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };
      for (const expense of allExpenses) {
        const invoice = allInvoices.find((inv) => inv.id === expense.invoiceId);
        const client = allClients.find((c) => c.id === invoice?.clientId);
        sheet.addRow({ invoiceNumber: invoice?.invoiceNumber || "\u2014", client: client?.name || "\u2014", description: expense.description || "\u2014", amount: Number(expense.amount || 0), paidBy: expense.paidByAdmin ? "\u0410\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440" : expense.paidByPartner ? "\u041F\u0430\u0440\u0442\u043D\u0451\u0440" : "\u2014", date: expense.date ? new Date(expense.date).toLocaleDateString("ru-RU") : "\u2014", notes: expense.notes || "" });
      }
    }
    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=export_${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}.xlsx`);
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error("Export error:", error);
    res.status(500).json({ error: error.message || "Failed to export data" });
  }
});
exportRouter.post("/api/admin/export/client-report/preview", authMiddleware, requireRole("admin", "partner", "client"), async (req, res) => {
  try {
    const { invoiceId, clientId, dateFrom, dateTo } = req.body;
    const allInvoices = await storage.getInvoices("admin");
    let invoices2 = allInvoices;
    if (invoiceId) {
      invoices2 = allInvoices.filter((inv) => inv.id === invoiceId);
    } else if (clientId) {
      invoices2 = allInvoices.filter((inv) => inv.clientId === clientId);
    }
    if (req.user?.role === "partner") {
      const partnerOwnId = req.user.partnerId;
      if (!partnerOwnId) return res.status(403).json({ error: "\u041F\u0430\u0440\u0442\u043D\u0451\u0440 \u043D\u0435 \u0438\u0434\u0435\u043D\u0442\u0438\u0444\u0438\u0446\u0438\u0440\u043E\u0432\u0430\u043D" });
      invoices2 = invoices2.filter((inv) => inv.partnerId === partnerOwnId);
    }
    if (req.user?.role === "client") {
      const ownClientId = req.user.clientId;
      if (!ownClientId) return res.status(403).json({ error: "\u041A\u043B\u0438\u0435\u043D\u0442 \u043D\u0435 \u0438\u0434\u0435\u043D\u0442\u0438\u0444\u0438\u0446\u0438\u0440\u043E\u0432\u0430\u043D" });
      invoices2 = invoices2.filter((inv) => inv.clientId === ownClientId);
    }
    if (dateFrom) {
      const from = new Date(dateFrom);
      invoices2 = invoices2.filter((inv) => inv.paymentDate && new Date(inv.paymentDate) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      invoices2 = invoices2.filter((inv) => inv.paymentDate && new Date(inv.paymentDate) <= to);
    }
    invoices2 = invoices2.filter((inv) => inv.status !== "cancelled");
    const count2 = invoices2.length;
    const totalBudget = invoices2.reduce((sum2, inv) => sum2 + Number(inv.calculations?.clientBill || inv.clientBill || 0), 0);
    const totalExpenses = invoices2.reduce((sum2, inv) => sum2 + Number(inv.calculations?.executorExpensesTotal || 0), 0);
    const totalRemaining = invoices2.reduce((sum2, inv) => {
      const isAgency = inv.scheme === "agency_30" || inv.scheme === "agency_40";
      if (isAgency) {
        return sum2 + Number(inv.calculations?.clientRemaining ?? Number(inv.calculations?.clientBill || inv.clientBill || 0) - Number(inv.calculations?.executorExpensesTotal || 0));
      }
      return sum2 + Number(inv.calculations?.clientRemaining ?? 0);
    }, 0);
    res.json({ count: count2, totalBudget, totalExpenses, totalRemaining });
  } catch (error) {
    console.error("Client report preview error:", error);
    res.status(500).json({ error: error.message || "Failed to generate preview" });
  }
});
exportRouter.post("/api/admin/export/client-report", authMiddleware, requireRole("admin", "partner", "client"), async (req, res) => {
  try {
    const { invoiceId, clientId, dateFrom, dateTo } = req.body;
    if (req.user?.role !== "client" && !invoiceId && !clientId) {
      return res.status(400).json({ error: "invoiceId \u0438\u043B\u0438 clientId \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u0435\u043D" });
    }
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Invoice Management System";
    workbook.created = /* @__PURE__ */ new Date();
    const allInvoices = await storage.getInvoices("admin");
    const allClients = await storage.getClients();
    let invoices2 = allInvoices;
    if (invoiceId) {
      invoices2 = allInvoices.filter((inv) => inv.id === invoiceId);
    } else if (clientId) {
      invoices2 = allInvoices.filter((inv) => inv.clientId === clientId);
    }
    if (req.user?.role === "partner") {
      const partnerOwnId = req.user.partnerId;
      if (!partnerOwnId) {
        return res.status(403).json({ error: "\u041F\u0430\u0440\u0442\u043D\u0451\u0440 \u043D\u0435 \u0438\u0434\u0435\u043D\u0442\u0438\u0444\u0438\u0446\u0438\u0440\u043E\u0432\u0430\u043D" });
      }
      invoices2 = invoices2.filter((inv) => inv.partnerId === partnerOwnId);
      if (invoices2.length === 0) {
        return res.status(403).json({ error: "\u041D\u0435\u0442 \u0434\u043E\u0441\u0442\u0443\u043F\u0430 \u043A \u044D\u0442\u043E\u043C\u0443 \u0441\u0447\u0451\u0442\u0443 \u0438\u043B\u0438 \u043A\u043B\u0438\u0435\u043D\u0442\u0443" });
      }
    }
    if (req.user?.role === "client") {
      const ownClientId = req.user.clientId;
      if (!ownClientId) {
        return res.status(403).json({ error: "\u041A\u043B\u0438\u0435\u043D\u0442 \u043D\u0435 \u0438\u0434\u0435\u043D\u0442\u0438\u0444\u0438\u0446\u0438\u0440\u043E\u0432\u0430\u043D" });
      }
      invoices2 = invoices2.filter((inv) => inv.clientId === ownClientId);
      if (invoiceId && invoices2.length === 0) {
        return res.status(403).json({ error: "\u041D\u0435\u0442 \u0434\u043E\u0441\u0442\u0443\u043F\u0430 \u043A \u044D\u0442\u043E\u043C\u0443 \u0441\u0447\u0451\u0442\u0443" });
      }
    }
    if (dateFrom) {
      const from = new Date(dateFrom);
      invoices2 = invoices2.filter((inv) => inv.paymentDate && new Date(inv.paymentDate) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      invoices2 = invoices2.filter((inv) => inv.paymentDate && new Date(inv.paymentDate) <= to);
    }
    invoices2 = invoices2.filter((inv) => inv.status !== "cancelled");
    const clientName = (() => {
      if (invoiceId && invoices2.length > 0) {
        return allClients.find((c) => c.id === invoices2[0].clientId)?.name || "\u043A\u043B\u0438\u0435\u043D\u0442";
      }
      if (clientId) {
        return allClients.find((c) => c.id === clientId)?.name || "\u043A\u043B\u0438\u0435\u043D\u0442";
      }
      return "\u043A\u043B\u0438\u0435\u043D\u0442";
    })();
    const statusMap = { draft: "\u0427\u0435\u0440\u043D\u043E\u0432\u0438\u043A", sent: "\u041E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D", paid: "\u041E\u043F\u043B\u0430\u0447\u0435\u043D", cancelled: "\u041E\u0442\u043C\u0435\u043D\u0451\u043D" };
    const agencyInvoices = invoices2.filter((inv) => inv.scheme === "agency_30" || inv.scheme === "agency_40");
    const closedInvoices = invoices2.filter((inv) => inv.scheme !== "agency_30" && inv.scheme !== "agency_40");
    if (agencyInvoices.length > 0) {
      const sheet = workbook.addWorksheet("\u041E\u0442\u043A\u0440\u044B\u0442\u0430\u044F \u043A\u043E\u043C\u0438\u0441\u0441\u0438\u044F");
      sheet.columns = [
        { header: "\u041D\u043E\u043C\u0435\u0440 \u0441\u0447\u0451\u0442\u0430", key: "number", width: 18 },
        { header: "\u0421\u0442\u0430\u0442\u0443\u0441", key: "status", width: 14 },
        { header: "\u0421\u0443\u043C\u043C\u0430 \u0441\u0447\u0451\u0442\u0430", key: "clientBill", width: 18, style: { numFmt: "#,##0.00 \u20BD" } },
        { header: "\u041A\u043E\u043C\u0438\u0441\u0441\u0438\u044F \u0430\u0433\u0435\u043D\u0442\u0441\u0442\u0432\u0430 %", key: "commissionRate", width: 22 },
        { header: "\u0421\u0443\u043C\u043C\u0430 \u043A\u043E\u043C\u0438\u0441\u0441\u0438\u0438", key: "commissionAmount", width: 20, style: { numFmt: "#,##0.00 \u20BD" } },
        { header: "\u0411\u044E\u0434\u0436\u0435\u0442 \u043F\u043E\u0441\u043B\u0435 \u043A\u043E\u043C\u0438\u0441\u0441\u0438\u0438", key: "budgetAfterMargin", width: 24, style: { numFmt: "#,##0.00 \u20BD" } },
        { header: "\u0420\u0430\u0441\u0445\u043E\u0434\u044B", key: "expenses", width: 18, style: { numFmt: "#,##0.00 \u20BD" } },
        { header: "\u041E\u0441\u0442\u0430\u0442\u043E\u043A", key: "remaining", width: 18, style: { numFmt: "#,##0.00 \u20BD" } }
      ];
      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };
      for (const inv of agencyInvoices) {
        const calc = inv.calculations;
        const clientBill = Number(calc?.clientBill || inv.clientBill || 0);
        const marginRate = inv.scheme === "agency_30" ? 30 : 40;
        const commissionAmount = Number(calc?.agencyMargin || clientBill * (marginRate / 100));
        const budgetAfterMargin = Number(calc?.clientBaseAfterMargin || clientBill * (1 - marginRate / 100));
        const expenses = Number(calc?.executorExpensesTotal || 0);
        const remaining = Number(calc?.clientRemaining ?? budgetAfterMargin - expenses);
        sheet.addRow({
          number: inv.invoiceNumber || "\u2014",
          status: statusMap[inv.status] || inv.status,
          clientBill,
          commissionRate: `${marginRate}%`,
          commissionAmount,
          budgetAfterMargin,
          expenses,
          remaining
        });
      }
    }
    if (closedInvoices.length > 0) {
      const sheet = workbook.addWorksheet("\u0411\u044E\u0434\u0436\u0435\u0442 \u0438 \u0440\u0430\u0441\u0445\u043E\u0434\u044B");
      sheet.columns = [
        { header: "\u041D\u043E\u043C\u0435\u0440 \u0441\u0447\u0451\u0442\u0430", key: "number", width: 18 },
        { header: "\u0421\u0442\u0430\u0442\u0443\u0441", key: "status", width: 14 },
        { header: "\u0411\u044E\u0434\u0436\u0435\u0442 \u043A\u043B\u0438\u0435\u043D\u0442\u0430", key: "clientBill", width: 20, style: { numFmt: "#,##0.00 \u20BD" } },
        { header: "\u0420\u0430\u0441\u0445\u043E\u0434\u044B", key: "expenses", width: 18, style: { numFmt: "#,##0.00 \u20BD" } },
        { header: "\u041E\u0441\u0442\u0430\u0442\u043E\u043A", key: "remaining", width: 18, style: { numFmt: "#,##0.00 \u20BD" } }
      ];
      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };
      for (const inv of closedInvoices) {
        const calc = inv.calculations;
        const clientBill = Number(calc?.clientBill || inv.clientBill || 0);
        const expenses = Number(calc?.executorExpensesTotal || 0);
        const remaining = Number(calc?.clientRemaining ?? 0);
        sheet.addRow({
          number: inv.invoiceNumber || "\u2014",
          status: statusMap[inv.status] || inv.status,
          clientBill,
          expenses,
          remaining
        });
      }
    }
    if (agencyInvoices.length === 0 && closedInvoices.length === 0) {
      const sheet = workbook.addWorksheet("\u041E\u0442\u0447\u0451\u0442");
      sheet.addRow(["\u041D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445 \u0434\u043B\u044F \u043E\u0442\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F"]);
    }
    const buffer = await workbook.xlsx.writeBuffer();
    const safeClientName = clientName.replace(/[^a-zA-Zа-яА-Я0-9_\- ]/g, "").trim().replace(/\s+/g, "_");
    const safeDate = (d) => d.replace(/[^0-9\-]/g, "").slice(0, 10);
    const dateSuffix = dateFrom && dateTo ? `_${safeDate(dateFrom)}_${safeDate(dateTo)}` : dateFrom ? `_${safeDate(dateFrom)}` : dateTo ? `_${safeDate(dateTo)}` : `_${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=client_report_${safeClientName}${dateSuffix}.xlsx`);
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error("Client report export error:", error);
    res.status(500).json({ error: error.message || "Failed to generate client report" });
  }
});

// server/routes/backup.ts
import { Router as Router9 } from "express";

// server/backupService.ts
import { promises as fs } from "node:fs";
import path from "node:path";
var BACKUP_DIR = process.env.BACKUP_DIR || "/var/finance-duck/backups";
var MAX_AUTO_BACKUPS = 7;
async function ensureBackupDir() {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
}
function parseBackupType(filename) {
  return filename.startsWith("backup-auto-") ? "auto" : "manual";
}
var BackupService = class {
  async createBackup(type = "manual") {
    await ensureBackupDir();
    const timestamp2 = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
    const filename = `backup-${type}-${timestamp2}.json`;
    const filePath = path.join(BACKUP_DIR, filename);
    const [
      allInvoices,
      allClients,
      allPartners,
      allPayments,
      allExpenses,
      allCalculations,
      allTokens,
      allRecurring
    ] = await Promise.all([
      db.select().from(invoices),
      db.select().from(clients),
      db.select().from(partners),
      db.select().from(partnerPayments),
      db.select().from(invoiceExpenses),
      db.select().from(invoiceCalculations),
      db.select().from(accessTokens),
      db.select().from(recurringInvoices)
    ]);
    const backupData = {
      version: "1.0",
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      type,
      data: {
        invoices: allInvoices,
        clients: allClients,
        partners: allPartners,
        partnerPayments: allPayments,
        invoiceExpenses: allExpenses,
        invoiceCalculations: allCalculations,
        accessTokens: allTokens,
        recurringInvoices: allRecurring
      }
    };
    const jsonContent = JSON.stringify(backupData, null, 2);
    await fs.writeFile(filePath, jsonContent, "utf8");
    console.log(`[Backup] Created backup: ${filename}`);
    if (type === "auto") {
      await this.cleanupOldBackups();
    }
    return {
      id: filename,
      filename,
      createdAt: backupData.createdAt,
      sizeBytes: Buffer.byteLength(jsonContent, "utf8"),
      type
    };
  }
  async listBackups() {
    try {
      await ensureBackupDir();
      const entries = await fs.readdir(BACKUP_DIR);
      const backups = [];
      for (const filename of entries) {
        if (!filename.startsWith("backup-") || !filename.endsWith(".json")) continue;
        const filePath = path.join(BACKUP_DIR, filename);
        const stat = await fs.stat(filePath);
        let createdAt = stat.mtime.toISOString();
        try {
          const head = await fs.readFile(filePath, "utf8");
          const parsed = JSON.parse(head);
          if (parsed?.createdAt) createdAt = parsed.createdAt;
        } catch {
        }
        backups.push({
          id: filename,
          filename,
          createdAt,
          sizeBytes: stat.size,
          type: parseBackupType(filename)
        });
      }
      backups.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      return backups;
    } catch (error) {
      console.error("[Backup] Error listing backups:", error);
      return [];
    }
  }
  async downloadBackup(backupId) {
    try {
      const filePath = path.join(BACKUP_DIR, path.basename(backupId));
      const content = await fs.readFile(filePath, "utf8");
      return JSON.parse(content);
    } catch (error) {
      const code = error?.code;
      if (code !== "ENOENT") {
        console.error("[Backup] Error downloading backup:", error);
      }
      return null;
    }
  }
  async restoreBackup(backupId) {
    try {
      const backupData = await this.downloadBackup(backupId);
      if (!backupData) {
        return { success: false, message: "\u0411\u044D\u043A\u0430\u043F \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D" };
      }
      console.log(`[Backup] Starting restore from: ${backupId}`);
      await db.transaction(async (tx) => {
        await tx.delete(invoiceCalculations);
        await tx.delete(invoiceExpenses);
        await tx.delete(partnerPayments);
        await tx.delete(recurringInvoices);
        await tx.delete(invoices);
        await tx.delete(clients);
        await tx.delete(partners);
        await tx.delete(accessTokens);
        if (backupData.data.partners?.length) {
          await tx.insert(partners).values(backupData.data.partners);
        }
        if (backupData.data.clients?.length) {
          await tx.insert(clients).values(backupData.data.clients);
        }
        if (backupData.data.accessTokens?.length) {
          await tx.insert(accessTokens).values(backupData.data.accessTokens);
        }
        if (backupData.data.invoices?.length) {
          await tx.insert(invoices).values(backupData.data.invoices);
        }
        if (backupData.data.invoiceExpenses?.length) {
          await tx.insert(invoiceExpenses).values(backupData.data.invoiceExpenses);
        }
        if (backupData.data.invoiceCalculations?.length) {
          await tx.insert(invoiceCalculations).values(backupData.data.invoiceCalculations);
        }
        if (backupData.data.partnerPayments?.length) {
          await tx.insert(partnerPayments).values(backupData.data.partnerPayments);
        }
        if (backupData.data.recurringInvoices?.length) {
          await tx.insert(recurringInvoices).values(backupData.data.recurringInvoices);
        }
      });
      console.log(`[Backup] Restore completed successfully`);
      return { success: true, message: "\u0414\u0430\u043D\u043D\u044B\u0435 \u0443\u0441\u043F\u0435\u0448\u043D\u043E \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u044B" };
    } catch (error) {
      console.error("[Backup] Error restoring backup:", error);
      return { success: false, message: `\u041E\u0448\u0438\u0431\u043A\u0430 \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u044F: ${error}` };
    }
  }
  async deleteBackup(backupId) {
    try {
      const filePath = path.join(BACKUP_DIR, path.basename(backupId));
      await fs.unlink(filePath);
      console.log(`[Backup] Deleted backup: ${backupId}`);
      return true;
    } catch (error) {
      const code = error?.code;
      if (code === "ENOENT") return false;
      console.error("[Backup] Error deleting backup:", error);
      return false;
    }
  }
  async cleanupOldBackups() {
    try {
      const backups = await this.listBackups();
      const autoBackups = backups.filter((b) => b.type === "auto");
      if (autoBackups.length > MAX_AUTO_BACKUPS) {
        const toDelete = autoBackups.slice(MAX_AUTO_BACKUPS);
        for (const backup of toDelete) {
          await this.deleteBackup(backup.id);
          console.log(`[Backup] Cleaned up old backup: ${backup.filename}`);
        }
      }
    } catch (error) {
      console.error("[Backup] Error cleaning up old backups:", error);
    }
  }
};
var backupService = new BackupService();

// server/routes/backup.ts
var backupRouter = Router9();
backupRouter.get("/api/backups", authMiddleware, requireRole("admin"), async (_req, res) => {
  try {
    res.json(await backupService.listBackups());
  } catch (error) {
    console.error("List backups error:", error);
    res.status(500).json({ error: error.message || "Failed to list backups" });
  }
});
backupRouter.post("/api/backups", authMiddleware, requireRole("admin"), async (_req, res) => {
  try {
    res.json(await backupService.createBackup("manual"));
  } catch (error) {
    console.error("Create backup error:", error);
    res.status(500).json({ error: error.message || "Failed to create backup" });
  }
});
backupRouter.get("/api/backups/:id/download", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const backupId = decodeURIComponent(req.params.id);
    const backup = await backupService.downloadBackup(backupId);
    if (!backup) return res.status(404).json({ error: "Backup not found" });
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename=${backupId.split("/").pop()}`);
    res.json(backup);
  } catch (error) {
    console.error("Download backup error:", error);
    res.status(500).json({ error: error.message || "Failed to download backup" });
  }
});
backupRouter.post("/api/backups/:id/restore", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const backupId = decodeURIComponent(req.params.id);
    const result = await backupService.restoreBackup(backupId);
    if (!result.success) return res.status(400).json({ error: result.message });
    res.json({ message: result.message });
  } catch (error) {
    console.error("Restore backup error:", error);
    res.status(500).json({ error: error.message || "Failed to restore backup" });
  }
});
backupRouter.delete("/api/backups/:id", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const backupId = decodeURIComponent(req.params.id);
    const deleted = await backupService.deleteBackup(backupId);
    if (!deleted) return res.status(404).json({ error: "Backup not found" });
    res.status(204).send();
  } catch (error) {
    console.error("Delete backup error:", error);
    res.status(500).json({ error: error.message || "Failed to delete backup" });
  }
});

// server/routes/actionLog.ts
import { Router as Router10 } from "express";
var actionLogRouter = Router10();
actionLogRouter.get("/api/assistant-logs", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    const role = req.query.role;
    const dateFrom = req.query.dateFrom;
    const dateTo = req.query.dateTo;
    res.json(await storage.getAssistantActionLogs({ limit, offset, role: role || null, dateFrom: dateFrom || null, dateTo: dateTo || null }));
  } catch (error) {
    console.error("Get assistant logs error:", error);
    res.status(500).json({ error: error.message || "Failed to fetch assistant action logs" });
  }
});
actionLogRouter.get("/api/accountant-logs", authMiddleware, requireRole("accountant"), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    res.json(await storage.getAssistantActionLogs({ limit, offset, role: "accountant", dateFrom: null, dateTo: null }));
  } catch (error) {
    console.error("Get accountant logs error:", error);
    res.status(500).json({ error: error.message || "Failed to fetch accountant action logs" });
  }
});

// server/routes/assistant.ts
import { Router as Router11 } from "express";
import { eq as eq9, and as and8, sql as sql7 } from "drizzle-orm";
var assistantRouter = Router11();
assistantRouter.get(
  "/api/assistant/stats-invoices",
  authMiddleware,
  requireRole("admin", "assistant"),
  async (req, res) => {
    try {
      const yearParam = req.query.year;
      const year = Number(yearParam);
      if (!Number.isInteger(year) || year < 1900 || year > 2100) {
        return res.status(400).json({ error: "Invalid or missing year" });
      }
      const excludeHidden = req.user?.role === "assistant";
      const conditions = [
        eq9(invoices.status, "paid"),
        sql7`extract(year from ${invoices.actualPaymentDate}) = ${year}`
      ];
      if (excludeHidden) {
        conditions.push(eq9(invoices.hideFromAssistant, false));
      }
      const rows = await db.select({
        id: invoices.id,
        invoice_number: invoices.invoiceNumber,
        client_id: invoices.clientId,
        partner_id: invoices.partnerId,
        scheme: invoices.scheme,
        status: invoices.status,
        actual_payment_date: invoices.actualPaymentDate,
        created_at: invoices.createdAt,
        client_bill: invoiceCalculations.clientBill,
        executor_expenses_total: invoiceCalculations.executorExpensesTotal,
        client_spent: invoiceCalculations.clientSpent,
        agency_margin: invoiceCalculations.agencyMargin,
        partner_share_from_margin: invoiceCalculations.partnerShareFromMargin,
        commission_amount: invoiceCalculations.commissionAmount,
        assistant_bonus_total: invoiceCalculations.assistantBonusActs,
        partner_name: partners.name,
        client_name: clients.name
      }).from(invoices).leftJoin(invoiceCalculations, eq9(invoiceCalculations.invoiceId, invoices.id)).leftJoin(partners, eq9(invoices.partnerId, partners.id)).leftJoin(clients, eq9(invoices.clientId, clients.id)).where(and8(...conditions)).orderBy(invoices.actualPaymentDate);
      res.json(rows);
    } catch (error) {
      console.error("Get assistant stats-invoices error:", error);
      res.status(500).json({ error: "Failed to load assistant stats invoices" });
    }
  }
);

// server/routes.ts
function registerHealthCheck(app2) {
  app2.get("/", (req, res, next) => {
    const userAgent = req.headers["user-agent"] || "";
    const acceptHeader = req.headers["accept"] || "";
    if (!userAgent || userAgent.includes("HealthCheck") || userAgent.includes("kube-probe") || userAgent.includes("curl") || !acceptHeader.includes("text/html")) {
      return res.status(200).send("OK");
    }
    next();
  });
  app2.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", timestamp: Date.now() });
  });
  app2.get("/api/health", (_req, res) => {
    res.status(200).json({ status: "ok", timestamp: Date.now() });
  });
}
function registerRoutes(app2) {
  app2.use(authRouter);
  app2.use(clientsRouter);
  app2.use(partnersRouter);
  app2.use(dashboardRouter);
  app2.use(invoicesRouter);
  app2.use(actsRouter);
  app2.use(recurringRouter);
  app2.use(exportRouter);
  app2.use(backupRouter);
  app2.use(actionLogRouter);
  app2.use(assistantRouter);
}

// server/index.ts
var app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "20mb" }));
app.use(cookieParser());
registerHealthCheck(app);
registerRoutes(app);

// server/vite.ts
var isProduction = process.env.NODE_ENV === "production";
var RECURRING_CHECK_INTERVAL = 60 * 60 * 1e3;
var BACKUP_CHECK_INTERVAL = 60 * 60 * 1e3;
async function processRecurringInvoicesQuietly() {
  try {
    const result = await storage.processAllDueRecurringInvoices();
    if (result.created > 0) {
      console.log(`[Recurring] Created ${result.created} draft(s)`);
    }
  } catch (error) {
    console.error("[Recurring] Error:", error);
  }
}
function startRecurringSchedulerLazy() {
  setTimeout(() => {
    console.log("[Recurring] Starting scheduler");
    processRecurringInvoicesQuietly();
    setInterval(processRecurringInvoicesQuietly, RECURRING_CHECK_INTERVAL);
  }, 6e4);
}
var lastBackupDate = null;
async function checkAndRunDailyBackup() {
  try {
    const now = /* @__PURE__ */ new Date();
    const currentHour = now.getHours();
    const today = now.toISOString().split("T")[0];
    if (currentHour === 3 && lastBackupDate !== today) {
      console.log("[Backup] Running daily automatic backup...");
      const backup = await backupService.createBackup("auto");
      console.log(`[Backup] Daily backup completed: ${backup.filename}`);
      lastBackupDate = today;
    }
  } catch (error) {
    console.error("[Backup] Daily backup error:", error);
  }
}
function startBackupSchedulerLazy() {
  setTimeout(() => {
    console.log("[Backup] Starting backup scheduler (daily at 3:00)");
    checkAndRunDailyBackup();
    setInterval(checkAndRunDailyBackup, BACKUP_CHECK_INTERVAL);
  }, 12e4);
}
async function setupVite(server, vite) {
  server.use(vite.middlewares);
  server.use("/{*path}", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
        import.meta.dirname,
        "..",
        "index.html"
      );
      let template = await fs2.promises.readFile(clientTemplate, "utf-8");
      template = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(template);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(server) {
  const distPath = path2.resolve(import.meta.dirname, "..", "dist");
  if (!fs2.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  server.use(express2.static(distPath));
  server.use("/{*path}", (_req, res) => {
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}
(async () => {
  const server = app;
  if (isProduction) {
    serveStatic(server);
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    await setupVite(server, vite);
  }
  const port = 5e3;
  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on port ${port}`);
    startRecurringSchedulerLazy();
    startBackupSchedulerLazy();
  });
})();
