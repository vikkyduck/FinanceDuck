/**
 * Invoice Repository
 * Core CRUD for invoices, invoice_calculations, invoice_expenses, invoice_documents.
 * Includes row-level ownership enforcement (IDOR protection) in getInvoice().
 * All functions accept `db` as first parameter — no class dependency.
 */

import { db as _db } from "../db";
import {
  invoices, invoiceCalculations, invoiceExpenses, partners, clients,
  Invoice, InvoiceCalculation, InvoiceExpense, Partner, Client,
  InsertInvoice, InsertInvoiceExpense,
  UserRole, InvoiceScheme,
} from "../../shared/schema";
import {
  eq, and, desc, isNull, or, isNotNull, sql,
} from "drizzle-orm";
import { calculateFinancials, parseNum } from "../../shared/financialEngine";

type DB = typeof _db;
type InvoiceWithRelations = Invoice & {
  calculations?: InvoiceCalculation;
  partner?: Partner;
  client?: Client;
};

// ---------------------------------------------------------------------------
// Internal adapter — converts shared engine numbers → Drizzle string fields
// Exported so recurring/dashboard repos can reuse without duplicating.
// ---------------------------------------------------------------------------
export function calculateInvoiceServer(
  scheme: InvoiceScheme,
  clientBill: number,
  partnerCommissionRate?: number,
  executorExpenses = 0,
  expensesPaidByPartner = 0,
  expensesPaidByAdmin = 0,
  plannedExpenses = 0,
): Partial<InvoiceCalculation> {
  const f = calculateFinancials(
    scheme,
    clientBill,
    partnerCommissionRate ?? 0,
    executorExpenses,
    expensesPaidByPartner,
    expensesPaidByAdmin,
    plannedExpenses,
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
async function _getInvoiceExpenses(db: DB, invoiceId: string): Promise<InvoiceExpense[]> {
  return db
    .select()
    .from(invoiceExpenses)
    .where(eq(invoiceExpenses.invoiceId, invoiceId))
    .orderBy(desc(invoiceExpenses.date));
}

async function _getInvoiceRaw(db: DB, id: string): Promise<InvoiceWithRelations | null> {
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
async function _recalculateInvoiceExpenses(db: DB, invoiceId: string): Promise<void> {
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

  const clientBill     = parseNum(existing.clientBill);
  const commissionRate = existing.commissionRate ? parseNum(existing.commissionRate) : undefined;
  const plannedExp     = parseNum(invoice.plannedExpenses);

  const computed = calculateInvoiceServer(
    invoice.scheme as InvoiceScheme,
    clientBill,
    commissionRate,
    total,
    expensesPaidByPartner,
    expensesPaidByAdmin,
    plannedExp,
  );

  await db.update(invoiceCalculations)
    .set({ ...computed, updatedAt: new Date() })
    .where(eq(invoiceCalculations.invoiceId, invoiceId));
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
  const [created] = await db.insert(invoices).values(invoice).returning();

  const clientBill     = parseNum(calculations.clientBill);
  const commissionRate = calculations.commissionRate ? parseNum(calculations.commissionRate) : undefined;
  const executorExpenses = parseNum(calculations.executorExpensesTotal);
  const plannedExp     = parseNum(created.plannedExpenses);

  const computed = calculateInvoiceServer(
    created.scheme as InvoiceScheme,
    clientBill,
    commissionRate,
    executorExpenses,
    0,
    0,
    plannedExp,
  );

  await db.insert(invoiceCalculations).values({ invoiceId: created.id, clientBill: computed.clientBill || "0", ...computed });
  return created;
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

  const computed = calculateInvoiceServer(
    invoice.scheme as InvoiceScheme,
    clientBill,
    commissionRate,
    executorExpenses,
    expensesPaidByPartner,
    expensesPaidByAdmin,
    plannedExp,
  );

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
  const [created] = await db.insert(invoiceExpenses).values(expense).returning();
  await _recalculateInvoiceExpenses(db, expense.invoiceId);
  return created;
}

export async function updateInvoiceExpense(
  db: DB,
  id: string,
  updates: Partial<InsertInvoiceExpense>,
): Promise<InvoiceExpense | null> {
  const [expense] = await db.select().from(invoiceExpenses).where(eq(invoiceExpenses.id, id)).limit(1);
  if (!expense) return null;

  const [updated] = await db.update(invoiceExpenses)
    .set(updates)
    .where(eq(invoiceExpenses.id, id))
    .returning();

  await _recalculateInvoiceExpenses(db, expense.invoiceId);
  return updated || null;
}

export async function deleteInvoiceExpense(db: DB, id: string): Promise<void> {
  const [expense] = await db.select().from(invoiceExpenses).where(eq(invoiceExpenses.id, id)).limit(1);
  if (expense) {
    await db.delete(invoiceExpenses).where(eq(invoiceExpenses.id, id));
    await _recalculateInvoiceExpenses(db, expense.invoiceId);
  }
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

      const expenses              = await _getInvoiceExpenses(db, invoice.id);
      const totalExpenses         = expenses.reduce((s, e) => s + parseNum(e.amount), 0);
      const expensesPaidByPartner = expenses.filter(e => e.paidByAdmin !== true).reduce((s, e) => s + parseNum(e.amount), 0);
      const expensesPaidByAdmin   = expenses.filter(e => e.paidByAdmin === true).reduce((s, e) => s + parseNum(e.amount), 0);

      const clientBill     = parseNum(existing.clientBill);
      const commissionRate = existing.commissionRate ? parseNum(existing.commissionRate) : undefined;
      const plannedExp     = parseNum(invoice.plannedExpenses);

      const computed = calculateInvoiceServer(
        invoice.scheme as InvoiceScheme,
        clientBill,
        commissionRate,
        totalExpenses,
        expensesPaidByPartner,
        expensesPaidByAdmin,
        plannedExp,
      );

      await db.update(invoiceCalculations)
        .set({ ...computed, updatedAt: new Date() })
        .where(eq(invoiceCalculations.invoiceId, invoice.id));

      updated++;
    } catch (err) {
      console.error(`[recalculateAllInvoices] Error for invoice ${invoice.id}:`, err);
      errors++;
    }
  }

  console.log(`[recalculateAllInvoices] Done: ${updated} updated, ${errors} errors`);
  return { updated, errors };
}
