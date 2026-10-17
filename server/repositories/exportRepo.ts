import { and, asc, eq, gt, inArray } from "drizzle-orm";
import type { db as database } from "../db";
import {
  invoices,
  invoiceCalculations,
  clients,
  partners,
  invoiceExpenses,
} from "../../shared/schema";
import { invoiceFilters, type InvoiceQuery } from "../invoiceQuery";
import type { InvoiceActor } from "../invoiceAccess";

/** Stable keyset batches keep a large export independent of total invoice count. */
export async function* invoiceExportPages(
  db: typeof database,
  actor: InvoiceActor,
  filters: Partial<InvoiceQuery>,
) {
  let cursor: string | undefined;
  for (;;) {
    const rows = await db
      .select({
        invoice: invoices,
        calculations: invoiceCalculations,
        client: clients,
        partner: partners,
      })
      .from(invoices)
      .leftJoin(
        invoiceCalculations,
        eq(invoices.id, invoiceCalculations.invoiceId),
      )
      .leftJoin(clients, eq(clients.id, invoices.clientId))
      .leftJoin(partners, eq(partners.id, invoices.partnerId))
      .where(
        and(
          invoiceFilters(actor, filters),
          cursor ? gt(invoices.id, cursor) : undefined,
        ),
      )
      .orderBy(asc(invoices.id))
      .limit(200);
    if (!rows.length) return;
    yield rows.map((row) => ({
      ...row.invoice,
      calculations: row.calculations ?? undefined,
      client: row.client ?? undefined,
      partner: row.partner ?? undefined,
    }));
    cursor = rows.at(-1)!.invoice.id;
  }
}
export async function* expenseExportPages(
  db: typeof database,
  invoiceIds: string[],
) {
  if (!invoiceIds.length) return;
  let cursor: string | undefined;
  for (;;) {
    const rows = await db
      .select()
      .from(invoiceExpenses)
      .where(
        and(
          inArray(invoiceExpenses.invoiceId, invoiceIds),
          cursor ? gt(invoiceExpenses.id, cursor) : undefined,
        ),
      )
      .orderBy(asc(invoiceExpenses.id))
      .limit(200);
    if (!rows.length) return;
    yield rows;
    cursor = rows.at(-1)!.id;
  }
}
