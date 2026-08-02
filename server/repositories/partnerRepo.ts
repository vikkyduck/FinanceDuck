/**
 * partnerRepo — partners, partner-payments
 */
import { eq, and, or, desc, gte, inArray } from "drizzle-orm";
import {
  partners, clients, clientPartners, accessTokens, invoices,
  partnerPayments, invoiceCalculations,
  Partner, PartnerPayment,
  InsertPartner, InsertPartnerPayment, signedActs,
} from "../../shared/schema";
import { parseNum, isAgencyScheme, AGENCY_SCHEMES } from "../../shared/financialEngine";
import type { PartnerClientStatsData, PartnerDocumentRiskData, PartnerAgency30FundsData } from "../storage";
import type { db as _db } from "../db";

export type Db = typeof _db;

export interface PaymentHistoryEntry {
  id: string;
  paymentDate: string;
  amount: number;
  notes: string | null;
  runningBalance: number;
}

// ─── Partners ─────────────────────────────────────────────────────────────────

export async function getPartners(db: Db): Promise<Partner[]> {
  return db.select().from(partners).orderBy(partners.name);
}

export async function getPartner(db: Db, id: string): Promise<Partner | null> {
  const [p] = await db.select().from(partners).where(eq(partners.id, id)).limit(1);
  return p ?? null;
}

export async function createPartner(db: Db, partner: InsertPartner): Promise<Partner> {
  const [created] = await db.insert(partners).values(partner).returning();
  return created;
}

export async function updatePartner(
  db: Db, id: string, partner: Partial<InsertPartner>,
): Promise<Partner | null> {
  const [updated] = await db.update(partners)
    .set({ ...partner, updatedAt: new Date() })
    .where(eq(partners.id, id))
    .returning();
  return updated ?? null;
}

export async function deletePartner(
  db: Db, id: string,
): Promise<{ success: boolean; error?: string }> {
  const linked = await db.select({ id: invoices.id }).from(invoices)
    .where(eq(invoices.partnerId, id)).limit(1);
  if (linked.length > 0) {
    return { success: false, error: "Нельзя удалить партнёра: есть связанные счета" };
  }

  const linkedClients = await db.select({ id: clientPartners.clientId }).from(clientPartners)
    .where(eq(clientPartners.partnerId, id)).limit(1);
  if (linkedClients.length > 0) {
    return { success: false, error: "Нельзя удалить партнёра: есть связанные клиенты" };
  }

  await db.delete(accessTokens).where(eq(accessTokens.partnerId, id));
  await db.delete(partners).where(eq(partners.id, id));
  return { success: true };
}

export async function getPartnerClients(db: Db, partnerId: string) {
  const results = await db
    .select({ client: clients })
    .from(clientPartners)
    .innerJoin(clients, eq(clientPartners.clientId, clients.id))
    .where(eq(clientPartners.partnerId, partnerId))
    .orderBy(clients.name);
  return results.map(r => r.client);
}

// ─── Partner Payments ─────────────────────────────────────────────────────────


export async function getPartnerPayment(
  db: Db, id: string,
): Promise<PartnerPayment | null> {
  const [p] = await db.select().from(partnerPayments)
    .where(eq(partnerPayments.id, id)).limit(1);
  return p ?? null;
}

export async function createPartnerPayment(
  db: Db, payment: InsertPartnerPayment,
): Promise<PartnerPayment> {
  const [created] = await db.insert(partnerPayments).values(payment).returning();
  return created;
}

export async function updatePartnerPayment(
  db: Db, id: string, updates: Partial<InsertPartnerPayment>,
): Promise<PartnerPayment | null> {
  const [updated] = await db.update(partnerPayments)
    .set(updates).where(eq(partnerPayments.id, id)).returning();
  return updated ?? null;
}

export async function deletePartnerPayment(db: Db, id: string): Promise<void> {
  await db.delete(partnerPayments).where(eq(partnerPayments.id, id));
}

export async function getPartnerPaymentHistory(
  db: Db, partnerId: string,
): Promise<PaymentHistoryEntry[]> {
  const paidInvoices = await db
    .select({ invoice: invoices, calculations: invoiceCalculations })
    .from(invoices)
    .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
    .where(and(eq(invoices.partnerId, partnerId), eq(invoices.status, "paid")));

  let totalDebt = 0;
  for (const r of paidInvoices) {
    if (r.calculations) {
      totalDebt += Math.max(0, parseNum(r.calculations.partnerTransferDue ?? "0"));
    }
  }

  const payments = await db.select().from(partnerPayments)
    .where(eq(partnerPayments.partnerId, partnerId))
    .orderBy(partnerPayments.paymentDate);

  let runningBalance = totalDebt;
  const history: PaymentHistoryEntry[] = [];
  for (const payment of payments) {
    const amount = parseNum(payment.amount);
    runningBalance -= amount;
    history.push({
      id: payment.id,
      paymentDate: payment.paymentDate,
      amount,
      notes: payment.notes,
      runningBalance,
    });
  }
  return history.reverse();
}

