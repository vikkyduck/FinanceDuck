import type { UserRole } from "@shared/schema";
/**
 * Frontend invoice calculations.
 *
 * All financial formula logic lives in shared/financialEngine.ts.
 * This file is the FE adapter: it converts camelCase numbers → snake_case numbers
 * (the shape expected by React components) and re-exports utility helpers.
 */
import { calculateInvoiceFinancials as _calc, parseNum, type FinancialInputs } from "@shared/financialEngine";
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
}

/**
 * Calculate invoice financial metrics.
 * Delegates to the shared engine and converts camelCase → snake_case for the UI.
 */
export function calculateInvoice(input: FinancialInputs): InvoiceCalculations {
  const f = _calc(input);

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
