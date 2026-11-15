import Decimal from "decimal.js";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { parseNum } from "../../shared/financialEngine";
import { clients, invoiceCalculations, invoices, partners } from "../../shared/schema";
import { db as _db } from "../db";
import type { DashboardInvoiceDetail, MonthlyData } from "../storage";
import { getAssistantBonusAccrued } from "./actsRepo";
import { splitShares } from "./ownerLedgerRepo";

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

  const rows = await db.execute<{ month: number; sales: string; profit: string; expenses: string; count: number }>(sql`
    SELECT extract(month FROM coalesce(i.actual_payment_date, i.payment_date))::int AS month,
      sum(c.client_bill) AS sales, sum(c.net_profit_admin) AS profit,
      sum(coalesce(c.executor_expenses_total, 0)) AS expenses, count(*)::int AS count
    FROM invoices i JOIN invoice_calculations c ON c.invoice_id = i.id
    WHERE i.status = 'paid' AND coalesce(i.actual_payment_date, i.payment_date) >= make_date(${year}, 1, 1)
      AND coalesce(i.actual_payment_date, i.payment_date) < make_date(${year + 1}, 1, 1)
    GROUP BY 1
  `);
  for (const row of rows.rows) {
    Object.assign(monthlyData[row.month - 1], {
      totalSales: parseNum(row.sales), totalProfit: parseNum(row.profit),
      expenses: parseNum(row.expenses), invoiceCount: row.count
    });
  }

  return monthlyData;
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
  // Доли 50/50 по чистой прибыли оплаченных счетов периода, как "Переводы Коту и себе".
  ownerShares: {
    yearlyKrya: number;
    yearlyKot: number;
    monthlyKrya: number;
    monthlyKot: number;
    yearlyKryaAfterAssistants: number;
    monthlyKryaAfterAssistants: number;
  };
  // Бонусы ассистенту за период: Кря платит их с личного счета, прибыль не меняют.
  assistantBonus: {
    yearly: number;
    monthly: number;
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
  const monthEndStr = `${selectedYear}-${pad(selectedMonth + 1)}-${pad(lastDayOfMonth)}`;
  const yearStartStr = `${selectedYear}-01-01`;
  const yearEndStr = `${selectedYear}-12-31`;

  // Эффективная дата денег: СНАЧАЛА фактическая оплата (когда деньги реально
  // пришли), затем плановая дата, затем дата создания. Порядок важен: счёт,
  // выставленный на июль и оплаченный в августе, — августовские деньги.
  // Раньше факт игнорировался, и карточка месяца расходилась с «Годовой
  // сводкой» (getAdminMonthlyData всегда считала по факту).
  const effectiveDate = sql`COALESCE(${invoices.actualPaymentDate}, ${invoices.paymentDate}, DATE(${invoices.createdAt}))`;

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
      profit: sql<string>`COALESCE(SUM(${invoiceCalculations.netProfitAdmin}::numeric), 0)`,
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
  const yearlyRevenue = parseNum(yearlyRows[0]?.revenue ?? '0');
  const yearlyProfit = parseNum(yearlyRows[0]?.profit ?? '0');
  const monthlyReceived = parseNum(monthlyPaidRows[0]?.profit ?? '0');
  const monthlyExpected = parseNum(monthlyExpectedRows[0]?.profit ?? '0');
  const monthlyOwnerProfit = parseNum(String(leverageRows[0]?.ownerProfit ?? '0'));
  const monthlyManagedProfit = parseNum(String(leverageRows[0]?.managedProfit ?? '0'));
  const monthlyOthersProfit = parseNum(String(leverageRows[0]?.othersProfit ?? '0'));
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

  // Get recurring expected for selected month
  const recurringStats = await getRecurringExpectedForMonth(selectedYear, selectedMonth);
  const [yearlyAssistantBonus, monthlyAssistantBonus] = await Promise.all([
    getAssistantBonusAccrued(db, yearStartStr, yearEndStr),
    getAssistantBonusAccrued(db, monthStartStr, monthEndStr),
  ]);

  // Доли 50/50 по чистой прибыли оплаченных счетов: Кря с округлением до копеек, Коту остаток.
  const yearlyShares = splitShares(new Decimal(yearlyRows[0]?.profit ?? 0));
  const monthlyShares = splitShares(new Decimal(monthlyPaidRows[0]?.profit ?? 0));

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
      yearlyKrya: yearlyShares.krya.toNumber(),
      yearlyKot: yearlyShares.kot.toNumber(),
      monthlyKrya: monthlyShares.krya.toNumber(),
      monthlyKot: monthlyShares.kot.toNumber(),
      yearlyKryaAfterAssistants: yearlyShares.krya.minus(yearlyAssistantBonus).toNumber(),
      monthlyKryaAfterAssistants: monthlyShares.krya.minus(monthlyAssistantBonus).toNumber(),
    },
    assistantBonus: {
      yearly: yearlyAssistantBonus,
      monthly: monthlyAssistantBonus,
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



export async function getDashboardInvoices(db: DB, year: number, month: number, category: 'received' | 'expected' | 'drafts' | 'overdue' | 'drafts_no_date'): Promise<DashboardInvoiceDetail[]> {
  // Провал-списки дашборда. Раньше метод грузил ВСЕ счета и фильтровал в JS —
  // при росте базы каждый клик по карточке = полная выборка. Теперь фильтр в
  // WHERE; семантика категорий 1:1 с getAdminDashboardStats (эффективная дата =
  // фактическая оплата, иначе плановая, иначе DATE(createdAt)).
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = new Date(year, month + 1, 0).getDate();
  const monthStartStr = `${year}-${pad(month + 1)}-01`;
  const monthEndStr = `${year}-${pad(month + 1)}-${pad(lastDay)}`;
  const effectiveDate = sql`COALESCE(${invoices.actualPaymentDate}, ${invoices.paymentDate}, DATE(${invoices.createdAt}))`;
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
      actualPaymentDate: invoices.actualPaymentDate,
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
  // «Продажи месяца» — это лента заключённых сделок: сверху свежая. По прибыли
  // новая продажа с маленьким чеком уезжала в самый низ списка и не попадалась
  // владельцу на глаза (кейс 12082026). Денежные категории остаются по прибыли.
  const byCreatedDesc = category === 'drafts' || category === 'drafts_no_date';
  const sorted = [...rows].sort((a, b) => byCreatedDesc
    ? (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)
    : parseNum(b.netProfitAdmin) - parseNum(a.netProfitAdmin));

  return sorted
    .map((r) => ({
      id: r.id,
      invoiceNumber: r.invoiceNumber || `INV-${r.id}`,
      clientName: r.clientName,
      netProfitAdmin: parseNum(r.netProfitAdmin),
      clientBill: parseNum(r.clientBill),
      status: r.status,
      // В списках месяца показываем ту же дату, по которой счёт в него попал,
      // — иначе счёт из августа подписан июльским плановым сроком.
      paymentDate: category === 'drafts' || category === 'drafts_no_date'
        ? null
        : (useEffective
          ? (r.actualPaymentDate ?? r.paymentDate ?? r.createdAt)?.toString() ?? null
          : r.paymentDate?.toString() ?? null),
    }));
}