export async function getPartnerPayments(db: Db, partnerId: string): Promise<Array<{
  id: string;
  amount: number;
  paymentDate: string;
  notes: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
}>> {
  // Get invoice IDs for the partner
  const partnerInvoices = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
    })
    .from(invoices)
    .where(eq(invoices.partnerId, partnerId));

  const invoiceMap = new Map<string, string>();
  for (const inv of partnerInvoices) {
    invoiceMap.set(inv.id, inv.invoiceNumber || '');
  }
  const invoiceIds = Array.from(invoiceMap.keys());

  // Get payments - always query by partnerId, optionally also by invoiceId
  let paymentsData: typeof partnerPayments.$inferSelect[] = [];
  
  if (invoiceIds.length > 0) {
    // Partner has invoices - get payments by invoice OR partner
    paymentsData = await db
      .select()
      .from(partnerPayments)
      .where(
        or(
          inArray(partnerPayments.invoiceId, invoiceIds),
          eq(partnerPayments.partnerId, partnerId)
        )
      )
      .orderBy(desc(partnerPayments.paymentDate));
  } else {
    // Partner has no invoices - only get payments by partnerId
    paymentsData = await db
      .select()
      .from(partnerPayments)
      .where(eq(partnerPayments.partnerId, partnerId))
      .orderBy(desc(partnerPayments.paymentDate));
  }

  // Deduplicate and merge
  const paymentsMap = new Map<string, {
    id: string;
    amount: number;
    paymentDate: string;
    notes: string | null;
    invoiceId: string | null;
    invoiceNumber: string | null;
  }>();

  for (const p of paymentsData) {
    if (!paymentsMap.has(p.id)) {
      paymentsMap.set(p.id, {
        id: p.id,
        amount: parseNum(p.amount),
        paymentDate: p.paymentDate,
        notes: p.notes,
        invoiceId: p.invoiceId,
        invoiceNumber: p.invoiceId ? invoiceMap.get(p.invoiceId) || null : null,
      });
    }
  }

  return Array.from(paymentsMap.values()).sort(
    (a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime()
  );
}

export async function getPartnerTerms(db: Db, partnerId: string): Promise<Array<{
  scheme: string;
  partnerCommissionRate: number | null;
}>> {
  const invoicesData = await db
    .select({
      scheme: invoices.scheme,
      partnerCommissionRate: invoices.partnerCommissionRate,
    })
    .from(invoices)
    .where(eq(invoices.partnerId, partnerId));

  // Get unique combinations
  const termsMap = new Map<string, { scheme: string; partnerCommissionRate: number | null }>();
  for (const inv of invoicesData) {
    const key = `${inv.scheme}-${inv.partnerCommissionRate}`;
    if (!termsMap.has(key)) {
      termsMap.set(key, {
        scheme: inv.scheme,
        partnerCommissionRate: inv.partnerCommissionRate,
      });
    }
  }

  return Array.from(termsMap.values()).sort((a, b) => a.scheme.localeCompare(b.scheme));
}

export async function getPartnerClientStats(db: Db, partnerId: string, year: number): Promise<PartnerClientStatsData[]> {
  const monthNames = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
  ];
  
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31, 23, 59, 59);
  
  const partnerInvoices = await db
    .select({
      invoice: invoices,
      calculations: invoiceCalculations,
      clientName: clients.name,
    })
    .from(invoices)
    .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
    .leftJoin(clients, eq(invoices.clientId, clients.id))
    .where(and(
      eq(invoices.partnerId, partnerId),
      eq(invoices.status, 'paid'),
      gte(invoices.actualPaymentDate, yearStart.toISOString().split('T')[0])
    ));

  // Group by client and month
  const statsMap = new Map<string, PartnerClientStatsData>();
  
  for (const row of partnerInvoices) {
    if (!row.invoice.clientId || !row.calculations) continue;
    
    const paymentDate = row.invoice.actualPaymentDate ? new Date(row.invoice.actualPaymentDate) : null;
    if (!paymentDate || paymentDate.getFullYear() !== year) continue;
    
    const month = paymentDate.getMonth();
    const key = `${row.invoice.clientId}-${month}`;
    
    const clientBill = parseNum(row.calculations.clientBill);
    const scheme = row.invoice.scheme;
    
    let commission = 0;
    let clientRemaining = 0;
    
    if (isAgencyScheme(scheme)) {
      commission = parseNum(row.calculations.partnerShareFromMargin);
      // База клиента — из расчётов (гибкая 'agency' жёсткой ставки не имеет);
      // запасной путь для старых строк без сохранённой базы.
      const storedBase = parseNum(row.calculations.clientBaseAfterMargin);
      const clientBase = storedBase || clientBill * (scheme === 'agency_40' ? 0.60 : 0.70);
      const expenses = parseNum(row.calculations.executorExpensesTotal);
      clientRemaining = Math.max(0, clientBase - expenses);
    } else {
      commission = parseNum(row.calculations.commissionAmount);
      clientRemaining = parseNum(row.calculations.clientRemaining);
    }
    
    if (!statsMap.has(key)) {
      statsMap.set(key, {
        clientId: row.invoice.clientId,
        clientName: row.clientName || 'Unknown',
        month,
        monthName: monthNames[month],
        clientBill: 0,
        partnerCommission: 0,
        clientRemaining: 0,
        invoiceCount: 0,
      });
    }
    
    const stats = statsMap.get(key)!;
    stats.clientBill += clientBill;
    stats.partnerCommission += commission;
    stats.clientRemaining += Math.max(0, clientRemaining);
    stats.invoiceCount += 1;
  }
  
  return Array.from(statsMap.values()).sort((a, b) => {
    if (a.month !== b.month) return a.month - b.month;
    return a.clientName.localeCompare(b.clientName);
  });
}

