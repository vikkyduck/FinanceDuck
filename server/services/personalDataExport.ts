import { and, asc, eq, gt, inArray } from 'drizzle-orm';
import type { db as database } from '../db';
import type { InvoiceActor } from '../invoiceAccess';
import { invoiceScope } from '../invoiceQuery';
import { invoiceExportPages } from '../repositories/exportRepo';
import { projectInvoiceForRole } from '../permissions';
import { AGENCY_SCHEMES } from '../../shared/financialEngine';
import { accessTokens, clients, invoices, invoiceExpenses, invoiceMessages } from '../../shared/schema';

type DB = typeof database;
export type PersonalExportActor = InvoiceActor & { tokenId: string };
const PAGE_SIZE = 200;

async function* ownInvoices(db: DB, actor: InvoiceActor) {
  for await (const page of invoiceExportPages(db, actor, {})) {
    for (const invoice of page) yield projectInvoiceForRole(invoice, actor.role);
  }
}

async function* ownExpenses(db: DB, actor: InvoiceActor) {
  let cursor: string | undefined;
  for (;;) {
    const page = await db.select({ id: invoiceExpenses.id, invoiceId: invoiceExpenses.invoiceId,
      description: invoiceExpenses.description, amount: invoiceExpenses.amount, date: invoiceExpenses.date })
      .from(invoiceExpenses).innerJoin(invoices, eq(invoices.id, invoiceExpenses.invoiceId))
      .where(and(invoiceScope(actor), inArray(invoices.scheme, [...AGENCY_SCHEMES]), cursor ? gt(invoiceExpenses.id, cursor) : undefined))
      .orderBy(asc(invoiceExpenses.id)).limit(PAGE_SIZE);
    if (!page.length) return;
    yield* page; cursor = page.at(-1)!.id;
  }
}

async function* ownMessages(db: DB, actor: InvoiceActor) {
  let cursor: string | undefined;
  for (;;) {
    const page = await db.select({ id: invoiceMessages.id, invoiceId: invoiceMessages.invoiceId,
      expenseId: invoiceMessages.expenseId, authorRole: invoiceMessages.authorRole,
      body: invoiceMessages.body, createdAt: invoiceMessages.createdAt })
      .from(invoiceMessages).innerJoin(invoices, eq(invoices.id, invoiceMessages.invoiceId))
      .where(and(invoiceScope(actor), cursor ? gt(invoiceMessages.id, cursor) : undefined))
      .orderBy(asc(invoiceMessages.id)).limit(PAGE_SIZE);
    if (!page.length) return;
    yield* page; cursor = page.at(-1)!.id;
  }
}

async function* ownAccess(db: DB, actor: PersonalExportActor) {
  const scope = actor.role === 'client' && actor.clientId ? eq(accessTokens.clientId, actor.clientId)
    : actor.role === 'partner' && actor.partnerId ? eq(accessTokens.partnerId, actor.partnerId)
    : eq(accessTokens.id, actor.tokenId);
  let cursor: string | undefined;
  for (;;) {
    const page = await db.select({ id: accessTokens.id, role: accessTokens.role, isActive: accessTokens.isActive,
      createdAt: accessTokens.createdAt, lastUsedAt: accessTokens.lastUsedAt, expiresAt: accessTokens.expiresAt })
      .from(accessTokens).where(and(scope, cursor ? gt(accessTokens.id, cursor) : undefined))
      .orderBy(asc(accessTokens.id)).limit(PAGE_SIZE);
    if (!page.length) return;
    yield* page; cursor = page.at(-1)!.id;
  }
}

async function* jsonArray(name: string, rows: AsyncIterable<unknown>) {
  yield `,${JSON.stringify(name)}:[`;
  let first = true;
  for await (const row of rows) { yield `${first ? '' : ','}${JSON.stringify(row)}`; first = false; }
  yield ']';
}

/** Bounded keyset queries and a backpressure-aware JSON stream. Never redefines financial visibility. */
export async function* personalDataExport(db: DB, actor: PersonalExportActor, generatedAt: string) {
  yield `{"generatedAt":${JSON.stringify(generatedAt)},"role":${JSON.stringify(actor.role)}`;
  if (actor.role === 'client' && actor.clientId) {
    const [client] = await db.select({ id: clients.id, name: clients.name, email: clients.email,
      phone: clients.phone, telegram: clients.telegram, createdAt: clients.createdAt })
      .from(clients).where(eq(clients.id, actor.clientId)).limit(1);
    yield `,"client":${JSON.stringify(client ?? null)}`;
    yield* jsonArray('invoices', ownInvoices(db, actor));
    yield* jsonArray('expenses', ownExpenses(db, actor));
    yield* jsonArray('messages', ownMessages(db, actor));
  }
  yield* jsonArray('accessTokens', ownAccess(db, actor));
  yield '}';
}
