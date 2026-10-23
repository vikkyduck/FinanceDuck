/**
 * Деньги владельцев на счете ИП и долги владельца.
 *
 * Учет идет с даты начала (строка kind 'opening' у каждого владельца):
 * остаток на эту дату + доля прибыли, которая пришла на счет ИП с этой даты,
 * - переводы. Ассистентам Кря платит с личной карты, на счет ИП это не влияет.
 * "Мы должны": неоплаченные исполнителям расходы, которые платит владелец,
 * и положительный остаток Кота.
 */
import Decimal from "decimal.js";
import { and, asc, desc, eq, isNull, ne, or, sql } from "drizzle-orm";
import {
  clients, invoiceCalculations, invoiceExpenses, invoices, ownerTransfers, partnerPayments, partners,
  type OwnerTransfer,
} from "../../shared/schema";
import { moneyDecimal } from "../../shared/money";
import { OWNERS, type Owner } from "../../shared/domainTypes";
import { decodeHtmlEntities } from "../lib/sanitize";
import { db as _db } from "../db";

type DB = typeof _db;

export interface OwnerBalance {
  since: string | null;  // дата начала учета, null - учет не начат
  opening: number;       // остаток на дату начала
  accrued: number;       // доля прибыли, пришедшей на счет ИП с даты начала
  paidOut: number;       // переводы владельцу с даты начала
  balance: number;       // opening + accrued - paidOut
}

export interface OwnerLedger {
  kot: OwnerBalance;
  krya: OwnerBalance;
  // Прибыль в деньгах, которые внешние партнеры еще не перевели: доли начислятся по их переводам.
  pendingFromPartners: number;
  transfers: OwnerTransfer[];
}

const effectiveDate = sql`COALESCE(${invoices.actualPaymentDate}, ${invoices.paymentDate}, DATE(${invoices.createdAt}))`;
const laterDate = (a: string, b: string) => (a > b ? a : b);

/** Когда прибыль оплаченных счетов приходит на счет ИП. Единственное место правила
 *  начисления долей: длинные предоплаты по месяцам работы поменяют его здесь.
 *  Клиенты партнеров-владельцев платят напрямую: прибыль приходит в день оплаты.
 *  Внешние партнеры переводят деньги сами: перевод со ссылкой на счет закрывает
 *  этот счет, остальное закрывает счета партнера по порядку дат. Прибылью из
 *  перевода считается та же доля, что прибыль счета в его сумме к переводу:
 *  остальное возвращает владельцу оплаченные им расходы. */
async function profitArrivals(db: DB): Promise<{ arrivals: { date: string; profit: Decimal }[]; pending: Decimal }> {
  const paid = await db.select({
    id: invoices.id,
    partnerId: invoices.partnerId,
    direct: partners.directToOwner,
    date: sql<string>`to_char(${effectiveDate}, 'YYYY-MM-DD')`,
    due: invoiceCalculations.partnerTransferDue,
    profit: invoiceCalculations.netProfitAdmin,
  })
    .from(invoices)
    .innerJoin(invoiceCalculations, eq(invoiceCalculations.invoiceId, invoices.id))
    .innerJoin(partners, eq(partners.id, invoices.partnerId))
    .where(eq(invoices.status, "paid"))
    .orderBy(asc(effectiveDate), asc(invoices.createdAt), asc(invoices.id));
  const payments = await db.select({
    partnerId: partnerPayments.partnerId,
    invoiceId: partnerPayments.invoiceId,
    amount: partnerPayments.amount,
    date: partnerPayments.paymentDate,
  })
    .from(partnerPayments)
    .innerJoin(partners, eq(partners.id, partnerPayments.partnerId))
    .where(eq(partners.directToOwner, false))
    .orderBy(asc(partnerPayments.paymentDate), asc(partnerPayments.createdAt), asc(partnerPayments.id));

  type Waiting = { date: string; profit: Decimal; due: Decimal; left: Decimal };
  const arrivals: { date: string; profit: Decimal }[] = [];
  const waiting = new Map<string, Waiting>();
  const byPartner = new Map<string, Waiting[]>();
  for (const invoice of paid) {
    const profit = new Decimal(invoice.profit ?? 0), due = Decimal.max(0, invoice.due ?? 0);
    if (invoice.direct || due.lte(0)) { arrivals.push({ date: invoice.date, profit }); continue; }
    const item = { date: invoice.date, profit, due, left: due };
    const list = byPartner.get(invoice.partnerId) ?? [];
    list.push(item);
    byPartner.set(invoice.partnerId, list);
    waiting.set(invoice.id, item);
  }
  const allocate = (invoice: Waiting, amount: Decimal, date: string) => {
    const part = Decimal.min(amount, invoice.left);
    invoice.left = invoice.left.minus(part);
    arrivals.push({ date: laterDate(date, invoice.date), profit: part.mul(invoice.profit).div(invoice.due) });
    return amount.minus(part);
  };
  // Сначала переводы со ссылкой на счет, затем остальное по порядку дат.
  const unlinked: { partnerId: string; amount: Decimal; date: string }[] = [];
  for (const payment of payments) {
    const linked = payment.invoiceId ? waiting.get(payment.invoiceId) : undefined;
    const own = linked && byPartner.get(payment.partnerId)?.includes(linked);
    const rest = own ? allocate(linked, new Decimal(payment.amount), payment.date) : new Decimal(payment.amount);
    if (rest.gt(0)) unlinked.push({ partnerId: payment.partnerId, amount: rest, date: payment.date });
  }
  for (const payment of unlinked) {
    let rest = payment.amount;
    for (const invoice of byPartner.get(payment.partnerId) ?? []) {
      if (rest.lte(0)) break;
      if (invoice.left.gt(0)) rest = allocate(invoice, rest, payment.date);
    }
  }
  const pending = [...waiting.values()].reduce((sum, invoice) => sum.plus(invoice.left.mul(invoice.profit).div(invoice.due)), new Decimal(0));
  return { arrivals, pending };
}

