/**
 * Пакеты документов ассистента: документы с клиентом по счету или с одним
 * исполнителем. Ассистент загружает документы, владелец принимает или
 * возвращает пакет целиком. Бонус ассистента считается по принятым пакетам
 * (actsRepo.getAssistantBonusSummary).
 */
import { and, asc, eq, sql } from "drizzle-orm";
import {
  assistantActionLogs, clients, documentPackages, invoices, signedActs,
  type ActType, type DocumentPackage,
} from "../../shared/schema";
import { CommandError } from "../lib/commandError";
import { db as _db } from "../db";

type DB = typeof _db;
type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

export type PackageSide = "client" | "executor";
export type PackageReview = "accept" | "return" | "reopen";

export const sideOfAct = (actType: ActType): PackageSide => (actType === "company" ? "client" : "executor");

/** Имя исполнителя без лишних пробелов: "  Иван  Петров " и "Иван Петров" один пакет. */
export function normalizeExecutorName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

const ACCEPTED_PACKAGE = "Пакет уже принят. Изменить его может только владелец: попросите отменить принятие";

/** Пакет счета для стороны и исполнителя: существующий или новый на проверке.
 *  Возвращенный пакет после новой загрузки снова ждет проверки, в принятый
 *  ассистент документ не добавит. */
export async function packageForUpload(tx: Tx, invoiceId: string, side: PackageSide, executorName: string | null): Promise<DocumentPackage> {
  const name = side === "executor" ? executorName : null;
  const [created] = await tx.insert(documentPackages).values({ invoiceId, side, executorName: name })
    .onConflictDoNothing().returning();
  if (created) return created;
  const [existing] = await tx.select().from(documentPackages).where(and(
    eq(documentPackages.invoiceId, invoiceId),
    eq(documentPackages.side, side),
    sql`lower(coalesce(${documentPackages.executorName}, '')) = lower(${name ?? ""})`,
  )).for("update");
  if (existing.status === "accepted") throw new CommandError(ACCEPTED_PACKAGE, 409);
  if (existing.status !== "returned") return existing;
  const [resubmitted] = await tx.update(documentPackages).set({ status: "pending" })
    .where(eq(documentPackages.id, existing.id)).returning();
  return resubmitted;
}

/** Документ из принятого пакета удаляет только владелец. */
export async function assertPackageEditable(tx: Tx, packageId: string): Promise<void> {
  const [pkg] = await tx.select({ status: documentPackages.status }).from(documentPackages)
    .where(eq(documentPackages.id, packageId)).for("update");
  if (pkg?.status === "accepted") throw new CommandError(ACCEPTED_PACKAGE, 409);
}

/** Пустой пакет, который еще не приняли, после удаления документа проверять нечего. */
export async function dropEmptyPackage(tx: Tx, packageId: string): Promise<void> {
  await tx.delete(documentPackages).where(and(
    eq(documentPackages.id, packageId),
    sql`${documentPackages.status} <> 'accepted'`,
    sql`NOT EXISTS (SELECT 1 FROM ${signedActs} WHERE ${signedActs.packageId} = ${packageId})`,
  ));
}

// Полные имена колонок: в запросе к одной таблице drizzle пишет их без имени таблицы,
// и "id" в подзапросе означал бы id документа.
const documentCount = sql<number>`(SELECT COUNT(*)::int FROM "signed_acts" WHERE "signed_acts"."package_id" = "document_packages"."id")`;

export interface PackageView extends DocumentPackage {
  documents: number;
}

export async function getInvoicePackages(db: DB, invoiceId: string): Promise<PackageView[]> {
  const rows = await db.select({ pkg: documentPackages, documents: documentCount })
    .from(documentPackages)
    .where(eq(documentPackages.invoiceId, invoiceId))
    .orderBy(asc(documentPackages.side), asc(documentPackages.executorName), asc(documentPackages.createdAt));
  return rows.map(row => ({ ...row.pkg, documents: row.documents }));
}

export interface PackageListItem extends PackageView {
  invoiceNumber: string;
  clientName: string | null;
}

/** Пакеты в статусе по всем счетам, старые первыми. Ассистенту без скрытых от него счетов. */
export async function getPackagesByStatus(db: DB, status: DocumentPackage["status"], excludeHidden: boolean): Promise<PackageListItem[]> {
  const rows = await db.select({
    pkg: documentPackages, documents: documentCount, invoiceNumber: invoices.invoiceNumber, clientName: clients.name,
  })
    .from(documentPackages)
    .innerJoin(invoices, eq(invoices.id, documentPackages.invoiceId))
    .leftJoin(clients, eq(clients.id, invoices.clientId))
    .where(and(eq(documentPackages.status, status), excludeHidden ? eq(invoices.hideFromAssistant, false) : undefined))
    .orderBy(asc(documentPackages.createdAt));
  return rows.map(row => ({ ...row.pkg, documents: row.documents, invoiceNumber: row.invoiceNumber, clientName: row.clientName }));
}

const REVIEW_FROM: Record<PackageReview, DocumentPackage["status"][]> = {
  accept: ["pending", "returned"],
  return: ["pending"],
  reopen: ["accepted"],
};

/** Решение владельца по пакету. Принятие фиксирует момент начисления бонуса,
 *  возврат требует комментария, отмена принятия снимает бонус. */
export async function reviewPackage(
  db: DB, id: string, action: PackageReview, comment: string | null, reviewerId: string,
): Promise<DocumentPackage | null> {
  return db.transaction(async tx => {
    const [current] = await tx.select({ pkg: documentPackages, invoiceNumber: invoices.invoiceNumber })
      .from(documentPackages)
      .innerJoin(invoices, eq(invoices.id, documentPackages.invoiceId))
      .where(eq(documentPackages.id, id))
      .for("update", { of: documentPackages });
    if (!current) return null;
    if (!REVIEW_FROM[action].includes(current.pkg.status)) throw new CommandError("Пакет уже в другом статусе, обновите страницу", 409);
    if (action === "return" && !comment) throw new CommandError("Напишите, что исправить", 400);
    const now = new Date();
    const changes = action === "accept"
      ? { status: "accepted", acceptedAt: now, reviewComment: null }
      : action === "return"
        ? { status: "returned", acceptedAt: null, reviewComment: comment }
        : { status: "pending", acceptedAt: null };
    const [updated] = await tx.update(documentPackages)
      .set({ ...changes, reviewedBy: reviewerId, reviewedAt: now })
      .where(eq(documentPackages.id, id)).returning();
    const who = current.pkg.side === "client" ? "клиента" : `исполнителя ${current.pkg.executorName ?? "(не указан)"}`;
    const what = action === "accept" ? `Принят пакет ${who}` : action === "return" ? `Возвращен пакет ${who}` : `Снято принятие пакета ${who}`;
    await tx.insert(assistantActionLogs).values({
      accessTokenId: reviewerId, actionType: "other", entityType: "document_package", entityId: id,
      description: `${what}: счет ${current.invoiceNumber}`,
      details: JSON.stringify({ invoiceId: current.pkg.invoiceId, action, comment }),
    });
    return updated;
  });
}
