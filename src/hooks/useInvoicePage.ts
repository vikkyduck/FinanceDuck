import { useQuery } from '@tanstack/react-query';
import { invoicePageSchema } from '@shared/invoiceContract';
import { apiGet } from '@/lib/api';

/** Filters and page form the cache key. No previous-filter rows may be selected during loading. */
export function useInvoicePage(filters: Record<string, string | number | boolean | undefined>, enabled = true) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value !== undefined && value !== '') params.set(key, String(value));
  return useQuery({ queryKey: ['/api/invoices', 'page', params.toString()], enabled,
    queryFn: () => apiGet(`/invoices?${params}`, invoicePageSchema), staleTime: 30000 });
}
