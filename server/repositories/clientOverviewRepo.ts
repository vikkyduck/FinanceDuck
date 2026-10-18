import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { isAgencyScheme, parseNum } from "../../shared/financialEngine";
import { accessTokens, invoiceCalculations, invoiceExpenses, invoices, partners, recurringInvoices } from "../../shared/schema";
import { db as _db } from "../db";
import { decodeHtmlEntities } from "../lib/sanitize";

type DB = typeof _db;

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

  const active = rows.filter(r => r.invoice.status !== 'cancelled' && inRange(r.invoice.paymentDate));

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
        description: decodeHtmlEntities(e.description || ''),
        amount: parseNum(e.amount),
        date: e.date || null,
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
  const isPeriodicLike = (inv: { recurringInvoiceId?: string | null; serviceType?: string | null }) => !!inv.recurringInvoiceId || inv.serviceType === 'periodic';
  const recurringInvoiceRows = nonAgencyActive.filter(r => isPeriodicLike(r.invoice));

  // «Использовано» по ШАБЛОНАМ recurring_invoices (блок 2b) = COUNT
  // (invoice_expenses) WHERE createdBy принадлежит admin/assistant токенам:
  // у шаблона своего счётчика периодов нет. Для standalone-periodic счетов
  // (блок 2a) считать так НЕЛЬЗЯ — там единственный источник истины
  // invoices.periods_used, тот же, по которому считается «Остаток» счёта.
  const periodicInvoiceIds = recurringInvoiceRows.filter(r => !!r.invoice.recurringInvoiceId).map(r => r.invoice.id);
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
  const recurringBlock: Array<{
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
    const used = Math.min(total, Math.max(0, Number(inv.periodsUsed ?? 0)));
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
        paymentDate: inv.paymentDate || null,
        actualPaymentDate: inv.actualPaymentDate || null,
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
      if (freq === 'monthly') return Math.max(0, m);
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
          paymentDate: r.invoice.paymentDate || null,
          actualPaymentDate: r.invoice.actualPaymentDate || null,
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
      else { pendingCount++; pendingAmount += bill; }
      return {
        invoiceId: r.invoice.id,
        invoiceNumber: r.invoice.invoiceNumber || '',
        status: r.invoice.status,
        bill,
        paymentDate: r.invoice.paymentDate || null,
        actualPaymentDate: r.invoice.actualPaymentDate || null,
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


