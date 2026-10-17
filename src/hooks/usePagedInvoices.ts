import { invoicePageSchema } from "@shared/invoiceContract";
import { useEffect, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { invoiceListView } from '@/lib/invoiceView';
import type { InvoiceDto } from '@shared/contracts';
import type { UserRole } from '@shared/schema';
import { useInvoiceFilters, type InvoiceStatus } from './useInvoiceFilters';

interface InvoicePage {
  invoices: InvoiceDto[]; total: number; pages: number;
  statusCounts: Record<InvoiceStatus, number>;
  clients: { id: string; name: string }[];
  partners: { id: string; name: string }[];
}
const emptyCounts = { all: 0, draft: 0, sent: 0, paid: 0, cancelled: 0, overdue: 0 };

export function usePagedInvoices(role: UserRole, initialStatus: InvoiceStatus | undefined, realtime: boolean) {
  const filters = useInvoiceFilters([], initialStatus, role === 'client' ? { prefix: 'clientInvoices', fields: ['searchQuery', 'statusFilter', 'sortBy'] } : undefined);
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ limit: '100', sort: filters.sortBy });
  if (filters.searchQuery) params.set('search', filters.searchQuery);
  if (filters.statusFilter !== 'all') params.set('status', filters.statusFilter);
  if (filters.clientFilter !== 'all') params.set('clientId', filters.clientFilter);
  if (filters.partnerFilter !== 'all') params.set('partnerId', filters.partnerFilter);
  if (filters.monthFilter !== 'all') params.set('month', filters.monthFilter);
  const filterKey = params.toString();
  useEffect(() => { setPage(1); }, [filterKey]);
  params.set('page', String(page));
  const query = useQuery({ queryKey: ['/api/invoices', 'paged', role, filterKey, page],
    placeholderData: keepPreviousData, queryFn: async () => invoicePageSchema.parse(await apiGet<unknown>(`/invoices?${params}`)) as InvoicePage, staleTime: 30000, refetchInterval: realtime ? 120000 : false,
  });
  return { ...filters, invoices: query.data?.invoices.map(invoiceListView) ?? [],
    loading: query.isLoading, error: query.error, page, setPage, total: query.data?.total ?? 0, pages: query.data?.pages ?? 0,
    clients: query.data?.clients ?? [], partners: query.data?.partners ?? [], statusCounts: query.data?.statusCounts ?? emptyCounts,
  };
}
