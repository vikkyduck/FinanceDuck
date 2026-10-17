import { serviceUsage } from "../../shared/schema";
import { CommandError } from "../lib/commandError";
/**
 * Invoice Repository
 * Core CRUD for invoices, invoice_calculations, invoice_expenses.
 * Includes row-level ownership enforcement (IDOR protection) in getInvoice().
 * All functions accept `db` as first parameter — no class dependency.
 */

import { db as _db } from "../db";
import { decodeHtmlEntities } from "../lib/sanitize";
import {
  invoices, invoiceCalculations, invoiceExpenses, invoiceTransfers, partners, clients,
  Invoice, InvoiceCalculation, InvoiceExpense, Partner, Client,
  InsertInvoice, InsertInvoiceExpense,
  UserRole, InvoiceScheme,
} from "../../shared/schema";
import {
  eq, and, desc, asc, inArray, isNull, or, isNotNull, sql,
} from "drizzle-orm";
import { invoiceFilters, invoiceOrder, invoiceScope, type InvoiceQuery } from "../invoiceQuery";
import { calculateFinancials, parseNum } from "../../shared/financialEngine";

type DB = typeof _db;
// Тип транзакции Drizzle. Хелперы принимают DB | Tx, чтобы одинаково
// работать и вне, и внутри db.transaction(...).
type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type DBorTx = DB | Tx;
type InvoiceWithRelations = Invoice & {
  calculations?: InvoiceCalculation;
  partner?: Partner;
  client?: Client;
};

// ---------------------------------------------------------------------------
// Internal adapter — converts shared engine numbers → Drizzle string fields
// Exported so recurring/dashboard repos can reuse without duplicating.
// ---------------------------------------------------------------------------
// Periodic service helpers — клиентская «дорожка» (по периодам) живёт
// отдельно от админской денежной математики. financialEngine не трогаем.
// ---------------------------------------------------------------------------

/**
 * Для periodic-счетов сумма счёта = price_per_period × total_periods
 * (предоплата за всё). Для one_time возвращает undefined — clientBill
 * остаётся таким, каким его прислали (ручной ввод).
 */
export function derivePeriodicClientBill(invoice: {
  serviceType?: string | null;
  pricePerPeriod?: string | number | null;
  totalPeriods?: number | null;
}): number | undefined {
  if (invoice.serviceType !== 'periodic') return undefined;
  const price = parseNum(invoice.pricePerPeriod ?? 0);
  const total = Number(invoice.totalPeriods ?? 0);
  if (!Number.isFinite(price) || !Number.isFinite(total) || total < 1) return undefined;
  return Math.round(price * total * 100) / 100;
}

/**
 * Для periodic переопределяем clientSpent/clientRemaining так, чтобы
 * они отражали ЗАКРЫТЫЕ ПЕРИОДЫ, а не реальные расходы на исполнителя.
 * Админская математика (commissionAmount, partnerTransferDue,
 * netProfitAdmin, executorExpensesTotal) остаётся как была.
 */
/**
 * Применяет переносы средств к клиентским полям без затрагивания
 * админской математики. transferBalance > 0 — нетто-приход (на счёт-получатель),
 * < 0 — нетто-расход (со счёта-источника). Меняем только clientRemaining.
 */
export function applyTransferOverrides(
  transferBalance: number,
  computed: Partial<InvoiceCalculation>,
): Partial<InvoiceCalculation> {
  if (!Number.isFinite(transferBalance) || transferBalance === 0) return computed;
  const remaining = parseNum(computed.clientRemaining ?? 0);
  const adjusted = remaining + transferBalance;
  return {
    ...computed,
    clientRemaining: adjusted.toString(),
  };
}

/** Сумма всех приходов и расходов по переносам — нетто для счёта. */
export async function getTransferBalance(db: DBorTx, invoiceId: string): Promise<number> {
  const res = await db.execute<{ balance: string }>(sql`
    SELECT
      COALESCE((SELECT SUM(amount)::numeric FROM invoice_transfers WHERE to_invoice_id   = ${invoiceId}), 0) -
      COALESCE((SELECT SUM(amount)::numeric FROM invoice_transfers WHERE from_invoice_id = ${invoiceId}), 0)
      AS balance
  `);
  const row = (res.rows ?? res)[0];
  return parseNum(row?.balance ?? 0);
}

