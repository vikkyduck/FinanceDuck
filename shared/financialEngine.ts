/**
 * SHARED FINANCIAL ENGINE — single source of truth for all invoice calculations.
 *
 * Used by BOTH the backend (server/storage.ts) and the frontend (src/lib/invoiceCalculations.ts).
 * All financial formulas live here and nowhere else.
 *
 * Return type uses plain numbers. Each consumer is responsible for
 * converting to its own format (strings for Drizzle DB, numbers for React UI).
 */

export type InvoiceScheme =
  | 'partner_10'
  | 'partner_15'
  | 'agency_30'
  | 'agency_40'
  | 'commission_based';

export interface FinancialResult {
  clientBill: number;
  commissionRate?: number;
  commissionAmount?: number;
  amountToAdmin?: number;
  agencyMargin?: number;
  partnerShareFromMargin?: number;
  adminShareFromMargin?: number;
  clientBaseAfterMargin?: number;
  clientSpent?: number;
  clientRemaining?: number;
  executorExpensesTotal: number;
  partnerTransferDue: number;
  netProfitAdmin: number;
  adminShare50: number;
  catShare50: number;
}

/**
 * Core calculation function — pure, no side effects.
 *
 * @param scheme              Commission scheme type
 * @param clientBill          Total amount billed to the client
 * @param partnerCommRate     Custom commission rate % (only for commission_based)
 * @param executorExpenses    Total executor expenses (reference value)
 * @param expensesByPartner   Expenses paid by partner from client money (paidByAdmin = false)
 * @param expensesByAdmin     Expenses paid by admin from own funds (paidByAdmin = true)
 * @param plannedExpenses     Reserved amount for future expenses (affects partner transfer for non-agency schemes)
 */
export function calculateFinancials(
  scheme: InvoiceScheme,
  clientBill: number,
  partnerCommRate: number = 0,
  executorExpenses: number = 0,
  expensesByPartner: number = 0,
  expensesByAdmin: number = 0,
  plannedExpenses: number = 0,
): FinancialResult {
  const base: FinancialResult = {
    clientBill,
    executorExpensesTotal: executorExpenses,
    partnerTransferDue: 0,
    netProfitAdmin: 0,
    adminShare50: 0,
    catShare50: 0,
  };

  switch (scheme) {
    case 'agency_30': {
      // 30% agency margin: 15% admin + 15% partner. Expenses come from 70% client budget.
      const agencyMargin         = clientBill * 0.30;
      const partnerShareFromMargin = clientBill * 0.15;
      const adminShareFromMargin   = clientBill * 0.15;
      const clientBaseAfterMargin  = clientBill * 0.70;
      const clientRemaining        = clientBaseAfterMargin - executorExpenses;
      const partnerTransferDue     = adminShareFromMargin;  // partner owes admin the fixed 15%
      const netProfitAdmin         = adminShareFromMargin;  // fixed — expenses from client budget

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
        catShare50:   netProfitAdmin / 2,
      };
    }

    case 'agency_40': {
      // 40% agency margin: 24% admin + 16% partner. Expenses come from 60% client budget.
      const agencyMargin         = clientBill * 0.40;
      const partnerShareFromMargin = clientBill * 0.16;
      const adminShareFromMargin   = clientBill * 0.24;
      const clientBaseAfterMargin  = clientBill * 0.60;
      const clientRemaining        = clientBaseAfterMargin - executorExpenses;
      const partnerTransferDue     = adminShareFromMargin;  // partner owes admin the fixed 24%
      const netProfitAdmin         = adminShareFromMargin;  // fixed — expenses from client budget

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
        catShare50:   netProfitAdmin / 2,
      };
    }

    case 'partner_10': {
      const commissionRate   = 10;
      const commissionAmount = clientBill * 0.10;
      const amountToAdmin    = clientBill * 0.90;
      const partnerTransferDue = plannedExpenses > 0
        ? Math.max(0, amountToAdmin - plannedExpenses)
        : Math.max(0, amountToAdmin - expensesByPartner);
      const netProfitAdmin = partnerTransferDue - expensesByAdmin;

      return {
        ...base,
        commissionRate,
        commissionAmount,
        amountToAdmin,
        partnerTransferDue,
        netProfitAdmin,
        adminShare50: netProfitAdmin / 2,
        catShare50:   netProfitAdmin / 2,
      };
    }

    case 'partner_15': {
      const commissionRate   = 15;
      const commissionAmount = clientBill * 0.15;
      const amountToAdmin    = clientBill * 0.85;
      const partnerTransferDue = plannedExpenses > 0
        ? Math.max(0, amountToAdmin - plannedExpenses)
        : Math.max(0, amountToAdmin - expensesByPartner);
      const netProfitAdmin = partnerTransferDue - expensesByAdmin;

      return {
        ...base,
        commissionRate,
        commissionAmount,
        amountToAdmin,
        partnerTransferDue,
        netProfitAdmin,
        adminShare50: netProfitAdmin / 2,
        catShare50:   netProfitAdmin / 2,
      };
    }

    case 'commission_based':
    default: {
      // Default 0% — entire clientBill goes to admin
      const commissionRate   = partnerCommRate ?? 0;
      const commissionAmount = clientBill * (commissionRate / 100);
      const amountToAdmin    = clientBill - commissionAmount;
      const partnerTransferDue = plannedExpenses > 0
        ? Math.max(0, amountToAdmin - plannedExpenses)
        : Math.max(0, amountToAdmin - expensesByPartner);
      const netProfitAdmin = partnerTransferDue - expensesByAdmin;

      return {
        ...base,
        commissionRate,
        commissionAmount,
        amountToAdmin,
        partnerTransferDue,
        netProfitAdmin,
        adminShare50: netProfitAdmin / 2,
        catShare50:   netProfitAdmin / 2,
      };
    }
  }
}

/**
 * Parse a DB numeric string safely to number.
 * All invoice_calculations fields are stored as numeric strings.
 */
export function parseNum(value: string | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = parseFloat(value);
  return isNaN(n) ? 0 : n;
}
