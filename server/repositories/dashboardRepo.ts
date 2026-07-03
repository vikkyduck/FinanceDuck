/**
 * dashboardRepo — аналитика для дашбордов. Методы вынесены из God-объекта
 * storage.ts (там они были инлайн). Все принимают db параметром — тестируются
 * против PGlite (см. server/test/testDb.ts).
 */
import { eq } from "drizzle-orm";
import { db as _db } from "../db";
import { invoices, invoiceCalculations, invoiceExpenses } from "../../shared/schema";
import { parseNum } from "../../shared/financialEngine";
import type { MonthlyData } from "../storage";

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
