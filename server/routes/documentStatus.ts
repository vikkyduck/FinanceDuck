import { Router, type Response } from 'express';
import { and, eq, ilike, sql } from 'drizzle-orm';
import type { db as Database } from '../db';
import { invoices, clients, signedActs } from '../../shared/schema';
import { invoiceQueryInput, invoiceScope } from '../invoiceQuery';
import { browsePages } from '../../shared/pagination';
import { requireRole, type AuthMiddleware, type AuthenticatedRequest } from '../middleware';

export function createDocumentStatusRouter(auth: AuthMiddleware, db: typeof Database) {
  const router = Router();
  for (const [route, closing] of [['/api/clients/acts-status', false], ['/api/closing-docs-status', true]] as const) {
    router.get(route, auth, requireRole(...(closing ? ['admin'] as const : ['admin', 'assistant', 'accountant'] as const)), async (req: AuthenticatedRequest, res: Response) => {
      const parsed = invoiceQueryInput.safeParse(req.query);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid document filters' });
      const { page, limit, clientId, search } = parsed.data;
      const filter = and(invoiceScope(req.user!), closing ? eq(invoices.hideFromAssistant, true) : eq(invoices.status, 'paid'),
        clientId ? eq(invoices.clientId, clientId) : undefined,
        search ? ilike(clients.name, `%${search.replace(/[\\%_]/g, '\\$&')}%`) : undefined);
      const matched = sql`SELECT ${invoices.id} AS id, ${invoices.invoiceNumber} AS number, ${invoices.paymentDate} AS paid,
        ${invoices.closingDocumentUrl} AS doc, ${clients.id} AS client_id, ${clients.name} AS client_name,
        coalesce(acts.company, false) AS company, coalesce(acts.executor, false) AS executor
        FROM ${invoices} JOIN ${clients} ON ${clients.id} = ${invoices.clientId}
        LEFT JOIN (SELECT ${signedActs.invoiceId} AS invoice_id,
          bool_or(${signedActs.actType} = 'company') AS company, bool_or(${signedActs.actType} = 'executor') AS executor
          FROM ${signedActs} GROUP BY ${signedActs.invoiceId}) acts ON acts.invoice_id = ${invoices.id}
        WHERE ${filter}`;
      try {
        if (clientId) {
          const result = await db.execute<{ payload: { invoices: unknown[]; total: number } }>(sql`
            WITH matched AS (${matched}), page AS (SELECT * FROM matched ORDER BY number, id LIMIT ${limit} OFFSET ${(page - 1) * limit})
            SELECT json_build_object('total', count(*)::int, 'invoices', coalesce((SELECT json_agg(json_build_object('id', id,
              'invoiceNumber', number, 'paymentDate', paid, 'hasCompanyAct', company, 'hasExecutorAct', executor,
              'closingDocumentUrl', doc) ORDER BY number, id) FROM page), '[]'::json)) AS payload FROM matched`);
          const data = result.rows[0].payload;
          return res.json({ ...data, page, pages: browsePages(data.total, limit) });
        }
        const counts = sql`json_build_object('totalInvoices', total, 'withCompanyAct', company, 'withExecutorAct', executor,
          'withBothActs', both_acts, 'withoutActs', no_acts, 'withDoc', with_doc, 'withoutDoc', no_doc)`;
        const result = await db.execute<{ payload: { groups: unknown[]; total: number; summary: unknown } }>(sql`
          WITH matched AS (${matched}), grouped AS (
            SELECT client_id, client_name, count(*)::int AS total, count(*) FILTER (WHERE company)::int AS company,
              count(*) FILTER (WHERE executor)::int AS executor, count(*) FILTER (WHERE company AND executor)::int AS both_acts,
              count(*) FILTER (WHERE NOT company AND NOT executor)::int AS no_acts,
              count(*) FILTER (WHERE coalesce(doc,'') <> '')::int AS with_doc, count(*) FILTER (WHERE coalesce(doc,'') = '')::int AS no_doc
            FROM matched GROUP BY client_id, client_name),
          page AS (SELECT * FROM grouped ORDER BY ${closing ? sql`no_doc` : sql`no_acts`} DESC, client_name, client_id LIMIT ${limit} OFFSET ${(page - 1) * limit}),
          totals AS (SELECT coalesce(sum(total),0)::int AS total, coalesce(sum(company),0)::int AS company,
            coalesce(sum(executor),0)::int AS executor, coalesce(sum(both_acts),0)::int AS both_acts,
            coalesce(sum(no_acts),0)::int AS no_acts, coalesce(sum(with_doc),0)::int AS with_doc, coalesce(sum(no_doc),0)::int AS no_doc FROM grouped)
          SELECT json_build_object('total', (SELECT count(*)::int FROM grouped), 'summary', (SELECT ${counts} FROM totals),
            'groups', coalesce((SELECT json_agg(${counts}::jsonb || jsonb_build_object('clientId', client_id, 'clientName', client_name)
              ORDER BY ${closing ? sql`no_doc` : sql`no_acts`} DESC, client_name, client_id) FROM page), '[]'::json)) AS payload`);
        const data = result.rows[0].payload;
        res.json({ ...data, page, pages: browsePages(data.total, limit) });
      } catch (error) { console.error('Document summary failed:', error); res.status(500).json({ error: 'Не удалось загрузить документы' }); }
    });
  }
  return router;
}
