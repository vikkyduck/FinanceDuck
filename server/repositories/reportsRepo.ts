/**
 * reportsRepo — вынесено из God-объекта storage.ts (тот же паттерн, что dashboardRepo).
 * Функции принимают db параметром → тестируются против PGlite.
 */
import { eq, and, or, gte, lte, desc, asc, sql, inArray, isNull, isNotNull } from "drizzle-orm";
import { db as _db } from "../db";
import {
  invoices, invoiceCalculations, invoiceExpenses, invoiceTransfers, partnerPayments,
  partners, clients, recurringInvoices, monthlyFinancialPlans, signedActs, accessTokens,
  assistantBonusPayments,
} from "../../shared/schema";
import { parseNum, isAgencyScheme, AGENCY_SCHEMES } from "../../shared/financialEngine";
import type { ClientLTVData, MonthInvoiceDetail, DraftsStats } from "../storage";

type DB = typeof _db;

export async function getExpectedAdminProfit(db: DB): Promise<{
  partnerId: string;
  partnerName: string;
  totalExpectedProfit: number;
  invoiceCount: number;
  invoices: {
    id: string;
    number: string;
    clientName: string | null;
    clientBill: number;
    netProfitAdmin: number;
    scheme: string;
    createdAt: Date | null;
  }[];
}[]> {
  // Get all UNPAID invoices (status = 'sent' or 'draft') with calculations
  const conditions = [
    inArray(invoices.status, ['sent', 'draft'])
  ];
  
  const unpaidInvoices = await db
    .select({
      invoice: invoices,
      calculations: invoiceCalculations,
      partnerName: partners.name,
      clientName: clients.name,
    })
    .from(invoices)
    .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
    .leftJoin(partners, eq(invoices.partnerId, partners.id))
    .leftJoin(clients, eq(invoices.clientId, clients.id))
    .where(and(...conditions));

  const partnerMap = new Map<string, {
    partnerId: string;
    partnerName: string;
    totalExpectedProfit: number;
    invoiceCount: number;
    invoices: {
      id: string;
      number: string;
      clientName: string | null;
      clientBill: number;
      netProfitAdmin: number;
      scheme: string;
      createdAt: Date | null;
    }[];
  }>();

  for (const row of unpaidInvoices) {
    if (!row.calculations) continue;

    const pId = row.invoice.partnerId || 'no-partner';
    const partnerName = row.partnerName || 'Без партнёра';
    const clientBill = parseNum(row.calculations.clientBill);
    const netProfitAdmin = parseNum(row.calculations.netProfitAdmin);
    const scheme = row.invoice.scheme || 'commission_based';
    
    if (netProfitAdmin <= 0) continue;
    
    if (!partnerMap.has(pId)) {
      partnerMap.set(pId, {
        partnerId: pId,
        partnerName,
        totalExpectedProfit: 0,
        invoiceCount: 0,
        invoices: [],
      });
    }

    const summary = partnerMap.get(pId)!;
    summary.totalExpectedProfit += netProfitAdmin;
    summary.invoiceCount += 1;
    summary.invoices.push({
      id: row.invoice.id,
      number: row.invoice.invoiceNumber || `INV-${row.invoice.id}`,
      clientName: row.clientName,
      clientBill,
      netProfitAdmin,
      scheme,
      createdAt: row.invoice.createdAt,
    });
  }

  return Array.from(partnerMap.values())
    .map(s => ({
      ...s,
      invoices: s.invoices.sort((a, b) => {
        if (!a.createdAt || !b.createdAt) return 0;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }),
    }))
    .filter(s => s.totalExpectedProfit > 0)
    .sort((a, b) => b.totalExpectedProfit - a.totalExpectedProfit);
}

