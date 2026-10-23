import { objectStore, decodeDocument, type ObjectStore } from "../services/objectStore";
/**
 * Signed Acts & Assistant Bonus Repository
 * Covers signed acts (executor/company) and bonus payment tracking.
 */

import { db as _db } from "../db";
import {
  signedActs, assistantBonusPayments, invoices, accessTokens, documentPackages,
  SignedAct, AssistantBonusPayment,
  InsertSignedAct, InsertAssistantBonusPayment,
  ActType,
} from "../../shared/schema";
import {
  eq, and, desc, isNull, isNotNull, or, sql, getTableColumns,
} from "drizzle-orm";
import { parseNum, ASSISTANT_BONUS_PER_ACT, ASSISTANT_BONUS_PER_PACKAGE, ASSISTANT_PACKAGE_RULE_SINCE } from "../../shared/financialEngine";
import { assertPackageEditable, dropEmptyPackage, packageForUpload, sideOfAct } from "./documentPackagesRepo";

type DB = typeof _db;

// ---------------------------------------------------------------------------
// Signed Acts
// ---------------------------------------------------------------------------

/** pkg: загрузка ассистента идет в пакет счета (сторона по типу акта, исполнитель по имени). */
export async function createSignedAct(
  db: DB, act: InsertSignedAct, objects: ObjectStore = objectStore, pkg?: { executorName: string | null },
): Promise<SignedAct> {
  const objectKey = !act.isLink && act.fileData ? await objects.put(decodeDocument(act.fileData)) : null;
  return db.transaction(async tx => {
    const packageId = pkg ? (await packageForUpload(tx, act.invoiceId, sideOfAct(act.actType), pkg.executorName)).id : null;
    const [created] = await tx.insert(signedActs).values({ ...act, objectKey, fileData: null, packageId }).returning();
    return created;
  });
}

export async function getSignedActsByInvoice(
  db: DB,
  invoiceId: string,
  actType?: ActType,
): Promise<Omit<SignedAct, "fileData" | "objectKey">[]> {
  const { fileData: _binary, objectKey: _key, ...metadata } = getTableColumns(signedActs);
  if (actType) {
    return db.select(metadata).from(signedActs)
      .where(and(eq(signedActs.invoiceId, invoiceId), eq(signedActs.actType, actType)))
      .orderBy(desc(signedActs.createdAt));
  }
  return db.select(metadata).from(signedActs)
    .where(eq(signedActs.invoiceId, invoiceId))
    .orderBy(desc(signedActs.createdAt));
}

export async function getSignedAct(db: DB, id: string): Promise<SignedAct | null> {
  const [act] = await db.select().from(signedActs).where(eq(signedActs.id, id)).limit(1);
  return act || null;
}

/** ownerEdit: владелец удаляет документ и из принятого пакета, остальным это 409. */
export async function deleteSignedAct(db: DB, id: string, ownerEdit = false): Promise<void> {
  await db.transaction(async tx => {
    const [act] = await tx.select({ packageId: signedActs.packageId }).from(signedActs).where(eq(signedActs.id, id)).for("update");
    if (!act) return;
    if (act.packageId && !ownerEdit) await assertPackageEditable(tx, act.packageId);
    await tx.delete(signedActs).where(eq(signedActs.id, id));
    if (act.packageId) await dropEmptyPackage(tx, act.packageId);
  });
}

export async function getActsStatistics(
  db: DB,
  excludeHidden = false,
): Promise<{ executorActs: number; companyActs: number; totalPaidInvoices: number }> {
  const visibleCondition = excludeHidden
    ? and(eq(invoices.status, 'paid'), or(isNull(invoices.hideFromAssistant), eq(invoices.hideFromAssistant, false)))
    : eq(invoices.status, 'paid');

  const paidInvoicesCount = await db.select({ count: sql<number>`count(*)` })
    .from(invoices)
    .where(visibleCondition);
  const acts = await countActsOfPaidInvoices(db, excludeHidden);

  return {
    executorActs:      acts.executor,
    companyActs:       acts.company,
    totalPaidInvoices: Number(paidInvoicesCount[0]?.count || 0),
  };
}

