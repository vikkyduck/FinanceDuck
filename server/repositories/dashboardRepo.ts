/**
 * dashboardRepo — аналитика для дашбордов. Методы вынесены из God-объекта
 * storage.ts (там они были инлайн). Все принимают db параметром — тестируются
 * против PGlite (см. server/test/testDb.ts).
 */
import { eq, and, sql, inArray, desc, isNull, isNotNull } from "drizzle-orm";
import { db as _db } from "../db";
import { invoices, invoiceCalculations, invoiceExpenses, partnerPayments, signedActs, partners, clients, accessTokens, recurringInvoices } from "../../shared/schema";
import { parseNum, isAgencyScheme } from "../../shared/financialEngine";
import type { MonthlyData, PartnerHeroMetricsData, DashboardInvoiceDetail } from "../storage";

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

export async function getPartnerDebtSummaries(db: DB): Promise<{
    partnerId: string;
    partnerName: string;
    totalToTransfer: number;
    totalPaid: number;
    remaining: number;
    invoiceCount: number;
    paidCommission: number;
    totalInvoiceCount: number;
    email: string | null;
    phone: string | null;
  }[]> {
    // Get all invoices for total counts
    const allInvoicesList = await db
      .select({
        invoice: invoices,
        calculations: invoiceCalculations,
        partnerName: partners.name,
        partnerEmail: partners.email,
        partnerPhone: partners.phone,
      })
      .from(invoices)
      .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
      .leftJoin(partners, eq(invoices.partnerId, partners.id));
    
    // Get all paid invoices with their stored partnerTransferDue values
    const paidInvoices = allInvoicesList.filter(r => r.invoice.status === 'paid');

    const allPayments = await db.select().from(partnerPayments);

    const partnerMap = new Map<string, {
      partnerId: string;
      partnerName: string;
      totalToTransfer: number;
      totalPaid: number;
      remaining: number;
      invoiceCount: number;
      paidCommission: number;
      totalInvoiceCount: number;
      email: string | null;
      phone: string | null;
    }>();

    // First pass: count all invoices per partner
    for (const row of allInvoicesList) {
      if (!row.invoice.partnerId) continue;
      
      const pid = row.invoice.partnerId;
      const pName = row.partnerName || 'Unknown';
      
      if (!partnerMap.has(pid)) {
        partnerMap.set(pid, {
          partnerId: pid,
          partnerName: pName,
          totalToTransfer: 0,
          totalPaid: 0,
          remaining: 0,
          invoiceCount: 0,
          paidCommission: 0,
          totalInvoiceCount: 0,
          email: row.partnerEmail,
          phone: row.partnerPhone,
        });
      }
      
      const summary = partnerMap.get(pid)!;
      summary.totalInvoiceCount += 1;
    }

    // Second pass: process paid invoices for debt and commission
    for (const row of paidInvoices) {
      if (!row.invoice.partnerId || !row.calculations) continue;
      
      const pid = row.invoice.partnerId;
      const pName = row.partnerName || 'Unknown';
      
      // Use stored values from calculations - single source of truth
      // Guard against NaN with || 0
      const debt = parseNum(row.calculations.partnerTransferDue) || 0;
      const commission = parseNum(row.calculations.commissionAmount) || 0;

      if (!partnerMap.has(pid)) {
        partnerMap.set(pid, {
          partnerId: pid,
          partnerName: pName,
          totalToTransfer: 0,
          totalPaid: 0,
          remaining: 0,
          invoiceCount: 0,
          paidCommission: 0,
          totalInvoiceCount: 0,
          email: row.partnerEmail,
          phone: row.partnerPhone,
        });
      }

      const summary = partnerMap.get(pid)!;
      summary.totalToTransfer += debt;
      summary.invoiceCount += 1;
      summary.paidCommission += commission;
    }

    for (const payment of allPayments) {
      if (partnerMap.has(payment.partnerId)) {
        const summary = partnerMap.get(payment.partnerId)!;
        summary.totalPaid += parseNum(payment.amount) || 0;
      }
    }

    // Include ALL partners, not just those with debt
    const allPartnersDb = await db.select().from(partners);
    
    for (const partner of allPartnersDb) {
      if (!partnerMap.has(partner.id)) {
        partnerMap.set(partner.id, {
          partnerId: partner.id,
          partnerName: partner.name,
          totalToTransfer: 0,
          totalPaid: 0,
          remaining: 0,
          invoiceCount: 0,
          paidCommission: 0,
          totalInvoiceCount: 0,
          email: partner.email,
          phone: partner.phone,
        });
      }
    }
    
    // Add payments even for partners without invoices
    for (const payment of allPayments) {
      if (partnerMap.has(payment.partnerId)) {
        const summary = partnerMap.get(payment.partnerId)!;
        // Already added above, but ensure we capture all payments
      }
    }

    return Array.from(partnerMap.values())
      .map(s => ({
        ...s,
        remaining: Math.max(0, s.totalToTransfer - s.totalPaid),
      }))
      .sort((a, b) => {
        // Sort by remaining debt descending, then by name
        if (b.remaining !== a.remaining) return b.remaining - a.remaining;
        return a.partnerName.localeCompare(b.partnerName);
      });
  }


