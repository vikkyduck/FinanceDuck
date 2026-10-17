/**
 * Assistant Action Log Repository
 * Handles writing and querying audit logs for assistant/accountant actions.
 * Includes coalescing of rapid sequential updates to the same entity.
 */

import { db as _db } from "../db";
import {
  assistantActionLogs, accessTokens, invoices, clients, partners,
  AssistantActionLog,
  InsertAssistantActionLog,
} from "../../shared/schema";
import { eq, and, desc, inArray, sql, type SQL } from "drizzle-orm";
import type { AssistantActionLogFilters, AssistantActionLogWithDetails } from "../storage";

type DB = typeof _db;

export async function logAssistantAction(
  db: DB,
  log: InsertAssistantActionLog,
): Promise<AssistantActionLog> {
  // Coalesce rapid sequential update_invoice events for the same entity/user
  if (log.actionType === 'update_invoice' && log.entityId && log.accessTokenId) {
    const recentLogs = await db.select()
      .from(assistantActionLogs)
      .where(and(
        eq(assistantActionLogs.accessTokenId, log.accessTokenId),
        eq(assistantActionLogs.entityId,      log.entityId),
        eq(assistantActionLogs.actionType,    'update_invoice'),
        sql`${assistantActionLogs.createdAt} > NOW() - INTERVAL '10 seconds'`,
      ))
      .orderBy(desc(assistantActionLogs.createdAt))
      .limit(1);

    if (recentLogs.length > 0) {
      const existing = recentLogs[0];
      let mergedDetails: Record<string, unknown> = {};
      if (existing.details) {
        try { mergedDetails = JSON.parse(existing.details); } catch { /* Keep the original legacy log when details are malformed. */ }
      }
      if (log.details) {
        try {
          const newDetails = JSON.parse(log.details);
          mergedDetails = { ...mergedDetails, ...newDetails };
        } catch { /* Keep the original legacy log when details are malformed. */ }
      }
      const [updated] = await db.update(assistantActionLogs)
        .set({
          details:     JSON.stringify(mergedDetails),
          description: log.description || existing.description,
        })
        .where(eq(assistantActionLogs.id, existing.id))
        .returning();
      return updated;
    }
  }

  const [created] = await db.insert(assistantActionLogs).values(log).returning();
  return created;
}

