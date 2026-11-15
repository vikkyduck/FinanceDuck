/**
 * Деньги владельцев на счете ИП и долги владельца.
 *
 * Учет идет с даты начала (строка kind 'opening' у каждого владельца):
 * остаток на начало этого дня + доля прибыли, которая пришла на счет ИП с этого
 * дня включительно, - переводы с этого дня. Ассистентам Кря платит с личной
 * карты, на счет ИП это не влияет.
 * "Мы должны" - долги Кота и Кря вместе перед другими: неоплаченные исполнителям
 * расходы, которые платит владелец, и отдельно невыплаченный бонус ассистенту.
 * Долг Коту туда не входит: это расчет между владельцами.
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
import { CommandError } from "../lib/commandError";
import { getAssistantBonusSummary } from "./actsRepo";
import { db as _db } from "../db";

type DB = typeof _db;

export interface OwnerBalance {
  since: string | null;  // дата начала учета, null - учет не начат
  opening: number;       // остаток на начало дня since
  accrued: number;       // доля прибыли, пришедшей на счет ИП с даты начала
  paidOut: number;       // переводы владельцу с даты начала
  balance: number;       // opening + accrued - paidOut
  // Переводы с датой раньше начала учета: в баланс не входят, их сумма должна быть в остатке.
  ignored: { count: number; total: number };
}

/** Поступление прибыли на счет ИП: оплата клиента или перевод партнера по счету. */
export interface Arrival {
  date: string;
  profit: Decimal;
  invoiceId: string;
  invoiceNumber: string;
  source: "client" | "partner";
}