export async function getPartnerSchemeDoNotSpendData(db: DB, partnerId?: string, role?: string): Promise<{
    partnerId: string;
    partnerName: string;
    totalPlannedExpenses: number;
    totalSpent: number;
    totalCommission: number;
    totalDoNotSpend: number;
    totalPartnerDebt: number;
    totalClientBill: number;
    invoiceCount: number;
    invoices: {
      id: string;
      number: string;
      description: string | null;
      notes: string | null;
      clientBill: number;
      plannedExpenses: number;
      spent: number;
      remaining: number;
      commission: number;
      partnerDebt: number;
      doNotSpend: number;
      createdAt: Date | null;
    }[];
  }[]> {
    // Include all partner schemes: commission_based, partner_10, partner_15
    const conditions = [
      inArray(invoices.scheme, ['commission_based', 'partner_10', 'partner_15']),
      inArray(invoices.status, ['paid', 'sent'])
    ];
    
    if (partnerId) {
      conditions.push(eq(invoices.partnerId, partnerId));
    }
    
    const partnerInvoices = await db
      .select({
        invoice: invoices,
        calculations: invoiceCalculations,
        partnerName: partners.name,
      })
      .from(invoices)
      .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
      .leftJoin(partners, eq(invoices.partnerId, partners.id))
      .where(and(...conditions));

    // Get all expenses for partner scheme invoices to calculate spent amounts
    const invoiceIds = partnerInvoices.map(row => row.invoice.id);
    const allExpenses = invoiceIds.length > 0 
      ? await db.select().from(invoiceExpenses).where(inArray(invoiceExpenses.invoiceId, invoiceIds))
      : [];
    
    // Group expenses by invoice ID
    const expensesByInvoice = new Map<string, { paidByPartner: number; paidByAdmin: number }>();
    for (const expense of allExpenses) {
      const current = expensesByInvoice.get(expense.invoiceId) || { paidByPartner: 0, paidByAdmin: 0 };
      const amount = parseNum(expense.amount);
      if (expense.paidByAdmin === true) {
        current.paidByAdmin += amount;
      } else {
        current.paidByPartner += amount;
      }
      expensesByInvoice.set(expense.invoiceId, current);
    }

    const partnerMap = new Map<string, {
      partnerId: string;
      partnerName: string;
      totalPlannedExpenses: number;
      totalSpent: number;
      totalCommission: number;
      totalDoNotSpend: number;
      totalPartnerDebt: number;
      totalClientBill: number;
      invoiceCount: number;
      invoices: {
        id: string;
        number: string;
        description: string | null;
        notes: string | null;
        clientBill: number;
        plannedExpenses: number;
        spent: number;
        remaining: number;
        commission: number;
        partnerDebt: number;
        doNotSpend: number;
        createdAt: Date | null;
      }[];
    }>();

    for (const row of partnerInvoices) {
      if (!row.invoice.partnerId || !row.calculations) continue;

      const pId = row.invoice.partnerId;
      const partnerName = row.partnerName || 'Unknown';
      const clientBill = parseNum(row.calculations.clientBill);
      const plannedExpenses = parseNum(row.invoice.plannedExpenses);
      const commissionRate = row.calculations.commissionRate ? parseNum(row.calculations.commissionRate) : 10;
      
      // Get ACTUAL spent expenses from invoice_expenses table (partner-paid only)
      const invoiceExpensesData = expensesByInvoice.get(row.invoice.id) || { paidByPartner: 0, paidByAdmin: 0 };
      const spent = invoiceExpensesData.paidByPartner;
      const remaining = Math.max(0, plannedExpenses - spent);
      
      // Commission is partner's share (what they keep): clientBill * (commissionRate / 100)
      const commission = clientBill * (commissionRate / 100);
      
      // Partner debt comes from stored calculation (FIXED value, doesn't change with expenses)
      const partnerDebt = parseNum(row.calculations.partnerTransferDue);
      
      // "Do not spend" calculation - only remaining planned expenses
      // Commission is now tracked separately for "Expected Commission" dashboard
      const doNotSpend = remaining;
      
      // Skip invoices without planned expenses (same logic for ALL roles)
      if (plannedExpenses <= 0) continue;
      
      if (!partnerMap.has(pId)) {
        partnerMap.set(pId, {
          partnerId: pId,
          partnerName,
          totalPlannedExpenses: 0,
          totalSpent: 0,
          totalCommission: 0,
          totalDoNotSpend: 0,
          totalPartnerDebt: 0,
          totalClientBill: 0,
          invoiceCount: 0,
          invoices: [],
        });
      }

      const summary = partnerMap.get(pId)!;
      summary.totalPlannedExpenses += plannedExpenses;
      summary.totalSpent += spent;
      // Only add commission to totals for non-assistant roles
      summary.totalCommission += (role === 'assistant' || role === 'accountant') ? 0 : commission;
      summary.totalDoNotSpend += doNotSpend;
      summary.totalPartnerDebt += partnerDebt;
      summary.totalClientBill += clientBill;
      summary.invoiceCount += 1;
      summary.invoices.push({
        id: row.invoice.id,
        number: row.invoice.invoiceNumber || `INV-${row.invoice.id}`,
        description: row.invoice.description,
        notes: row.invoice.notes,
        clientBill,
        plannedExpenses,
        spent,
        remaining,
        commission: (role === 'assistant' || role === 'accountant') ? 0 : commission,
        partnerDebt,
        doNotSpend,
        createdAt: row.invoice.createdAt,
      });
    }

    // Filter and sort results, zero out commission fields for assistant
    return Array.from(partnerMap.values())
      .map(s => ({
        ...s,
        // Ensure assistant never sees any commission data
        totalCommission: (role === 'assistant' || role === 'accountant') ? 0 : s.totalCommission,
        invoices: s.invoices.sort((a, b) => {
          if (!a.createdAt || !b.createdAt) return 0;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }),
      }))
      .filter(s => s.totalDoNotSpend > 0)
      .sort((a, b) => b.totalDoNotSpend - a.totalDoNotSpend);
  }


