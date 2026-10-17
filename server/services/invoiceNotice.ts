import type { getInvoice } from '../repositories/invoiceRepo';
import { isClientFinancialVisible } from '../permissions';
import { escapeHtml, publicUrl } from '../lib/telegram';

export function invoiceNotice(invoice: NonNullable<Awaited<ReturnType<typeof getInvoice>>>, title: string) {
  const amount = isClientFinancialVisible(invoice.scheme) ? invoice.calculations?.clientBaseAfterMargin ?? invoice.clientBill : invoice.clientBill;
  const formatted = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(Number(amount ?? 0));
  const link = publicUrl(`/invoices/${invoice.id}`);
  return { clientId: invoice.clientId, body: `<b>${title}</b> · ${escapeHtml(invoice.clientTitle || invoice.invoiceNumber)}\nСумма: ${formatted}${link ? `\n<a href="${escapeHtml(link)}">Открыть счёт</a>` : ''}` };
}