/** Cached projection of the explicit usage ledger. Caller holds the invoice lock. */
async function _syncPeriodsUsed<T extends { id: string; periodsUsed?: number | null }>(db: DBorTx, invoice: T): Promise<T> {
  const [row] = await db.select({ used: sql<number>`count(*)::int` }).from(serviceUsage)
    .where(and(eq(serviceUsage.invoiceId, invoice.id), eq(serviceUsage.closed, true)));
  if (row.used === invoice.periodsUsed) return invoice;
  await db.update(invoices).set({ periodsUsed: row.used, updatedAt: new Date() }).where(eq(invoices.id, invoice.id));
  return { ...invoice, periodsUsed: row.used };
}

export async function setServicePeriod(db: DBorTx, invoiceId: string, period: number, closed: boolean, actorId: string) {
  return db.transaction(async tx => {
    await lockInvoices(tx, [invoiceId]);
    const invoice = await _getInvoiceRaw(tx, invoiceId);
    if (!invoice) throw new CommandError('Invoice not found', 404);
    if (invoice.serviceType !== 'periodic' || invoice.status === 'cancelled') throw new CommandError('Закрывать периоды можно только у действующей подписки', 400);
    const used = invoice.periodsUsed;
    if (period !== (closed ? used + 1 : used) || period < 1 || period > (invoice.totalPeriods ?? 0)) {
      throw new CommandError('Состояние периодов изменилось. Обновите счёт и повторите действие', 409);
    }
    await tx.insert(serviceUsage).values({ invoiceId, period, closed, closedAt: closed ? new Date() : null, updatedBy: actorId })
      .onConflictDoUpdate({ target: [serviceUsage.invoiceId, serviceUsage.period], set: { closed, closedAt: closed ? new Date() : null, updatedAt: new Date(), updatedBy: actorId } });
    await _recalculateInvoiceExpenses(tx, invoiceId);
    return { periodsUsed: closed ? used + 1 : used - 1, period, closed };
  });
}

export function applyPeriodicOverrides(
  invoice: {
    serviceType?: string | null;
    pricePerPeriod?: string | number | null;
    totalPeriods?: number | null;
    periodsUsed?: number | null;
  },
  computed: Partial<InvoiceCalculation>,
): Partial<InvoiceCalculation> {
  if (invoice.serviceType !== 'periodic') return computed;
  const price = parseNum(invoice.pricePerPeriod ?? 0);
  const total = Number(invoice.totalPeriods ?? 0);
  const used  = Math.max(0, Math.min(Number(invoice.periodsUsed ?? 0), total));
  if (!Number.isFinite(price) || total < 1) return computed;

  const spent     = Math.round(price * used * 100) / 100;
  const remaining = Math.round(price * (total - used) * 100) / 100;

  return {
    ...computed,
    clientSpent:     spent.toString(),
    clientRemaining: remaining.toString(),
  };
}

export function calculateInvoiceServer(
  scheme: InvoiceScheme,
  clientBill: number,
  partnerCommissionRate?: number,
  executorExpenses = 0,
  expensesPaidByPartner = 0,
  expensesPaidByAdmin = 0,
  plannedExpenses = 0,
  agencyMarginRate = 0,
): Partial<InvoiceCalculation> {
  const f = calculateFinancials(
    scheme,
    clientBill,
    partnerCommissionRate ?? 0,
    executorExpenses,
    expensesPaidByPartner,
    expensesPaidByAdmin,
    plannedExpenses,
    agencyMarginRate,
  );

  const r: Partial<InvoiceCalculation> = {
    commissionRate: null, commissionAmount: null, amountToAdmin: null,
    agencyMargin: null, partnerShareFromMargin: null, adminShareFromMargin: null,
    clientBaseAfterMargin: null, clientRemaining: null,
    clientSpent: (f.clientSpent ?? executorExpenses).toFixed(2),
    clientBill:            f.clientBill.toString(),
    executorExpensesTotal: f.executorExpensesTotal.toString(),
    partnerTransferDue:    f.partnerTransferDue.toString(),
    netProfitAdmin:        f.netProfitAdmin.toString(),
    adminShare50:          f.adminShare50.toString(),
    catShare50:            f.catShare50.toString(),
  };
  if (f.commissionRate          !== undefined) r.commissionRate          = f.commissionRate.toString();
  if (f.commissionAmount        !== undefined) r.commissionAmount        = f.commissionAmount.toString();
  if (f.amountToAdmin           !== undefined) r.amountToAdmin           = f.amountToAdmin.toString();
  if (f.agencyMargin            !== undefined) r.agencyMargin            = f.agencyMargin.toString();
  if (f.partnerShareFromMargin  !== undefined) r.partnerShareFromMargin  = f.partnerShareFromMargin.toString();
  if (f.adminShareFromMargin    !== undefined) r.adminShareFromMargin    = f.adminShareFromMargin.toString();
  if (f.clientBaseAfterMargin   !== undefined) r.clientBaseAfterMargin   = f.clientBaseAfterMargin.toString();
  if (f.clientRemaining         !== undefined) r.clientRemaining         = f.clientRemaining.toString();
  return r;
}

