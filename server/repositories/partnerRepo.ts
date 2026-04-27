/**
 * partnerRepo — partners, partner-payments
 */
import { eq, and, desc } from "drizzle-orm";
import {
  partners, clients, clientPartners, accessTokens, invoices,
  partnerPayments, invoiceCalculations,
  Partner, PartnerPayment,
  InsertPartner, InsertPartnerPayment,
} from "../../shared/schema";
import { parseNum } from "../../shared/financialEngine";
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

export async function getPartnerPayments(
  db: Db, partnerId?: string,
): Promise<PartnerPayment[]> {
  if (partnerId) {
    return db.select().from(partnerPayments)
      .where(eq(partnerPayments.partnerId, partnerId))
      .orderBy(desc(partnerPayments.paymentDate));
  }
  return db.select().from(partnerPayments).orderBy(desc(partnerPayments.paymentDate));
}

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