export async function getAdminDashboardStats(db: DB, getRecurringExpectedForMonth: (y: number, m: number) => Promise<{ monthlyAmount: number; yearlyTotal: number }>, year?: number, month?: number): Promise<{
    yearlySummary: {
      totalRevenue: number;
      totalProfit: number;
      netProfitMargin: number;
    };
    monthlyCashFlow: {
      received: number;
      expected: number;
      recurring: number;
    };
    monthlyProfit: number;
    ownerShares: {
      yearlyKrya: number;
      yearlyKot: number;
      monthlyKrya: number;
      monthlyKot: number;
    };
    monthlySales: {
      draftsCount: number;
      draftsTotal: number;
    };
    leverage: {
      othersProfit: number;   // прибыль через внешних партнёров (делегирование)
      managedProfit: number;  // прибыль через активы под управлением владельца
      ownerProfit: number;    // прибыль от личной работы владельца — знаменатель
      ratio: number;          // (others + managed) / owner — плечо владельца
    };
    recurringExpected: {
      monthlyAmount: number;
      yearlyTotal: number;
    };
    selectedYear: number;
    selectedMonth: number;
    availableYears: number[];
  }> {
    const now = new Date();
    const selectedYear = year ?? now.getFullYear();
    const selectedMonth = month ?? now.getMonth();

    // Build ISO date-string bounds for SQL date comparisons
    const pad = (n: number) => String(n).padStart(2, '0');
    const lastDayOfMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const monthStartStr = `${selectedYear}-${pad(selectedMonth + 1)}-01`;
    const monthEndStr   = `${selectedYear}-${pad(selectedMonth + 1)}-${pad(lastDayOfMonth)}`;
    const yearStartStr  = `${selectedYear}-01-01`;
    const yearEndStr    = `${selectedYear}-12-31`;

    // Effective date expression: paymentDate when set, otherwise DATE(createdAt)
    const effectiveDate = sql`COALESCE(${invoices.paymentDate}, DATE(${invoices.createdAt}))`;

    // Run all aggregation queries in parallel for performance
    const [
      yearlyRows,
      monthlyPaidRows,
      monthlyExpectedRows,
      leverageRows,
      salesRows,
      availableYearsRows,
    ] = await Promise.all([
      // 1. Yearly metrics — paid invoices whose effective date falls within the selected year
      db.select({
        revenue: sql<string>`COALESCE(SUM(${invoiceCalculations.clientBill}::numeric), 0)`,
        profit:  sql<string>`COALESCE(SUM(${invoiceCalculations.netProfitAdmin}::numeric), 0)`,
      })
        .from(invoices)
        .innerJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
        .where(and(
          eq(invoices.status, 'paid'),
          sql`${effectiveDate} BETWEEN ${yearStartStr}::date AND ${yearEndStr}::date`,
        )),

      // 2. Monthly received — paid invoices whose effective date falls within the selected month
      db.select({
        profit: sql<string>`COALESCE(SUM(${invoiceCalculations.netProfitAdmin}::numeric), 0)`,
      })
        .from(invoices)
        .innerJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
        .where(and(
          eq(invoices.status, 'paid'),
          sql`${effectiveDate} BETWEEN ${monthStartStr}::date AND ${monthEndStr}::date`,
        )),

      // 3. Monthly expected — non-paid, non-cancelled with effective date in month
      db.select({
        profit: sql<string>`COALESCE(SUM(${invoiceCalculations.netProfitAdmin}::numeric), 0)`,
      })
        .from(invoices)
        .innerJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
        .where(and(
          sql`${invoices.status} NOT IN ('paid', 'cancelled')`,
          sql`${effectiveDate} BETWEEN ${monthStartStr}::date AND ${monthEndStr}::date`,
        )),

      // 4. Leverage — non-cancelled с effective date в месяце, ТРИ котла по
      //    partners.leverage_role (НЕ по имени — имена людей коду знать незачем):
      //    • managedProfit — 'managed_asset' (актив под управлением) → ЧИСЛИТЕЛЬ;
      //    • ownerProfit   — 'owner' (личная работа владельца)       → ЗНАМЕНАТЕЛЬ;
      //    • othersProfit  — 'external' (обычные партнёры)           → числитель.
      //    Счета без партнёра никуда не считаются (как и раньше).
      db.select({
        managedProfit: sql<string>`COALESCE(SUM(
          CASE WHEN ${partners.leverageRole} = 'managed_asset'
               THEN ${invoiceCalculations.netProfitAdmin}::numeric ELSE 0 END), 0)`,
        ownerProfit: sql<string>`COALESCE(SUM(
          CASE WHEN ${partners.leverageRole} = 'owner'
               THEN ${invoiceCalculations.netProfitAdmin}::numeric ELSE 0 END), 0)`,
        othersProfit: sql<string>`COALESCE(SUM(
          CASE WHEN ${partners.id} IS NOT NULL AND ${partners.leverageRole} = 'external'
               THEN ${invoiceCalculations.netProfitAdmin}::numeric ELSE 0 END), 0)`,
      })
        .from(invoices)
        .innerJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
        .leftJoin(partners, eq(invoices.partnerId, partners.id))
        .where(and(
          sql`${invoices.status} != 'cancelled'`,
          sql`${effectiveDate} BETWEEN ${monthStartStr}::date AND ${monthEndStr}::date`,
        )),

      // 5. Monthly sales — non-cancelled, non-recurring invoices created this month
      db.select({
        draftsCount: sql<string>`COUNT(*)`,
        draftsTotal: sql<string>`COALESCE(SUM(${invoiceCalculations.netProfitAdmin}::numeric), 0)`,
      })
        .from(invoices)
        .innerJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
        .where(and(
          sql`${invoices.status} != 'cancelled'`,
          isNull(invoices.recurringInvoiceId),
          sql`DATE(${invoices.createdAt}) BETWEEN ${monthStartStr}::date AND ${monthEndStr}::date`,
        )),

      // 6. Available years — one row per distinct year found in effective dates
      db.select({
        yr: sql<number>`EXTRACT(YEAR FROM ${effectiveDate})::integer`,
      })
        .from(invoices)
        .groupBy(sql`EXTRACT(YEAR FROM ${effectiveDate})`),
    ]);

    // Unpack SQL results
    const yearlyRevenue     = parseNum(yearlyRows[0]?.revenue     ?? '0');
    const yearlyProfit      = parseNum(yearlyRows[0]?.profit      ?? '0');
    const monthlyReceived   = parseNum(monthlyPaidRows[0]?.profit ?? '0');
    const monthlyExpected   = parseNum(monthlyExpectedRows[0]?.profit ?? '0');
    const monthlyOwnerProfit   = parseNum(String(leverageRows[0]?.ownerProfit   ?? '0'));
    const monthlyManagedProfit = parseNum(String(leverageRows[0]?.managedProfit ?? '0'));
    const monthlyOthersProfit  = parseNum(String(leverageRows[0]?.othersProfit  ?? '0'));
    const draftsCount = parseInt(String(salesRows[0]?.draftsCount ?? '0'), 10);
    const draftsTotal = parseNum(String(salesRows[0]?.draftsTotal ?? '0'));
    const monthlyProfit = monthlyReceived;

    // Net Profit Margin = (Net Profit / Revenue) * 100
    const netProfitMargin = yearlyRevenue > 0 ? (yearlyProfit / yearlyRevenue) * 100 : 0;

    // Плечо за месяц: (делегирование + активы под управлением) / личная работа.
    // Если владелец лично ничего не делал, а числитель есть — это максимальное
    // плечо (только управляет): ratio=0 здесь означал бы «нет данных», поэтому
    // фронт для owner=0 показывает «∞»/«—».
    const leverageNumerator = monthlyOthersProfit + monthlyManagedProfit;
    const leverageRatio = monthlyOwnerProfit > 0 ? leverageNumerator / monthlyOwnerProfit : 0;

    // Available years — ensure current year is always present
    const yearsSet = new Set(availableYearsRows.map(r => r.yr).filter(Boolean));
    if (!yearsSet.has(now.getFullYear())) yearsSet.add(now.getFullYear());
    const availableYears = Array.from(yearsSet).sort((a, b) => b - a);

    // Owner shares: split profit 50/50
    const yearlyOwnerShare  = yearlyProfit / 2;
    const monthlyOwnerShare = monthlyProfit / 2;

    // Get recurring expected for selected month
    const recurringStats = await getRecurringExpectedForMonth(selectedYear, selectedMonth);
    
    return {
      yearlySummary: {
        totalRevenue: yearlyRevenue,
        totalProfit: yearlyProfit,
        netProfitMargin: netProfitMargin,
      },
      monthlyCashFlow: {
        received: monthlyReceived,
        expected: monthlyExpected,
        recurring: recurringStats.monthlyAmount,
      },
      monthlyProfit,
      ownerShares: {
        yearlyKrya: yearlyOwnerShare,
        yearlyKot: yearlyOwnerShare,
        monthlyKrya: monthlyOwnerShare,
        monthlyKot: monthlyOwnerShare,
      },
      monthlySales: {
        draftsCount,
        draftsTotal,
      },
      leverage: {
        othersProfit: monthlyOthersProfit,
        managedProfit: monthlyManagedProfit,
        ownerProfit: monthlyOwnerProfit,
        ratio: leverageRatio,
      },
      recurringExpected: recurringStats,
      selectedYear,
      selectedMonth,
      availableYears,
    };
  }