function balanceOf(owner: Owner, transfers: OwnerTransfer[], arrivals: { date: string; profit: Decimal }[]): OwnerBalance {
  const opening = transfers.find(t => t.owner === owner && t.kind === "opening");
  if (!opening) return { since: null, opening: 0, accrued: 0, paidOut: 0, balance: 0 };
  const since = opening.transferDate;
  // Пополам, как в движке: Кря округляется до копеек, Коту остаток.
  const profit = moneyDecimal(arrivals.filter(a => a.date >= since).reduce((sum, a) => sum.plus(a.profit), new Decimal(0)));
  const kryaShare = moneyDecimal(profit.div(2));
  const accrued = owner === "krya" ? kryaShare : profit.minus(kryaShare);
  const paidOut = transfers
    .filter(t => t.owner === owner && t.kind === "payout" && t.transferDate >= since)
    .reduce((sum, t) => sum.plus(t.amount), new Decimal(0));
  const balance = new Decimal(opening.amount).plus(accrued).minus(paidOut);
  return {
    since,
    opening: Number(opening.amount),
    accrued: accrued.toNumber(),
    paidOut: paidOut.toNumber(),
    balance: balance.toNumber(),
  };
}

export async function getOwnerLedger(db: DB): Promise<OwnerLedger> {
  const transfers = await db.select().from(ownerTransfers)
    .orderBy(desc(ownerTransfers.transferDate), desc(ownerTransfers.createdAt));
  const { arrivals, pending } = await profitArrivals(db);
  return {
    kot: balanceOf("kot", transfers, arrivals),
    krya: balanceOf("krya", transfers, arrivals),
    pendingFromPartners: moneyDecimal(pending).toNumber(),
    transfers,
  };
}

export async function createOwnerPayout(
  db: DB,
  payout: { owner: Owner; amount: string; transferDate: string; notes: string | null; createdBy: string },
): Promise<OwnerTransfer> {
  const [created] = await db.insert(ownerTransfers).values({ ...payout, kind: "payout" }).returning();
  return created;
}

/** Удаляет только переводы: дата начала меняется через setOwnerLedgerStart. */
export async function deleteOwnerPayout(db: DB, id: string): Promise<boolean> {
  const deleted = await db.delete(ownerTransfers)
    .where(and(eq(ownerTransfers.id, id), eq(ownerTransfers.kind, "payout")))
    .returning({ id: ownerTransfers.id });
  return deleted.length > 0;
}

/** Дата начала учета и остатки на нее: положительный остаток Кота - долг ему,
 *  отрицательный - Кот получил вперед. */
export async function setOwnerLedgerStart(
  db: DB,
  start: { since: string; kot: string; krya: string; createdBy: string },
): Promise<void> {
  await db.transaction(async tx => {
    for (const owner of OWNERS) {
      await tx.delete(ownerTransfers).where(and(eq(ownerTransfers.owner, owner), eq(ownerTransfers.kind, "opening")));
      await tx.insert(ownerTransfers).values({
        owner, kind: "opening", amount: start[owner], transferDate: start.since, notes: null, createdBy: start.createdBy,
      });
    }
  });
}

export interface UnpaidExpense {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  clientName: string | null;
  description: string;
  amount: number;
  date: string;
}

export interface Payables {
  executors: { total: number; count: number; items: UnpaidExpense[] };
  kot: { since: string | null; balance: number };
}

/** Расходы, которые платит владелец (оплачены админом или по партнеру-владельцу)
 *  и еще не оплачены исполнителю. Отмененные счета не в счет. */
export async function getPayables(db: DB): Promise<Payables> {
  const rows = await db.select({
    id: invoiceExpenses.id,
    invoiceId: invoices.id,
    invoiceNumber: invoices.invoiceNumber,
    clientName: clients.name,
    description: invoiceExpenses.description,
    amount: invoiceExpenses.amount,
    date: invoiceExpenses.date,
  })
    .from(invoiceExpenses)
    .innerJoin(invoices, eq(invoices.id, invoiceExpenses.invoiceId))
    .innerJoin(partners, eq(partners.id, invoices.partnerId))
    .leftJoin(clients, eq(clients.id, invoices.clientId))
    .where(and(
      isNull(invoiceExpenses.paidAt),
      ne(invoices.status, "cancelled"),
      or(eq(invoiceExpenses.paidByAdmin, true), eq(partners.directToOwner, true)),
    ))
    .orderBy(asc(invoiceExpenses.date), asc(invoices.invoiceNumber));
  const total = rows.reduce((sum, row) => sum.plus(row.amount), new Decimal(0));
  const ledger = await getOwnerLedger(db);
  return {
    executors: {
      total: total.toNumber(),
      count: rows.length,
      items: rows.map(row => ({ ...row, description: decodeHtmlEntities(row.description), amount: Number(row.amount) })),
    },
    kot: { since: ledger.kot.since, balance: ledger.kot.balance },
  };
}
