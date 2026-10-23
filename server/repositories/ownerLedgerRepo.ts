/**
 * Деньги владельцев на счете ИП и долги владельца.
 *
 * Учет идет с даты начала (строка kind 'opening' у каждого владельца):
 * остаток на эту дату + доля по оплаченным счетам с этой даты - переводы.
 * Ассистентам Кря платит из своей доли, поэтому их выплаты уменьшают ее остаток.
 * "Мы должны": неоплаченные исполнителям расходы, которые платит владелец,
 * и положительный остаток Кота.
 */
import Decimal from "decimal.js";
import { and, asc, desc, eq, isNull, ne, or, sql } from "drizzle-orm";
import {
  assistantBonusPayments, clients, invoiceCalculations, invoiceExpenses, invoices, ownerTransfers, partners,
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
  accrued: number;       // доля по оплаченным счетам с даты начала
  assistants: number;    // выплаты ассистентам с даты начала, только у Кря
  paidOut: number;       // переводы владельцу с даты начала
  balance: number;       // opening + accrued - assistants - paidOut
}

export interface OwnerLedger {
  kot: OwnerBalance;
  krya: OwnerBalance;
  transfers: OwnerTransfer[];
}

const effectiveDate = sql`COALESCE(${invoices.actualPaymentDate}, ${invoices.paymentDate}, DATE(${invoices.createdAt}))`;

/** Прибыль оплаченных счетов с даты since включительно. Единственное место правила
 *  начисления долей: длинные предоплаты по месяцам работы поменяют его здесь. */
async function profitSince(db: DB, since: string): Promise<Decimal> {
  const [row] = await db.select({ profit: sql<string>`COALESCE(SUM(${invoiceCalculations.netProfitAdmin}), 0)` })
    .from(invoices)
    .innerJoin(invoiceCalculations, eq(invoiceCalculations.invoiceId, invoices.id))
    .where(and(eq(invoices.status, "paid"), sql`${effectiveDate} >= ${since}::date`));
  return new Decimal(row?.profit ?? 0);
}

async function assistantPaidSince(db: DB, since: string): Promise<Decimal> {
  const [row] = await db.select({ paid: sql<string>`COALESCE(SUM(${assistantBonusPayments.amount}), 0)` })
    .from(assistantBonusPayments)
    .where(sql`${assistantBonusPayments.paymentDate} >= ${since}::date`);
  return new Decimal(row?.paid ?? 0);
}

async function balanceOf(db: DB, owner: Owner, transfers: OwnerTransfer[]): Promise<OwnerBalance> {
  const opening = transfers.find(t => t.owner === owner && t.kind === "opening");
  if (!opening) return { since: null, opening: 0, accrued: 0, assistants: 0, paidOut: 0, balance: 0 };
  const since = opening.transferDate;
  // Пополам, как в движке: Кря округляется до копеек, Коту остаток.
  const profit = await profitSince(db, since);
  const kryaShare = moneyDecimal(profit.div(2));
  const accrued = owner === "krya" ? kryaShare : profit.minus(kryaShare);
  const assistants = owner === "krya" ? await assistantPaidSince(db, since) : new Decimal(0);
  const paidOut = transfers
    .filter(t => t.owner === owner && t.kind === "payout" && t.transferDate >= since)
    .reduce((sum, t) => sum.plus(t.amount), new Decimal(0));
  const balance = new Decimal(opening.amount).plus(accrued).minus(assistants).minus(paidOut);
  return {
    since,
    opening: Number(opening.amount),
    accrued: accrued.toNumber(),
    assistants: assistants.toNumber(),
    paidOut: paidOut.toNumber(),
    balance: balance.toNumber(),
  };
}

export async function getOwnerLedger(db: DB): Promise<OwnerLedger> {
  const transfers = await db.select().from(ownerTransfers)
    .orderBy(desc(ownerTransfers.transferDate), desc(ownerTransfers.createdAt));
  const [kot, krya] = await Promise.all([balanceOf(db, "kot", transfers), balanceOf(db, "krya", transfers)]);
  return { kot, krya, transfers };
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