export async function getClientBudget(db: DB, clientId: string): Promise<Array<{
    invoiceId: string;
    invoiceNumber: string;
    partnerName: string;
    totalBudget: number;
    spent: number;
    remaining: number;
    expenses: Array<{
      description: string;
      amount: number;
      date: string;
    }>;
    serviceType?: 'one_time' | 'periodic';
    periodUnit?: 'month' | 'day';
    pricePerPeriod?: number;
    totalPeriods?: number;
    periodsUsed?: number;
  }>> {
    // Get invoices with calculations for this client
    const clientInvoices = await db
      .select({
        invoice: invoices,
        calculations: invoiceCalculations,
      })
      .from(invoices)
      .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
      .where(
        and(
          eq(invoices.clientId, clientId),
          inArray(invoices.status, ['sent', 'paid'])
        )
      )
      .orderBy(desc(invoices.createdAt));

    // Get partner names
    const partnerIds = [...new Set(clientInvoices.map(i => i.invoice.partnerId).filter(Boolean))];
    const partnerData = partnerIds.length > 0
      ? await db.select().from(partners).where(inArray(partners.id, partnerIds as string[]))
      : [];
    const partnerMap = new Map(partnerData.map(p => [p.id, p.name]));

    // Get expenses for all invoices
    const invoiceIds = clientInvoices.map(i => i.invoice.id);
    const allExpenses = invoiceIds.length > 0
      ? await db.select().from(invoiceExpenses).where(inArray(invoiceExpenses.invoiceId, invoiceIds))
      : [];
    const expensesByInvoice = new Map<string, Array<{ description: string; amount: number; date: string }>>();
    for (const exp of allExpenses) {
      if (!expensesByInvoice.has(exp.invoiceId)) {
        expensesByInvoice.set(exp.invoiceId, []);
      }
      expensesByInvoice.get(exp.invoiceId)!.push({
        description: exp.description || '',
        amount: parseNum(exp.amount),
        date: exp.date || '',
      });
    }

    // Клиенту в «Бюджеты проектов» показываем:
    //   1) Агентские счета (agency_30/40) — реальный бюджет и расходы исполнителя.
    //   2) Периодические счета (любая схема) — оплачено / использовано / осталось
    //      по периодам, БЕЗ списка расходов исполнителя (это «кухня»).
    const result: Array<{
      invoiceId: string;
      invoiceNumber: string;
      partnerName: string;
      totalBudget: number;
      spent: number;
      remaining: number;
      expenses: Array<{ description: string; amount: number; date: string }>;
      serviceType?: 'one_time' | 'periodic';
      periodUnit?: 'month' | 'day';
      pricePerPeriod?: number;
      totalPeriods?: number;
      periodsUsed?: number;
    }> = [];
    for (const row of clientInvoices) {
      const inv = row.invoice;
      const calc = row.calculations;
      const partnerName = inv.partnerId ? partnerMap.get(inv.partnerId) || '—' : '—';
      // Агентские схемы, включая гибкую 'agency' — раскладка открыта клиенту.
      const isOpenCommission = isAgencyScheme(inv.scheme);

      if (inv.serviceType === 'periodic') {
        const price = parseNum(inv.pricePerPeriod ?? '0');
        const total = Number(inv.totalPeriods ?? 0);
        const used  = Math.max(0, Math.min(Number(inv.periodsUsed ?? 0), total));
        if (!Number.isFinite(price) || total < 1) continue;
        result.push({
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber || '',
          partnerName,
          totalBudget: Math.round(price * total * 100) / 100,
          spent: Math.round(price * used * 100) / 100,
          remaining: Math.round(price * (total - used) * 100) / 100,
          expenses: [], // расходы исполнителя клиенту по periodic не показываем
          serviceType: 'periodic',
          periodUnit: (inv.periodUnit ?? 'month') as 'month' | 'day',
          pricePerPeriod: price,
          totalPeriods: total,
          periodsUsed: used,
        });
        continue;
      }

      if (isOpenCommission && calc?.clientBaseAfterMargin) {
        // Только агентские 30%/40% — открытая раскладка с расходами и остатком.
        result.push({
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber || '',
          partnerName,
          totalBudget: parseNum(calc.clientBaseAfterMargin),
          spent: parseNum(calc.executorExpensesTotal),
          remaining: parseNum(calc.clientRemaining),
          expenses: expensesByInvoice.get(inv.id) || [],
        });
      }
      // commission_based / partner_10 / partner_15 (one_time) — клиенту в
      // «Бюджеты проектов» структурно не показываем. Конкретные счета он
      // увидит в списке счетов (сумма + статус), а описания списаний —
      // в детальной карточке без сумм.
    }
    return result;
  }