export async function getAssistantActionLogs(
  db: DB,
  filters: AssistantActionLogFilters,
): Promise<{ logs: AssistantActionLogWithDetails[]; total: number }> {
  const { limit = 100, offset = 0, role, dateFrom, dateTo } = filters;

  const conditions: SQL<unknown>[] = [];
  if (role)     conditions.push(eq(accessTokens.role, role));
  if (dateFrom) conditions.push(sql`${assistantActionLogs.createdAt} >= ${dateFrom}::timestamp`);
  if (dateTo)   conditions.push(sql`${assistantActionLogs.createdAt} <= ${dateTo}::timestamp + interval '1 day'`);

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const baseFrom = db
    .select({ count: sql<number>`count(*)::int` })
    .from(assistantActionLogs)
    .leftJoin(accessTokens, eq(assistantActionLogs.accessTokenId, accessTokens.id));
  const [countResult] = whereClause
    ? await baseFrom.where(whereClause)
    : await baseFrom;

  const dataBase = db.select({
    log:       assistantActionLogs,
    tokenCode: accessTokens.code,
    tokenRole: accessTokens.role,
  })
    .from(assistantActionLogs)
    .leftJoin(accessTokens, eq(assistantActionLogs.accessTokenId, accessTokens.id));

  const logsData = await (whereClause ? dataBase.where(whereClause) : dataBase)
    .orderBy(desc(assistantActionLogs.createdAt))
    .limit(limit)
    .offset(offset);

  // Collect IDs for enrichment
  const clientIds  = new Set<string>();
  const partnerIds = new Set<string>();
  const invoiceIds = new Set<string>();

  for (const row of logsData) {
    if (row.log.details) {
      try {
        const parsed = JSON.parse(row.log.details);
        if (parsed.clientId)  clientIds.add(parsed.clientId);
        if (parsed.partnerId) partnerIds.add(parsed.partnerId);
        if (parsed.invoiceId) invoiceIds.add(parsed.invoiceId);
      } catch { /* Keep the original legacy log when details are malformed. */ }
    }
    if (row.log.entityId && row.log.actionType.includes('invoice')) {
      invoiceIds.add(row.log.entityId);
    }
  }

  const clientMap  = new Map<string, string>();
  const partnerMap = new Map<string, string>();
  const invoiceMap = new Map<string, { number: string; status: string }>();

  if (clientIds.size > 0) {
    const data = await db.select({ id: clients.id, name: clients.name })
      .from(clients)
      .where(inArray(clients.id, Array.from(clientIds)));
    for (const c of data) clientMap.set(c.id, c.name);
  }

  if (partnerIds.size > 0) {
    const data = await db.select({ id: partners.id, name: partners.name })
      .from(partners)
      .where(inArray(partners.id, Array.from(partnerIds)));
    for (const p of data) partnerMap.set(p.id, p.name);
  }

  if (invoiceIds.size > 0) {
    const data = await db.select({
      id:            invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      status:        invoices.status,
      clientId:      invoices.clientId,
      description:   invoices.description,
      clientName:    clients.name,
    })
      .from(invoices)
      .leftJoin(clients, eq(invoices.clientId, clients.id))
      .where(inArray(invoices.id, Array.from(invoiceIds)));
    for (const inv of data) {
      const displayName = inv.invoiceNumber || inv.clientName || inv.description || inv.id;
      invoiceMap.set(inv.id, { number: displayName, status: inv.status });
    }
  }

  const isUUID = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

  const logs: AssistantActionLogWithDetails[] = logsData.map(row => {
    let enrichedDetails     = row.log.details;
    let enrichedDescription = row.log.description;
    let parsedDetails: { clientId?: string; partnerId?: string; invoiceId?: string; clientName?: string; partnerName?: string; invoiceNumber?: string; invoiceStatus?: string; status?: string; description?: string } | null = null;

    if (row.log.details) {
      try { parsedDetails = JSON.parse(row.log.details); } catch { /* Keep the original legacy log when details are malformed. */ }
    }

    if (parsedDetails) {
      if (parsedDetails.clientId  && clientMap.has(parsedDetails.clientId)  && !parsedDetails.clientName)
        parsedDetails.clientName  = clientMap.get(parsedDetails.clientId);
      if (parsedDetails.partnerId && partnerMap.has(parsedDetails.partnerId) && !parsedDetails.partnerName)
        parsedDetails.partnerName = partnerMap.get(parsedDetails.partnerId);
      if (parsedDetails.invoiceId && invoiceMap.has(parsedDetails.invoiceId)) {
        const inv = invoiceMap.get(parsedDetails.invoiceId)!;
        if (!parsedDetails.invoiceNumber) parsedDetails.invoiceNumber = inv.number;
        parsedDetails.invoiceStatus = inv.status;
      }
      if (row.log.entityId && invoiceMap.has(row.log.entityId) && !parsedDetails.status)
        parsedDetails.invoiceStatus = invoiceMap.get(row.log.entityId)!.status;
      enrichedDetails = JSON.stringify(parsedDetails);
    }

    if (row.log.entityId && row.log.entityType === "invoice") {
      let displayName: string | null = parsedDetails
        ? (parsedDetails.invoiceNumber || parsedDetails.clientName || parsedDetails.partnerName || parsedDetails.description || null)
        : null;
      if (!displayName && invoiceMap.has(row.log.entityId)) {
        const num = invoiceMap.get(row.log.entityId)!.number;
        if (!isUUID(num)) displayName = num;
      }
      if (displayName && enrichedDescription.includes(row.log.entityId)) {
        enrichedDescription = enrichedDescription.replace(row.log.entityId, displayName);
      }
    }

    return {
      ...row.log,
      description: enrichedDescription,
      details:     enrichedDetails,
      tokenCode:   row.tokenCode || undefined,
      tokenRole:   row.tokenRole || undefined,
    };
  });

  return { logs, total: countResult?.count || 0 };
}
