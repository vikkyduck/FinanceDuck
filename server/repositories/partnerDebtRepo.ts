import Decimal from "decimal.js";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { parseNum } from "../../shared/financialEngine";
import { clients, invoiceCalculations, invoiceExpenses, invoices, partnerPayments, partners } from "../../shared/schema";
import { db as _db } from "../db";

type DB = typeof _db;

/** Partners marked directToOwner are skipped: their clients pay the owner directly,
 *  so the stored transfer due is not a debt. */
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
  const allInvoicesList = (await db
    .select({
      invoice: invoices,
      calculations: invoiceCalculations,
      partnerName: partners.name,
      partnerEmail: partners.email,
      partnerPhone: partners.phone,
      partnerDirectToOwner: partners.directToOwner,
    })
    .from(invoices)
    .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
    .leftJoin(partners, eq(invoices.partnerId, partners.id)))
    .filter(r => !r.partnerDirectToOwner);

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
    if (!partner.directToOwner && !partnerMap.has(partner.id)) {
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
        created_at: row.invoice.createdAt?.toISOString() || '',
      };
    })
    .filter(inv => inv.remaining > 0);
}



export async function getPartnerDebtDetails(db: DB, partnerId: string): Promise<{
  summary: {
    totalDebt: number;
    totalPaid: number;
    remainingDebt: number;
    overpayment: number;
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

  const expenseTotals = await db.select({
    invoiceId: invoiceExpenses.invoiceId,
    byPartner: sql<string>`COALESCE(SUM(${invoiceExpenses.amount}) FILTER (WHERE NOT ${invoiceExpenses.paidByAdmin}), 0)`,
    byAdmin: sql<string>`COALESCE(SUM(${invoiceExpenses.amount}) FILTER (WHERE ${invoiceExpenses.paidByAdmin}), 0)`,
  }).from(invoiceExpenses).innerJoin(invoices, eq(invoices.id, invoiceExpenses.invoiceId))
    .where(and(eq(invoices.partnerId, partnerId), eq(invoices.status, 'paid'))).groupBy(invoiceExpenses.invoiceId);
  const expensesByInvoice = new Map(expenseTotals.map(row => [row.invoiceId, { byPartner: parseNum(row.byPartner), byAdmin: parseNum(row.byAdmin) }]));
  const partnerPaymentsList = await db.select({
    id: partnerPayments.id, amount: partnerPayments.amount, paymentDate: partnerPayments.paymentDate,
    notes: partnerPayments.notes, invoiceNumber: invoices.invoiceNumber,
  }).from(partnerPayments).leftJoin(invoices, eq(invoices.id, partnerPayments.invoiceId))
    .where(eq(partnerPayments.partnerId, partnerId)).orderBy(partnerPayments.paymentDate);

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

  const paymentDetails = partnerPaymentsList;

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

/** "Нам должны" for the owner. Clients of directToOwner partners pay the owner, so their
 *  sent and unpaid invoices are owed in full. Other partners owe what they received from
 *  clients and have not transferred yet. */
export async function getReceivables(db: DB): Promise<{
  clients: { total: number; count: number; overdueTotal: number; overdueCount: number };
  partners: { total: number; count: number };
}> {
  const bill = sql`COALESCE(${invoiceCalculations.clientBill}, ${invoices.clientBill}, 0)`;
  const overdue = sql`${invoices.paymentDate} IS NOT NULL AND ${invoices.paymentDate} < CURRENT_DATE`;
  const [clientRow] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${bill}), 0)`,
      count: sql<number>`COUNT(*)::int`,
      overdueTotal: sql<string>`COALESCE(SUM(CASE WHEN ${overdue} THEN ${bill} END), 0)`,
      overdueCount: sql<number>`(COUNT(*) FILTER (WHERE ${overdue}))::int`,
    })
    .from(invoices)
    .innerJoin(partners, eq(invoices.partnerId, partners.id))
    .leftJoin(invoiceCalculations, eq(invoices.id, invoiceCalculations.invoiceId))
    .where(and(eq(invoices.status, 'sent'), isNull(invoices.actualPaymentDate), eq(partners.directToOwner, true)));

  const debts = (await getPartnerDebtSummaries(db)).filter(s => s.remaining > 0);
  return {
    clients: {
      total: parseNum(clientRow?.total),
      count: Number(clientRow?.count ?? 0),
      overdueTotal: parseNum(clientRow?.overdueTotal),
      overdueCount: Number(clientRow?.overdueCount ?? 0),
    },
    partners: {
      total: debts.reduce((sum, s) => sum.plus(s.remaining), new Decimal(0)).toNumber(),
      count: debts.length,
    },
  };
}

