import { z } from 'zod';
import { invoiceDtoSchema, invoicePageSchema, expenseDtoSchema, clientBalancesSchema, partnerInvoiceSummarySchema, accountantLogsSchema } from './invoiceContract';
import { assistantGroupsSchema, assistantSummarySchema } from './assistantContract';
import { authResponseSchema } from './authContract';

/** Critical identity/invoicing responses are validated even when a caller omits its explicit schema. */
export function apiResponseContract(url: string, method: string): z.ZodTypeAny | undefined {
  const path = url.split('?')[0];
  if (path.startsWith('/api/auth/')) return authResponseSchema;
  if (method === 'GET') {
    if (path === '/api/invoices') return invoicePageSchema;
    if (path === '/api/invoices/client-balances') return clientBalancesSchema;
    if (path === '/api/invoices/partner-summary') return partnerInvoiceSummarySchema;
    if (path === '/api/assistant/invoice-summary') return assistantSummarySchema;
    if (path === '/api/assistant/invoice-groups') return assistantGroupsSchema;
    if (path === '/api/accountant-logs') return accountantLogsSchema;
  }
  if (method === 'POST' && path === '/api/invoices/transfer') return z.object({ id: z.string().uuid() });
  if (method === 'POST' && /^\/api\/invoices\/[^/]+\/periods$/.test(path)) {
    return z.object({ periodsUsed: z.number().int().nonnegative(), period: z.number().int().positive(), closed: z.boolean() });
  }
  if (method === 'DELETE' && /^\/api\/(?:invoices|expenses|transfers)\/[^/]+$/.test(path)) return z.object({ success: z.literal(true) });
  if (method === 'POST' && path === '/api/invoices') return invoiceDtoSchema;
  if (['GET', 'PATCH'].includes(method) && /^\/api\/invoices\/[a-f0-9-]{36}$/.test(path)) return invoiceDtoSchema;
  if (/^\/api\/invoices\/[^/]+\/expenses$/.test(path)) return method === 'GET' ? expenseDtoSchema.array() : expenseDtoSchema;
  if (method === 'PATCH' && /^\/api\/expenses\/[^/]+$/.test(path)) return expenseDtoSchema;
  return undefined;
}
