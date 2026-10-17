import { z } from 'zod';
import { INVOICE_SCHEMES, INVOICE_STATUSES } from './domainTypes';

const money = z.string().regex(/^-?\d+(\.\d+)?$/).nullable();
const party = z.object({ id: z.string().uuid(), name: z.string() }).passthrough();
export const invoiceDtoSchema = z.object({
  id: z.string().uuid(), invoiceNumber: z.string(), createdAt: z.string(), scheme: z.enum(INVOICE_SCHEMES), status: z.enum(INVOICE_STATUSES),
  clientBill: money.optional(), pricePerPeriod: money.optional(), plannedExpenses: money.optional(),
  clientId: z.string().uuid().optional(), partnerId: z.string().uuid().optional(),
  client: party.optional(), partner: party.optional(),
  clientTitle: z.string().nullable().optional(), notes: z.string().nullable().optional(), description: z.string().nullable().optional(),
  paymentDate: z.string().nullable().optional(), issueDate: z.string().nullable().optional(), actualPaymentDate: z.string().nullable().optional(),
  closingDocumentUrl: z.string().nullable().optional(), hideFromAssistant: z.boolean().optional(),
  serviceType: z.enum(['one_time', 'periodic']).optional(), periodUnit: z.enum(['month', 'day', 'hour']).optional(),
  totalPeriods: z.number().int().nullable().optional(), periodsUsed: z.number().int().nonnegative().optional(),
  partnerCommissionRate: money.optional(), commissionAmount: money.optional(),
  calculations: z.object({
    clientBill: money.optional(), clientRemaining: money.optional(), clientSpent: money.optional(),
    executorExpensesTotal: money.optional(),
    commissionRate: money.optional(), commissionAmount: money.optional(), amountToAdmin: money.optional(),
    agencyMargin: money.optional(), partnerShareFromMargin: money.optional(), adminShareFromMargin: money.optional(),
    clientBaseAfterMargin: money.optional(), partnerTransferDue: money.optional(), netProfitAdmin: money.optional(),
    adminShare50: money.optional(), catShare50: money.optional(),
  }).passthrough().optional(),
}).passthrough();

export const expenseDtoSchema = z.object({
  id: z.string().uuid(), invoiceId: z.string().uuid(), description: z.string(),
  amount: z.string().regex(/^-?\d+(\.\d+)?$/).optional(), date: z.string(), paidByAdmin: z.boolean().optional(),
}).passthrough();

export const invoicePageSchema = z.object({
  invoices: z.array(invoiceDtoSchema), total: z.number().int().nonnegative(),
  page: z.number().int().positive(), pages: z.number().int().nonnegative(),
  statusCounts: z.object({ all: z.number(), draft: z.number(), sent: z.number(), paid: z.number(), cancelled: z.number(), overdue: z.number() }),
  clients: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
  partners: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
});

export const partnerInvoiceSummarySchema = z.object({
  totalPaidInvoices: z.number().int().nonnegative(), yearlyCommission: money.unwrap(), year: z.number().int(),
});
export const clientBalanceSchema = z.object({
  clientId: z.string().uuid(), clientName: z.string(), invoiceCount: z.number().int(), activeCount: z.number().int(),
  totalBudget: money.unwrap(), totalSpent: money.unwrap(), totalRemaining: money.unwrap(),
});
export const clientBalancesSchema = z.object({
  groups: clientBalanceSchema.array(), page: z.number().int(), pages: z.number().int(),
  summary: z.object({ clients: z.number().int(), invoices: z.number().int(),
    totalBudget: money.unwrap(), totalSpent: money.unwrap(), totalRemaining: money.unwrap() }),
});
export const accountantLogsSchema = z.object({
  logs: z.array(z.object({ id: z.string().uuid(), actionType: z.string(), description: z.string(), createdAt: z.string() }).passthrough()),
  total: z.number().int().nonnegative(),
});
export type InvoicePageDto = z.infer<typeof invoicePageSchema>;
