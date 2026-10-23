import { schemePolicy } from "../shared/schemePolicies";
/**
 * Role-based field visibility rules for invoice data.
 * Extracted from routes.ts for single-responsibility.
 *
 * UNIFIED SOURCE OF TRUTH: All roles receive data from the same stored
 * invoice_calculations values. These constants determine what each role
 * can SEE, not what is calculated.
 */

import { UserRole, InvoiceScheme } from "../shared/schema";

// Клиенту открытая раскладка «комиссия / доступно / потрачено / осталось»
// показывается ТОЛЬКО по агентским 30%/40% — у них % зашит в названии и
// согласован с клиентом. По commission_based, partner_10 и partner_15
// конкретный процент клиенту не показываем (это внутренние условия).
export function isClientFinancialVisible(scheme: unknown): boolean {
  return schemePolicy(scheme)?.kind === "agency";
}

/**
 * Видим ли клиенту блок «потрачено/осталось» по счёту в принципе.
 * Помимо агентских схем — также любые ПЕРИОДИЧЕСКИЕ счета: клиент платит
 * вперёд за N месяцев, и должен видеть, сколько уже использовано.
 * Расходы исполнителя при этом всё равно остаются скрытыми (см.
 * client-safe поля calculations ниже).
 */
export function isClientUsageVisible(invoice: {
  scheme?: unknown;
  serviceType?: unknown;
}): boolean {
  if (isClientFinancialVisible(invoice.scheme)) return true;
  return invoice.serviceType === 'periodic';
}

// ---------------------------------------------------------------------------
// Permission tables
// ---------------------------------------------------------------------------

/** Поля периодической услуги (предоплата за N месяцев/дней/часов).
 *  Нужны КАЖДОЙ роли, а не только клиенту: по ним считается «Остаток» счёта
 *  (invoiceRepo.applyPeriodicOverrides), и без них админу с ассистентом не
 *  рисуется блок «Периодическая услуга» с кнопкой «Закрыть месяц» — закрывать
 *  периоды становится некому, и остаток навсегда замирает на полной сумме
 *  счёта. Секрета в этих полях нет: клиент их и так видит. */
const PERIODIC_FIELDS = [
  'serviceType', 'periodUnit', 'pricePerPeriod', 'totalPeriods', 'periodsUsed',
] as const;

