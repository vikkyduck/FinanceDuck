import { and, eq, inArray, sql } from "drizzle-orm";
import { parseNum } from "../../shared/financialEngine";
import { invoiceCalculations, invoiceExpenses, invoices, partnerPayments, signedActs } from "../../shared/schema";
import { db as _db } from "../db";
import type { PartnerHeroMetricsData } from "../storage";

type DB = typeof _db;

export async function getPartnerHeroMetrics(db: DB, partnerId: string): Promise<PartnerHeroMetricsData> {
  const currentYear = new Date().getFullYear();
  const yearStart = new Date(currentYear, 0, 1);

  // Paid invoices for this partner in the current year
  const partnerInvoices = await db
    .select({ invoice: invoices, calculations: invoiceCalculations })
    .from(invoices)
    .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
    .where(and(
      eq(invoices.partnerId, partnerId),
      eq(invoices.status, 'paid'),
      sql`${invoices.createdAt} >= ${yearStart.toISOString()}`,
    ));

  // All paid invoices for this partner (any year)
  const allPartnerInvoices = await db
    .select({ invoice: invoices, calculations: invoiceCalculations })
    .from(invoices)
    .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
    .where(and(eq(invoices.partnerId, partnerId), eq(invoices.status, 'paid')));

  const expenseTotals = await db.select({ invoiceId: invoiceExpenses.invoiceId, total: sql<string>`COALESCE(SUM(${invoiceExpenses.amount}), 0)` })
    .from(invoiceExpenses).innerJoin(invoices, eq(invoices.id, invoiceExpenses.invoiceId))
    .where(and(eq(invoices.partnerId, partnerId), eq(invoices.status, 'paid'), eq(invoiceExpenses.paidByAdmin, false)))
    .groupBy(invoiceExpenses.invoiceId);
  const expenseTotalsByInvoice = new Map(expenseTotals.map(row => [row.invoiceId, parseNum(row.total)]));
  let debtToAdmin = 0;
  let reservedForExpenses = 0;
  let yearlyCommission = 0;
  const invoicesWithDebt: { id: string; number: string; amount: number }[] = [];

  for (const row of allPartnerInvoices) {
    if (!row.calculations) continue;

    const partnerTransferDue = parseNum(row.calculations.partnerTransferDue);
    const plannedExpenses = parseNum(row.invoice.plannedExpenses);
    const expensesPaidByPartner = expenseTotalsByInvoice.get(row.invoice.id) ?? 0;

    if (partnerTransferDue > 0) {
      debtToAdmin += partnerTransferDue;
      invoicesWithDebt.push({
        id: row.invoice.id,
        number: row.invoice.invoiceNumber || `INV-${row.invoice.id}`,
        amount: partnerTransferDue,
      });
    }

    if (plannedExpenses > 0) {
      reservedForExpenses += Math.max(0, plannedExpenses - expensesPaidByPartner);
    }
  }

  for (const row of partnerInvoices) {
    if (!row.calculations) continue;
    yearlyCommission += parseNum(row.calculations.partnerShareFromMargin ?? row.calculations.commissionAmount);
  }

  // Payments reduce the debt
  const payments = await db.select().from(partnerPayments).where(eq(partnerPayments.partnerId, partnerId));
  const totalPaid = payments.reduce((sum, p) => sum + parseNum(p.amount), 0);
  debtToAdmin = Math.max(0, debtToAdmin - totalPaid);

  // Signed acts across this partner's paid invoices
  const paidInvoiceIds = allPartnerInvoices.map(r => r.invoice.id);
  let signedActsCount = 0;
  if (paidInvoiceIds.length > 0) {
    const actsResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(signedActs)
      .where(inArray(signedActs.invoiceId, paidInvoiceIds));
    signedActsCount = Number(actsResult[0]?.count || 0);
  }

  return {
    debtToAdmin,
    reservedForExpenses,
    yearlyCommission,
    signedActsCount,
    totalPaidInvoices: allPartnerInvoices.length,
    invoicesWithDebt,
  };
}

