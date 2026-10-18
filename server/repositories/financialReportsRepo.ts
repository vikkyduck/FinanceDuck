/** Scoped financial read models. Actor is mandatory, including for administrators. */
import Decimal from 'decimal.js';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { db as database } from '../db';
import type { InvoiceActor } from '../invoiceAccess';
import { invoiceScope } from '../invoiceQuery';
import { invoices, invoiceCalculations, invoiceExpenses, invoiceTransfers, partners, clients } from '../../shared/schema';
import { parseNum, isAgencyScheme, AGENCY_SCHEMES } from '../../shared/financialEngine';
import { INVOICE_SCHEMES } from '../../shared/domainTypes';
type DB = typeof database;
const PARTNER_SCHEMES = INVOICE_SCHEMES.filter(scheme => !isAgencyScheme(scheme));
const addMoney = (a: number, b: number) => new Decimal(a).plus(b).toNumber();

export async function getExpectedCommission(db: DB, actor: InvoiceActor): Promise<{
  partnerId: string;
  partnerName: string;
  totalExpectedCommission: number;
  invoiceCount: number;
  invoices: {
    id: string;
    number: string;
    clientName: string | null;
    clientBill: number;
    commission: number;
    scheme: string;
    createdAt: Date | null;
  }[];
}[]> {
  // Get all UNPAID invoices (status = 'sent') for partner schemes
  const conditions = [invoiceScope(actor),
    inArray(invoices.scheme, INVOICE_SCHEMES),
    eq(invoices.status, 'sent')
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
    totalExpectedCommission: number;
    invoiceCount: number;
    invoices: {
      id: string;
      number: string;
      clientName: string | null;
      clientBill: number;
      commission: number;
      scheme: string;
      createdAt: Date | null;
    }[];
  }>();

  for (const row of unpaidInvoices) {
    if (!row.invoice.partnerId || !row.calculations) continue;

    const pId = row.invoice.partnerId;
    const partnerName = row.partnerName || 'Unknown';
    const clientBill = parseNum(row.calculations.clientBill);
    const scheme = row.invoice.scheme || 'commission_based';
    
    // Calculate commission based on scheme
    let commission = 0;
    if (isAgencyScheme(scheme)) {
      // For agency schemes (включая гибкую 'agency'): partner gets partnerShareFromMargin
      commission = parseNum(row.calculations.partnerShareFromMargin);
    } else {
      // For partner_10, partner_15, commission_based: use commissionAmount
      commission = parseNum(row.calculations.commissionAmount);
    }
    
    if (commission <= 0) continue;
    
    if (!partnerMap.has(pId)) {
      partnerMap.set(pId, {
        partnerId: pId,
        partnerName,
        totalExpectedCommission: 0,
        invoiceCount: 0,
        invoices: [],
      });
    }

    const summary = partnerMap.get(pId)!;
    summary.totalExpectedCommission = addMoney(summary.totalExpectedCommission, commission);
    summary.invoiceCount = addMoney(summary.invoiceCount, 1);
    summary.invoices.push({
      id: row.invoice.id,
      number: row.invoice.invoiceNumber || `INV-${row.invoice.id}`,
      clientName: row.clientName,
      clientBill,
      commission,
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
    .filter(s => s.totalExpectedCommission > 0)
    .sort((a, b) => b.totalExpectedCommission - a.totalExpectedCommission);
}

export async function getDoNotSpendData(db: DB, actor: InvoiceActor): Promise<{
  clientId: string;
  clientName: string;
  totalBudget: number;
  totalSpent: number;
  remaining: number;
  invoiceCount: number;
  invoices: {
    id: string;
    number: string;
    description: string | null;
    notes: string | null;
    budget: number;
    spent: number;
    remaining: number;
    createdAt: Date | null;
  }[];
}[]> {
  const conditions = [invoiceScope(actor),
    inArray(invoices.scheme, [...AGENCY_SCHEMES]),
    eq(invoices.status, 'paid')
  ];
  

  
  const agencyInvoices = await db
    .select({
      invoice: invoices,
      calculations: invoiceCalculations,
      clientName: clients.name,
      // Переносы бюджета между счетами: без них «доступно» врёт, а итог
      // расходится с кабинетом клиента (перенос МЕЖДУ клиентами реально
      // двигает деньги — см. регрессию 004→033 на 5 100 ₽).
      transferIn: sql<string>`COALESCE((
        SELECT SUM(t.amount) FROM ${invoiceTransfers} t WHERE t.to_invoice_id = ${invoices.id}
      ), 0)`,
      transferOut: sql<string>`COALESCE((
        SELECT SUM(t.amount) FROM ${invoiceTransfers} t WHERE t.from_invoice_id = ${invoices.id}
      ), 0)`,
    })
    .from(invoices)
    .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
    .leftJoin(clients, eq(invoices.clientId, clients.id))
    .where(and(...conditions));

  const clientMap = new Map<string, {
    clientId: string;
    clientName: string;
    totalBudget: number;
    totalSpent: number;
    remaining: number;
    invoiceCount: number;
    invoices: {
      id: string;
      number: string;
      description: string | null;
      notes: string | null;
      budget: number;
      spent: number;
      remaining: number;
      createdAt: Date | null;
    }[];
  }>();

  for (const row of agencyInvoices) {
    if (!row.invoice.clientId || !row.calculations) continue;

    const clientId = row.invoice.clientId;
    const clientName = row.clientName || 'Unknown';
    const clientBill = parseNum(row.calculations.clientBill);
    const executorExpenses = parseNum(row.calculations.executorExpensesTotal);
    
    // Use stored clientBaseAfterMargin if available, else calculate based on scheme.
    // Гибкая 'agency' в запасном пути: база = сумма − маржа (ставки не жёсткие).
    const scheme = row.invoice.scheme;
    const fallbackBase = scheme === 'agency'
      ? clientBill - parseNum(row.calculations.agencyMargin)
      : clientBill * (scheme === 'agency_40' ? 0.6 : 0.7); // agency_40: 60%, agency_30: 70%
    const clientBase = parseNum(row.calculations.clientBaseAfterMargin) || fallbackBase;
    // «Доступно» с поправкой на переносы бюджета — та же формула, что в аудите
    // денег (остаток = база − расходы + переносы) и в кабинете клиента.
    const doNotSpendBudget = clientBase + parseNum(row.transferIn) - parseNum(row.transferOut);
    // Единственный источник истины по остатку — сохранённый расчёт; локальная
    // формула остаётся запасным путём для старых строк без него.
    const storedRemaining = row.calculations.clientRemaining;
    const invoiceRemaining = storedRemaining !== null && storedRemaining !== undefined
      ? parseNum(storedRemaining)
      : doNotSpendBudget - executorExpenses;
    
    if (!clientMap.has(clientId)) {
      clientMap.set(clientId, {
        clientId,
        clientName,
        totalBudget: 0,
        totalSpent: 0,
        remaining: 0,
        invoiceCount: 0,
        invoices: [],
      });
    }

    const summary = clientMap.get(clientId)!;
    summary.totalBudget = addMoney(summary.totalBudget, doNotSpendBudget);
    summary.totalSpent = addMoney(summary.totalSpent, executorExpenses);
    summary.remaining = addMoney(summary.remaining, invoiceRemaining);
    summary.invoiceCount = addMoney(summary.invoiceCount, 1);
    summary.invoices.push({
      id: row.invoice.id,
      number: row.invoice.invoiceNumber || `INV-${row.invoice.id}`,
      description: row.invoice.description,
      notes: row.invoice.notes,
      budget: doNotSpendBudget,
      spent: executorExpenses,
      remaining: invoiceRemaining,
      createdAt: row.invoice.createdAt,
    });
  }

  return Array.from(clientMap.values())
    .map(s => ({
      ...s,
      // Итог — сумма остатков счетов (как у клиента в кабинете), а не
      // Σбюджет − Σрасходы: последнее не знало о переносах и клампило минус,
      // из-за чего админка показывала 805К там, где у клиента 811К.
      invoices: s.invoices.sort((a, b) => {
        if (!a.createdAt || !b.createdAt) return 0;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }),
    }))
    .filter(s => s.totalBudget > 0)
    .sort((a, b) => b.remaining - a.remaining);
}

export async function getPartnerSchemeDoNotSpendData(db: DB, actor: InvoiceActor): Promise<{
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
    const conditions = [invoiceScope(actor),
      inArray(invoices.scheme, PARTNER_SCHEMES),
      inArray(invoices.status, ['paid', 'sent'])
    ];
    

    
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
        current.paidByAdmin = addMoney(current.paidByAdmin, amount);
      } else {
        current.paidByPartner = addMoney(current.paidByPartner, amount);
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

      
      // Get ACTUAL spent expenses from invoice_expenses table (partner-paid only)
      const invoiceExpensesData = expensesByInvoice.get(row.invoice.id) || { paidByPartner: 0, paidByAdmin: 0 };
      const spent = invoiceExpensesData.paidByPartner;
      const remaining = Math.max(0, plannedExpenses - spent);
      
      // Preserve booked per-invoice rounding and historical values.
      const commission = parseNum(row.calculations.commissionAmount);
      
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
      summary.totalPlannedExpenses = addMoney(summary.totalPlannedExpenses, plannedExpenses);
      summary.totalSpent = addMoney(summary.totalSpent, spent);
      // Only add commission to totals for non-assistant roles
      summary.totalCommission = addMoney(summary.totalCommission, (actor.role === 'assistant' || actor.role === 'accountant') ? 0 : commission);
      summary.totalDoNotSpend = addMoney(summary.totalDoNotSpend, doNotSpend);
      summary.totalPartnerDebt = addMoney(summary.totalPartnerDebt, partnerDebt);
      summary.totalClientBill = addMoney(summary.totalClientBill, clientBill);
      summary.invoiceCount = addMoney(summary.invoiceCount, 1);
      summary.invoices.push({
        id: row.invoice.id,
        number: row.invoice.invoiceNumber || `INV-${row.invoice.id}`,
        description: row.invoice.description,
        notes: row.invoice.notes,
        clientBill,
        plannedExpenses,
        spent,
        remaining,
        commission: (actor.role === 'assistant' || actor.role === 'accountant') ? 0 : commission,
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
        totalCommission: (actor.role === 'assistant' || actor.role === 'accountant') ? 0 : s.totalCommission,
        invoices: s.invoices.sort((a, b) => {
          if (!a.createdAt || !b.createdAt) return 0;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }),
      }))
      .filter(s => s.totalDoNotSpend > 0)
      .sort((a, b) => b.totalDoNotSpend - a.totalDoNotSpend);
  }