export async function getClientOverviewBuckets(db: DB, clientId: string, dateFrom?: string, dateTo?: string): Promise<{
    agency: {
      available: number;
      spent: number;
      remaining: number;
      count: number;
      invoices: Array<{
        invoiceId: string;
        invoiceNumber: string;
        status: string;
        bill: number;
        marginRate: number;
        commissionAmount: number;
        budgetAfter: number;
        spent: number;
        remaining: number;
        notes: string | null;
        expenses: Array<{
          id: string;
          description: string;
          amount: number;
          date: string | null;
        }>;
      }>;
    };
    recurring: Array<{
      // 'standalone' = единичный periodic-счёт; 'template' = серия из recurring_invoices
      kind: 'standalone' | 'template';
      key: string;
      invoiceNumber: string;
      description: string;
      partnerName: string;
      unit: 'month' | 'day' | 'hour';
      unitLabel: string;
      unitPrice: number;
      totalUnits: number;
      usedUnits: number;
      remainingUnits: number;
      remainingMoney: number;
      invoices: Array<{
        invoiceId: string;
        invoiceNumber: string;
        status: string;
        bill: number;
        paymentDate: string | null;
        actualPaymentDate: string | null;
        notes: string | null;
      }>;
    }>;
    oneTime: {
      totalCount: number;
      paidCount: number;
      pendingCount: number;
      paidAmount: number;
      pendingAmount: number;
      totalAmount: number;
      invoices: Array<{
        invoiceId: string;
        invoiceNumber: string;
        status: string;
        bill: number;
        paymentDate: string | null;
        actualPaymentDate: string | null;
        notes: string | null;
      }>;
    };
  }> {
    const fromDate = dateFrom ? new Date(dateFrom) : null;
    const toDate = dateTo ? new Date(`${dateTo}T23:59:59.999Z`) : null;

    // Все счета клиента с расчётами.
    const rows = await db
      .select({ invoice: invoices, calculations: invoiceCalculations })
      .from(invoices)
      .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
      .where(eq(invoices.clientId, clientId));

    const inRange = (paymentDate: string | null) => {
      if (!fromDate && !toDate) return true;
      if (!paymentDate) return false;
      const t = new Date(paymentDate).getTime();
      if (Number.isNaN(t)) return false;
      if (fromDate && t < fromDate.getTime()) return false;
      if (toDate && t > toDate.getTime()) return false;
      return true;
    };

    const active = rows.filter(r => r.invoice.status !== 'cancelled' && inRange(r.invoice.paymentDate as any));

    // --- Блок 1: агентские (жёсткие 30/40 + гибкая 'agency') ---
    const agencyRows = active.filter(r => isAgencyScheme(r.invoice.scheme));
    // Подтягиваем затраты по этим счетам одним запросом. ВАЖНО: только для
    // агентских схем. По commission_based/partner — затраты клиенту видны не
    // должны быть никогда (см. видимость в кабинете и в expenses-endpoint).
    const agencyIds = agencyRows.map(r => r.invoice.id);
    const expensesByAgencyInvoice = new Map<string, Array<{
      id: string; description: string; amount: number; date: string | null;
    }>>();
    if (agencyIds.length > 0) {
      const expRows = await db
        .select()
        .from(invoiceExpenses)
        .where(inArray(invoiceExpenses.invoiceId, agencyIds))
        .orderBy(desc(invoiceExpenses.date));
      for (const e of expRows) {
        const list = expensesByAgencyInvoice.get(e.invoiceId) || [];
        list.push({
          id: e.id,
          description: e.description || '',
          amount: parseNum(e.amount),
          date: e.date as any || null,
        });
        expensesByAgencyInvoice.set(e.invoiceId, list);
      }
    }

    let aAvail = 0, aSpent = 0, aRemain = 0;
    const agencyInvoices = agencyRows.map(r => {
      const inv = r.invoice;
      const c = r.calculations;
      const bill = parseNum(c?.clientBill ?? inv.clientBill);
      // Гибкая 'agency': ставка маржи персистится в calc.commissionRate
      // (см. invoiceRepo/financialEngine), запасной путь — маржа/сумма.
      const marginRate = inv.scheme === 'agency'
        ? (parseNum(c?.commissionRate) || (bill > 0 ? Math.round(parseNum(c?.agencyMargin) / bill * 100) : 0))
        : inv.scheme === 'agency_30' ? 30 : 40;
      const commissionAmount = parseNum(c?.agencyMargin ?? bill * (marginRate / 100));
      const budgetAfter = parseNum(c?.clientBaseAfterMargin ?? bill * (1 - marginRate / 100));
      const spent = parseNum(c?.executorExpensesTotal);
      const remaining = parseNum(c?.clientRemaining ?? (budgetAfter - spent));
      aAvail += budgetAfter; aSpent += spent; aRemain += remaining;
      return {
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber || '',
        status: inv.status,
        bill, marginRate, commissionAmount, budgetAfter, spent, remaining,
        notes: inv.clientTitle || null,
        expenses: expensesByAgencyInvoice.get(inv.id) || [],
      };
    });

    // --- Блок 2: регулярные ---
    // Классификатор расширен: счёт попадает в блок 2, если он привязан к
    // шаблону recurring_invoices ИЛИ если у него service_type='periodic'
    // (предоплата за N единиц — месяц/день/час). Без agency.
    const nonAgencyActive = active.filter(r => !isAgencyScheme(r.invoice.scheme));
    const isPeriodicLike = (inv: any) => !!inv.recurringInvoiceId || inv.serviceType === 'periodic';
    const recurringInvoiceRows = nonAgencyActive.filter(r => isPeriodicLike(r.invoice));

    // Считаем «использовано» = COUNT(invoice_expenses) WHERE createdBy
    // принадлежит admin/assistant токенам. Расходы клиента (просмотр) и
    // партнёра не учитываются — единица списывается, только когда работу
    // отметили мы.
    const periodicInvoiceIds = recurringInvoiceRows.map(r => r.invoice.id);
    const usedByInvoice = new Map<string, number>();
    if (periodicInvoiceIds.length > 0) {
      const usageRows = await db
        .select({
          invoiceId: invoiceExpenses.invoiceId,
          cnt: sql<number>`COUNT(*)::int`,
        })
        .from(invoiceExpenses)
        .leftJoin(accessTokens, eq(accessTokens.id, invoiceExpenses.createdBy))
        .where(and(
          inArray(invoiceExpenses.invoiceId, periodicInvoiceIds),
          inArray(accessTokens.role, ['admin', 'assistant']),
        ))
        .groupBy(invoiceExpenses.invoiceId);
      for (const u of usageRows) usedByInvoice.set(u.invoiceId, Number(u.cnt) || 0);
    }

    const unitLabel = (u: string): string => u === 'day' ? 'дн' : u === 'hour' ? 'ч' : 'мес';

    type RecurringInvoiceRow = {
      invoiceId: string; invoiceNumber: string; status: string;
      bill: number; paymentDate: string | null; actualPaymentDate: string | null;
      notes: string | null;
    };
    let recurringBlock: Array<{
      kind: 'standalone' | 'template';
      key: string; invoiceNumber: string; description: string; partnerName: string;
      unit: 'month' | 'day' | 'hour'; unitLabel: string; unitPrice: number;
      totalUnits: number; usedUnits: number;
      remainingUnits: number; remainingMoney: number;
      invoices: RecurringInvoiceRow[];
    }> = [];

    // Партнёры для отображения имён.
    const periodicPartnerIds = Array.from(new Set(recurringInvoiceRows
      .map(r => r.invoice.partnerId)
      .filter((x): x is string => !!x)));
    const partnersByIdMap = new Map<string, string>();
    if (periodicPartnerIds.length > 0) {
      const partnerRows = await db.select().from(partners).where(inArray(partners.id, periodicPartnerIds));
      for (const p of partnerRows) partnersByIdMap.set(p.id, p.name);
    }

    // 2a) Standalone-periodic счета: каждый счёт = одна услуга.
    const standaloneRows = recurringInvoiceRows.filter(r => !r.invoice.recurringInvoiceId && r.invoice.serviceType === 'periodic');
    for (const r of standaloneRows) {
      const inv = r.invoice;
      const total = Number(inv.totalPeriods ?? 0);
      const unit = (inv.periodUnit as 'month' | 'day' | 'hour') || 'month';
      const unitPrice = parseNum(inv.pricePerPeriod);
      if (!Number.isFinite(unitPrice) || total < 1) continue;
      const used = Math.min(total, Math.max(0, usedByInvoice.get(inv.id) ?? Number(inv.periodsUsed ?? 0)));
      const remaining = Math.max(0, total - used);
      const partnerName = inv.partnerId ? (partnersByIdMap.get(inv.partnerId) || '—') : '—';
      recurringBlock.push({
        kind: 'standalone',
        key: inv.id,
        invoiceNumber: inv.invoiceNumber || '',
        description: inv.clientTitle || (inv.invoiceNumber ? `Счёт № ${inv.invoiceNumber}` : '—'),
        partnerName,
        unit,
        unitLabel: unitLabel(unit),
        unitPrice,
        totalUnits: total,
        usedUnits: used,
        remainingUnits: remaining,
        remainingMoney: Math.round(remaining * unitPrice * 100) / 100,
        invoices: [{
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber || '',
          status: inv.status,
          bill: parseNum(r.calculations?.clientBill ?? inv.clientBill),
          paymentDate: inv.paymentDate as any || null,
          actualPaymentDate: inv.actualPaymentDate as any || null,
          notes: inv.clientTitle || null,
        }],
      });
    }

    // 2b) Шаблоны recurring_invoices: серия счетов = одна услуга.
    const recurringIds = Array.from(new Set(recurringInvoiceRows
      .map(r => r.invoice.recurringInvoiceId)
      .filter((x): x is string => !!x)));
    if (recurringIds.length > 0) {
      const templates = await db
        .select({ rec: recurringInvoices, partnerName: partners.name })
        .from(recurringInvoices)
        .leftJoin(partners, eq(recurringInvoices.partnerId, partners.id))
        .where(inArray(recurringInvoices.id, recurringIds));

      const periodsBetween = (start: Date, end: Date, freq: 'monthly' | 'quarterly' | 'yearly'): number => {
        if (end < start) return 0;
        const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
        const dayBonus = end.getDate() >= start.getDate() ? 1 : 0;
        const m = months + dayBonus;
        if (freq === 'monthly')   return Math.max(0, m);
        if (freq === 'quarterly') return Math.max(0, Math.floor(m / 3));
        return Math.max(0, Math.floor(m / 12));
      };

      for (const t of templates) {
        const tpl = t.rec;
        const tplInvoices = recurringInvoiceRows.filter(r => r.invoice.recurringInvoiceId === tpl.id);
        // «Использовано» по шаблону = сумма расходов админа/ассистента
        // по всем привязанным счетам.
        const usedUnits = tplInvoices.reduce((s, r) => s + (usedByInvoice.get(r.invoice.id) ?? 0), 0);
        const startD = new Date(tpl.startDate);
        const endD = tpl.endDate ? new Date(tpl.endDate) : null;
        const unitPrice = parseNum(tpl.amount);
        const freq = tpl.frequency as 'monthly' | 'quarterly' | 'yearly';
        // У шаблона нет явной единицы потребления (frequency — это период
        // выставления, а не списания). Мап по дефолту: монтли→month и т.д.
        const unit: 'month' | 'day' | 'hour' = freq === 'monthly' ? 'month' : freq === 'quarterly' ? 'month' : 'month';
        const totalUnits = endD ? periodsBetween(startD, endD, freq) : 0;
        const remainingUnits = endD ? Math.max(0, totalUnits - usedUnits) : 0;
        const matchedInvoice = tplInvoices[0];

        const invoiceList: RecurringInvoiceRow[] = tplInvoices
          .sort((a, b) => {
            const ad = a.invoice.paymentDate ? new Date(a.invoice.paymentDate).getTime() : 0;
            const bd = b.invoice.paymentDate ? new Date(b.invoice.paymentDate).getTime() : 0;
            return bd - ad;
          })
          .map(r => ({
            invoiceId: r.invoice.id,
            invoiceNumber: r.invoice.invoiceNumber || '',
            status: r.invoice.status,
            bill: parseNum(r.calculations?.clientBill ?? r.invoice.clientBill),
            paymentDate: r.invoice.paymentDate as any || null,
            actualPaymentDate: r.invoice.actualPaymentDate as any || null,
            notes: r.invoice.clientTitle || null,
          }));

        recurringBlock.push({
          kind: 'template',
          key: tpl.id,
          invoiceNumber: matchedInvoice?.invoice.invoiceNumber || '',
          description: matchedInvoice?.invoice.clientTitle || tpl.description || '—',
          partnerName: t.partnerName || '—',
          unit,
          unitLabel: unitLabel(unit),
          unitPrice,
          totalUnits,
          usedUnits,
          remainingUnits,
          remainingMoney: Math.round(remainingUnits * unitPrice * 100) / 100,
          invoices: invoiceList,
        });
      }
    }

    // --- Блок 3: разовые (НЕ periodic-like) ---
    const oneTimeRows = nonAgencyActive.filter(r => !isPeriodicLike(r.invoice));
    let paidCount = 0, pendingCount = 0, paidAmount = 0, pendingAmount = 0;
    const oneTimeInvoices = oneTimeRows
      .slice()
      .sort((a, b) => {
        // Сначала непогашенные (sent/draft), потом по убыванию paymentDate.
        const aPaid = a.invoice.status === 'paid' ? 1 : 0;
        const bPaid = b.invoice.status === 'paid' ? 1 : 0;
        if (aPaid !== bPaid) return aPaid - bPaid;
        const ad = a.invoice.paymentDate ? new Date(a.invoice.paymentDate).getTime() : 0;
        const bd = b.invoice.paymentDate ? new Date(b.invoice.paymentDate).getTime() : 0;
        return bd - ad;
      })
      .map(r => {
        const bill = parseNum(r.calculations?.clientBill ?? r.invoice.clientBill);
        if (r.invoice.status === 'paid') { paidCount++; paidAmount += bill; }
        else                              { pendingCount++; pendingAmount += bill; }
        return {
          invoiceId: r.invoice.id,
          invoiceNumber: r.invoice.invoiceNumber || '',
          status: r.invoice.status,
          bill,
          paymentDate: r.invoice.paymentDate as any || null,
          actualPaymentDate: r.invoice.actualPaymentDate as any || null,
          notes: r.invoice.clientTitle || null,
        };
      });

    return {
      agency: {
        available: aAvail,
        spent: aSpent,
        remaining: aRemain,
        count: agencyInvoices.length,
        invoices: agencyInvoices,
      },
      recurring: recurringBlock,
      oneTime: {
        totalCount: oneTimeRows.length,
        paidCount,
        pendingCount,
        paidAmount,
        pendingAmount,
        totalAmount: paidAmount + pendingAmount,
        invoices: oneTimeInvoices,
      },
    };
  }


