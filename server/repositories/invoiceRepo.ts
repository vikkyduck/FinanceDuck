/**
 * Invoice Repository
 * Core CRUD for invoices, invoice_calculations, invoice_expenses, invoice_documents.
 * Includes row-level ownership enforcement (IDOR protection) in getInvoice().
 * All functions accept `db` as first parameter — no class dependency.
 */

import { db as _db } from "../db";
import {
  invoices, invoiceCalculations, invoiceExpenses, invoiceTransfers, partners, clients,
  Invoice, InvoiceCalculation, InvoiceExpense, Partner, Client,
  InsertInvoice, InsertInvoiceExpense,
  UserRole, InvoiceScheme,
} from "../../shared/schema";
import {
  eq, and, desc, isNull, or, isNotNull, sql,
} from "drizzle-orm";
import { calculateFinancials, parseNum } from "../../shared/financialEngine";

type DB = typeof _db;
// Тип транзакции Drizzle. Хелперы принимают DB | Tx, чтобы одинаково
// работать и вне, и внутри db.transaction(...).
type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
type DBorTx = DB | Tx;
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
  const res: any = await db.execute(sql`
    SELECT
      COALESCE((SELECT SUM(amount)::numeric FROM invoice_transfers WHERE to_invoice_id   = ${invoiceId}), 0) -
      COALESCE((SELECT SUM(amount)::numeric FROM invoice_transfers WHERE from_invoice_id = ${invoiceId}), 0)
      AS balance
  `);
  const row = (res.rows ?? res)[0];
  return parseNum(row?.balance ?? 0);
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
async function _getInvoiceExpenses(db: DBorTx, invoiceId: string): Promise<InvoiceExpense[]> {
  return db
    .select()
    .from(invoiceExpenses)
    .where(eq(invoiceExpenses.invoiceId, invoiceId))
    .orderBy(desc(invoiceExpenses.date));
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

/** Recalculate stored calculations after expense changes */
async function _recalculateInvoiceExpenses(db: DBorTx, invoiceId: string): Promise<void> {
  const expenses = await _getInvoiceExpenses(db, invoiceId);
  const total                = expenses.reduce((s, e) => s + parseNum(e.amount), 0);
  const expensesPaidByPartner = expenses.filter(e => e.paidByAdmin !== true).reduce((s, e) => s + parseNum(e.amount), 0);
  const expensesPaidByAdmin   = expenses.filter(e => e.paidByAdmin === true).reduce((s, e) => s + parseNum(e.amount), 0);

  const invoice = await _getInvoiceRaw(db, invoiceId);
  if (!invoice) return;

  const [existing] = await db
    .select()
    .from(invoiceCalculations)
    .where(eq(invoiceCalculations.invoiceId, invoiceId))
    .limit(1);
  if (!existing) return;

  const storedBill     = parseNum(existing.clientBill);
  const commissionRate = existing.commissionRate ? parseNum(existing.commissionRate) : undefined;
  const plannedExp     = parseNum(invoice.plannedExpenses);

  // Для periodic сумма счёта могла измениться (цена за период или
  // количество периодов) — пересчитываем clientBill и в invoices, и в
  // invoice_calculations.
  const periodicBill = derivePeriodicClientBill(invoice);
  const effectiveBill = periodicBill ?? storedBill;

  // Гибкая agency: партнёр из invoices.partnerCommissionRate, маржа из calc.commissionRate.
  const isAgencyFlex = invoice.scheme === 'agency';
  const partnerRate  = isAgencyFlex ? parseNum(invoice.partnerCommissionRate) : commissionRate;
  const marginRate   = isAgencyFlex ? (commissionRate ?? 0) : 0;

  let computed = calculateInvoiceServer(
    invoice.scheme as InvoiceScheme,
    effectiveBill,
    partnerRate,
    total,
    expensesPaidByPartner,
    expensesPaidByAdmin,
    plannedExp,
    marginRate,
  );
  computed = applyPeriodicOverrides(invoice, computed);
  const transferBalance = await getTransferBalance(db, invoiceId);
  computed = applyTransferOverrides(transferBalance, computed);

  await db.update(invoiceCalculations)
    .set({ ...computed, updatedAt: new Date() })
    .where(eq(invoiceCalculations.invoiceId, invoiceId));

  if (periodicBill !== undefined && periodicBill !== storedBill) {
    await db.update(invoices)
      .set({ clientBill: periodicBill.toString(), updatedAt: new Date() })
      .where(eq(invoices.id, invoiceId));
  }
}

/** Пересчитать счёт по последним переносам — публичная обёртка над _recalculateInvoiceExpenses. */
export async function recalcInvoice(db: DB, invoiceId: string): Promise<void> {
  await _recalculateInvoiceExpenses(db, invoiceId);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * List invoices with role-based row filtering.
 * Partners see only their own; clients see only theirs; assistants exclude hidden; accountants see only hidden.
 */
export async function getInvoices(
  db: DB,
  role: UserRole,
  partnerId?: string,
  clientId?: string,
): Promise<InvoiceWithRelations[]> {
  // Deny-by-default: роли partner/client ОБЯЗАНЫ иметь свой scope-id.
  // Без него нельзя проваливаться в общий (неотфильтрованный) запрос —
  // иначе токен без partnerId/clientId увидел бы ВСЕ счета (IDOR).
  if ((role === 'partner' && !partnerId) || (role === 'client' && !clientId)) {
    return [];
  }

  const baseQuery = db
    .select({ invoice: invoices, calculations: invoiceCalculations, partner: partners, client: clients })
    .from(invoices)
    .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
    .leftJoin(partners, eq(invoices.partnerId, partners.id))
    .leftJoin(clients, eq(invoices.clientId, clients.id))
    .orderBy(desc(invoices.createdAt));

  let results;
  if (partnerId) {
    results = await baseQuery.where(eq(invoices.partnerId, partnerId));
  } else if (role === 'client' && clientId) {
    results = await baseQuery.where(eq(invoices.clientId, clientId));
  } else if (role === 'assistant') {
    results = await baseQuery.where(or(isNull(invoices.hideFromAssistant), eq(invoices.hideFromAssistant, false)));
  } else if (role === 'accountant') {
    results = await baseQuery.where(eq(invoices.hideFromAssistant, true));
  } else {
    results = await baseQuery;
  }

  return results.map(r => ({
    ...r.invoice,
    calculations: r.calculations || undefined,
    partner:      r.partner      || undefined,
    client:       r.client       || undefined,
  }));
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
  db: DB,
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
  db: DB,
  invoice: InsertInvoice,
  calculations: Partial<InvoiceCalculation>,
): Promise<Invoice> {
  // Для periodic сумма счёта = price × periods (предоплата за всё) —
  // переписываем clientBill ДО вставки строки счёта и расчёта.
  const periodicBill = derivePeriodicClientBill(invoice);
  if (periodicBill !== undefined) {
    invoice = { ...invoice, clientBill: periodicBill.toString() };
  }

  // Счёт и строка расчётов пишутся атомарно: либо оба, либо ни одного —
  // иначе при сбое между вставками остаётся счёт-сирота без calculations.
  return db.transaction(async (tx) => {
    const [created] = await tx.insert(invoices).values(invoice).returning();

    const clientBill     = periodicBill ?? parseNum(calculations.clientBill);
    const commissionRate = calculations.commissionRate ? parseNum(calculations.commissionRate) : undefined;
    const executorExpenses = parseNum(calculations.executorExpensesTotal);
    const plannedExp     = parseNum(created.plannedExpenses);

    // Гибкая agency: маржа приходит в calculations.commissionRate, а процент
    // партнёра — в invoices.partnerCommissionRate (скрыт от клиента).
    const isAgencyFlex = created.scheme === 'agency';
    const partnerRate  = isAgencyFlex ? parseNum(created.partnerCommissionRate) : commissionRate;
    const marginRate   = isAgencyFlex ? (commissionRate ?? 0) : 0;

    let computed = calculateInvoiceServer(
      created.scheme as InvoiceScheme,
      clientBill,
      partnerRate,
      executorExpenses,
      0,
      0,
      plannedExp,
      marginRate,
    );
    computed = applyPeriodicOverrides(created, computed);

    await tx.insert(invoiceCalculations).values({ invoiceId: created.id, clientBill: computed.clientBill || "0", ...computed });
    return created;
  });
}

export async function updateInvoice(
  db: DB,
  id: string,
  invoice: Partial<InsertInvoice>,
): Promise<Invoice | null> {
  const [updated] = await db.update(invoices)
    .set({ ...invoice, updatedAt: new Date() })
    .where(eq(invoices.id, id))
    .returning();
  return updated || null;
}

export async function updateInvoiceCalculations(
  db: DB,
  invoiceId: string,
  calculations: Partial<InvoiceCalculation>,
): Promise<InvoiceCalculation | null> {
  const invoice = await _getInvoiceRaw(db, invoiceId);
  if (!invoice) return null;

  const [existing] = await db
    .select()
    .from(invoiceCalculations)
    .where(eq(invoiceCalculations.invoiceId, invoiceId))
    .limit(1);

  const clientBill      = parseNum(calculations.clientBill ?? existing?.clientBill);
  const commissionRate  = calculations.commissionRate
    ? parseNum(calculations.commissionRate)
    : (existing?.commissionRate ? parseNum(existing.commissionRate) : undefined);
  const executorExpenses = parseNum(calculations.executorExpensesTotal ?? existing?.executorExpensesTotal);

  const expenses              = await _getInvoiceExpenses(db, invoiceId);
  const expensesPaidByPartner = expenses.filter(e => e.paidByAdmin !== true).reduce((s, e) => s + parseNum(e.amount), 0);
  const expensesPaidByAdmin   = expenses.filter(e => e.paidByAdmin === true).reduce((s, e) => s + parseNum(e.amount), 0);
  const plannedExp            = parseNum(invoice.plannedExpenses);

  // Для periodic clientBill = price × periods, перекрываем вход в расчёт.
  const periodicBill = derivePeriodicClientBill(invoice);
  const effectiveBill = periodicBill ?? clientBill;

  // Гибкая agency: partnerCommRate — из invoices.partnerCommissionRate,
  // маржа (agencyMarginRate) — из commissionRate (calc/вход).
  const isAgencyFlex = invoice.scheme === 'agency';
  const partnerRate  = isAgencyFlex ? parseNum(invoice.partnerCommissionRate) : commissionRate;
  const marginRate   = isAgencyFlex ? (commissionRate ?? 0) : 0;

  let computed = calculateInvoiceServer(
    invoice.scheme as InvoiceScheme,
    effectiveBill,
    partnerRate,
    executorExpenses,
    expensesPaidByPartner,
    expensesPaidByAdmin,
    plannedExp,
    marginRate,
  );
  computed = applyPeriodicOverrides(invoice, computed);

  if (existing) {
    const [updated] = await db.update(invoiceCalculations)
      .set({ ...computed, updatedAt: new Date() })
      .where(eq(invoiceCalculations.invoiceId, invoiceId))
      .returning();
    return updated || null;
  } else {
    const [created] = await db.insert(invoiceCalculations)
      .values({ invoiceId, clientBill: computed.clientBill || "0", ...computed })
      .returning();
    return created;
  }
}

export async function getInvoiceExpenses(db: DB, invoiceId: string): Promise<InvoiceExpense[]> {
  return _getInvoiceExpenses(db, invoiceId);
}

export async function getAllExpenses(db: DB): Promise<InvoiceExpense[]> {
  return db.select().from(invoiceExpenses).orderBy(desc(invoiceExpenses.date));
}

export async function createInvoiceExpense(db: DB, expense: InsertInvoiceExpense): Promise<InvoiceExpense> {
  // Вставка расхода + пересчёт calculations — одна транзакция, чтобы счёт
  // не остался с расходом, но без обновлённого остатка.
  return db.transaction(async (tx) => {
    const [created] = await tx.insert(invoiceExpenses).values(expense).returning();
    await _recalculateInvoiceExpenses(tx, expense.invoiceId);
    return created;
  });
}

export async function updateInvoiceExpense(
  db: DB,
  id: string,
  updates: Partial<InsertInvoiceExpense>,
): Promise<InvoiceExpense | null> {
  const [expense] = await db.select().from(invoiceExpenses).where(eq(invoiceExpenses.id, id)).limit(1);
  if (!expense) return null;

  return db.transaction(async (tx) => {
    const [updated] = await tx.update(invoiceExpenses)
      .set(updates)
      .where(eq(invoiceExpenses.id, id))
      .returning();

    await _recalculateInvoiceExpenses(tx, expense.invoiceId);
    return updated || null;
  });
}

export async function deleteInvoiceExpense(db: DB, id: string): Promise<void> {
  const [expense] = await db.select().from(invoiceExpenses).where(eq(invoiceExpenses.id, id)).limit(1);
  if (expense) {
    await db.transaction(async (tx) => {
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
  db: DB,
  args: { fromInvoiceId: string; toInvoiceId: string; amount: number; notes?: string | null; createdBy: string },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { fromInvoiceId, toInvoiceId, amount, notes, createdBy } = args;
  if (fromInvoiceId === toInvoiceId) return { ok: false, error: "Счёт-источник и счёт-получатель совпадают" };
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Сумма должна быть положительной" };

  // Вся операция — одна транзакция. Строку расчётов счёта-источника берём
  // под FOR UPDATE, поэтому параллельные переносы сериализуются и не могут
  // оба пройти проверку остатка и увести счёт в минус (TOCTOU-гонка).
  return db.transaction(async (tx) => {
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

export async function deleteInvoiceTransfer(db: DB, id: string): Promise<void> {
  const [row] = await db.select().from(invoiceTransfers).where(eq(invoiceTransfers.id, id)).limit(1);
  if (!row) return;
  await db.transaction(async (tx) => {
    await tx.delete(invoiceTransfers).where(eq(invoiceTransfers.id, id));
    await _recalculateInvoiceExpenses(tx, row.fromInvoiceId);
    await _recalculateInvoiceExpenses(tx, row.toInvoiceId);
  });
}

export async function getInvoiceTransfers(db: DB, invoiceId: string) {
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
  return (rows.rows ?? rows) as any[];
}

export async function deleteInvoice(db: DB, id: string): Promise<void> {
  await db.delete(invoiceExpenses).where(eq(invoiceExpenses.invoiceId, id));
  await db.delete(invoiceCalculations).where(eq(invoiceCalculations.invoiceId, id));
  await db.delete(invoices).where(eq(invoices.id, id));
}

export async function deleteDocument(db: DB, id: string): Promise<void> {
  await db.execute(sql`DELETE FROM invoice_documents WHERE id = ${id}`);
}

export async function generateInvoiceNumber(db: DB): Promise<string> {
  const result = await db.select({ count: sql<number>`count(*)` }).from(invoices);
  const n = Number(result[0]?.count || 0) + 1;
  return `INV-${new Date().getFullYear()}-${String(n).padStart(4, '0')}`;
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
