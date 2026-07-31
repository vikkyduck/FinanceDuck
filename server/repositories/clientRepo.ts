/**
 * clientRepo — clients, client-partner relations
 */
import { eq, inArray } from "drizzle-orm";
import {
  clients, partners, clientPartners, accessTokens, invoices,
  Client, Partner,
  InsertClient,
} from "../../shared/schema";
import type { db as _db } from "../db";
import type { ClientCollectionScope } from "../tenantAccess";

export type Db = typeof _db;

// ─── Clients ──────────────────────────────────────────────────────────────────

export async function getClients(
  db: Db,
  scope: ClientCollectionScope,
): Promise<Client[]> {
  if (scope.kind === "partner") {
    // Единый источник: клиенты, связанные с партнёром через client_partners
    // (много-ко-многим), а не по устаревшему одиночному clients.partner_id.
    const linked = db.select({ id: clientPartners.clientId })
      .from(clientPartners).where(eq(clientPartners.partnerId, scope.partnerId));
    return db.select().from(clients)
      .where(inArray(clients.id, linked))
      .orderBy(clients.name);
  }

  if (scope.kind === "client") {
    return db.select().from(clients)
      .where(eq(clients.id, scope.clientId))
      .orderBy(clients.name);
  }

  if (scope.kind === "all") {
    return db.select().from(clients).orderBy(clients.name);
  }

  const exhaustiveCheck: never = scope;
  throw new Error(`Unsupported client collection scope: ${JSON.stringify(exhaustiveCheck)}`);
}

export async function getClient(db: Db, id: string): Promise<Client | null> {
  const [c] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  return c ?? null;
}

export async function createClient(db: Db, client: InsertClient): Promise<Client> {
  const [created] = await db.insert(clients).values(client).returning();
  return created;
}

export async function updateClient(
  db: Db, id: string, client: Partial<InsertClient>,
): Promise<Client | null> {
  const [updated] = await db.update(clients)
    .set({ ...client, updatedAt: new Date() })
    .where(eq(clients.id, id))
    .returning();
  return updated ?? null;
}

export async function getClientWithPartner(
  db: Db, id: string,
): Promise<(Client & { partner?: Partner }) | null> {
  const [result] = await db
    .select({ client: clients, partner: partners })
    .from(clients)
    .leftJoin(partners, eq(clients.partnerId, partners.id))
    .where(eq(clients.id, id))
    .limit(1);

  if (!result) return null;
  return { ...result.client, partner: result.partner ?? undefined };
}

export async function getClientPartners(db: Db, clientId: string): Promise<Partner[]> {
  const results = await db
    .select({ partner: partners })
    .from(clientPartners)
    .innerJoin(partners, eq(clientPartners.partnerId, partners.id))
    .where(eq(clientPartners.clientId, clientId))
    .orderBy(partners.name);
  return results.map(r => r.partner);
}

export async function getClientsWithPartners(
  db: Db,
  scope: ClientCollectionScope,
): Promise<(Client & { partners: Partner[] })[]> {
  const scopedClients = await getClients(db, scope);
  return Promise.all(
    scopedClients.map(async client => ({
      ...client,
      partners: await getClientPartners(db, client.id),
    })),
  );
}

/**
 * ЕДИНЫЙ писатель связи клиент↔партнёр. client_partners — источник истины;
 * clients.partner_id держим как «основной партнёр» (первый), синхронно, ВСЕГДА
 * (в т.ч. при 2+ партнёрах — раньше поле оставалось устаревшим). Транзакция.
 */
export async function setClientPartners(
  db: Db, clientId: string, partnerIds: string[],
): Promise<void> {
  // dedupe на всякий случай
  const ids = Array.from(new Set(partnerIds.filter(Boolean)));
  await (db as any).transaction(async (tx: any) => {
    await tx.delete(clientPartners).where(eq(clientPartners.clientId, clientId));
    if (ids.length > 0) {
      await tx.insert(clientPartners).values(ids.map(partnerId => ({ clientId, partnerId })));
    }
    await tx.update(clients)
      .set({ partnerId: ids[0] ?? null, updatedAt: new Date() })
      .where(eq(clients.id, clientId));
  });
}

export async function deleteClient(
  db: Db, id: string,
): Promise<{ success: boolean; error?: string }> {
  const linked = await db.select({ id: invoices.id }).from(invoices)
    .where(eq(invoices.clientId, id)).limit(1);
  if (linked.length > 0) {
    return { success: false, error: "Нельзя удалить клиента: есть связанные счета" };
  }

  await db.delete(clientPartners).where(eq(clientPartners.clientId, id));
  await db.delete(accessTokens).where(eq(accessTokens.clientId, id));
  await db.delete(clients).where(eq(clients.id, id));
  return { success: true };
}
