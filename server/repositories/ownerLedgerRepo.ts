/**
 * Деньги владельцев на счете ИП и долги владельца.
 *
 * Учет идет с даты начала (строка kind 'opening' у каждого владельца):
 * остаток на начало этого дня + половина чистой прибыли счетов, оплаченных с этого
 * дня включительно, - переводы с этого дня. Ассистентам Кря платит с личной
 * карты, на счет ИП это не влияет.
 * "Мы должны" - долги Кота и Кря вместе перед другими: неоплаченные исполнителям
 * расходы, которые платит владелец, и отдельно невыплаченный бонус ассистенту.
 * Долг Коту туда не входит: это расчет между владельцами.
 */
import Decimal from "decimal.js";
import { and, asc, desc, eq, isNull, ne, or, sql } from "drizzle-orm";
import {
  clients, invoiceCalculations, invoiceExpenses, invoices, ownerTransfers, partners,
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

/** Оплаченный счет с даты начала учета: из таких счетов складываются доли. */
export interface PaidInvoice {
  date: string;                                  // день оплаты
  dateSource: "actual" | "planned" | "created";  // дата фактическая, плановая или дата создания
  profit: Decimal;
  invoiceId: string;
  invoiceNumber: string;
  clientName: string | null;
}

export interface OwnerLedger {
  kot: OwnerBalance;
  krya: OwnerBalance;
  // Из чего сложилась доля: оплаченные счета с даты начала по дню оплаты.
  invoices: { date: string; dateSource: PaidInvoice["dateSource"]; invoiceId: string; invoiceNumber: string; clientName: string | null; profit: number }[];
  transfers: OwnerTransfer[];
}

const effectiveDate = sql`COALESCE(${invoices.actualPaymentDate}, ${invoices.paymentDate}, DATE(${invoices.createdAt}))`;

/** Правило долей: чистая прибыль оплаченных счетов пополам, в день оплаты. День оплаты -
 *  фактическая дата, без нее плановая, без нее дата создания (так же считает "Доли (50/50)").
 *  Владелец ставит "Оплачен", когда деньги пришли к нему, в том числе от внешнего партнера,
 *  поэтому записи о переводах партнеров на доли не влияют. */
export async function paidInvoices(db: DB, since: string): Promise<PaidInvoice[]> {
  const rows = await db.select({
    invoiceId: invoices.id,
    invoiceNumber: invoices.invoiceNumber,
    clientName: clients.name,
    date: sql<string>`to_char(${effectiveDate}, 'YYYY-MM-DD')`,
    dateSource: sql<PaidInvoice["dateSource"]>`CASE WHEN ${invoices.actualPaymentDate} IS NOT NULL THEN 'actual'
      WHEN ${invoices.paymentDate} IS NOT NULL THEN 'planned' ELSE 'created' END`,
    profit: invoiceCalculations.netProfitAdmin,
  })
    .from(invoices)
    .innerJoin(invoiceCalculations, eq(invoiceCalculations.invoiceId, invoices.id))
    .leftJoin(clients, eq(clients.id, invoices.clientId))
    .where(and(eq(invoices.status, "paid"), sql`${effectiveDate} >= ${since}::date`))
    .orderBy(asc(effectiveDate), asc(invoices.invoiceNumber));
  return rows.map(row => ({
    ...row,
    clientName: row.clientName === null ? null : decodeHtmlEntities(row.clientName),
    profit: new Decimal(row.profit ?? 0),
  }));
}

/** Прибыль оплаченных счетов с from по to включительно (to не задан - без конца). */
export function paidProfit(rows: Pick<PaidInvoice, "date" | "profit">[], from: string, to?: string): Decimal {
  return moneyDecimal(rows.filter(row => row.date >= from && (to === undefined || row.date <= to))
    .reduce((sum, row) => sum.plus(row.profit), new Decimal(0)));
}

/** Пополам, как в движке: Кря округляется до копеек, Коту остаток. */
export function splitShares(profit: Decimal): { krya: Decimal; kot: Decimal } {
  const krya = moneyDecimal(profit.div(2));
  return { krya, kot: profit.minus(krya) };
}

const sum = (rows: OwnerTransfer[]) => rows.reduce((total, t) => total.plus(t.amount), new Decimal(0));

function balanceOf(owner: Owner, transfers: OwnerTransfer[], paid: PaidInvoice[]): OwnerBalance {
  const opening = transfers.find(t => t.owner === owner && t.kind === "opening");
  if (!opening) return { since: null, opening: 0, accrued: 0, paidOut: 0, balance: 0, ignored: { count: 0, total: 0 } };
  const since = opening.transferDate;
  const accrued = splitShares(paidProfit(paid, since))[owner];
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
  const since = transfers.filter(t => t.kind === "opening").map(t => t.transferDate).sort()[0];
  const paid = since === undefined ? [] : await paidInvoices(db, since);
  return {
    kot: balanceOf("kot", transfers, paid),
    krya: balanceOf("krya", transfers, paid),
    invoices: paid.map(row => ({ ...row, profit: row.profit.toNumber() })),
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
