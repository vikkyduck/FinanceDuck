import { and, desc, eq, inArray } from "drizzle-orm";
import { isAgencyScheme, parseNum } from "../../shared/financialEngine";
import { invoiceCalculations, invoiceExpenses, invoices, partners } from "../../shared/schema";
import { db as _db } from "../db";
import { decodeHtmlEntities } from "../lib/sanitize";

type DB = typeof _db;

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
      description: decodeHtmlEntities(exp.description || ''),
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
      const used = Math.max(0, Math.min(Number(inv.periodsUsed ?? 0), total));
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


