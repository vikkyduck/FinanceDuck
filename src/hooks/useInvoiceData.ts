import { financialKeys } from '@/lib/financialQueries';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { invoiceDtoSchema, expenseDtoSchema } from '@shared/invoiceContract';
import type { InvoiceDto, ExpenseDto } from '@shared/contracts';

/** Shared transport contract for both the invoice page and the details dialog. */
export function useInvoiceData(invoiceId: string | null, enabled = true) {
  return useQuery({
    queryKey: financialKeys.invoice(invoiceId), enabled: enabled && Boolean(invoiceId), staleTime: 0,
    queryFn: async (): Promise<{ invoice: InvoiceDto; expenses: ExpenseDto[] }> => {
      const [invoice, expenses] = await Promise.all([
        apiGet(`/invoices/${invoiceId}`, invoiceDtoSchema),
        apiGet(`/invoices/${invoiceId}/expenses`, expenseDtoSchema.array()),
      ]);
      return { invoice, expenses };
    },
  });
}