export const ROLE_INVOICE_PERMISSIONS: Record<UserRole, readonly string[]> = {
  admin: [
    'id', 'invoiceNumber', 'partnerId', 'clientId', 'status', 'description',
    'clientTitle',
    'clientBill', 'scheme', 'createdAt', 'updatedAt', 'createdBy',
    'paymentDate', 'actualPaymentDate', 'issueDate', 'notes', 'hideFromAssistant',
    'plannedExpenses', 'closingDocumentUrl', 'archivedAt',
    ...PERIODIC_FIELDS,
  ],
  partner: [
    'id', 'invoiceNumber', 'clientId', 'status', 'description', 'clientTitle',
    'clientBill', 'scheme', 'createdAt', 'updatedAt',
    'paymentDate', 'actualPaymentDate', 'issueDate', 'notes', 'plannedExpenses',
    ...PERIODIC_FIELDS,
  ],
  client: [
    'id', 'invoiceNumber', 'status', 'description', 'clientTitle', 'clientBill',
    'scheme', 'createdAt', 'updatedAt',
    'paymentDate', 'actualPaymentDate', 'issueDate', 'notes',
    // Клиент видит, что он покупает и насколько использовал.
    ...PERIODIC_FIELDS,
  ],
  assistant: [
    'id', 'invoiceNumber', 'clientId', 'status', 'description', 'clientTitle',
    'clientBill', 'createdAt', 'updatedAt', 'createdBy',
    'paymentDate', 'actualPaymentDate', 'issueDate', 'notes', 'scheme',
    'plannedExpenses',
    ...PERIODIC_FIELDS,
  ],
  accountant: [
    'id', 'invoiceNumber', 'clientId', 'status', 'description', 'clientTitle',
    'clientBill', 'createdAt', 'updatedAt', 'createdBy',
    'paymentDate', 'actualPaymentDate', 'issueDate', 'notes', 'scheme',
    'plannedExpenses', 'closingDocumentUrl',
    ...PERIODIC_FIELDS,
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
    'id', 'invoiceId', 'clientBill',
    // Для agency 30/40 показываем явный размер маржи и базу.
    // commissionAmount/commissionRate клиенту НЕ отдаём — для commission_based
    // и partner_10/15 конкретный % — внутреннее условие, не для клиента.
    'agencyMargin', 'clientBaseAfterMargin',
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
    'totalClientBill', 'paidClientBill', 'pendingClientBill',
    'totalExpenses', 'clientRemaining',
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

const CLIENT_BASE_FIELDS = [
  'id', 'name', 'email', 'phone', 'telegram', 'contactPerson',
  'createdAt', 'updatedAt',
] as const;

const PARTNER_BASE_FIELDS = [
  'id', 'name', 'createdAt', 'updatedAt',
] as const;

const PARTNER_INTERNAL_FIELDS = [
  'email', 'phone', 'telegram', 'commissionRate', 'leverageRole', 'directToOwner',
] as const;

const CLIENT_SETTINGS_ROLES: ReadonlySet<UserRole> = new Set([
  'admin', 'assistant', 'accountant',
]);

function copyAllowedFields(
  source: object,
  fields: readonly string[],
): Record<string, unknown> {
  const record = source as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    if (field in record) result[field] = record[field];
  }
  return result;
}

/**
 * Positive allowlist для клиента. `tgBotToken` намеренно отсутствует во всех
 * ролях: обычный read API сообщает только факт наличия секрета.
 */
export function projectClientForRole(
  client: object,
  role: UserRole,
): Record<string, unknown> {
  const record = client as Record<string, unknown>;
  const result = copyAllowedFields(client, CLIENT_BASE_FIELDS);

  if (CLIENT_SETTINGS_ROLES.has(role)) {
    if ('tgChatId' in record) result.tgChatId = record.tgChatId;
    result.hasTgBotToken = typeof record.tgBotToken === 'string'
      && record.tgBotToken.trim().length > 0;
  }

  // Assistant/accountant исторически не имеют доступа к структуре связей.
  if (role === 'admin' && 'partnerId' in record) {
    result.partnerId = record.partnerId;
  }

  return result;
}

export function projectClientsForRole(
  clients: object[],
  role: UserRole,
): Record<string, unknown>[] {
  return clients.map(client => projectClientForRole(client, role));
}

/**
 * Client получает только публичную идентичность своего связанного партнёра.
 * Остальные роли получают внутренние поля лишь после object-level проверки
 * маршрута.
 */
export function projectPartnerForRole(
  partner: object,
  role: UserRole,
): Record<string, unknown> {
  const result = copyAllowedFields(partner, PARTNER_BASE_FIELDS);
  if (role !== 'client') {
    Object.assign(result, copyAllowedFields(partner, PARTNER_INTERNAL_FIELDS));
  }
  return result;
}

export function projectPartnersForRole(
  partners: object[],
  role: UserRole,
): Record<string, unknown>[] {
  return partners.map(partner => projectPartnerForRole(partner, role));
}

/**
 * Returns only the invoice fields the given role is permitted to see,
 * including nested `calculations`, `partner`, and `client` objects.
 */
export function projectInvoiceForRole(
  invoice: Record<string, unknown> & { scheme?: unknown; serviceType?: unknown; calculations?: Record<string, unknown>; partner?: Record<string, unknown>; client?: Record<string, unknown> },
  role: UserRole,
): Record<string, unknown> {
  const allowedInvoiceFields = ROLE_INVOICE_PERMISSIONS[role];
  const allowedCalcFields    = ROLE_CALCULATION_PERMISSIONS[role];

  const result: Record<string, unknown> = {};

  for (const field of allowedInvoiceFields) {
    if (field in invoice) result[field] = invoice[field];
  }

  // Клиенту блок calculations отдаём, когда он структурно ему предназначен:
  //   1) Агентские схемы (agency_30/40) — полный клиентский блок.
  //   2) Любые ПЕРИОДИЧЕСКИЕ счета — но без executorExpensesTotal:
  //      клиент видит «использовано/осталось» по месяцам, а не наши расходы.
  // По остальным (one_time + неагентская) calculations не отдаём вовсе.
  const includeCalculations =
    invoice.calculations
    && typeof invoice.calculations === 'object'
    && (role !== 'client' || isClientUsageVisible(invoice));

  if (includeCalculations && invoice.calculations) {
    const calc: Record<string, unknown> = {};
    const hideExecutorExpenses =
      role === 'client'
      && !isClientFinancialVisible(invoice.scheme)
      && invoice.serviceType === 'periodic';
    for (const field of allowedCalcFields) {
      if (hideExecutorExpenses && field === 'executorExpensesTotal') continue;
      if (field in invoice.calculations) calc[field] = invoice.calculations[field];
    }
    result.calculations = calc;
  }

  if (invoice.partner) {
    if (role === 'admin') {
      result.partner = projectPartnerForRole(invoice.partner, role);
    } else if (role === 'partner') {
      result.partner = { id: invoice.partner.id, name: invoice.partner.name };
    }
  }

  if (invoice.client) {
    result.client = (role === 'assistant' || role === 'accountant')
      ? { id: invoice.client.id, name: invoice.client.name }
      : projectClientForRole(invoice.client, role);
  }

  return result;
}

export function createAssistantInvoiceProjection(invoice: Parameters<typeof projectInvoiceForRole>[0]) {
  return projectInvoiceForRole(invoice, 'assistant');
}

export function stripSensitiveFieldsForRole<T extends Parameters<typeof projectInvoiceForRole>[0]>(
  data: T,
  role: UserRole,
): T {
  return projectInvoiceForRole(data, role) as T;
}

export function stripSensitiveFieldsFromList<T extends Parameters<typeof projectInvoiceForRole>[0]>(
  data: T[],
  role: UserRole,
): T[] {
  return data.map(item => projectInvoiceForRole(item, role)) as T[];
}

export function projectStatsForRole(
  stats: object,
  role: UserRole,
): Record<string, unknown> {
  const allowedFields = ROLE_STATS_PERMISSIONS[role];
  const result: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in stats) result[field] = (stats as Record<string, unknown>)[field];
  }
  return result;
}
