import { and, eq, ilike, sql } from 'drizzle-orm';
import { invoices, invoiceCalculations, clients, partners } from '../../shared/schema';
import { AGENCY_SCHEMES } from '../../shared/financialEngine';
import { invoiceFilters, invoiceScope, type InvoiceQuery } from '../invoiceQuery';
import type { InvoiceActor } from '../invoiceAccess';
import type { DBorTx } from './invoiceRepo';
import { browsePages } from '../../shared/pagination';

export async function getPartnerInvoiceSummary(db: DBorTx, actor: InvoiceActor, year: number) {
  const [row] = await db.select({
    totalPaidInvoices: sql<number>`count(*)::int`,
    yearlyCommission: sql<string>`coalesce(sum(case when ${invoices.scheme} in ${AGENCY_SCHEMES}
      then ${invoiceCalculations.partnerShareFromMargin} else ${invoiceCalculations.commissionAmount} end)
      filter (where coalesce(${invoices.paymentDate}, ${invoices.createdAt}::date) >= ${`${year}-01-01`}::date
        and coalesce(${invoices.paymentDate}, ${invoices.createdAt}::date) < ${`${year + 1}-01-01`}::date), 0)::text`,
  }).from(invoices).leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
    .where(and(invoiceScope(actor), eq(invoices.status, 'paid')));
  return { ...row, year };
}

/** One SQL snapshot: totals cover every matching invoice, while only one page of groups leaves PostgreSQL. */
export async function getClientBalances(db: DBorTx, actor: InvoiceActor, query: InvoiceQuery) {
  const filter = invoiceFilters(actor, { ...query, search: undefined, excludeCancelled: true });
  const search = query.search?.trim();
  const names = search ? ilike(clients.name, `%${search.replace(/[\\%_]/g, '\\$&')}%`) : undefined;
  const bill = sql`coalesce(${invoiceCalculations.clientBill}, ${invoices.clientBill}, 0)`;
  const budget = sql`case when ${invoices.scheme} in ${AGENCY_SCHEMES}
    then coalesce(${invoiceCalculations.clientBaseAfterMargin}, ${bill}) else ${bill} end`;
  const result = await db.execute<{ payload: { groups: unknown[]; summary: { clients: number; invoices: number; totalBudget: string; totalSpent: string; totalRemaining: string } } }>(sql`
    WITH matched AS (
      SELECT ${clients.id} AS client_id, ${clients.name} AS client_name, ${invoices.status} AS status,
        ${budget} AS budget, coalesce(${invoiceCalculations.executorExpensesTotal}, 0) AS spent,
        coalesce(${invoiceCalculations.clientRemaining}, 0) AS remaining
      FROM ${invoices} JOIN ${clients} ON ${invoices.clientId} = ${clients.id}
      LEFT JOIN ${invoiceCalculations} ON ${invoices.id} = ${invoiceCalculations.invoiceId}
      LEFT JOIN ${partners} ON ${invoices.partnerId} = ${partners.id}
      WHERE ${and(filter, names)}
    ), grouped AS (
      SELECT client_id, client_name, count(*)::int AS invoice_count,
        count(*) FILTER (WHERE status IN ('draft','sent'))::int AS active_count,
        sum(budget) AS budget, sum(spent) AS spent, sum(remaining) AS remaining
      FROM matched GROUP BY client_id, client_name
    ), page AS (SELECT * FROM grouped ORDER BY client_name, client_id LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit})
    SELECT json_build_object('groups', coalesce((SELECT json_agg(json_build_object(
      'clientId', client_id, 'clientName', client_name, 'invoiceCount', invoice_count, 'activeCount', active_count,
      'totalBudget', budget::text, 'totalSpent', spent::text, 'totalRemaining', remaining::text
    ) ORDER BY client_name, client_id) FROM page), '[]'::json), 'summary',
      (SELECT json_build_object('clients', count(*)::int, 'invoices', coalesce(sum(invoice_count), 0)::int,
        'totalBudget', coalesce(sum(budget), 0)::text, 'totalSpent', coalesce(sum(spent), 0)::text,
        'totalRemaining', coalesce(sum(remaining), 0)::text) FROM grouped)) AS payload`);
  const data = result.rows[0].payload;
  return { ...data, page: query.page, pages: browsePages(data.summary.clients, query.limit) };
}
