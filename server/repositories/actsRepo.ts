/**
 * Signed Acts & Assistant Bonus Repository
 * Covers signed acts (executor/company) and bonus payment tracking.
 */

import { db as _db } from "../db";
import {
  signedActs, assistantBonusPayments, invoices, accessTokens,
  SignedAct, AssistantBonusPayment,
  InsertSignedAct, InsertAssistantBonusPayment,
  ActType,
} from "../../shared/schema";
import {
  eq, and, desc, isNull, or, inArray, sql,
} from "drizzle-orm";
import { parseNum } from "../../shared/financialEngine";

type DB = typeof _db;

// ---------------------------------------------------------------------------
// Signed Acts
// ---------------------------------------------------------------------------

export async function createSignedAct(db: DB, act: InsertSignedAct): Promise<SignedAct> {
  const [created] = await db.insert(signedActs).values(act).returning();
  return created;
}

export async function getSignedActsByInvoice(
  db: DB,
  invoiceId: string,
  actType?: ActType,
): Promise<SignedAct[]> {
  if (actType) {
    return db.select().from(signedActs)
      .where(and(eq(signedActs.invoiceId, invoiceId), eq(signedActs.actType, actType)))
      .orderBy(desc(signedActs.createdAt));
  }
  return db.select().from(signedActs)
    .where(eq(signedActs.invoiceId, invoiceId))
    .orderBy(desc(signedActs.createdAt));
}

export async function getSignedAct(db: DB, id: string): Promise<SignedAct | null> {
  const [act] = await db.select().from(signedActs).where(eq(signedActs.id, id)).limit(1);
  return act || null;
}

export async function deleteSignedAct(db: DB, id: string): Promise<void> {
  await db.delete(signedActs).where(eq(signedActs.id, id));
}

export async function getActsStatistics(
  db: DB,
  excludeHidden = false,
): Promise<{ executorActs: number; companyActs: number; totalPaidInvoices: number }> {
  const visibleCondition = excludeHidden
    ? and(eq(invoices.status, 'paid'), or(isNull(invoices.hideFromAssistant), eq(invoices.hideFromAssistant, false)))
    : eq(invoices.status, 'paid');

  const paidInvoicesCount = await db.select({ count: sql<number>`count(*)` })
    .from(invoices)
    .where(visibleCondition);

  const visibleInvoices = await db.select({ id: invoices.id }).from(invoices).where(visibleCondition);
  const visibleInvoiceIds = visibleInvoices.map(inv => inv.id.toString());

  let executorActsCount = 0;
  let companyActsCount  = 0;

  if (visibleInvoiceIds.length > 0) {
    const [executorResult] = await db.select({ count: sql<number>`count(*)` })
      .from(signedActs)
      .where(and(eq(signedActs.actType, 'executor'), inArray(signedActs.invoiceId, visibleInvoiceIds)));
    executorActsCount = Number(executorResult?.count || 0);

    const [companyResult] = await db.select({ count: sql<number>`count(*)` })
      .from(signedActs)
      .where(and(eq(signedActs.actType, 'company'), inArray(signedActs.invoiceId, visibleInvoiceIds)));
    companyActsCount = Number(companyResult?.count || 0);
  }

  return {
    executorActs:      executorActsCount,
    companyActs:       companyActsCount,
    totalPaidInvoices: Number(paidInvoicesCount[0]?.count || 0),
  };
}

export async function getAssistantStats(db: DB): Promise<{
  paidInvoicesCount: number;
  executorActsCount: number;
  companyActsCount:  number;
  totalPaidInvoices: number;
  assistantBonus:    number;
  totalEarned:       number;
  totalPaid:         number;
}> {
  const stats      = await getActsStatistics(db, true);
  const totalEarned = (stats.executorActs * 1000) + (stats.companyActs * 2000);

  const [paymentsResult] = await db.select({
    totalPaid: sql<string>`COALESCE(SUM(amount::numeric), 0)`,
  }).from(assistantBonusPayments);
  const totalPaid     = parseNum(paymentsResult?.totalPaid);
  const assistantBonus = Math.max(0, totalEarned - totalPaid);

  return {
    paidInvoicesCount: stats.totalPaidInvoices,
    executorActsCount: stats.executorActs,
    companyActsCount:  stats.companyActs,
    totalPaidInvoices: stats.totalPaidInvoices,
    assistantBonus,
    totalEarned,
    totalPaid,
  };
}

// ---------------------------------------------------------------------------
// Bonus Payments
// ---------------------------------------------------------------------------

export async function getAssistantBonusPayments(db: DB): Promise<AssistantBonusPayment[]> {
  return db.select().from(assistantBonusPayments).orderBy(desc(assistantBonusPayments.paymentDate));
}

export async function createAssistantBonusPayment(
  db: DB,
  payment: InsertAssistantBonusPayment,
): Promise<AssistantBonusPayment> {
  const [created] = await db.insert(assistantBonusPayments).values(payment).returning();
  return created;
}

export async function getUnpaidBonusTotal(db: DB): Promise<{
  total:        number;
  invoiceCount: number;
  invoiceIds:   string[];
  executorActs: number;
  companyActs:  number;
  totalEarned:  number;
  totalPaid:    number;
}> {
  const stats        = await getActsStatistics(db, true);
  const totalEarned  = (stats.executorActs * 1000) + (stats.companyActs * 2000);

  const [paymentsResult] = await db.select({
    totalPaid: sql<string>`COALESCE(SUM(amount::numeric), 0)`,
  }).from(assistantBonusPayments);
  const totalPaid    = parseNum(paymentsResult?.totalPaid);
  const unpaidTotal  = Math.max(0, totalEarned - totalPaid);

  const invoicesWithActs = await db.selectDistinct({ invoiceId: signedActs.invoiceId })
    .from(signedActs)
    .innerJoin(invoices, eq(invoices.id, signedActs.invoiceId))
    .where(eq(invoices.status, 'paid'));

  return {
    total:        unpaidTotal,
    invoiceCount: invoicesWithActs.length,
    invoiceIds:   invoicesWithActs.map(r => r.invoiceId),
    executorActs: stats.executorActs,
    companyActs:  stats.companyActs,
    totalEarned,
    totalPaid,
  };
}

/** No-op — kept for backwards compatibility. Payments tracked via assistant_bonus_payments table. */
export async function markBonusesAsPaid(_db: DB, _invoiceIds: string[]): Promise<void> {}
