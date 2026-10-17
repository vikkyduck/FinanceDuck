/**
 * alertsRepo — вынесено из God-объекта storage.ts (тот же паттерн, что dashboardRepo).
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
import type { OverdueInvoice } from "../storage";

type DB = typeof _db;

export async function getPriorityActions(db: DB): Promise<Array<{
  id: string;
  type: string;
  priority: number;
  title: string;
  description: string;
  amount: number | null;
  actionType: string;
}>> {
  const today = new Date();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const actions: Array<{
    id: string;
    type: string;
    priority: number;
    title: string;
    description: string;
    amount: number | null;
    actionType: string;
  }> = [];

  // Overdue invoices
  const overdueInvoices = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      paymentDate: invoices.paymentDate,
      clientName: clients.name,
      clientBill: invoiceCalculations.clientBill,
    })
    .from(invoices)
    .leftJoin(clients, eq(invoices.clientId, clients.id))
    .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
    .where(
      and(
        eq(invoices.status, 'sent'),
        isNull(invoices.actualPaymentDate),
        sql`${invoices.paymentDate} < ${today.toISOString().split('T')[0]}`
      )
    );

  for (const inv of overdueInvoices) {
    const daysOverdue = Math.floor((today.getTime() - new Date(inv.paymentDate!).getTime()) / (1000 * 60 * 60 * 24));
    const clientBill = parseNum(inv.clientBill);
    actions.push({
      id: inv.id,
      type: 'overdue',
      priority: daysOverdue * clientBill,
      title: `Просрочен на ${daysOverdue} дн.`,
      description: `Счет ${inv.invoiceNumber} • ${inv.clientName || 'N/A'}`,
      amount: clientBill,
      actionType: 'mark_paid',
    });
  }

  // Draft invoices without payment date
  const draftInvoices = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      clientName: clients.name,
      clientBill: invoiceCalculations.clientBill,
    })
    .from(invoices)
    .leftJoin(clients, eq(invoices.clientId, clients.id))
    .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
    .where(
      and(
        eq(invoices.status, 'draft'),
        isNull(invoices.paymentDate)
      )
    );

  for (const inv of draftInvoices) {
    actions.push({
      id: inv.id,
      type: 'draft',
      priority: 50,
      title: 'Заполните дату оплаты',
      description: `Счет ${inv.invoiceNumber} • ${inv.clientName || 'N/A'}`,
      amount: parseNum(inv.clientBill),
      actionType: 'edit',
    });
  }

  // Long-waiting sent invoices
  const longSentInvoices = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      createdAt: invoices.createdAt,
      clientName: clients.name,
      clientBill: invoiceCalculations.clientBill,
    })
    .from(invoices)
    .leftJoin(clients, eq(invoices.clientId, clients.id))
    .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
    .where(
      and(
        eq(invoices.status, 'sent'),
        isNull(invoices.actualPaymentDate),
        sql`${invoices.createdAt} < ${thirtyDaysAgo.toISOString()}`
      )
    );

  for (const inv of longSentInvoices) {
    const daysWaiting = Math.floor((today.getTime() - new Date(inv.createdAt!).getTime()) / (1000 * 60 * 60 * 24));
    actions.push({
      id: inv.id,
      type: 'long_sent',
      priority: daysWaiting,
      title: `Ожидает ${daysWaiting} дней`,
      description: `Счет ${inv.invoiceNumber} • ${inv.clientName || 'N/A'}`,
      amount: parseNum(inv.clientBill),
      actionType: 'remind',
    });
  }

  // Sort by priority descending
  actions.sort((a, b) => b.priority - a.priority);
  return actions.slice(0, 5); // Top 5
}

export async function getAlertCounts(db: DB, role: string): Promise<{
  overdueInvoices: number;
  pendingInvoices: number;
  unresolvedSecurityEvents: number;
}> {
  const today = new Date();
  let overdueCount = 0;
  let pendingCount = 0;

  if (role === 'admin' || role === 'assistant') {
    const overdueInvoices = await db
      .select({ id: invoices.id })
      .from(invoices)
      .where(
        and(
          eq(invoices.status, 'sent'),
          isNull(invoices.actualPaymentDate),
          sql`${invoices.paymentDate} < ${today.toISOString().split('T')[0]}`
        )
      );
    overdueCount = overdueInvoices.length;
  }

  // Pending invoices (drafts)
  const pendingInvoices = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(eq(invoices.status, 'draft'));
  pendingCount = pendingInvoices.length;

  return {
    overdueInvoices: overdueCount,
    pendingInvoices: pendingCount,
    unresolvedSecurityEvents: 0, // security_events table not in Neon
  };
}

export async function getOverdueInvoices(db: DB): Promise<OverdueInvoice[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const overdueResults = await db
    .select({
      invoice: invoices,
      calculations: invoiceCalculations,
      clientName: clients.name,
      partnerName: partners.name,
    })
    .from(invoices)
    .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
    .leftJoin(clients, eq(invoices.clientId, clients.id))
    .leftJoin(partners, eq(invoices.partnerId, partners.id))
    .where(eq(invoices.status, 'sent'));
  
  const overdueInvoices: OverdueInvoice[] = [];
  
  for (const row of overdueResults) {
    if (!row.invoice.paymentDate) continue;
    
    const paymentDate = new Date(row.invoice.paymentDate);
    paymentDate.setHours(0, 0, 0, 0);
    
    if (paymentDate >= today) continue;
    
    const daysOverdue = Math.floor((today.getTime() - paymentDate.getTime()) / (1000 * 60 * 60 * 24));
    
    overdueInvoices.push({
      id: row.invoice.id,
      invoiceNumber: row.invoice.invoiceNumber,
      paymentDate: row.invoice.paymentDate,
      clientName: row.clientName || 'Неизвестно',
      partnerName: row.partnerName || 'Неизвестно',
      amount: parseNum(row.calculations?.clientBill),
      daysOverdue,
    });
  }
  
  // Sort by days overdue (most overdue first)
  return overdueInvoices.sort((a, b) => b.daysOverdue - a.daysOverdue);
}

export async function getOverdueInvoicesDetailed(db: DB): Promise<Array<{
  id: string;
  invoice_number: string;
  payment_date: string;
  overdue_days: number;
  priority_level: string;
  client_name: string;
  partner_name: string;
  client_bill: number;
}>> {
  const today = new Date();
  
  const overdueInvoices = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      paymentDate: invoices.paymentDate,
      clientName: clients.name,
      partnerName: partners.name,
      clientBill: invoiceCalculations.clientBill,
    })
    .from(invoices)
    .leftJoin(clients, eq(invoices.clientId, clients.id))
    .leftJoin(partners, eq(invoices.partnerId, partners.id))
    .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
    .where(
      and(
        eq(invoices.status, 'sent'),
        sql`${invoices.paymentDate} < ${today.toISOString().split('T')[0]}`
      )
    )
    .orderBy(invoices.paymentDate);

  return overdueInvoices.map(inv => {
    const paymentDate = new Date(inv.paymentDate!);
    const overdueDays = Math.floor((today.getTime() - paymentDate.getTime()) / (1000 * 60 * 60 * 24));
    return {
      id: inv.id,
      invoice_number: inv.invoiceNumber || '',
      payment_date: inv.paymentDate || '',
      overdue_days: overdueDays,
      priority_level: overdueDays >= 30 ? 'high' : 'normal',
      client_name: inv.clientName || '',
      partner_name: inv.partnerName || '',
      client_bill: parseNum(inv.clientBill),
    };
  });
}
