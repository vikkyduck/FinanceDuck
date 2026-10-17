/**
 * planningRepo — вынесено из God-объекта storage.ts (тот же паттерн, что dashboardRepo).
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
import { calculateInvoiceServer } from "./invoiceRepo";
import type { InvoiceScheme } from "../../shared/financialEngine";
import type { MonthlyFinancialPlan } from "../../shared/schema";
import type { ForecastData, PlanFactData, MonthlyPlanInput } from "../storage";

type DB = typeof _db;

export async function getMonthlyPlan(db: DB, year: number, month: number): Promise<MonthlyFinancialPlan | null> {
  const [plan] = await db
    .select()
    .from(monthlyFinancialPlans)
    .where(and(
      eq(monthlyFinancialPlans.year, year.toString()),
      eq(monthlyFinancialPlans.month, month.toString())
    ))
    .limit(1);
  
  return plan || null;
}

export async function getMonthlyPlans(db: DB, year: number): Promise<MonthlyFinancialPlan[]> {
  return await db
    .select()
    .from(monthlyFinancialPlans)
    .where(eq(monthlyFinancialPlans.year, year.toString()))
    .orderBy(monthlyFinancialPlans.month);
}

export async function upsertMonthlyPlan(db: DB, input: MonthlyPlanInput): Promise<MonthlyFinancialPlan> {
  const existing = await getMonthlyPlan(db, input.year, input.month);
  
  if (existing) {
    const [updated] = await db
      .update(monthlyFinancialPlans)
      .set({
        salesTarget: input.salesTarget?.toString() || existing.salesTarget,
        profitTarget: input.profitTarget?.toString() || existing.profitTarget,
        receiptsTarget: input.receiptsTarget?.toString() || existing.receiptsTarget,
        updatedAt: new Date(),
      })
      .where(eq(monthlyFinancialPlans.id, existing.id))
      .returning();
    return updated;
  } else {
    const [created] = await db
      .insert(monthlyFinancialPlans)
      .values({
        year: input.year.toString(),
        month: input.month.toString(),
        salesTarget: input.salesTarget?.toString() || "0",
        profitTarget: input.profitTarget?.toString() || "0",
        receiptsTarget: input.receiptsTarget?.toString() || "0",
      })
      .returning();
    return created;
  }
}

export async function getAdminPlanFact(db: DB, year: number): Promise<PlanFactData[]> {
  const monthNames = [
    "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
    "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
  ];
  
  // Initialize all 12 months
  const planFactData: PlanFactData[] = monthNames.map((name, i) => ({
    monthNumber: i + 1,
    monthName: name,
    salesTarget: 0,
    receiptsTarget: 0,
    actualSales: 0,
    actualReceipts: 0,
  }));
  
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31, 23, 59, 59);
  
  // Get monthly plans for the year
  const plans = await getMonthlyPlans(db, year);
  for (const plan of plans) {
    const monthIndex = parseInt(plan.month) - 1;
    if (monthIndex >= 0 && monthIndex < 12) {
      planFactData[monthIndex].salesTarget = parseNum(plan.salesTarget);
      planFactData[monthIndex].receiptsTarget = parseNum(plan.receiptsTarget);
    }
  }
  
  // Get invoices that are not draft/cancelled for sales
  const sentOrPaidInvoices = await db
    .select({
      invoice: invoices,
      calculations: invoiceCalculations,
    })
    .from(invoices)
    .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
    .where(
      sql`${invoices.status} IN ('sent', 'paid')`
    );
  
  for (const row of sentOrPaidInvoices) {
    if (!row.calculations) continue;
    
    const clientBill = parseNum(row.calculations.clientBill);
    
    // Actual Sales: based on invoice creation date (when invoice was issued/sent)
    const createdDate = row.invoice.createdAt 
      ? new Date(row.invoice.createdAt) 
      : null;
    
    if (createdDate && createdDate >= yearStart && createdDate <= yearEnd) {
      const salesMonth = createdDate.getMonth();
      planFactData[salesMonth].actualSales += clientBill;
    }
    
    // Actual Receipts: only for paid invoices with paymentDate in year
    if (row.invoice.status === 'paid' && row.invoice.paymentDate) {
      const paymentDate = new Date(row.invoice.paymentDate);
      if (paymentDate >= yearStart && paymentDate <= yearEnd) {
        const receiptMonth = paymentDate.getMonth();
        planFactData[receiptMonth].actualReceipts += clientBill;
      }
    }
  }
  
  return planFactData;
}

export async function getAdminForecast(db: DB, monthsAhead: number): Promise<ForecastData[]> {
  const monthNames = [
    "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
    "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
  ];
  
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  
  // Create forecast periods
  const forecastData: ForecastData[] = [];
  for (let i = 0; i < monthsAhead; i++) {
    const targetMonth = (currentMonth + i) % 12;
    const targetYear = currentYear + Math.floor((currentMonth + i) / 12);
    
    forecastData.push({
      monthIndex: targetMonth + 1,
      monthName: monthNames[targetMonth],
      yearNum: targetYear,
      expectedAmount: 0,
      receivedAmount: 0,
      recurringAmount: 0,
    });
  }
  
  // Get all invoices with calculations
  const allInvoices = await db
    .select({
      invoice: invoices,
      calculations: invoiceCalculations,
    })
    .from(invoices)
    .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId));
  
  for (const row of allInvoices) {
    if (!row.calculations) continue;
    
    const isPaid = row.invoice.status === 'paid';
    
    // For paid invoices: use actualPaymentDate first, then paymentDate (matches dashboard logic)
    // For expected invoices: use plannedPaymentDate or issueDate
    let dateStr: string | Date | null;
    if (isPaid) {
      dateStr = row.invoice.actualPaymentDate || row.invoice.paymentDate;
    } else {
      dateStr = row.invoice.paymentDate || row.invoice.issueDate;
    }
    
    const paymentDate = dateStr ? new Date(dateStr) : null;
    
    if (!paymentDate) continue;
    
    const paymentMonth = paymentDate.getMonth();
    const paymentYear = paymentDate.getFullYear();
    
    // Use netProfitAdmin for profit calculation (includes expense deduction for admin-paid expenses)
    const profit = parseNum(row.calculations.netProfitAdmin);
    
    // Find matching forecast period
    const forecastIndex = forecastData.findIndex(f => 
      f.monthIndex === paymentMonth + 1 && f.yearNum === paymentYear
    );
    
    if (forecastIndex === -1) continue;
    
    if (isPaid) {
      forecastData[forecastIndex].receivedAmount += profit;
    } else if (row.invoice.status === 'sent') {
      forecastData[forecastIndex].expectedAmount += profit;
    }
  }
  
  // Add recurring invoices expected amounts to forecast
  const activeRecurring = await db
    .select()
    .from(recurringInvoices)
    .where(eq(recurringInvoices.isActive, true));
  
  for (const recurring of activeRecurring) {
    const amount = parseNum(recurring.amount);
    if (amount <= 0) continue;
    
    const scheme = recurring.scheme as InvoiceScheme;
    const partnerCommissionRate = recurring.partnerCommissionRate 
      ? parseNum(recurring.partnerCommissionRate) 
      : undefined;
    
    // Calculate expected admin profit for this recurring invoice (including default expenses)
    const calculation = calculateInvoiceServer({ scheme, clientBill: recurring.amount, partnerCommRate: partnerCommissionRate, plannedExpenses: recurring.defaultExpenses ?? 0 });
    const expectedProfit = parseNum(calculation.netProfitAdmin);
    
    if (expectedProfit <= 0) continue;
    
    // Validate dates before processing
    const startDate = recurring.startDate ? new Date(recurring.startDate) : new Date();
    const endDateValue = recurring.endDate ? new Date(recurring.endDate) : null;
    const nextInvoiceDateValue = recurring.nextInvoiceDate 
      ? new Date(recurring.nextInvoiceDate) 
      : null;
    
    // Calculate end of forecast period
    const lastForecast = forecastData[forecastData.length - 1];
    const forecastEndDate = new Date(lastForecast.yearNum, lastForecast.monthIndex, 0);
    
    // Start from nextInvoiceDate if valid, otherwise calculate from startDate
    const dayOfMonth = parseInt(recurring.dayOfMonth || "1");
    const frequency = recurring.frequency as 'monthly' | 'quarterly' | 'yearly';
    
    let checkDate: Date;
    if (nextInvoiceDateValue && !isNaN(nextInvoiceDateValue.getTime())) {
      checkDate = new Date(nextInvoiceDateValue.getTime());
    } else {
      // Calculate first occurrence from startDate
      checkDate = new Date(startDate.getFullYear(), startDate.getMonth(), dayOfMonth);
      if (checkDate < startDate) {
        checkDate.setMonth(checkDate.getMonth() + 1);
      }
    }
    
    // Iterate through forecast periods
    let iterations = 0;
    const maxIterations = 100; // Safety limit
    
    while (checkDate <= forecastEndDate && iterations < maxIterations) {
      iterations++;
      
      // Check if within endDate (if set)
      if (endDateValue && checkDate > endDateValue) break;
      
      const checkMonth = checkDate.getMonth();
      const checkYear = checkDate.getFullYear();
      
      // Find matching forecast period
      const forecastIndex = forecastData.findIndex(f => 
        f.monthIndex === checkMonth + 1 && f.yearNum === checkYear
      );
      
      if (forecastIndex !== -1) {
        forecastData[forecastIndex].recurringAmount = 
          (forecastData[forecastIndex].recurringAmount || 0) + expectedProfit;
      }
      
      // Move to next occurrence - create new Date to avoid mutation issues
      const nextYear = checkDate.getFullYear();
      const nextMonth = checkDate.getMonth();
      
      switch (frequency) {
        case 'monthly':
          checkDate = new Date(nextYear, nextMonth + 1, dayOfMonth);
          break;
        case 'quarterly':
          checkDate = new Date(nextYear, nextMonth + 3, dayOfMonth);
          break;
        case 'yearly':
          checkDate = new Date(nextYear + 1, nextMonth, dayOfMonth);
          break;
      }
    }
  }
  
  return forecastData;
}
