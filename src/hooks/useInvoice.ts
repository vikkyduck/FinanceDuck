import { financialKeys } from '@/lib/financialQueries';
import { useQueryClient } from '@tanstack/react-query';
import type { InvoiceDto, ExpenseDto } from '@shared/contracts';
import { useEffect, useMemo } from 'react';
import { useInvoiceData } from './useInvoiceData';
import { invoiceDetailsView } from '@/lib/invoiceDetailsView';
import { useToast } from './use-toast';


/** Server data belongs to the current query key, so a late response cannot replace another invoice. */
export function useInvoice(invoiceId: string | null, open: boolean) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const query = useInvoiceData(invoiceId, open);
  useEffect(() => {
    if (query.error) toast({ title: 'Ошибка загрузки', description: query.error.message, variant: 'destructive' });
  }, [query.error, toast]);
  // Один объект на один ответ сервера: новый объект на каждом рендере перезапускал эффекты потребителей.
  const invoice = useMemo(() => query.data ? invoiceDetailsView(query.data.invoice) : null, [query.data]);
  const expenses = useMemo(() => query.data?.expenses.map(row => ({ ...row, invoice_id: row.invoiceId })) ?? [], [query.data]);
  return {
    invoice, expenses, loading: query.isLoading, error: query.error,
    fetchInvoiceDetails: query.refetch,
    setStatus: (status: InvoiceDto['status']) => queryClient.setQueryData<{ invoice: InvoiceDto; expenses: ExpenseDto[] }>(
      financialKeys.invoice(invoiceId), previous => previous ? { ...previous, invoice: { ...previous.invoice, status } } : previous),

  };
}