// ---------------------------------------------------------------------------
// Private helpers (not exported)
// ---------------------------------------------------------------------------
// Описания, сохраненные старым клиентом HTML-экранированными, отдаются
// простым текстом (см. decodeHtmlEntities); при следующей правке строка
// сохраняется уже чистой.
function plainExpense<T extends { description: string | null }>(e: T): T {
  return e.description ? { ...e, description: decodeHtmlEntities(e.description) } : e;
}

async function _getInvoiceExpenses(db: DBorTx, invoiceId: string): Promise<InvoiceExpense[]> {
  const rows = await db
    .select()
    .from(invoiceExpenses)
    .where(eq(invoiceExpenses.invoiceId, invoiceId))
    .orderBy(desc(invoiceExpenses.date));
  return rows.map(plainExpense);
}

async function _getInvoiceRaw(db: DBorTx, id: string): Promise<InvoiceWithRelations | null> {
  const [result] = await db
    .select({ invoice: invoices, calculations: invoiceCalculations, partner: partners, client: clients })
    .from(invoices)
    .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
    .leftJoin(partners, eq(invoices.partnerId, partners.id))
    .leftJoin(clients, eq(invoices.clientId, clients.id))
    .where(eq(invoices.id, id))
    .limit(1);
  if (!result) return null;
  return {
    ...result.invoice,
    calculations: result.calculations || undefined,
    partner:      result.partner      || undefined,
    client:       result.client       || undefined,
  };
}

/** All writers lock parent rows in UUID order BEFORE reading financial facts. */
export async function lockInvoices(db: DBorTx, ids: string[]) {
  return db.select({ id: invoices.id }).from(invoices)
    .where(inArray(invoices.id, [...new Set(ids)]))
    .orderBy(asc(invoices.id)).for("update");
}

/** Sole persisted projection: terms + expense ledger + transfers. Caller holds parent lock. */
async function _recalculateInvoiceExpenses(db: DBorTx, invoiceId: string): Promise<InvoiceCalculation | null> {
  const invoiceRaw = await _getInvoiceRaw(db, invoiceId);
  if (!invoiceRaw) return null;
  const invoice = await _syncPeriodsUsed(db, invoiceRaw);
  const [sums] = await db.select({
    total: sql<string>`coalesce(sum(${invoiceExpenses.amount}), 0)`,
    partner: sql<string>`coalesce(sum(${invoiceExpenses.amount}) filter (where not ${invoiceExpenses.paidByAdmin}), 0)`,
    admin: sql<string>`coalesce(sum(${invoiceExpenses.amount}) filter (where ${invoiceExpenses.paidByAdmin}), 0)`,
  }).from(invoiceExpenses).where(eq(invoiceExpenses.invoiceId, invoiceId));
  const total = parseNum(sums.total), byPartner = parseNum(sums.partner), byAdmin = parseNum(sums.admin);
  const existing = invoice.calculations;
  const bill = derivePeriodicClientBill(invoice) ?? parseNum(invoice.clientBill ?? existing?.clientBill);
  const partnerRate = parseNum(invoice.partnerCommissionRate ?? existing?.commissionRate);
  const marginRate = invoice.scheme === 'agency' ? parseNum(existing?.commissionRate) : 0;
  let computed = calculateInvoiceServer(invoice.scheme, bill, partnerRate, total, byPartner, byAdmin, parseNum(invoice.plannedExpenses), marginRate);
  computed = applyPeriodicOverrides(invoice, computed);
  computed = applyTransferOverrides(await getTransferBalance(db, invoiceId), computed);
  await db.update(invoices).set({ clientBill: bill.toFixed(2), updatedAt: new Date() }).where(eq(invoices.id, invoiceId));
  if (existing) {
    const [updated] = await db.update(invoiceCalculations).set({ ...computed, updatedAt: new Date() })
      .where(eq(invoiceCalculations.invoiceId, invoiceId)).returning();
    return updated;
  }
  const [created] = await db.insert(invoiceCalculations).values({ invoiceId, clientBill: bill.toFixed(2), ...computed }).returning();
  return created;
}

