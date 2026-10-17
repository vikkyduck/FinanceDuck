import type { ExportStore } from '../routeStores';
import type { InvoiceActor } from '../invoiceAccess';
import type { InvoiceQuery } from '../invoiceQuery';
import { CommandError } from '../lib/commandError';

/** Printable reports need an in-memory layout, so bound their data before rendering. */
export async function readClientReportInvoices(storage: ExportStore, actor: InvoiceActor, query: InvoiceQuery) {
  if (actor.role !== 'client' && !query.invoiceId && !query.clientId) {
    throw new CommandError('invoiceId или clientId обязателен', 400);
  }
  const result: Awaited<ReturnType<ExportStore['getInvoices']>> = [];
  for await (const page of storage.invoiceExportPages(actor, query)) {
    const included = page.filter(invoice => invoice.status !== 'cancelled');
    if (result.length + included.length > 2000) throw new CommandError('В отчёте больше 2000 счетов. Укажите меньший период или отдельный счёт.', 413);
    result.push(...included);
  }
  // Preserve the previous report order while reading in bounded keyset batches.
  return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() || a.id.localeCompare(b.id));
}