export async function getPartnerInvoicesDetail(db: DB, partnerId: string): Promise<Array<{
    id: string;
    invoice_number: string | null;
    client_name: string;
    client_bill: number;
    partner_commission: number;
    debt_to_admin: number;
    paid_amount: number;
    remaining: number;
    status: string;
    created_at: string;
  }>> {
    // Get invoices with calculations for this partner
    const partnerInvoices = await db
      .select({
        invoice: invoices,
        calculations: invoiceCalculations,
      })
      .from(invoices)
      .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
      .where(eq(invoices.partnerId, partnerId))
      .orderBy(desc(invoices.createdAt));

    // Get client names
    const clientIds = [...new Set(partnerInvoices.map(i => i.invoice.clientId).filter(Boolean))];
    const clientData = clientIds.length > 0
      ? await db.select().from(clients).where(inArray(clients.id, clientIds as string[]))
      : [];
    const clientMap = new Map(clientData.map(c => [c.id, c.name]));

    // Get payments by invoice
    const invoiceIds = partnerInvoices.map(i => i.invoice.id);
    const paymentsData = invoiceIds.length > 0
      ? await db.select().from(partnerPayments).where(inArray(partnerPayments.invoiceId, invoiceIds))
      : [];
    const paymentsByInvoice = new Map<string, number>();
    for (const p of paymentsData) {
      if (p.invoiceId) {
        const current = paymentsByInvoice.get(p.invoiceId) || 0;
        paymentsByInvoice.set(p.invoiceId, current + parseNum(p.amount));
      }
    }

    return partnerInvoices
      .map(row => {
        const calc = row.calculations;
        const clientBill = parseNum(calc?.clientBill);
        const partnerCommission = parseNum(calc?.commissionAmount) || parseNum(calc?.partnerShareFromMargin);
        const storedDebt = parseNum(calc?.partnerTransferDue);
        const debtToAdmin = Math.max(0, storedDebt);
        const paidAmount = paymentsByInvoice.get(row.invoice.id) || 0;
        const remaining = Math.max(0, debtToAdmin - paidAmount);

        return {
          id: row.invoice.id,
          invoice_number: row.invoice.invoiceNumber,
          client_name: row.invoice.clientId ? clientMap.get(row.invoice.clientId) || 'Клиент' : 'Клиент',
          client_bill: clientBill,
          partner_commission: partnerCommission,
          debt_to_admin: debtToAdmin,
          paid_amount: paidAmount,
          remaining,
          status: row.invoice.status,
          created_at: row.invoice.createdAt || '',
        };
      })
      .filter(inv => inv.remaining > 0);
  }