export interface OwnerLedger {
  kot: OwnerBalance;
  krya: OwnerBalance;
  // Прибыль в деньгах, которые внешние партнеры еще не перевели: доли начислятся по их переводам.
  pendingFromPartners: number;
  // Из чего сложилась доля с даты начала: каждое поступление прибыли по дате.
  arrivals: { date: string; invoiceId: string; invoiceNumber: string; source: Arrival["source"]; profit: number }[];
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
export async function profitArrivals(db: DB): Promise<{ arrivals: Arrival[]; pending: Decimal }> {
  const paid = await db.select({
    id: invoices.id,
    invoiceNumber: invoices.invoiceNumber,
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

  type Waiting = { id: string; invoiceNumber: string; date: string; profit: Decimal; due: Decimal; left: Decimal };
  const arrivals: Arrival[] = [];
  const waiting = new Map<string, Waiting>();
  const byPartner = new Map<string, Waiting[]>();
  for (const invoice of paid) {
    const profit = new Decimal(invoice.profit ?? 0), due = Decimal.max(0, invoice.due ?? 0);
    if (invoice.direct || due.lte(0)) {
      arrivals.push({ date: invoice.date, profit, invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, source: "client" });
      continue;
    }
    const item = { id: invoice.id, invoiceNumber: invoice.invoiceNumber, date: invoice.date, profit, due, left: due };
    const list = byPartner.get(invoice.partnerId) ?? [];
    list.push(item);
    byPartner.set(invoice.partnerId, list);
    waiting.set(invoice.id, item);
  }
  // Прибыль каждого перевода в копейках: строки расшифровки в сумме дают ровно долю.
  const allocate = (invoice: Waiting, amount: Decimal, date: string) => {
    const part = Decimal.min(amount, invoice.left);
    invoice.left = invoice.left.minus(part);
    arrivals.push({
      date: laterDate(date, invoice.date), profit: moneyDecimal(part.mul(invoice.profit).div(invoice.due)),
      invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, source: "partner",
    });
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

/** Прибыль, пришедшая на счет ИП с from по to включительно (to не задан - по сегодня и дальше). */
export function arrivedProfit(arrivals: Pick<Arrival, "date" | "profit">[], from: string, to?: string): Decimal {
  return moneyDecimal(arrivals.filter(a => a.date >= from && (to === undefined || a.date <= to))
    .reduce((sum, a) => sum.plus(a.profit), new Decimal(0)));
}

/** Пополам, как в движке: Кря округляется до копеек, Коту остаток. */
export function splitShares(profit: Decimal): { krya: Decimal; kot: Decimal } {
  const krya = moneyDecimal(profit.div(2));
  return { krya, kot: profit.minus(krya) };
}

const sum = (rows: OwnerTransfer[]) => rows.reduce((total, t) => total.plus(t.amount), new Decimal(0));

function balanceOf(owner: Owner, transfers: OwnerTransfer[], arrivals: Arrival[]): OwnerBalance {
  const opening = transfers.find(t => t.owner === owner && t.kind === "opening");
  if (!opening) return { since: null, opening: 0, accrued: 0, paidOut: 0, balance: 0, ignored: { count: 0, total: 0 } };
  const since = opening.transferDate;
  const accrued = splitShares(arrivedProfit(arrivals, since))[owner];
  const payouts = transfers.filter(t => t.owner === owner && t.kind === "payout");
  const paidOut = sum(payouts.filter(t => t.transferDate >= since));
  const ignored = payouts.filter(t => t.transferDate < since);
  const balance = new Decimal(opening.amount).plus(accrued).minus(paidOut);
  return {
    since,
    opening: Number(opening.amount),
    accrued: accrued.toNumber(),
    paidOut: paidOut.toNumber(),
    balance: balance.toNumber(),
    ignored: { count: ignored.length, total: sum(ignored).toNumber() },
  };
}

export async function getOwnerLedger(db: DB): Promise<OwnerLedger> {
  const transfers = await db.select().from(ownerTransfers)
    .orderBy(desc(ownerTransfers.transferDate), desc(ownerTransfers.createdAt));
  const { arrivals, pending } = await profitArrivals(db);
  const kot = balanceOf("kot", transfers, arrivals);
  const krya = balanceOf("krya", transfers, arrivals);
  const since = [kot.since, krya.since].filter((date): date is string => !!date).sort()[0];
  return {
    kot,
    krya,
    pendingFromPartners: moneyDecimal(pending).toNumber(),
    arrivals: since === undefined ? [] : arrivals
      .filter(a => a.date >= since)
      .sort((a, b) => a.date.localeCompare(b.date) || a.invoiceNumber.localeCompare(b.invoiceNumber))
      .map(a => ({ date: a.date, invoiceId: a.invoiceId, invoiceNumber: a.invoiceNumber, source: a.source, profit: moneyDecimal(a.profit).toNumber() })),
    transfers,
  };
}

/** Перевод до даты начала учета уже входит в остаток на эту дату: такой не записываем,
 *  иначе он молча не попадет в расчет. */
export async function createOwnerPayout(
  db: DB,
  payout: { owner: Owner; amount: string; transferDate: string; notes: string | null; createdBy: string },
): Promise<OwnerTransfer> {
  const [opening] = await db.select({ since: ownerTransfers.transferDate }).from(ownerTransfers)
    .where(and(eq(ownerTransfers.owner, payout.owner), eq(ownerTransfers.kind, "opening")));
  if (opening && payout.transferDate < opening.since) {
    const since = opening.since.split("-").reverse().join(".");
    throw new CommandError(`Учет переводов начат с ${since}. Перевод до этой даты уже входит в остаток на ${since}: укажите дату перевода не раньше или измените дату начала учета`, 400);
  }
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
  // Бонус ассистенту за принятые пакеты: Кря платит с личного счета, не со счета ИП.
  assistant: { since: string; unpaid: number };
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
  const bonus = await getAssistantBonusSummary(db);
  return {
    executors: {
      total: total.toNumber(),
      count: rows.length,
      items: rows.map(row => ({ ...row, description: decodeHtmlEntities(row.description), amount: Number(row.amount) })),
    },
    assistant: { since: bonus.since, unpaid: bonus.unpaid },
  };
}