/** Акты по оплаченным счетам по типам: единое место правила бонуса ассистента.
 *  excludeHidden убирает счета, скрытые от ассистента, period ограничивает дату загрузки акта. */
async function countActsOfPaidInvoices(db: DB, excludeHidden: boolean, period?: { from: string; to: string }) {
  const rows = await db.select({ actType: signedActs.actType, count: sql<number>`COUNT(*)::int` })
    .from(signedActs)
    .innerJoin(invoices, eq(signedActs.invoiceId, invoices.id))
    .where(and(
      eq(invoices.status, 'paid'),
      excludeHidden ? or(isNull(invoices.hideFromAssistant), eq(invoices.hideFromAssistant, false)) : undefined,
      period ? sql`DATE(${signedActs.createdAt}) BETWEEN ${period.from}::date AND ${period.to}::date` : undefined,
    ))
    .groupBy(signedActs.actType);
  const count = (type: ActType) => Number(rows.find(row => row.actType === type)?.count ?? 0);
  return { executor: count('executor'), company: count('company') };
}

/** Принятые пакеты по сторонам; period ограничивает дату принятия. */
async function countAcceptedPackages(db: DB, period?: { from: string; to: string }) {
  const rows = await db.select({ side: documentPackages.side, count: sql<number>`COUNT(*)::int` })
    .from(documentPackages)
    .where(and(
      isNotNull(documentPackages.acceptedAt),
      period ? sql`DATE(${documentPackages.acceptedAt}) BETWEEN ${period.from}::date AND ${period.to}::date` : undefined,
    ))
    .groupBy(documentPackages.side);
  const count = (side: string) => Number(rows.find(row => row.side === side)?.count ?? 0);
  return { client: count("client"), executor: count("executor") };
}

const packageBonus = (accepted: { client: number; executor: number }) =>
  accepted.client * ASSISTANT_BONUS_PER_PACKAGE.client + accepted.executor * ASSISTANT_BONUS_PER_PACKAGE.executor;

const dayBefore = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);

/** Бонус ассистента за период с from по to включительно (даты YYYY-MM-DD). До
 *  22.10.2026 действовало старое правило: за каждый акт оплаченного счета по дате
 *  загрузки. С этой даты бонус за принятые пакеты по дате принятия. */
export async function getAssistantBonusAccrued(db: DB, from: string, to: string): Promise<number> {
  let total = 0;
  if (from < ASSISTANT_PACKAGE_RULE_SINCE) {
    const end = to < ASSISTANT_PACKAGE_RULE_SINCE ? to : dayBefore(ASSISTANT_PACKAGE_RULE_SINCE);
    const acts = await countActsOfPaidInvoices(db, true, { from, to: end });
    total += acts.executor * ASSISTANT_BONUS_PER_ACT.executor + acts.company * ASSISTANT_BONUS_PER_ACT.company;
  }
  if (to >= ASSISTANT_PACKAGE_RULE_SINCE) {
    const start = from > ASSISTANT_PACKAGE_RULE_SINCE ? from : ASSISTANT_PACKAGE_RULE_SINCE;
    total += packageBonus(await countAcceptedPackages(db, { from: start, to }));
  }
  return total;
}

export interface AssistantBonusSummary {
  since: string;                                  // начало правила пакетов
  accepted: { client: number; executor: number }; // принятые пакеты
  earned: number;                                 // бонус за принятые пакеты
  paid: number;                                   // выплаты ассистенту с начала правила
  unpaid: number;                                 // к выплате, не меньше 0
  pending: number;                                // пакеты на проверке
  returned: number;                               // возвращенные пакеты
}