export async function getPartnerDebtDetails(db: DB, partnerId: string): Promise<{
    summary: {
      totalDebt: number;
      totalPaid: number;
      remainingDebt: number;
      invoiceCount: number;
    };
    invoices: Array<{
      id: string;
      invoiceNumber: string;
      scheme: string;
      clientBill: number;
      partnerCommission: number;
      amountToAdmin: number;
      expensesByPartner: number;
      expensesByAdmin: number;
    }>;
    payments: Array<{
      id: string;
      amount: string;
      paymentDate: string;
      notes: string | null;
      invoiceNumber: string | null;
    }>;
  }> {
    // Get partner's paid invoices
    const partnerInvoices = await db
      .select({
        invoice: invoices,
        calculations: invoiceCalculations,
      })
      .from(invoices)
      .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
      .where(and(
        eq(invoices.partnerId, partnerId),
        eq(invoices.status, 'paid')
      ));
    
    // Get all expenses for these invoices
    const allExpenses = await db.select().from(invoiceExpenses);
    const expensesByInvoice = new Map<string, { byPartner: number; byAdmin: number }>();
    
    for (const exp of allExpenses) {
      if (!expensesByInvoice.has(exp.invoiceId)) {
        expensesByInvoice.set(exp.invoiceId, { byPartner: 0, byAdmin: 0 });
      }
      const amounts = expensesByInvoice.get(exp.invoiceId)!;
      const amount = parseNum(exp.amount);
      if (exp.paidByAdmin) {
        amounts.byAdmin += amount;
      } else {
        amounts.byPartner += amount;
      }
    }
    
    // Get partner payments
    const partnerPaymentsList = await db
      .select()
      .from(partnerPayments)
      .where(eq(partnerPayments.partnerId, partnerId))
      .orderBy(partnerPayments.paymentDate);
    
    // Calculate totals using stored partnerTransferDue values (single source of truth)
    let totalDebt = 0;
    const invoiceDetails: Array<{
      id: string;
      invoiceNumber: string;
      scheme: string;
      clientBill: number;
      partnerCommission: number;
      amountToAdmin: number;
      expensesByPartner: number;
      expensesByAdmin: number;
    }> = [];
    
    for (const row of partnerInvoices) {
      if (!row.calculations) continue;
      
      const scheme = row.invoice.scheme;
      const cBill = parseNum(row.calculations.clientBill);
      const expenses = expensesByInvoice.get(row.invoice.id) || { byPartner: 0, byAdmin: 0 };
      
      // Use stored values as single source of truth
      const storedDebt = parseNum(row.calculations.partnerTransferDue);
      const partnerCommission = parseNum(row.calculations.commissionAmount);
      const debt = Math.max(0, storedDebt);
      
      totalDebt += debt;
      
      invoiceDetails.push({
        id: row.invoice.id,
        invoiceNumber: row.invoice.invoiceNumber,
        scheme: scheme,
        clientBill: cBill,
        partnerCommission,
        amountToAdmin: debt,
        expensesByPartner: expenses.byPartner,
        expensesByAdmin: expenses.byAdmin,
      });
    }
    
    // Calculate total paid
    const totalPaid = partnerPaymentsList.reduce((sum, p) => sum + parseNum(p.amount), 0);
    
    // Map payments with invoice numbers
    const paymentDetails = await Promise.all(
      partnerPaymentsList.map(async (p) => {
        let invoiceNumber: string | null = null;
        if (p.invoiceId) {
          const inv = await db.select({ invoiceNumber: invoices.invoiceNumber })
            .from(invoices)
            .where(eq(invoices.id, p.invoiceId))
            .limit(1);
          invoiceNumber = inv[0]?.invoiceNumber || null;
        }
        return {
          id: p.id,
          amount: p.amount,
          paymentDate: p.paymentDate,
          notes: p.notes,
          invoiceNumber,
        };
      })
    );
    
    const balance = totalDebt - totalPaid;
    return {
      summary: {
        totalDebt,
        totalPaid,
        remainingDebt: Math.max(0, balance),
        overpayment: balance < 0 ? Math.abs(balance) : 0,
        invoiceCount: invoiceDetails.length,
      },
      invoices: invoiceDetails,
      payments: paymentDetails,
    };
  }

