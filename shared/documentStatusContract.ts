import { z } from 'zod';
const counts = z.object({ totalInvoices: z.number().int(), withCompanyAct: z.number().int(), withExecutorAct: z.number().int(),
  withBothActs: z.number().int(), withoutActs: z.number().int(), withDoc: z.number().int(), withoutDoc: z.number().int() });
export const documentGroupsSchema = z.object({
  groups: counts.extend({ clientId: z.string().uuid(), clientName: z.string() }).array(), summary: counts,
  total: z.number().int(), page: z.number().int(), pages: z.number().int(),
});
export const documentRowsSchema = z.object({
  invoices: z.object({ id: z.string().uuid(), invoiceNumber: z.string(), paymentDate: z.string().nullable(),
    hasCompanyAct: z.boolean(), hasExecutorAct: z.boolean(), closingDocumentUrl: z.string().nullable() }).array(),
  total: z.number().int(), page: z.number().int(), pages: z.number().int(),
});
