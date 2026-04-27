/**
 * Role-based field visibility rules for invoice data.
 * Extracted from routes.ts for single-responsibility.
 *
 * UNIFIED SOURCE OF TRUTH: All roles receive data from the same stored
 * invoice_calculations values. These constants determine what each role
 * can SEE, not what is calculated.
 */

import { UserRole } from "../shared/schema";

// ---------------------------------------------------------------------------
// Permission tables
// ---------------------------------------------------------------------------

export const ROLE_INVOICE_PERMISSIONS: Record<UserRole, readonly string[]> = {
  admin: [
    'id', 'invoiceNumber', 'partnerId', 'clientId', 'status', 'description',
    'clientBill', 'scheme', 'createdAt', 'updatedAt', 'createdBy',
    'paymentDate', 'actualPaymentDate', 'issueDate', 'notes', 'hideFromAssistant',
    'plannedExpenses', 'closingDocumentUrl',
  ],
  partner: [
    'id', 'invoiceNumber', 'clientId', 'status', 'description',
    'clientBill', 'scheme', 'createdAt', 'updatedAt',
    'paymentDate', 'actualPaymentDate', 'issueDate', 'notes', 'plannedExpenses',
  ],
  client: [
    'id', 'invoiceNumber', 'status', 'description', 'clientBill',
    'scheme', 'createdAt', 'updatedAt',
    'paymentDate', 'actualPaymentDate', 'issueDate', 'notes',
  ],
  assistant: [
    'id', 'invoiceNumber', 'clientId', 'status', 'description',
    'clientBill', 'createdAt', 'updatedAt', 'createdBy',
    'paymentDate', 'actualPaymentDate', 'issueDate', 'notes', 'scheme',
    'plannedExpenses',
  ],
  accountant: [
    'id', 'invoiceNumber', 'clientId', 'status', 'description',
    'clientBill', 'createdAt', 'updatedAt', 'createdBy',
    'paymentDate', 'actualPaymentDate', 'issueDate', 'notes', 'scheme',
    'plannedExpenses', 'closingDocumentUrl',
  ],
};

export const ROLE_CALCULATION_PERMISSIONS: Record<UserRole, readonly string[]> = {
  admin: [
    'id', 'invoiceId', 'clientBill', 'commissionRate', 'commissionAmount',
    'amountToAdmin', 'agencyMargin', 'partnerShareFromMargin', 'adminShareFromMargin',
    'clientBaseAfterMargin', 'clientSpent', 'clientRemaining', 'executorExpensesTotal',
    'partnerTransferDue', 'netProfitAdmin', 'adminShare50', 'catShare50',
    'assistantBonusActs', 'assistantBonusPaid',
  ],
  partner: [
    'id', 'invoiceId', 'clientBill', 'commissionRate', 'commissionAmount',
    'amountToAdmin', 'agencyMargin', 'partnerShareFromMargin', 'adminShareFromMargin',
    'clientBaseAfterMargin', 'clientSpent', 'clientRemaining', 'executorExpensesTotal',
    'partnerTransferDue',
  ],
  client: [
    'id', 'invoiceId', 'clientBill', 'clientBaseAfterMargin',
    'clientSpent', 'clientRemaining', 'executorExpensesTotal',
  ],
  assistant: [
    'id', 'invoiceId', 'clientBill', 'executorExpensesTotal',
    'agencyMargin', 'clientBaseAfterMargin', 'clientRemaining',
  ],
  accountant: [
    'id', 'invoiceId', 'clientBill', 'executorExpensesTotal',
    'agencyMargin', 'clientBaseAfterMargin', 'clientRemaining',
  ],
};

