import { schemePolicy, SCHEME_POLICIES } from './schemePolicies';
/**
 * SHARED FINANCIAL ENGINE — single source of truth for all invoice calculations.
 *
 * Used by BOTH the backend (server/storage.ts) and the frontend (src/lib/invoiceCalculations.ts).
 * All financial formulas live here and nowhere else.
 *
 * Canonical booked amounts are decimal strings; the UI has a numeric display adapter.
 */

import Decimal from 'decimal.js';
import { moneyDecimal, moneyString } from './money';
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

/** Запасная база клиента для старых агентских строк без сохраненной
 *  clientBaseAfterMargin: жесткие схемы берут ставку маржи из реестра схем,
 *  гибкая 'agency' считает сумму минус сохраненную маржу. */
export function agencyClientBaseFallback(scheme: unknown, clientBill: number, agencyMargin: number): number {
  const policy = schemePolicy(scheme);
  const marginRate = policy?.kind === 'agency' ? policy.marginRate : null;
  return marginRate === null ? clientBill - agencyMargin : clientBill * ((100 - marginRate) / 100);
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

export interface FinancialInputs {
  scheme: InvoiceScheme;
  clientBill: Decimal.Value;
  partnerCommRate?: Decimal.Value;
  executorExpenses?: Decimal.Value;
  expensesByPartner?: Decimal.Value;
  expensesByAdmin?: Decimal.Value;
  plannedExpenses?: Decimal.Value;
  agencyMarginRate?: Decimal.Value;
}

/** Decimal arithmetic; currency is rounded half-up to kopecks at each booked amount. */
export type BookedFinancialResult = { [K in keyof FinancialResult]: string };

/** The server persists these decimal strings without a binary-number round trip. */
export function calculateBookedFinancials(input: FinancialInputs): BookedFinancialResult {
  const money = moneyDecimal;
  const bill = money(input.clientBill);
  const expenses = money(input.executorExpenses ?? 0);
  const byPartner = money(input.expensesByPartner ?? 0);
  const byAdmin = money(input.expensesByAdmin ?? 0);
  const planned = money(input.plannedExpenses ?? 0);
  const percent = (rate: Decimal.Value) => Decimal.max(0, Decimal.min(100, rate));
  const share = (rate: Decimal.Value) => money(bill.mul(percent(rate)).div(100));
  const base = { clientBill: moneyString(bill), executorExpensesTotal: moneyString(expenses), clientSpent: moneyString(expenses) };
  const split = (profit: Decimal) => {
    const admin = money(profit.div(2));
    return { netProfitAdmin: moneyString(profit), adminShare50: moneyString(admin), catShare50: moneyString(profit.minus(admin)) };
  };
  const policy = schemePolicy(input.scheme);
  if (!policy) throw new Error(`Unknown invoice scheme: ${input.scheme}`);
  if (policy.kind === 'agency') {
    const marginRate = policy.marginRate ?? percent(input.agencyMarginRate ?? 0).toNumber();
    const partnerRate = policy.partnerRate ?? Decimal.min(marginRate, percent(input.partnerCommRate ?? 0)).toNumber();
    const margin = share(marginRate);
    const partner = share(partnerRate);
    const admin = margin.minus(partner);
    const clientBase = bill.minus(margin);
    return { ...base, ...(input.scheme === 'agency' ? { commissionRate: String(marginRate) } : {}),
      agencyMargin: moneyString(margin), partnerShareFromMargin: moneyString(partner), adminShareFromMargin: moneyString(admin),
      clientBaseAfterMargin: moneyString(clientBase), clientRemaining: moneyString(clientBase.minus(expenses)),
      partnerTransferDue: moneyString(admin), ...split(admin),
    };
  }
  const commissionRate = policy.commissionRate ?? percent(input.partnerCommRate ?? 0).toNumber();
  const commission = share(commissionRate);
  const toAdmin = bill.minus(commission);
  const due = Decimal.max(0, toAdmin.minus(planned.gt(0) ? planned : byPartner));
  const remaining = planned.gt(0) ? money(Decimal.max(0, bill.mul(new Decimal(1).minus(expenses.div(planned))))) : new Decimal(0);
  return { ...base, commissionRate: String(commissionRate), commissionAmount: moneyString(commission), amountToAdmin: moneyString(toAdmin),
    clientRemaining: moneyString(remaining), partnerTransferDue: moneyString(due), ...split(due.minus(byAdmin)),
  };
}

/** Numeric display adapter; never used to persist financial facts. */
export function calculateInvoiceFinancials(input: FinancialInputs): FinancialResult {
  return Object.fromEntries(Object.entries(calculateBookedFinancials(input)).map(([key, value]) => [key, Number(value)])) as unknown as FinancialResult;
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