export async function getDraftsStats(db: DB): Promise<DraftsStats> {
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  
  const draftInvoices = await db
    .select({
      invoice: invoices,
      calculations: invoiceCalculations,
    })
    .from(invoices)
    .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
    .where(eq(invoices.status, 'draft'));
  
  let totalDrafts = 0;
  let totalDraftAmount = 0;
  let currentMonthDrafts = 0;
  let currentMonthAmount = 0;
  let fromRecurring = 0;
  let fromRecurringAmount = 0;
  
  for (const row of draftInvoices) {
    const clientBill = parseNum(row.calculations?.clientBill);
    const issueDate = row.invoice.issueDate ? new Date(row.invoice.issueDate) : null;
    
    totalDrafts++;
    totalDraftAmount += clientBill;
    
    if (issueDate && issueDate >= currentMonthStart && issueDate < nextMonthStart) {
      currentMonthDrafts++;
      currentMonthAmount += clientBill;
    }
    
    if (row.invoice.recurringInvoiceId) {
      fromRecurring++;
      fromRecurringAmount += clientBill;
    }
  }
  
  return {
    totalDrafts,
    totalDraftAmount,
    currentMonthDrafts,
    currentMonthAmount,
    fromRecurring,
    fromRecurringAmount,
  };
}

export async function getClientLTV(db: DB, year?: number): Promise<{ data: ClientLTVData[]; availableYears: number[] }> {
  // Get all invoices with client info and calculations
  // LTV = чистая прибыль админа (netProfitAdmin) от клиента
  const allInvoices = await db
    .select({
      invoice: invoices,
      calculations: invoiceCalculations,
      clientName: clients.name,
    })
    .from(invoices)
    .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
    .leftJoin(clients, eq(invoices.clientId, clients.id))
    .where(isNotNull(invoices.clientId));

  // Collect available years from paid invoices (use paymentDate with fallback to createdAt)
  const yearsSet = new Set<number>();
  for (const row of allInvoices) {
    if (row.invoice.status === 'paid') {
      const dateStr = row.invoice.paymentDate || row.invoice.createdAt;
      if (dateStr) {
        yearsSet.add(new Date(dateStr).getFullYear());
      }
    }
  }
  const availableYears = Array.from(yearsSet).sort((a, b) => b - a);

  // Filter by year if specified
  let yearStart: Date | null = null;
  let yearEnd: Date | null = null;
  if (year !== undefined) {
    yearStart = new Date(year, 0, 1);
    yearEnd = new Date(year, 11, 31, 23, 59, 59);
  }

  const clientMap = new Map<string, ClientLTVData>();

  for (const row of allInvoices) {
    if (!row.invoice.clientId) continue;

    const clientId = row.invoice.clientId;
    const clientName = row.clientName || 'Неизвестный клиент';
    const adminProfit = parseNum(row.calculations?.netProfitAdmin);
    const isPaid = row.invoice.status === 'paid';
    const isSent = row.invoice.status === 'sent';

    // For year filter, get payment date with fallback
    const paymentDateStr = row.invoice.paymentDate || row.invoice.createdAt;
    const paymentDate = paymentDateStr ? new Date(paymentDateStr) : null;

    // When year filter is applied, skip paid invoices outside the year entirely
    if (year !== undefined && yearStart && yearEnd && isPaid) {
      if (!paymentDate || paymentDate < yearStart || paymentDate > yearEnd) {
        continue; // Skip this invoice completely
      }
    }

    if (!clientMap.has(clientId)) {
      clientMap.set(clientId, {
        client_id: clientId,
        client_name: clientName,
        total_invoices: 0,
        paid_invoices: 0,
        total_admin_profit: 0,
        potential_profit: 0,
      });
    }

    const client = clientMap.get(clientId)!;
    client.total_invoices += 1;

    if (isPaid) {
      client.paid_invoices += 1;
      client.total_admin_profit += adminProfit;
    } else if (isSent) {
      // Потенциальная прибыль - не фильтруем по году, если год не указан
      // При фильтре по году показываем только текущие ожидающие счета
      client.potential_profit += adminProfit;
    }
  }

  // Filter out clients with no activity in the selected period
  let data = Array.from(clientMap.values());
  if (year !== undefined) {
    // When filtering by year, only show clients with paid invoices or potential profit
    data = data.filter(c => c.paid_invoices > 0 || c.potential_profit > 0);
  }

  // Sort by total_admin_profit (realized profit)
  data.sort((a, b) => b.total_admin_profit - a.total_admin_profit);
  
  return { data, availableYears };
}