export const ROLE_STATS_PERMISSIONS: Record<UserRole, readonly string[]> = {
  admin: [
    'totalInvoices', 'paidInvoices', 'pendingInvoices', 'overdueInvoices',
    'totalClientBill', 'paidClientBill', 'pendingClientBill', 'totalExpenses',
    'totalPartnerCommission', 'totalAdminShare', 'totalNetProfit', 'clientRemaining',
  ],
  partner: [
    'totalInvoices', 'paidInvoices', 'pendingInvoices', 'overdueInvoices',
    'totalClientBill', 'paidClientBill', 'pendingClientBill', 'totalExpenses',
    'totalPartnerCommission', 'partnerDebt', 'clientRemaining',
  ],
  client: [
    'totalInvoices', 'paidInvoices', 'pendingInvoices', 'overdueInvoices',
    'totalClientBill', 'totalExpenses', 'clientRemaining',
  ],
  assistant: [
    'totalInvoices', 'paidInvoices', 'pendingInvoices', 'overdueInvoices',
    'totalClientBill', 'paidClientBill', 'pendingClientBill', 'totalExpenses',
  ],
  accountant: [
    'totalInvoices', 'paidInvoices', 'pendingInvoices', 'overdueInvoices',
    'totalClientBill', 'paidClientBill', 'pendingClientBill', 'totalExpenses',
  ],
};

// Legacy named aliases (kept for gradual migration; prefer ROLE_* constants directly)
export const ASSISTANT_ALLOWED_INVOICE_FIELDS    = ROLE_INVOICE_PERMISSIONS.assistant;
export const ASSISTANT_ALLOWED_CALCULATION_FIELDS = ROLE_CALCULATION_PERMISSIONS.assistant;

// ---------------------------------------------------------------------------
// Projection helpers
// ---------------------------------------------------------------------------

/**
 * Returns only the invoice fields the given role is permitted to see,
 * including nested `calculations`, `partner`, and `client` objects.
 */
export function projectInvoiceForRole(
  invoice: Record<string, any>,
  role: UserRole,
): Record<string, any> {
  const allowedInvoiceFields = ROLE_INVOICE_PERMISSIONS[role];
  const allowedCalcFields    = ROLE_CALCULATION_PERMISSIONS[role];

  const result: Record<string, any> = {};

  for (const field of allowedInvoiceFields) {
    if (field in invoice) result[field] = invoice[field];
  }

  if (invoice.calculations && typeof invoice.calculations === 'object') {
    const calc: Record<string, any> = {};
    for (const field of allowedCalcFields) {
      if (field in invoice.calculations) calc[field] = invoice.calculations[field];
    }
    result.calculations = calc;
  }

  if (invoice.partner) {
    if (role === 'admin') {
      result.partner = invoice.partner;
    } else if (role === 'partner') {
      result.partner = { id: invoice.partner.id, name: invoice.partner.name };
    }
  }

  if (invoice.client) {
    result.client = (role === 'assistant' || role === 'accountant')
      ? { id: invoice.client.id, name: invoice.client.name }
      : invoice.client;
  }

  return result;
}

export function createAssistantInvoiceProjection(invoice: Record<string, any>) {
  return projectInvoiceForRole(invoice, 'assistant');
}

export function stripSensitiveFieldsForRole<T extends Record<string, any>>(
  data: T,
  role: UserRole,
): T {
  return projectInvoiceForRole(data, role) as T;
}

export function stripSensitiveFieldsFromList<T extends Record<string, any>>(
  data: T[],
  role: UserRole,
): T[] {
  return data.map(item => projectInvoiceForRole(item, role)) as T[];
}

export function projectStatsForRole(
  stats: Record<string, any>,
  role: UserRole,
): Record<string, any> {
  const allowedFields = ROLE_STATS_PERMISSIONS[role];
  const result: Record<string, any> = {};
  for (const field of allowedFields) {
    if (field in stats) result[field] = stats[field];
  }
  return result;
}

export function stripPartnerInfoFromClient<T extends Record<string, any>>(
  client: T,
  role: UserRole,
): T {
  if (role !== 'assistant' && role !== 'accountant') return client;
  const { partnerId, partner, ...rest } = client;
  return rest as T;
}

export function stripPartnerInfoFromClients<T extends Record<string, any>>(
  clients: T[],
  role: UserRole,
): T[] {
  if (role !== 'assistant' && role !== 'accountant') return clients;
  return clients.map(client => {
    const { partnerId, partner, ...rest } = client;
    return rest as T;
  });
}
