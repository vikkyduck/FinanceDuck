import { schemePolicy, SCHEME_POLICIES } from './schemePolicies';
/**
 * SHARED FINANCIAL ENGINE — single source of truth for all invoice calculations.
 *
 * Used by BOTH the backend (server/storage.ts) and the frontend (src/lib/invoiceCalculations.ts).
 * All financial formulas live here and nowhere else.
 *
 * Return type uses plain numbers. Each consumer is responsible for
 * converting to its own format (strings for Drizzle DB, numbers for React UI).
 */

import Decimal from 'decimal.js';
import type { InvoiceScheme } from './schema';
export type { InvoiceScheme } from './schema';

/** Агентские схемы (открытая клиенту раскладка бюджета): жёсткие 30/40 и
 *  гибкая 'agency'. Единственный источник истины для сервера — фильтры
 *  `scheme === 'agency_30' || ...` по коду не размножать: именно такой
 *  рассыпанный фильтр однажды оставил счёт по гибкой схеме без бюджета
 *  в кабинете клиента. Фронтовый близнец: src/lib/invoiceHelpers.ts. */
export const AGENCY_SCHEMES: readonly InvoiceScheme[] = (Object.keys(SCHEME_POLICIES) as InvoiceScheme[]).filter(scheme => SCHEME_POLICIES[scheme].kind === 'agency');
export function isAgencyScheme(scheme: unknown): boolean {
  return schemePolicy(scheme)?.kind === 'agency';
}

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
 * @param agencyMarginRate    Agency margin % — ТОЛЬКО для гибкой схемы 'agency'
 *                            (комиссия агентства, видна клиенту). Для 'agency'
 *                            partnerCommRate = процент партнёра от всей суммы.
 */
export function calculateFinancials(
  scheme: InvoiceScheme,
  clientBill: number,
  partnerCommRate: number = 0,
  executorExpenses: number = 0,
  expensesByPartner: number = 0,
  expensesByAdmin: number = 0,
  plannedExpenses: number = 0,
  agencyMarginRate: number = 0,
): FinancialResult {
  return calculateInvoiceFinancials({ scheme, clientBill, partnerCommRate, executorExpenses, expensesByPartner, expensesByAdmin, plannedExpenses, agencyMarginRate });
}

export interface FinancialInputs {
  scheme: InvoiceScheme;
  clientBill: number;
  partnerCommRate?: number;
  executorExpenses?: number;
  expensesByPartner?: number;
  expensesByAdmin?: number;
  plannedExpenses?: number;
  agencyMarginRate?: number;
}

/** Decimal arithmetic; currency is rounded half-up to kopecks at each booked amount. */
export function calculateInvoiceFinancials(input: FinancialInputs): FinancialResult {
  const money = (value: Decimal.Value) => new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const bill = money(input.clientBill);
  const expenses = money(input.executorExpenses ?? 0);
  const byPartner = money(input.expensesByPartner ?? 0);
  const byAdmin = money(input.expensesByAdmin ?? 0);
  const planned = money(input.plannedExpenses ?? 0);
  const percent = (rate: number) => Decimal.max(0, Decimal.min(100, rate));
  const share = (rate: number) => money(bill.mul(percent(rate)).div(100));
  const base = { clientBill: bill.toNumber(), executorExpensesTotal: expenses.toNumber(), clientSpent: expenses.toNumber() };
  const split = (profit: Decimal) => {
    const admin = money(profit.div(2));
    return { netProfitAdmin: profit.toNumber(), adminShare50: admin.toNumber(), catShare50: profit.minus(admin).toNumber() };
  };
  const policy = schemePolicy(input.scheme);
  if (!policy) throw new Error(`Unknown invoice scheme: ${input.scheme}`);
  if (policy.kind === 'agency') {
    const marginRate = policy.marginRate ?? percent(input.agencyMarginRate ?? 0).toNumber();
    const partnerRate = policy.partnerRate ?? Math.min(marginRate, input.partnerCommRate ?? 0);
    const margin = share(marginRate);
    const partner = share(partnerRate);
    const admin = margin.minus(partner);
    const clientBase = bill.minus(margin);
    return { ...base, ...(input.scheme === 'agency' ? { commissionRate: marginRate } : {}),
      agencyMargin: margin.toNumber(), partnerShareFromMargin: partner.toNumber(), adminShareFromMargin: admin.toNumber(),
      clientBaseAfterMargin: clientBase.toNumber(), clientRemaining: clientBase.minus(expenses).toNumber(),
      partnerTransferDue: admin.toNumber(), ...split(admin),
    };
  }
  const commissionRate = policy.commissionRate ?? percent(input.partnerCommRate ?? 0).toNumber();
  const commission = share(commissionRate);
  const toAdmin = bill.minus(commission);
  const due = Decimal.max(0, toAdmin.minus(planned.gt(0) ? planned : byPartner));
  const remaining = planned.gt(0) ? money(Decimal.max(0, bill.mul(new Decimal(1).minus(expenses.div(planned))))) : new Decimal(0);
  return { ...base, commissionRate, commissionAmount: commission.toNumber(), amountToAdmin: toAdmin.toNumber(),
    clientRemaining: remaining.toNumber(), partnerTransferDue: due.toNumber(), ...split(due.minus(byAdmin)),
  };
}

/**
 * Parse a DB numeric string safely to number.
 * All invoice_calculations fields are stored as numeric strings.
 */
export function parseNum(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === "number" ? value : Number(value.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