export async function recalcInvoice(db: DBorTx, invoiceId: string): Promise<void> {
  await db.transaction(async tx => {
    await lockInvoices(tx, [invoiceId]);
    await _recalculateInvoiceExpenses(tx, invoiceId);
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * List invoices with role-based row filtering.
 * Partners see only their own; clients see only theirs; assistants exclude hidden; accountants see only hidden.
 */
export async function getInvoices(db: DBorTx, role: UserRole, partnerId?: string, clientId?: string, filters: Partial<InvoiceQuery> = {}): Promise<InvoiceWithRelations[]> {
  const actor = { role, partnerId, clientId };
  const query = db.select({ invoice: invoices, calculations: invoiceCalculations, partner: partners, client: clients })
    .from(invoices).leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
    .leftJoin(partners, eq(invoices.partnerId, partners.id)).leftJoin(clients, eq(invoices.clientId, clients.id))
    .where(invoiceFilters(actor, { ...filters, ...(role === 'admin' && partnerId ? { partnerId } : {}) })).orderBy(invoiceOrder(filters)).$dynamic();
  if (filters.page) query.limit(Math.min(filters.limit ?? 100, 200)).offset((filters.page - 1) * Math.min(filters.limit ?? 100, 200));
  const rows = await query;
  return rows.map(r => ({ ...r.invoice, calculations: r.calculations ?? undefined, partner: r.partner ?? undefined, client: r.client ?? undefined }));
}

export async function getInvoiceListMetadata(db: DBorTx, actor: { role: UserRole; partnerId?: string; clientId?: string }, filters: Partial<InvoiceQuery>) {
  const countQuery = db.select({ total: sql<number>`COUNT(*)::int` }).from(invoices).$dynamic();
  if (filters.search?.trim()) countQuery.leftJoin(clients, eq(clients.id, invoices.clientId)).leftJoin(partners, eq(partners.id, invoices.partnerId));
  const [count] = await countQuery.where(invoiceFilters(actor, filters));
  const [counts] = await db.select({
    all: sql<number>`COUNT(*)::int`, draft: sql<number>`COUNT(*) FILTER (WHERE ${invoices.status} = 'draft')::int`,
    sent: sql<number>`COUNT(*) FILTER (WHERE ${invoices.status} = 'sent')::int`, paid: sql<number>`COUNT(*) FILTER (WHERE ${invoices.status} = 'paid')::int`,
    cancelled: sql<number>`COUNT(*) FILTER (WHERE ${invoices.status} = 'cancelled')::int`,
    overdue: sql<number>`COUNT(*) FILTER (WHERE ${invoices.status} = 'sent' AND ${invoices.actualPaymentDate} IS NULL AND ${invoices.paymentDate} < CURRENT_DATE)::int`,
  }).from(invoices).where(invoiceScope(actor));
  const scope = invoiceScope(actor) ?? sql`true`;
  const clientOptions = await db.select({ id: clients.id, name: clients.name }).from(clients)
    .where(sql`EXISTS (SELECT 1 FROM ${invoices} WHERE ${invoices.clientId} = ${clients.id} AND ${scope})`).orderBy(clients.name);
  const partnerOptions = actor.role === 'client' ? [] : await db.select({ id: partners.id, name: partners.name }).from(partners)
    .where(sql`EXISTS (SELECT 1 FROM ${invoices} WHERE ${invoices.partnerId} = ${partners.id} AND ${scope})`).orderBy(partners.name);
  return { total: count.total, statusCounts: counts, clients: clientOptions, partners: partnerOptions };
}

/**
 * Fetch a single invoice by ID with IDOR row-level ownership enforcement.
 * Partners can only access invoices linked to their partnerId.
 * Clients can only access invoices linked to their clientId.
 * Assistants cannot access invoices hidden from them.
 * Accountants can only access invoices hidden from assistants.
 * Admin/no-role: unrestricted.
 */
export async function getInvoice(
  db: DBorTx,
  id: string,
  role?: UserRole,
  partnerId?: string,
  clientId?: string,
): Promise<InvoiceWithRelations | null> {
  // Deny-by-default: роли partner/client без своего scope-id НЕ должны
  // проваливаться в общий фильтр `eq(invoices.id, id)` — иначе токен без
  // partnerId/clientId прочитал бы любой счёт по id (IDOR).
  if ((role === 'partner' && !partnerId) || (role === 'client' && !clientId)) {
    return null;
  }

  // Build ownership WHERE clause
  let ownerFilter;
  if (role === 'partner' && partnerId) {
    ownerFilter = and(eq(invoices.id, id), eq(invoices.partnerId, partnerId));
  } else if (role === 'client' && clientId) {
    ownerFilter = and(eq(invoices.id, id), eq(invoices.clientId, clientId));
  } else if (role === 'assistant') {
    ownerFilter = and(
      eq(invoices.id, id),
      or(isNull(invoices.hideFromAssistant), eq(invoices.hideFromAssistant, false)),
    );
  } else if (role === 'accountant') {
    ownerFilter = and(eq(invoices.id, id), eq(invoices.hideFromAssistant, true));
  } else {
    ownerFilter = eq(invoices.id, id);
  }

  const [result] = await db
    .select({ invoice: invoices, calculations: invoiceCalculations, partner: partners, client: clients })
    .from(invoices)
    .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
    .leftJoin(partners, eq(invoices.partnerId, partners.id))
    .leftJoin(clients, eq(invoices.clientId, clients.id))
    .where(ownerFilter)
    .limit(1);

  if (!result) return null;
  return {
    ...result.invoice,
    calculations: result.calculations || undefined,
    partner:      result.partner      || undefined,
    client:       result.client       || undefined,
  };
}

/** Get raw calculation data for plan-fact analysis (paid + any with actualPaymentDate). */
export async function getInvoicesWithCalculations(db: DB): Promise<Array<{
  id: string;
  status: string;
  paymentDate: string | null;
  adminShare50: string | null;
  catShare50: string | null;
  netProfitAdmin: string | null;
}>> {
  const results = await db
    .select({
      id:               invoices.id,
      status:           invoices.status,
      actualPaymentDate: invoices.actualPaymentDate,
      paymentDate:      invoices.paymentDate,
      adminShare50:     invoiceCalculations.adminShare50,
      catShare50:       invoiceCalculations.catShare50,
      netProfitAdmin:   invoiceCalculations.netProfitAdmin,
    })
    .from(invoices)
    .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
    .where(or(eq(invoices.status, 'paid'), isNotNull(invoices.actualPaymentDate)));

  return results.map(r => ({
    id:            r.id,
    status:        r.status,
    paymentDate:   r.actualPaymentDate || r.paymentDate || null,
    adminShare50:  r.adminShare50,
    catShare50:    r.catShare50,
    netProfitAdmin: r.netProfitAdmin,
  }));
}

export async function createInvoice(
  db: DBorTx,
  invoice: InsertInvoice,
  calculations: Partial<InvoiceCalculation> = {},
): Promise<Invoice> {
  return db.transaction(async tx => {
    const [created] = await tx.insert(invoices).values({
      ...invoice,
      clientBill: invoice.clientBill ?? calculations.clientBill ?? "0",
      partnerCommissionRate: invoice.partnerCommissionRate ?? (invoice.scheme === "commission_based" ? calculations.commissionRate : null),
    }).returning();
    await tx.insert(invoiceCalculations).values({
      invoiceId: created.id, clientBill: created.clientBill ?? "0",
      commissionRate: calculations.commissionRate ?? null,
    });
    await _recalculateInvoiceExpenses(tx, created.id);
    const [result] = await tx.select().from(invoices).where(eq(invoices.id, created.id));
    return result;
  });
}

/** Change terms and projection in ONE transaction, including legacy calculation input. */
export async function updateInvoice(
  db: DBorTx,
  id: string,
  changes: Partial<InsertInvoice>,
  calculations: Partial<InvoiceCalculation> = {},
): Promise<Invoice | null> {
  return db.transaction(async tx => {
    await lockInvoices(tx, [id]);
    const current = await _getInvoiceRaw(tx, id);
    if (!current) return null;
    if (changes.clientId && changes.clientId !== current.clientId) {
      const [transfer] = await tx.select({ id: invoiceTransfers.id }).from(invoiceTransfers)
        .where(or(eq(invoiceTransfers.fromInvoiceId, id), eq(invoiceTransfers.toInvoiceId, id))).limit(1);
      if (transfer) throw new CommandError("Сначала отмените переносы бюджета перед сменой клиента");
    }
    if (changes.periodsUsed !== undefined && changes.periodsUsed !== current.periodsUsed) throw new CommandError('Используйте закрытие или отмену периода', 400);
    if (current.periodsUsed > 0 && (changes.serviceType === 'one_time' || (changes.totalPeriods != null && changes.totalPeriods < current.periodsUsed) || (changes.periodUnit !== undefined && changes.periodUnit !== current.periodUnit))) {
      throw new CommandError('Сначала отмените закрытые периоды перед изменением единицы, уменьшением количества или преобразованием в разовый счёт', 409);
    }
    const scheme = changes.scheme ?? current.scheme;
    const terms = { ...changes };
    if (terms.clientBill === undefined && calculations.clientBill != null) terms.clientBill = calculations.clientBill;
    if (scheme === "commission_based" && terms.partnerCommissionRate === undefined && calculations.commissionRate != null) {
      terms.partnerCommissionRate = calculations.commissionRate;
    }
    await tx.update(invoices).set({ ...terms, updatedAt: new Date() }).where(eq(invoices.id, id));
    if (scheme === "agency" && calculations.commissionRate != null) {
      await tx.update(invoiceCalculations).set({ commissionRate: calculations.commissionRate }).where(eq(invoiceCalculations.invoiceId, id));
    }
    await _recalculateInvoiceExpenses(tx, id);
    const [updated] = await tx.select().from(invoices).where(eq(invoices.id, id));
    return updated;
  });
}

export async function updateInvoiceCalculations(db: DBorTx, invoiceId: string, calculations: Partial<InvoiceCalculation>): Promise<InvoiceCalculation | null> {
  return db.transaction(async tx => {
    if (!await updateInvoice(tx, invoiceId, {}, calculations)) return null;
    const [result] = await tx.select().from(invoiceCalculations).where(eq(invoiceCalculations.invoiceId, invoiceId));
    return result;
  });
}

export async function getInvoiceExpenses(db: DBorTx, invoiceId: string): Promise<InvoiceExpense[]> {
  return _getInvoiceExpenses(db, invoiceId);
}

export async function getInvoiceExpense(db: DBorTx, id: string): Promise<InvoiceExpense | null> {
  const [expense] = await db.select().from(invoiceExpenses)
    .where(eq(invoiceExpenses.id, id)).limit(1);
  return expense ? plainExpense(expense) : null;
}

export async function getAllExpenses(db: DB, invoiceIds?: string[]): Promise<InvoiceExpense[]> {
  if (invoiceIds?.length === 0) return [];
  const rows = await db.select().from(invoiceExpenses).where(invoiceIds ? inArray(invoiceExpenses.invoiceId, invoiceIds) : undefined).orderBy(desc(invoiceExpenses.date));
  return rows.map(plainExpense);
}

export async function createInvoiceExpense(db: DBorTx, expense: InsertInvoiceExpense): Promise<InvoiceExpense> {
  // Вставка расхода + пересчёт calculations — одна транзакция, чтобы счёт
  // не остался с расходом, но без обновлённого остатка.
  return db.transaction(async (tx) => {
    await lockInvoices(tx, [expense.invoiceId]);
    const [created] = await tx.insert(invoiceExpenses).values(expense).returning();
    await _recalculateInvoiceExpenses(tx, expense.invoiceId);
    return created;
  });
}

export async function updateInvoiceExpense(
  db: DBorTx,
  id: string,
  updates: Partial<InsertInvoiceExpense>,
): Promise<InvoiceExpense | null> {
  const [expense] = await db.select().from(invoiceExpenses).where(eq(invoiceExpenses.id, id)).limit(1);
  if (!expense) return null;

  return db.transaction(async (tx) => {
    await lockInvoices(tx, [expense.invoiceId]);
    const { invoiceId: _immutableParent, ...editable } = updates;
    const [updated] = await tx.update(invoiceExpenses)
      .set(editable)
      .where(eq(invoiceExpenses.id, id))
      .returning();

    await _recalculateInvoiceExpenses(tx, expense.invoiceId);
    return updated || null;
  });
}

export async function deleteInvoiceExpense(db: DBorTx, id: string): Promise<void> {
  const [expense] = await db.select().from(invoiceExpenses).where(eq(invoiceExpenses.id, id)).limit(1);
  if (expense) {
    await db.transaction(async (tx) => {
      await lockInvoices(tx, [expense.invoiceId]);
      await tx.delete(invoiceExpenses).where(eq(invoiceExpenses.id, id));
      await _recalculateInvoiceExpenses(tx, expense.invoiceId);
    });
  }
}

/**
 * Создаёт перенос средств между двумя счетами одного клиента.
 * Валидация: оба счёта существуют, принадлежат одному клиенту, сумма > 0,
 * не больше «доступно» на счёте-источнике (clientRemaining).
 */
export async function createInvoiceTransfer(
  db: DBorTx,
  args: { fromInvoiceId: string; toInvoiceId: string; amount: number; notes?: string | null; createdBy: string },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { fromInvoiceId, toInvoiceId, amount, notes, createdBy } = args;
  if (fromInvoiceId === toInvoiceId) return { ok: false, error: "Счёт-источник и счёт-получатель совпадают" };
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Сумма должна быть положительной" };

  // Вся операция — одна транзакция. Строку расчётов счёта-источника берём
  // под FOR UPDATE, поэтому параллельные переносы сериализуются и не могут
  // оба пройти проверку остатка и увести счёт в минус (TOCTOU-гонка).
  return db.transaction(async (tx) => {
    await lockInvoices(tx, [fromInvoiceId, toInvoiceId]);
    const fromInv = await _getInvoiceRaw(tx, fromInvoiceId);
    const toInv   = await _getInvoiceRaw(tx, toInvoiceId);
    if (!fromInv || !toInv) return { ok: false, error: "Счёт не найден" };
    if (!fromInv.clientId || fromInv.clientId !== toInv.clientId) {
      return { ok: false, error: "Перенос возможен только между счетами одного клиента" };
    }

    // Блокирующее чтение остатка: до коммита этой транзакции никакой другой
    // перенос по тому же счёту-источнику не прочитает clientRemaining.
    const [lockedCalc] = await tx
      .select({ clientRemaining: invoiceCalculations.clientRemaining })
      .from(invoiceCalculations)
      .where(eq(invoiceCalculations.invoiceId, fromInvoiceId))
      .for("update")
      .limit(1);

    const remaining = parseNum(
      lockedCalc?.clientRemaining ?? fromInv.calculations?.clientRemaining ?? "0",
    );
    if (amount > remaining + 1e-6) {
      return { ok: false, error: `На счёте-источнике доступно ${remaining}, нельзя перенести ${amount}` };
    }

    const [created] = await tx.insert(invoiceTransfers).values({
      fromInvoiceId, toInvoiceId, amount: amount.toString(),
      notes: notes ?? null, createdBy,
    }).returning({ id: invoiceTransfers.id });

    await _recalculateInvoiceExpenses(tx, fromInvoiceId);
    await _recalculateInvoiceExpenses(tx, toInvoiceId);
    return { ok: true, id: created.id };
  });
}

export async function deleteInvoiceTransfer(db: DBorTx, id: string): Promise<void> {
  const [row] = await db.select().from(invoiceTransfers).where(eq(invoiceTransfers.id, id)).limit(1);
  if (!row) return;
  await db.transaction(async (tx) => {
    await lockInvoices(tx, [row.fromInvoiceId, row.toInvoiceId]);
    await tx.delete(invoiceTransfers).where(eq(invoiceTransfers.id, id));
    await _recalculateInvoiceExpenses(tx, row.fromInvoiceId);
    await _recalculateInvoiceExpenses(tx, row.toInvoiceId);
  });
}

export async function getInvoiceTransfers(db: DBorTx, invoiceId: string) {
  // Все переносы, в которых счёт участвует как источник или получатель.
  // Возвращаем direction: 'out' (со счёта) или 'in' (на счёт), счёт-партнёр.
  const rows = await db.execute(sql`
    SELECT
      t.id, t.amount::numeric AS amount, t.notes, t.created_at,
      t.from_invoice_id, t.to_invoice_id,
      CASE WHEN t.from_invoice_id = ${invoiceId} THEN 'out' ELSE 'in' END AS direction,
      CASE WHEN t.from_invoice_id = ${invoiceId} THEN ti.invoice_number ELSE fi.invoice_number END AS counterparty_number,
      CASE WHEN t.from_invoice_id = ${invoiceId} THEN ti.client_title   ELSE fi.client_title   END AS counterparty_title,
      CASE WHEN t.from_invoice_id = ${invoiceId} THEN t.to_invoice_id   ELSE t.from_invoice_id END AS counterparty_id
    FROM invoice_transfers t
    LEFT JOIN invoices fi ON fi.id = t.from_invoice_id
    LEFT JOIN invoices ti ON ti.id = t.to_invoice_id
    WHERE t.from_invoice_id = ${invoiceId} OR t.to_invoice_id = ${invoiceId}
    ORDER BY t.created_at DESC
  `);
  return (rows.rows ?? rows) as { id: string; amount: string; notes: string | null; created_at: Date; direction: "in" | "out"; counterparty_id: string; counterparty_number: string; counterparty_title: string | null }[];
}

export async function deleteInvoice(db: DBorTx, id: string): Promise<void> {
  await db.transaction(async tx => {
    await lockInvoices(tx, [id]);
    const [transfer] = await tx.select({ id: invoiceTransfers.id }).from(invoiceTransfers)
      .where(or(eq(invoiceTransfers.fromInvoiceId, id), eq(invoiceTransfers.toInvoiceId, id))).limit(1);
    if (transfer) throw new CommandError("Сначала отмените переносы бюджета перед удалением счёта");
    await tx.delete(invoices).where(eq(invoices.id, id));
  });
}

export async function generateInvoiceNumber(db: DBorTx): Promise<string> {
  const year = new Date().getFullYear();
  const result = await db.execute<{ last_number: number }>(sql`
    INSERT INTO invoice_number_counters (year, last_number) VALUES (${year}, 1)
    ON CONFLICT (year) DO UPDATE SET last_number = invoice_number_counters.last_number + 1
    RETURNING last_number
  `);
  return `INV-${year}-${String(result.rows[0].last_number).padStart(4, '0')}`;
}

export async function recalculateAllInvoices(db: DB): Promise<{ updated: number; errors: number }> {
  console.log('[recalculateAllInvoices] Starting...');
  let updated = 0;
  let errors  = 0;

  const allInvoices = await db.select().from(invoices);
  console.log(`[recalculateAllInvoices] ${allInvoices.length} invoices`);

  for (const invoice of allInvoices) {
    try {
      const [existing] = await db.select().from(invoiceCalculations)
        .where(eq(invoiceCalculations.invoiceId, invoice.id)).limit(1);
      if (!existing) continue;

      // Делегируем ЕДИНОЙ канонической логике пересчёта (recalcInvoice →
      // _recalculateInvoiceExpenses): она правильно обрабатывает гибкую схему
      // 'agency' (маржа/партнёр) и применяет поправку на переносы бюджета.
      // Раньше bulk-пересчёт дублировал логику и расходился с пер-инвойсным:
      // обнулял маржу agency и стирал остаток по переносам.
      await recalcInvoice(db, invoice.id);
      updated++;
    } catch (err) {
      console.error(`[recalculateAllInvoices] Error for invoice ${invoice.id}:`, err);
      errors++;
    }
  }

  console.log(`[recalculateAllInvoices] Done: ${updated} updated, ${errors} errors`);
  return { updated, errors };
}
