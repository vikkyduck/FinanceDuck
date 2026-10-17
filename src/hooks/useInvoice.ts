import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { invoiceDetailsView, type InvoiceDetailsView } from '@/lib/invoiceDetailsView';
import { invoiceDtoSchema, expenseDtoSchema } from '@shared/invoiceContract';
import { useToast } from './use-toast';
import type { InvoiceDto, ExpenseDto } from '@shared/contracts';

type Details = { invoice: InvoiceDetailsView; expenses: Array<ExpenseDto & { invoice_id: string }> };

/** Server data belongs to the current query key, so a late response cannot replace another invoice. */
export function useInvoice(invoiceId: string | null, open: boolean) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const key = ['/api/invoices', 'detail', invoiceId];
  const query = useQuery({
    queryKey: key, enabled: open && Boolean(invoiceId), staleTime: 0,
    queryFn: async (): Promise<Details> => {
      const [invoice, expenses] = await Promise.all([
        apiGet<unknown>(`/invoices/${invoiceId}`), apiGet<unknown>(`/invoices/${invoiceId}/expenses`),
      ]);
      return {
        invoice: invoiceDetailsView(invoiceDtoSchema.parse(invoice) as InvoiceDto),
        expenses: expenseDtoSchema.array().parse(expenses).map(row => ({ ...row, id: row.id!, description: row.description!, invoice_id: row.invoiceId! })),
      };
    },
  });
  useEffect(() => {
    if (query.error) toast({ title: 'Ошибка загрузки', description: query.error.message, variant: 'destructive' });
  }, [query.error, toast]);
  return {
    invoice: query.data?.invoice ?? null, expenses: query.data?.expenses ?? [], loading: query.isLoading, error: query.error,
    fetchInvoiceDetails: query.refetch,
    setInvoice: (update: (previous: InvoiceDetailsView) => InvoiceDetailsView) => {
      queryClient.setQueryData<Details>(key, previous => previous ? { ...previous, invoice: update(previous.invoice) } : previous);
    },
  };
}
