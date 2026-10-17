import { and, or, eq, ilike, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { invoices, clients, partners, invoiceCalculations } from '../shared/schema';
import type { InvoiceActor } from './invoiceAccess';
import { MAX_BROWSE_ROWS } from '../shared/pagination';

export const invoiceQueryFields = z.object({
  page: z.coerce.number().int().min(1).max(MAX_BROWSE_ROWS).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  clientId: z.string().uuid().optional(), partnerId: z.string().uuid().optional(),
  invoiceId: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
  status: z.enum(['all', 'draft', 'sent', 'paid', 'cancelled', 'overdue']).optional(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  sort: z.enum(['date-desc', 'date-asc', 'amount-desc', 'amount-asc']).default('date-desc'),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
  includeUndated: z.enum(['true', 'false']).optional().transform(v => v === 'true'),
  excludeCancelled: z.enum(['true', 'false']).optional().transform(v => v === 'true'),
  positiveBalance: z.enum(['true', 'false']).optional().transform(v => v === 'true'),
});
export const invoiceQueryInput = invoiceQueryFields.refine(query => query.page * query.limit <= MAX_BROWSE_ROWS, 'Уточните фильтры: достигнут предел просмотра')
  .refine(query => !query.dateFrom || !query.dateTo || query.dateFrom <= query.dateTo, 'Начало периода позже конца');
export type InvoiceQuery = z.infer<typeof invoiceQueryInput>;

export function invoiceScope(actor: InvoiceActor): SQL | undefined {
  switch (actor.role) {
    case 'admin': return undefined;
    case 'assistant': return eq(invoices.hideFromAssistant, false);
    case 'accountant': return eq(invoices.hideFromAssistant, true);
    case 'client': return actor.clientId ? eq(invoices.clientId, actor.clientId) : sql`false`;
    case 'partner': return actor.partnerId ? eq(invoices.partnerId, actor.partnerId) : sql`false`;
    default: return sql`false`;
  }
}

export function invoiceFilters(actor: InvoiceActor, query: Partial<InvoiceQuery> = {}) {
  const terms: (SQL | undefined)[] = [invoiceScope(actor)];
  if (query.invoiceId) terms.push(eq(invoices.id, query.invoiceId));
  if (query.clientId) terms.push(eq(invoices.clientId, query.clientId));
  if (query.partnerId) terms.push(eq(invoices.partnerId, query.partnerId));
  if (query.status === 'overdue') terms.push(sql`${invoices.status} = 'sent' AND ${invoices.actualPaymentDate} IS NULL AND ${invoices.paymentDate} < CURRENT_DATE`);
  else if (query.status && query.status !== 'all') terms.push(eq(invoices.status, query.status));
  if (query.month) terms.push(sql`${invoices.createdAt} >= ${query.month + '-01'}::date AND ${invoices.createdAt} < ${query.month + '-01'}::date + INTERVAL '1 month'`);
  const dates = and(query.dateFrom ? sql`${invoices.paymentDate} >= ${query.dateFrom}::date` : undefined,
    query.dateTo ? sql`${invoices.paymentDate} <= ${query.dateTo}::date` : undefined);
  if (dates) terms.push(query.includeUndated ? or(dates, sql`${invoices.paymentDate} IS NULL`) : dates);
  if (query.excludeCancelled) terms.push(sql`${invoices.status} <> 'cancelled'`);
  if (query.positiveBalance) terms.push(sql`${invoiceCalculations.clientRemaining} > 0`);
  if (query.search?.trim()) {
    const pattern = `%${query.search.trim().replace(/[\\%_]/g, '\\$&')}%`;
    terms.push(or(ilike(invoices.invoiceNumber, pattern), ilike(invoices.notes, pattern),
      sql`${invoices.clientId} IN (SELECT ${clients.id} FROM ${clients} WHERE ${clients.name} ILIKE ${pattern})`,
      sql`${invoices.partnerId} IN (SELECT ${partners.id} FROM ${partners} WHERE ${partners.name} ILIKE ${pattern})`));
  }
  return and(...terms);
}

export function invoiceOrder(query: Partial<InvoiceQuery>) {
  const amount = sql`COALESCE(${invoiceCalculations.clientBill}, ${invoices.clientBill}, 0)`;
  switch (query.sort) {
    case 'date-asc': return sql`${invoices.createdAt} ASC, ${invoices.id} ASC`;
    case 'amount-desc': return sql`${amount} DESC, ${invoices.id} ASC`;
    case 'amount-asc': return sql`${amount} ASC, ${invoices.id} ASC`;
    default: return sql`${invoices.createdAt} DESC, ${invoices.id} ASC`;
  }
}