export async function getDashboardInvoices(db: DB, year: number, month: number, category: 'received' | 'expected' | 'drafts' | 'overdue' | 'drafts_no_date'): Promise<DashboardInvoiceDetail[]> {
  // Провал-списки дашборда. Раньше метод грузил ВСЕ счета и фильтровал в JS —
  // при росте базы каждый клик по карточке = полная выборка. Теперь фильтр в
  // WHERE; семантика категорий 1:1 с getAdminDashboardStats (эффективная дата =
  // paymentDate, иначе DATE(createdAt)).
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = new Date(year, month + 1, 0).getDate();
  const monthStartStr = `${year}-${pad(month + 1)}-01`;
  const monthEndStr   = `${year}-${pad(month + 1)}-${pad(lastDay)}`;
  const effectiveDate = sql`COALESCE(${invoices.paymentDate}, DATE(${invoices.createdAt}))`;
  const inMonth = sql`${effectiveDate} BETWEEN ${monthStartStr}::date AND ${monthEndStr}::date`;

  let where;
  switch (category) {
    case 'received': // оплаченные месяца
      where = and(eq(invoices.status, 'paid'), inMonth); break;
    case 'expected': // ожидаемые месяца (не оплачены, не отменены)
      where = and(sql`${invoices.status} NOT IN ('paid', 'cancelled')`, inMonth); break;
    case 'drafts':   // продажи месяца: неотменённые, нерекуррентные, созданы в месяце
      where = and(
        sql`${invoices.status} != 'cancelled'`,
        isNull(invoices.recurringInvoiceId),
        sql`DATE(${invoices.createdAt}) BETWEEN ${monthStartStr}::date AND ${monthEndStr}::date`,
      ); break;
    case 'overdue':  // долги к сбору «как сейчас» (месяц игнорируется)
      where = and(
        eq(invoices.status, 'sent'),
        isNull(invoices.actualPaymentDate),
        isNotNull(invoices.paymentDate),
        sql`${invoices.paymentDate} < CURRENT_DATE`,
      ); break;
    case 'drafts_no_date': // черновики без плановой даты (месяц игнорируется)
      where = and(eq(invoices.status, 'draft'), isNull(invoices.paymentDate)); break;
  }

  const rows = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      status: invoices.status,
      paymentDate: invoices.paymentDate,
      createdAt: invoices.createdAt,
      clientName: clients.name,
      netProfitAdmin: invoiceCalculations.netProfitAdmin,
      clientBill: invoiceCalculations.clientBill,
    })
    .from(invoices)
    // innerJoin = прежнее `if (!row.calculations) continue`
    .innerJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
    .leftJoin(clients, eq(invoices.clientId, clients.id))
    .where(where);

  const useEffective = category === 'received' || category === 'expected';
  return rows
    .map((r) => ({
      id: r.id,
      invoiceNumber: r.invoiceNumber || `INV-${r.id}`,
      clientName: r.clientName,
      netProfitAdmin: parseNum(r.netProfitAdmin),
      clientBill: parseNum(r.clientBill),
      status: r.status,
      paymentDate: category === 'drafts' || category === 'drafts_no_date'
        ? null
        : (useEffective ? (r.paymentDate ?? r.createdAt)?.toString() ?? null : r.paymentDate?.toString() ?? null),
    }))
    .sort((a, b) => b.netProfitAdmin - a.netProfitAdmin);
}