/** Бонус по правилу пакетов: все, что было до 22.10.2026, закрыто и выплачено. */
export async function getAssistantBonusSummary(db: DB): Promise<AssistantBonusSummary> {
  const [accepted, [paidRow], statusRows] = await Promise.all([
    countAcceptedPackages(db),
    db.select({ paid: sql<string>`COALESCE(SUM(${assistantBonusPayments.amount}), 0)` })
      .from(assistantBonusPayments)
      .where(sql`${assistantBonusPayments.paymentDate} >= ${ASSISTANT_PACKAGE_RULE_SINCE}::date`),
    db.select({ status: documentPackages.status, count: sql<number>`COUNT(*)::int` })
      .from(documentPackages).groupBy(documentPackages.status),
  ]);
  const earned = packageBonus(accepted);
  const paid = parseNum(paidRow?.paid);
  const status = (name: string) => Number(statusRows.find(row => row.status === name)?.count ?? 0);
  return {
    since: ASSISTANT_PACKAGE_RULE_SINCE,
    accepted,
    earned,
    paid,
    unpaid: Math.max(0, earned - paid),
    pending: status("pending"),
    returned: status("returned"),
  };
}

/** Сводка бонуса для ассистента и владельца: правило пакетов с 22.10.2026. */
export async function getAssistantStats(db: DB): Promise<AssistantBonusSummary> {
  return getAssistantBonusSummary(db);
}

// ---------------------------------------------------------------------------
// Bonus Payments
// ---------------------------------------------------------------------------

export async function getAssistantBonusPayments(db: DB): Promise<AssistantBonusPayment[]> {
  return db.select().from(assistantBonusPayments).orderBy(desc(assistantBonusPayments.paymentDate));
}

export async function createAssistantBonusPayment(
  db: DB,
  payment: InsertAssistantBonusPayment,
): Promise<AssistantBonusPayment> {
  const [created] = await db.insert(assistantBonusPayments).values(payment).returning();
  return created;
}

/** К выплате ассистенту: total совпадает с unpaid сводки. */
export async function getUnpaidBonusTotal(db: DB): Promise<AssistantBonusSummary & { total: number }> {
  const summary = await getAssistantBonusSummary(db);
  return { ...summary, total: summary.unpaid };
}

/** No-op — kept for backwards compatibility. Payments tracked via assistant_bonus_payments table. */
export async function markBonusesAsPaid(_db: DB, _invoiceIds: string[]): Promise<void> {}

/** Read bytes only after the HTTP layer has authorized the parent invoice. */
export async function openSignedActFile(db: DB, id: string, objects: ObjectStore = objectStore) {
  const act = await getSignedAct(db, id);
  if (!act || act.isLink) return null;
  const stream = act.objectKey ? await objects.open(act.objectKey)
    : act.fileData ? (await import('node:stream')).Readable.from(decodeDocument(act.fileData)) : null;
  return stream ? { stream, fileName: act.fileName, mimeType: act.mimeType } : null;
}
export async function readSignedActData(db: DB, id: string, objects: ObjectStore = objectStore) {
  const act = await getSignedAct(db, id);
  if (!act) return null;
  return act.objectKey ? `data:${act.mimeType || 'application/octet-stream'};base64,${(await objects.get(act.objectKey)).toString('base64')}` : act.fileData;
}
export async function migrateDocumentObjects(db: DB, objects: ObjectStore = objectStore) {
  let migrated = 0;
  for (;;) {
    const changed = await db.transaction(async tx => {
      const [act] = await tx.select().from(signedActs).where(and(isNull(signedActs.objectKey), sql`${signedActs.fileData} IS NOT NULL`)).limit(1).for('update', { skipLocked: true });
      if (!act) return false;
      const key = await objects.put(decodeDocument(act.fileData!));
      await tx.update(signedActs).set({ objectKey: key, fileData: null }).where(eq(signedActs.id, act.id));
      return true;
    });
    if (!changed) return { migrated };
    migrated++;
  }
}
