import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiPost } from '@/lib/api';
import { invalidateFinancialQueries } from '@/lib/financialQueries';
import { useToast } from './use-toast';

export function useInvoiceArchive(invoiceId: string) {
  const [pending, setPending] = useState(false);
  const client = useQueryClient();
  const { toast } = useToast();
  const setArchived = async (archived: boolean) => {
    if (pending) return;
    setPending(true);
    try {
      await apiPost(`/invoices/${invoiceId}/archive`, { archived });
      await invalidateFinancialQueries(client);
      toast({ title: archived ? 'Счёт в архиве' : 'Счёт возвращён в рабочий список' });
    } catch (error) {
      toast({ title: 'Ошибка', description: error instanceof Error ? error.message : String(error), variant: 'destructive' });
    } finally { setPending(false); }
  };
  return { pending, setArchived };
}
