import type { UserRole } from "@shared/schema";
/**
 * Frontend invoice calculations.
 *
 * All financial formula logic lives in shared/financialEngine.ts.
 * This file is the FE adapter: it converts camelCase numbers → snake_case numbers
 * (the shape expected by React components) and re-exports utility helpers.
 */
import { calculateFinancials as _calc, parseNum } from "@shared/financialEngine";
export type { InvoiceScheme } from "@shared/financialEngine";

// ─── Public interface (snake_case, numbers) used by React components ──────────
export interface InvoiceCalculations {
  client_bill: number;
  commission_rate?: number;
  commission_amount?: number;
  amount_to_admin?: number;
  agency_margin?: number;
  partner_share_from_margin?: number;
  admin_share_from_margin?: number;
  client_base_after_margin?: number;
  client_spent?: number;
  client_remaining?: number;
  executor_expenses_total: number;
  partner_transfer_due: number;
  net_profit_admin: number;
  admin_share_50: number;
  cat_share_50: number;
  tax_amount?: number;
  amount_after_tax?: number;
}

/**
 * Calculate invoice financial metrics.
 * Delegates to the shared engine and converts camelCase → snake_case for the UI.
 */
export function calculateInvoice(
  scheme: import("@shared/financialEngine").InvoiceScheme,
  clientBill: number,
  partnerCommissionRate?: number,
  executorExpenses: number = 0,
  expensesPaidByPartner: number = 0,
  expensesPaidByAdmin: number = 0,
  plannedExpenses: number = 0,
  agencyMarginRate: number = 0,
): InvoiceCalculations {
  const f = _calc(
    scheme,
    clientBill,
    partnerCommissionRate ?? 0,
    executorExpenses,
    expensesPaidByPartner,
    expensesPaidByAdmin,
    plannedExpenses,
    agencyMarginRate,
  );

  return {
    client_bill:               f.clientBill,
    executor_expenses_total:   f.executorExpensesTotal,
    partner_transfer_due:      f.partnerTransferDue,
    net_profit_admin:          f.netProfitAdmin,
    admin_share_50:            f.adminShare50,
    cat_share_50:              f.catShare50,
    commission_rate:           f.commissionRate,
    commission_amount:         f.commissionAmount,
    amount_to_admin:           f.amountToAdmin,
    agency_margin:             f.agencyMargin,
    partner_share_from_margin: f.partnerShareFromMargin,
    admin_share_from_margin:   f.adminShareFromMargin,
    client_base_after_margin:  f.clientBaseAfterMargin,
    client_spent:              f.clientSpent,
    client_remaining:          f.clientRemaining,
  };
}

/**
 * Calculates partner debt to admin based on scheme.
 * When possible, use the stored `partnerTransferDue` from invoice_calculations as source of truth.
 */
export function calculatePartnerDebt(
  scheme: import("@shared/financialEngine").InvoiceScheme,
  clientBill: number,
  partnerCommission: number,
  expensesPaidByPartner: number = 0,
  expensesPaidByAdmin: number = 0,
  storedPartnerTransferDue?: number,
): { debtToAdmin: number; doNotSpendAmount: number; adminNetAfterOwnExpenses: number } {
  const totalExpenses = expensesPaidByPartner + expensesPaidByAdmin;

  if (scheme === 'agency_30') {
    const adminShare    = clientBill * 0.15;
    const clientBase    = clientBill * 0.70;
    const doNotSpendAmount = Math.max(0, clientBase - totalExpenses);
    const debtToAdmin   = storedPartnerTransferDue !== undefined
      ? Math.max(0, storedPartnerTransferDue)
      : adminShare;
    return { debtToAdmin, doNotSpendAmount, adminNetAfterOwnExpenses: debtToAdmin - expensesPaidByAdmin };
  }

  if (scheme === 'agency_40') {
    const adminShare    = clientBill * 0.24;
    const clientBase    = clientBill * 0.60;
    const doNotSpendAmount = Math.max(0, clientBase - totalExpenses);
    const debtToAdmin   = storedPartnerTransferDue !== undefined
      ? Math.max(0, storedPartnerTransferDue)
      : adminShare;
    return { debtToAdmin, doNotSpendAmount, adminNetAfterOwnExpenses: debtToAdmin - expensesPaidByAdmin };
  }

  let calculatedDebt: number;
  if (storedPartnerTransferDue !== undefined) {
    calculatedDebt = storedPartnerTransferDue;
  } else {
    let commissionRate: number;
    if (scheme === 'partner_10')      commissionRate = 10;
    else if (scheme === 'partner_15') commissionRate = 15;
    else commissionRate = clientBill > 0 ? (partnerCommission / clientBill) * 100 : 0;
    const commissionAmount = clientBill * (commissionRate / 100);
    calculatedDebt = clientBill - commissionAmount - expensesPaidByPartner;
  }

  const debtToAdmin = Math.max(0, calculatedDebt);
  return {
    debtToAdmin,
    doNotSpendAmount: 0,
    adminNetAfterOwnExpenses: debtToAdmin - expensesPaidByAdmin,
  };
}

// ─── Formatting utilities ─────────────────────────────────────────────────────
// Реэкспорт из единого Format-сервиса, чтобы не ломать legacy-импорты вида
// `import { formatCurrency, formatDate } from "@/lib/invoiceCalculations"`.
// Любой новый код должен импортировать напрямую из @/lib/format.
export { formatMoney as formatCurrency, formatDate } from "./format";

export function getSchemeLabel(
  scheme: import("@shared/financialEngine").InvoiceScheme,
  role?: UserRole,
  commissionRate?: number,
): string {
  switch (scheme) {
    case 'agency':          return commissionRate ? `Агентская ${commissionRate}%` : 'Агентская';
    case 'agency_30':       return 'Агентство 30%';
    case 'agency_40':       return 'Агентство 40%';
    case 'partner_10':      return 'Партнер 10%';
    case 'partner_15':      return 'Партнер 15%';
    case 'commission_based':
      return commissionRate ? `Партнер ${commissionRate}%` : 'Партнерское соглашение';
    default:
      return String(scheme);
  }
}

// Re-export parseNum so consumers don't need to reach into financialEngine directly
export { parseNum };
