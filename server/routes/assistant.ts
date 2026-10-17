import type { AuthMiddleware } from '../middleware';
import { Router, Response } from 'express';
import { and, eq, sql } from 'drizzle-orm';
import type { db as Database } from '../db';
import { invoices, invoiceCalculations, partners, clients } from '../../shared/schema';
import { AuthenticatedRequest, requireRole } from '../middleware';
import { invoiceScope, invoiceQueryInput } from '../invoiceQuery';
import { browsePages } from '../../shared/pagination';

export function createAssistantRouter(authMiddleware: AuthMiddleware, db: typeof Database) {
  const router = Router();
  router.get('/api/assistant/invoice-summary', authMiddleware, requireRole('admin', 'assistant'), async (req: AuthenticatedRequest, res: Response) => {
    const year = Number(req.query.year);
    if (!Number.isInteger(year) || year < 1900 || year > 2100) return res.status(400).json({ error: 'Invalid year' });
    const filter = and(invoiceScope(req.user!), eq(invoices.status, 'paid'),
      sql`${invoices.actualPaymentDate} >= ${`${year}-01-01`}::date AND ${invoices.actualPaymentDate} < ${`${year + 1}-01-01`}::date`);
    try {
      const result = await db.execute<{ payload: unknown }>(sql`
        WITH matched AS (SELECT ${invoices.actualPaymentDate} AS paid, ${invoices.partnerId} AS partner_id,
          coalesce(${invoiceCalculations.clientBill}, ${invoices.clientBill}, 0) AS amount,
          coalesce(${invoiceCalculations.executorExpensesTotal}, 0) AS expenses
          FROM ${invoices} LEFT JOIN ${invoiceCalculations} ON ${invoices.id} = ${invoiceCalculations.invoiceId} WHERE ${filter})
        SELECT json_build_object('total', coalesce(sum(amount), 0)::text, 'totalExpenses', coalesce(sum(expenses), 0)::text,
          'count', count(*)::int, 'monthly', coalesce((SELECT json_agg(m ORDER BY month) FROM
            (SELECT extract(month from paid)::int - 1 AS month, sum(amount)::text AS total FROM matched GROUP BY month) m), '[]'::json),
          'topPartner', (SELECT json_build_object('name', ${partners.name}, 'total', sum(m.amount)::text)
            FROM matched m JOIN ${partners} ON m.partner_id = ${partners.id}
            GROUP BY ${partners.id}, ${partners.name} ORDER BY sum(m.amount) DESC, ${partners.id} LIMIT 1)) AS payload FROM matched`);
      res.json(result.rows[0].payload);
    } catch (error) { console.error('Assistant summary failed:', error); res.status(500).json({ error: 'Не удалось загрузить статистику' }); }
  });
  router.get('/api/assistant/invoice-groups', authMiddleware, requireRole('admin', 'assistant'), async (req: AuthenticatedRequest, res: Response) => {
    const year = Number(req.query.year);
    const parsed = invoiceQueryInput.safeParse(req.query);
    if (!parsed.success || !Number.isInteger(year) || year < 1900 || year > 2100) return res.status(400).json({ error: 'Invalid filters' });
    const { page, limit, partnerId } = parsed.data;
    const entity = partnerId ? clients : partners;
    const filter = and(invoiceScope(req.user!), eq(invoices.status, 'paid'), partnerId ? eq(invoices.partnerId, partnerId) : undefined,
      sql`${invoices.actualPaymentDate} >= ${`${year}-01-01`}::date AND ${invoices.actualPaymentDate} < ${`${year + 1}-01-01`}::date`);
    try {
      const result = await db.execute<{ payload: { rows: unknown[]; total: number; amount: string } }>(sql`
        WITH groups AS (SELECT ${entity.id} AS id, ${entity.name} AS name,
          coalesce(sum(coalesce(${invoiceCalculations.clientBill}, ${invoices.clientBill}, 0)), 0) AS amount,
          count(*)::int AS count, count(distinct ${invoices.clientId})::int AS clients
          FROM ${invoices} JOIN ${entity} ON ${partnerId ? invoices.clientId : invoices.partnerId} = ${entity.id}
          LEFT JOIN ${invoiceCalculations} ON ${invoices.id} = ${invoiceCalculations.invoiceId}
          WHERE ${filter} GROUP BY ${entity.id}, ${entity.name}),
        page AS (SELECT * FROM groups ORDER BY amount DESC, id LIMIT ${limit} OFFSET ${(page - 1) * limit})
        SELECT json_build_object('total', count(*)::int, 'amount', coalesce(sum(amount), 0)::text,
          'rows', coalesce((SELECT json_agg(json_build_object('id', id, 'name', name, 'total', amount::text,
            'invoiceCount', count, 'clientCount', clients) ORDER BY amount DESC, id) FROM page), '[]'::json)) AS payload FROM groups`);
      const data = result.rows[0].payload;
      res.json({ ...data, page, pages: browsePages(data.total, limit) });
    } catch (error) { console.error('Assistant groups failed:', error); res.status(500).json({ error: 'Не удалось загрузить статистику' }); }
  });
  return router;
}