export async function getInvoicesByMonth(db: DB, month: number, year: number, type?: string): Promise<MonthInvoiceDetail[]> {
  // Get invoices for a specific month - for expandable month rows
  const startDateStr = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 0); // Last day of month
  const endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
  
  // For forecast type, we need to include sent invoices that may not have paymentDate
  // For paid invoices: use actualPaymentDate first, then paymentDate (matches dashboard logic)
  // For sent invoices: use plannedPaymentDate, paymentDate, or issueDate as fallback
  const results = await db
    .select({
      invoice: invoices,
      calculations: invoiceCalculations,
      clientName: clients.name,
    })
    .from(invoices)
    .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
    .leftJoin(clients, eq(invoices.clientId, clients.id))
    .where(
      type === 'forecast' 
        ? and(
            or(eq(invoices.status, 'sent'), eq(invoices.status, 'paid')),
            sql`COALESCE(${invoices.actualPaymentDate}::date, ${invoices.paymentDate}::date, ${invoices.issueDate}::date) >= ${startDateStr}::date`,
            sql`COALESCE(${invoices.actualPaymentDate}::date, ${invoices.paymentDate}::date, ${invoices.issueDate}::date) <= ${endDateStr}::date`
          )
        : and(
            eq(invoices.status, 'paid'),
            sql`COALESCE(${invoices.actualPaymentDate}::date, ${invoices.paymentDate}::date) >= ${startDateStr}::date`,
            sql`COALESCE(${invoices.actualPaymentDate}::date, ${invoices.paymentDate}::date) <= ${endDateStr}::date`
          )
    );
  
  return results.map(row => ({
    id: row.invoice.id,
    invoiceNumber: row.invoice.invoiceNumber,
    clientName: row.clientName,
    clientBill: parseNum(row.calculations?.clientBill),
    netProfitAdmin: parseNum(row.calculations?.netProfitAdmin),
    status: row.invoice.status,
    paymentDate: row.invoice.paymentDate,
    isExpected: row.invoice.status === 'sent',
    isPaid: row.invoice.status === 'paid',
  }));
}

export async function getClientAgency30Report(db: DB, clientId: string): Promise<{
  total_paid: number;
  agency_margin: number;
  client_budget_70: number;
  total_spent: number;
  remaining_budget: number;
}> {
  // Get agency scheme invoices (agency_30/40 + гибкая 'agency') for this client
  const agencyInvoices = await db
    .select({
      calculations: invoiceCalculations,
    })
    .from(invoices)
    .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
    .where(
      and(
        eq(invoices.clientId, clientId),
        inArray(invoices.scheme, [...AGENCY_SCHEMES])
      )
    );

  let totalPaid = 0;
  let agencyMargin = 0;
  let clientBudget = 0;
  let totalSpent = 0;
  let remainingBudget = 0;

  for (const row of agencyInvoices) {
    if (!row.calculations) continue;
    totalPaid += parseNum(row.calculations.clientBill);
    agencyMargin += parseNum(row.calculations.agencyMargin);
    clientBudget += parseNum(row.calculations.clientBaseAfterMargin);
    totalSpent += parseNum(row.calculations.clientSpent);
    remainingBudget += parseNum(row.calculations.clientRemaining);
  }

  return {
    total_paid: totalPaid,
    agency_margin: agencyMargin,
    client_budget_70: clientBudget,
    total_spent: totalSpent,
    remaining_budget: remainingBudget,
  };
}