export async function getPartnerDocumentRisk(db: Db, partnerId: string): Promise<PartnerDocumentRiskData> {
  // Get paid invoices for this partner
  const paidInvoices = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
    })
    .from(invoices)
    .where(and(
      eq(invoices.partnerId, partnerId),
      eq(invoices.status, 'paid')
    ));
  
  if (paidInvoices.length === 0) {
    return { status: 'green', missingActsCount: 0, missingActsInvoices: [] };
  }
  
  const invoiceIds = paidInvoices.map(i => i.id);
  
  // Get all signed acts for these invoices (use the same source as admin)
  const acts = await db
    .select({
      invoiceId: signedActs.invoiceId,
    })
    .from(signedActs)
    .where(inArray(signedActs.invoiceId, invoiceIds));
  
  const invoicesWithActs = new Set(acts.map(a => a.invoiceId));
  
  // Find invoices without ANY acts (critical risk)
  const missingActs = paidInvoices.filter(i => !invoicesWithActs.has(i.id));
  
  return {
    status: missingActs.length > 0 ? 'red' : 'green',
    missingActsCount: missingActs.length,
    missingActsInvoices: missingActs.map(i => ({
      id: i.id,
      invoiceNumber: i.invoiceNumber || 'Unknown',
    })),
  };
}

export async function getPartnerAgency30Funds(db: Db, partnerId: string): Promise<PartnerAgency30FundsData[]> {
  // Get agency scheme invoices (agency_30/40 + гибкая 'agency') for this partner
  const agencyInvoices = await db
    .select({
      invoice: invoices,
      calculations: invoiceCalculations,
      clientName: clients.name,
    })
    .from(invoices)
    .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
    .leftJoin(clients, eq(invoices.clientId, clients.id))
    .where(and(
      eq(invoices.partnerId, partnerId),
      inArray(invoices.scheme, [...AGENCY_SCHEMES]),
      inArray(invoices.status, ['paid', 'sent'])
    ));

  const clientMap = new Map<string, PartnerAgency30FundsData>();

  for (const row of agencyInvoices) {
    if (!row.invoice.clientId || !row.calculations) continue;

    const clientId = row.invoice.clientId;
    const clientName = row.clientName || 'Unknown';
    const clientBill = parseNum(row.calculations.clientBill);
    const executorExpenses = parseNum(row.calculations.executorExpensesTotal);
    
    // Client money that partner must not spend: из сохранённой базы расчётов;
    // запасной путь только для старых жёстких схем (у гибкой 'agency' база
    // всегда персистится — ставка не фиксированная).
    const scheme = row.invoice.scheme;
    const fallbackBase = scheme === 'agency'
      ? clientBill - parseNum(row.calculations.agencyMargin)
      : clientBill * (scheme === 'agency_40' ? 0.6 : 0.7);
    const clientBase = parseNum(row.calculations.clientBaseAfterMargin) || fallbackBase;
    
    if (!clientMap.has(clientId)) {
      clientMap.set(clientId, {
        clientId,
        clientName,
        totalBudget: 0,
        totalSpent: 0,
        remaining: 0,
        invoiceCount: 0,
      });
    }

    const summary = clientMap.get(clientId)!;
    summary.totalBudget += clientBase;
    summary.totalSpent += executorExpenses;
    summary.invoiceCount += 1;
  }

  return Array.from(clientMap.values())
    .map(s => ({
      ...s,
      remaining: Math.max(0, s.totalBudget - s.totalSpent),
    }))
    .filter(s => s.totalBudget > 0)
    .sort((a, b) => b.remaining - a.remaining);
}
