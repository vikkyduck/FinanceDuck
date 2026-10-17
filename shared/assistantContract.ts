import { z } from 'zod';
const amount = z.string().regex(/^-?\d+(\.\d+)?$/);
export const assistantSummarySchema = z.object({
  total: amount, totalExpenses: amount, count: z.number().int(),
  monthly: z.array(z.object({ month: z.number().int().min(0).max(11), total: amount })).max(12),
  topPartner: z.object({ name: z.string(), total: amount }).nullable(),
});
export const assistantGroupsSchema = z.object({
  rows: z.array(z.object({ id: z.string().uuid(), name: z.string(), total: amount, invoiceCount: z.number().int(), clientCount: z.number().int() })),
  total: z.number().int(), amount: amount, page: z.number().int(), pages: z.number().int(),
});
