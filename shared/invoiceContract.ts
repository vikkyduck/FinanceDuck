import { z } from 'zod';
import { INVOICE_SCHEMES, INVOICE_STATUSES } from './domainTypes';

const money = z.string().regex(/^-?\d+(\.\d+)?$/).nullable();
export const invoiceDtoSchema = z.object({
  id: z.string().uuid(), invoiceNumber: z.string(), createdAt: z.string(), scheme: z.enum(INVOICE_SCHEMES), status: z.enum(INVOICE_STATUSES),
  clientBill: money.optional(), pricePerPeriod: money.optional(), plannedExpenses: money.optional(),
  calculations: z.object({
    clientBill: money.optional(), clientRemaining: money.optional(), clientSpent: money.optional(),
    executorExpensesTotal: money.optional(),
  }).passthrough().optional(),
}).passthrough();

export const expenseDtoSchema = z.object({
  id: z.string().uuid(), invoiceId: z.string().uuid(), description: z.string(),
  amount: z.string().regex(/^-?\d+(\.\d+)?$/).optional(), date: z.string(), paidByAdmin: z.boolean().optional(),
}).passthrough();

export const invoicePageSchema = z.object({
  invoices: z.array(invoiceDtoSchema), total: z.number().int().nonnegative(),
  statusCounts: z.object({ all: z.number(), draft: z.number(), sent: z.number(), paid: z.number(), cancelled: z.number(), overdue: z.number() }),
  clients: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
  partners: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
});
