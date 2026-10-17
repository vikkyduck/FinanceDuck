import { z } from 'zod';
import Decimal from 'decimal.js';
import { INVOICE_SCHEMES, INVOICE_STATUSES } from '../../shared/domainTypes';
import type { InsertInvoice, InsertInvoiceExpense, InvoiceCalculation } from '../../shared/schema';
import { INVOICE_WRITABLE_FIELDS, EXPENSE_WRITABLE_FIELDS } from '../lib/sanitize';
import { isoDate } from '../lib/recurringInput';
import { CommandError } from '../lib/commandError';

type InvoiceFields = Pick<InsertInvoice, typeof INVOICE_WRITABLE_FIELDS[number]>;
export type CreateInvoiceInput = InvoiceFields & { createdBy?: string };
export type ChangeInvoiceTerms = Partial<InvoiceFields>;
export type CalculationInput = Partial<Pick<InvoiceCalculation, 'clientBill' | 'commissionRate'>>;
export type ExpenseFields = Pick<InsertInvoiceExpense, typeof EXPENSE_WRITABLE_FIELDS[number]>;
export type RecordExpense = ExpenseFields & { invoiceId: string; createdBy?: string };

const money = z.union([z.number().finite().nonnegative().max(9999999999999.99), z.string().trim().regex(/^\d{1,13}(?:[.,]\d{1,4})?$/)])
  .transform(value => new Decimal(String(value).replace(',', '.')).toFixed(2, Decimal.ROUND_HALF_UP));
const rate = money.refine(value => Number(value) <= 100, 'Процент должен быть от 0 до 100');
const text = z.string().max(10000).nullish();
export const invoiceTerms = z.object({
  invoiceNumber: z.string().trim().min(1).max(200), clientId: z.string().uuid(), partnerId: z.string().uuid(),
  scheme: z.enum(INVOICE_SCHEMES), status: z.enum(INVOICE_STATUSES).optional(), clientBill: money.nullish(),
  commissionAmount: money.nullish(), partnerCommissionRate: rate.nullish(), plannedExpenses: money.nullish(),
  description: text, clientTitle: text, notes: text, closingDocumentUrl: text,
  issueDate: isoDate.nullish(), paymentDate: isoDate.nullish(), actualPaymentDate: isoDate.nullish(),
  hideFromAssistant: z.boolean().optional(), serviceType: z.enum(['one_time', 'periodic']).optional(),
  periodUnit: z.enum(['month', 'day', 'hour']).optional(), pricePerPeriod: money.nullish(),
  totalPeriods: z.number().int().min(1).max(1_000_000).nullish(),
});
export const calculationInput = z.object({ clientBill: z.preprocess(value => value ?? undefined, money.optional()), commissionRate: rate.nullish() });
export const expenseInput = z.object({ description: z.string().min(1).max(10000), amount: money.refine(value => Number(value) > 0, 'Расход должен быть больше 0'),
  paidByAdmin: z.boolean().optional(), date: isoDate.optional() });

export function parseCommand<S extends z.ZodTypeAny>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw new CommandError(result.error.issues.slice(0, 3).map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; '), 400);
  return result.data;
}

export function validatePeriodicTerms(terms: ChangeInvoiceTerms & { periodsUsed?: number }) {
  if (terms.serviceType !== 'periodic') return;
  if (!terms.totalPeriods || terms.pricePerPeriod == null) throw new CommandError('Периодической услуге нужны цена и число периодов', 400);
  if ((terms.periodsUsed ?? 0) > terms.totalPeriods) throw new CommandError('Использованные периоды превышают общее число', 400);
}
