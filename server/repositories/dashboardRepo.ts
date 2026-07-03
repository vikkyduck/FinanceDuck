/**
 * dashboardRepo — аналитика для дашбордов. Методы вынесены из God-объекта
 * storage.ts (там они были инлайн). Все принимают db параметром — тестируются
 * против PGlite (см. server/test/testDb.ts).
 */
import { eq, and, sql, inArray } from "drizzle-orm";
import { db as _db } from "../db";
import { invoices, invoiceCalculations, invoiceExpenses, partnerPayments, signedActs } from "../../shared/schema";
import { parseNum } from "../../shared/financialEngine";
import type { MonthlyData, PartnerHeroMetricsData } from "../storage";

type DB = typeof _db;

export async function getAdminMonthlyData(db: DB, year: number): Promise<MonthlyData[]> {
  const monthNames = [
    "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
    "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
  ];

  // Initialize all 12 months with zeros
  const monthlyData: MonthlyData[] = monthNames.map((_, i) => ({
    monthNumber: i + 1,
    totalSales: 0,
    totalProfit: 0,
    invoiceCount: 0,
    expenses: 0,
  }));

  // Get all paid invoices for the year
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31, 23, 59, 59);

  const allInvoices = await db
    .select({
      invoice: invoices,
      calculations: invoiceCalculations,
    })
    .from(invoices)
    .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
    .where(eq(invoices.status, 'paid'));

  // Get all expenses
  const allExpenses = await db.select().from(invoiceExpenses);
  const expensesByInvoice = new Map<string, number>();
  for (const exp of allExpenses) {
    const current = expensesByInvoice.get(exp.invoiceId) || 0;
    expensesByInvoice.set(exp.invoiceId, current + parseNum(exp.amount));
  }

  for (const row of allInvoices) {
    if (!row.calculations) continue;

    // Use actualPaymentDate first, then paymentDate for grouping (matches dashboard logic)
    const paymentDateStr = row.invoice.actualPaymentDate || row.invoice.paymentDate;
    const paymentDate = paymentDateStr
      ? new Date(paymentDateStr)
      : null;

    if (!paymentDate || paymentDate < yearStart || paymentDate > yearEnd) continue;

    const monthIndex = paymentDate.getMonth(); // 0-11

    // Use netProfitAdmin for profit calculation (includes expense deduction for admin-paid expenses)
    const profit = parseNum(row.calculations.netProfitAdmin);

    const clientBill = parseNum(row.calculations.clientBill);
    const invoiceExpensesTotal = expensesByInvoice.get(row.invoice.id) || 0;

    monthlyData[monthIndex].totalSales += clientBill;
    monthlyData[monthIndex].totalProfit += profit;
    monthlyData[monthIndex].invoiceCount += 1;
    monthlyData[monthIndex].expenses += invoiceExpensesTotal;
  }

  return monthlyData;
}

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

  let debtToAdmin = 0;
  let reservedForExpenses = 0;
  let yearlyCommission = 0;
  const invoicesWithDebt: { id: string; number: string; amount: number }[] = [];

  for (const row of allPartnerInvoices) {
    if (!row.calculations) continue;

    const partnerTransferDue = parseNum(row.calculations.partnerTransferDue);
    // ⚠️ ЛАТЕНТНЫЙ БАГ (сохранён при переносе как есть): полей plannedExpenses /
    // expensesPaidByPartner НЕТ на invoice_calculations → всегда undefined → 0,
    // поэтому reservedForExpenses всегда 0. Исправлять отдельной задачей.
    const plannedExpenses = parseNum((row.calculations as any).plannedExpenses);
    const expensesPaidByPartner = parseNum((row.calculations as any).expensesPaidByPartner);

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
    // ⚠️ ТОТ ЖЕ БАГ: поля partnerCommission на invoice_calculations нет →
    // yearlyCommission всегда 0.
    yearlyCommission += parseNum((row.calculations as any).partnerCommission);
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
