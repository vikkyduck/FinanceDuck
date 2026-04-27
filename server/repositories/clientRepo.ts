/**
 * clientRepo — clients, client-partner relations
 */
import { eq } from "drizzle-orm";
import {
  clients, partners, clientPartners, accessTokens, invoices,
  Client, Partner,
  InsertClient,
} from "../../shared/schema";
import type { db as _db } from "../db";

export type Db = typeof _db;

// ─── Clients ──────────────────────────────────────────────────────────────────

export async function getClients(db: Db, partnerId?: string): Promise<Client[]> {
  if (partnerId) {
    return db.select().from(clients)
      .where(eq(clients.partnerId, partnerId))
      .orderBy(clients.name);
  }
  return db.select().from(clients).orderBy(clients.name);
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
): Promise<(Client & { partners: Partner[] })[]> {
  const allClients = await db.select().from(clients).orderBy(clients.name);
  return Promise.all(
    allClients.map(async client => ({
      ...client,
      partners: await getClientPartners(db, client.id),
    })),
  );
}

export async function setClientPartners(
  db: Db, clientId: string, partnerIds: string[],
): Promise<void> {
  await db.delete(clientPartners).where(eq(clientPartners.clientId, clientId));

  if (partnerIds.length > 0) {
    await db.insert(clientPartners).values(partnerIds.map(partnerId => ({ clientId, partnerId })));
  }

  if (partnerIds.length === 1) {
    await db.update(clients)
      .set({ partnerId: partnerIds[0], updatedAt: new Date() })
      .where(eq(clients.id, clientId));
  } else if (partnerIds.length === 0) {
    await db.update(clients)
      .set({ partnerId: null, updatedAt: new Date() })
      .where(eq(clients.id, clientId));
  }
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
