/**
 * searchRepo — вынесено из God-объекта storage.ts (тот же паттерн, что dashboardRepo).
 * Функции принимают db параметром → тестируются против PGlite.
 */
import { eq, and, or, gte, lte, desc, asc, sql, inArray, isNull, isNotNull } from "drizzle-orm";
import { db as _db } from "../db";
import {
  invoices, invoiceCalculations, invoiceExpenses, invoiceTransfers, partnerPayments,
  partners, clients, recurringInvoices, monthlyFinancialPlans, signedActs, accessTokens,
  assistantBonusPayments,
} from "../../shared/schema";
import { parseNum } from "../../shared/financialEngine";


type DB = typeof _db;

export async function globalSearch(db: DB, 
  query: string,
  role: string,
  options: { clientId?: string } = {},
): Promise<Array<{
  id: string;
  type: 'invoice' | 'partner' | 'client' | 'thread' | 'expense';
  title: string;
  subtitle?: string;
  url?: string;
  score?: number;
}>> {
  type R = {
    id: string;
    type: 'invoice' | 'partner' | 'client' | 'thread' | 'expense';
    title: string;
    subtitle?: string;
    url?: string;
    score?: number;
  };
  const results: R[] = [];

  const trimmed = query.trim();
  if (!trimmed) return results;
  const isStaff = role === 'admin' || role === 'assistant';
  const isClient = role === 'client';
  if (!isStaff && !isClient) return results;

  const q = trimmed.toLowerCase();
  const like = `%${q}%`;
  // pg_trgm выставляем порог ~0.25 — нормально ловит опечатки до 1-2 букв
  // в слове и сокращения. Слишком низкий — много шума.
  const TRG_MIN = 0.25;
  // Короткие запросы (< 3 символов) триграммы не покрывают, оставляем
  // только LIKE-логику.
  const useFuzzy = q.length >= 3;

  // ── Счета ────────────────────────────────────────────────────────────
  const clientFilter = isClient
    ? sql`AND i.client_id = ${options.clientId}`
    : sql``;
  const fuzzyExpr = useFuzzy
    ? sql`GREATEST(
          similarity(LOWER(COALESCE(i.invoice_number, '')), ${q}),
          similarity(LOWER(COALESCE(i.client_title, '')),   ${q}),
          ${isStaff ? sql`similarity(LOWER(COALESCE(i.notes, '')), ${q}),`         : sql``}
          ${isStaff ? sql`similarity(LOWER(COALESCE(i.description, '')), ${q}),`   : sql``}
          ${isStaff ? sql`similarity(LOWER(COALESCE(c.name, '')), ${q})`           : sql`0`}
        )`
    : sql`0`;
  const fuzzyCondition = useFuzzy
    ? sql`OR (${fuzzyExpr}) >= ${TRG_MIN}`
    : sql``;

  const invRows = await db.execute(sql`
    SELECT
      i.id              AS id,
      i.invoice_number  AS invoice_number,
      i.client_title    AS client_title,
      c.name            AS client_name,
      p.name            AS partner_name,
      GREATEST(
        CASE WHEN LOWER(COALESCE(i.invoice_number, '')) LIKE ${like}    THEN 1.0 ELSE 0 END,
        CASE WHEN LOWER(COALESCE(i.client_title,   '')) LIKE ${like}    THEN 0.95 ELSE 0 END,
        ${isStaff ? sql`CASE WHEN LOWER(COALESCE(i.notes, '')) LIKE ${like}       THEN 0.8 ELSE 0 END,` : sql``}
        ${isStaff ? sql`CASE WHEN LOWER(COALESCE(i.description, '')) LIKE ${like} THEN 0.8 ELSE 0 END,` : sql``}
        ${isStaff ? sql`CASE WHEN LOWER(COALESCE(c.name, '')) LIKE ${like}        THEN 0.85 ELSE 0 END,`: sql``}
        ${fuzzyExpr}
      ) AS score
      FROM invoices i
      LEFT JOIN clients  c ON c.id = i.client_id
      LEFT JOIN partners p ON p.id = i.partner_id
     WHERE (
       LOWER(COALESCE(i.invoice_number, '')) LIKE ${like}
       OR LOWER(COALESCE(i.client_title,   '')) LIKE ${like}
       ${isStaff ? sql`OR LOWER(COALESCE(i.notes, '')) LIKE ${like}`        : sql``}
       ${isStaff ? sql`OR LOWER(COALESCE(i.description, '')) LIKE ${like}`  : sql``}
       ${isStaff ? sql`OR LOWER(COALESCE(c.name, '')) LIKE ${like}`         : sql``}
       ${fuzzyCondition}
     )
     ${clientFilter}
     ORDER BY score DESC
     LIMIT 8
  `);
  const invList = (invRows.rows ?? invRows) as Array<{
    id: string; invoice_number: string | null; client_title: string | null;
    client_name: string | null; partner_name: string | null; score: number;
  }>;
  for (const inv of invList) {
    const title = inv.client_title || inv.invoice_number || `Счёт ${inv.id.slice(0, 8)}`;
    const subtitle = isClient
      ? (inv.invoice_number ? `№ ${inv.invoice_number}` : undefined)
      : `№ ${inv.invoice_number || '—'} · ${inv.client_name || 'Клиент'}`;
    results.push({
      id: inv.id,
      type: 'invoice',
      title,
      subtitle,
      url: `/invoices?open=${inv.id}`,
      score: Number(inv.score) || 0,
    });
  }

  // ── Треды (по тексту сообщений) ──────────────────────────────────────
  const threadAccess = isClient ? sql`AND i.client_id = ${options.clientId}` : sql``;
  const threadFuzzy = useFuzzy
    ? sql`OR similarity(LOWER(im.body), ${q}) >= ${TRG_MIN}`
    : sql``;
  const threadRows = await db.execute(sql`
    SELECT DISTINCT ON (im.invoice_id, im.expense_id)
      im.invoice_id    AS invoice_id,
      im.expense_id    AS expense_id,
      im.body          AS last_match_body,
      im.created_at    AS msg_created_at,
      i.invoice_number AS invoice_number,
      c.name           AS client_name,
      GREATEST(
        CASE WHEN LOWER(im.body) LIKE ${like} THEN 1.0 ELSE 0 END,
        ${useFuzzy ? sql`similarity(LOWER(im.body), ${q})` : sql`0`}
      ) AS score
      FROM invoice_messages im
      JOIN invoices i ON i.id = im.invoice_id
      JOIN clients  c ON c.id = i.client_id
     WHERE (LOWER(im.body) LIKE ${like} ${threadFuzzy})
       ${threadAccess}
     ORDER BY im.invoice_id, im.expense_id, im.created_at DESC
     LIMIT 6
  `);
  const threadList = (threadRows.rows ?? threadRows) as Array<{
    invoice_id: string; expense_id: string | null;
    last_match_body: string; invoice_number: string | null; client_name: string | null;
    score: number;
  }>;
  for (const t of threadList) {
    const previewRaw = String(t.last_match_body || '').replace(/\s+/g, ' ').slice(0, 80);
    const title = isClient
      ? (t.invoice_number ? `Счёт № ${t.invoice_number}` : 'Тред')
      : `${t.invoice_number ? `Счёт № ${t.invoice_number}` : 'Тред'} · ${t.client_name || 'Клиент'}`;
    // URL ведёт прямо на конкретный тред (MessagesPage прочитает query).
    const threadParams = new URLSearchParams({ invoiceId: t.invoice_id });
    if (t.expense_id) threadParams.set('expenseId', t.expense_id);
    results.push({
      id: `thread:${t.invoice_id}:${t.expense_id ?? ''}`,
      type: 'thread',
      title,
      subtitle: previewRaw + (previewRaw.length === 80 ? '…' : ''),
      url: `/messages?${threadParams.toString()}`,
      score: Number(t.score) || 0,
    });
  }

  // ── Затраты (invoice_expenses.description) ──────────────────────────
  // Видны клиенту ТОЛЬКО по агентским 30/40 счетам (видимость «кухни»).
  // Staff видит все.
  const expenseClientFilter = isClient
    ? sql`AND i.client_id = ${options.clientId} AND i.scheme IN ('agency_30', 'agency_40', 'agency')`
    : sql``;
  const expenseFuzzy = useFuzzy
    ? sql`OR similarity(LOWER(ie.description), ${q}) >= ${TRG_MIN}`
    : sql``;
  const expenseRows = await db.execute(sql`
    SELECT
      ie.id              AS id,
      ie.invoice_id      AS invoice_id,
      ie.description     AS description,
      ie.amount          AS amount,
      ie.date            AS date,
      i.invoice_number   AS invoice_number,
      c.name             AS client_name,
      GREATEST(
        CASE WHEN LOWER(COALESCE(ie.description, '')) LIKE ${like} THEN 1.0 ELSE 0 END,
        ${useFuzzy ? sql`similarity(LOWER(COALESCE(ie.description, '')), ${q})` : sql`0`}
      ) AS score
      FROM invoice_expenses ie
      JOIN invoices i ON i.id = ie.invoice_id
      JOIN clients  c ON c.id = i.client_id
     WHERE (LOWER(COALESCE(ie.description, '')) LIKE ${like} ${expenseFuzzy})
       ${expenseClientFilter}
     ORDER BY score DESC, ie.date DESC NULLS LAST
     LIMIT 6
  `);
  const expenseList = (expenseRows.rows ?? expenseRows) as Array<{
    id: string; invoice_id: string; description: string | null;
    amount: string | number; date: string | null;
    invoice_number: string | null; client_name: string | null; score: number;
  }>;
  for (const e of expenseList) {
    const amount = typeof e.amount === 'number' ? e.amount : parseFloat(String(e.amount || '0'));
    const subtitle = isClient
      ? `Счёт № ${e.invoice_number || '—'}${Number.isFinite(amount) ? ` · ${amount.toLocaleString('ru-RU')} ₽` : ''}`
      : `Счёт № ${e.invoice_number || '—'} · ${e.client_name || ''}${Number.isFinite(amount) ? ` · ${amount.toLocaleString('ru-RU')} ₽` : ''}`;
    results.push({
      id: `expense:${e.id}`,
      type: 'expense',
      title: e.description || '—',
      subtitle,
      url: `/invoices?open=${e.invoice_id}`,
      score: Number(e.score) || 0,
    });
  }

  // ── Партнёры/клиенты — только staff ─────────────────────────────────
  if (isStaff) {
    const partnerRows = await db.execute(sql`
      SELECT id, name,
        GREATEST(
          CASE WHEN LOWER(name) LIKE ${like} THEN 1.0 ELSE 0 END,
          ${useFuzzy ? sql`similarity(LOWER(name), ${q})` : sql`0`}
        ) AS score
        FROM partners
       WHERE LOWER(name) LIKE ${like}
         ${useFuzzy ? sql`OR similarity(LOWER(name), ${q}) >= ${TRG_MIN}` : sql``}
       ORDER BY score DESC
       LIMIT 5
    `);
    for (const p of ((partnerRows.rows ?? partnerRows) as any[])) {
      results.push({ id: p.id, type: 'partner', title: p.name, url: '/partners', score: Number(p.score) || 0 });
    }

    const clientRows = await db.execute(sql`
      SELECT id, name, contact_person,
        GREATEST(
          CASE WHEN LOWER(name) LIKE ${like} THEN 1.0 ELSE 0 END,
          CASE WHEN LOWER(COALESCE(contact_person, '')) LIKE ${like} THEN 0.9 ELSE 0 END,
          ${useFuzzy ? sql`similarity(LOWER(name), ${q})` : sql`0`},
          ${useFuzzy ? sql`similarity(LOWER(COALESCE(contact_person, '')), ${q})` : sql`0`}
        ) AS score
        FROM clients
       WHERE LOWER(name) LIKE ${like}
         OR LOWER(COALESCE(contact_person, '')) LIKE ${like}
         ${useFuzzy ? sql`OR similarity(LOWER(name), ${q}) >= ${TRG_MIN}` : sql``}
         ${useFuzzy ? sql`OR similarity(LOWER(COALESCE(contact_person, '')), ${q}) >= ${TRG_MIN}` : sql``}
       ORDER BY score DESC
       LIMIT 5
    `);
    for (const c of ((clientRows.rows ?? clientRows) as any[])) {
      const title = c.contact_person ? `${c.name} (${c.contact_person})` : c.name;
      results.push({ id: c.id, type: 'client', title, url: '/clients', score: Number(c.score) || 0 });
    }
  }

  // Сортируем итог по релевантности (но внутри типа порядок уже от БД).
  results.sort((a, b) => (b.score || 0) - (a.score || 0));
  return results;
}
