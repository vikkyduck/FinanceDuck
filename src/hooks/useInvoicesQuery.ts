import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useCallback } from "react";
import { apiGet } from "@/lib/api";

const POLLING_INTERVAL = 120000;

export type UserRole = 'admin' | 'assistant' | 'partner' | 'client';

export interface InvoiceFilters {
  status?: string;
  year?: number;
  search?: string;
  partnerId?: string;
  clientId?: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  status: string;
  clientBill: number;
  scheme: string;
  description?: string;
  createdAt: string;
  actualPaymentDate?: string;
  sentDate?: string;
  hideFromAssistant?: boolean;
  partnerId?: string;
  clientId?: string;
  partnerName?: string;
  clientName?: string;
  calculations?: {
    clientBill: number;
    partnerCommission?: number;
    netProfitAdmin?: number;
    executorExpensesTotal?: number;
    clientRemaining?: number;
    partnerTransferDue?: number;
  };
}

interface InvoicesResponse {
  invoices: Invoice[];
  stats?: Record<string, any>;
}

function useVisibility() {
  const [isVisible, setIsVisible] = useState(document.visibilityState === "visible");
  
  useEffect(() => {
    const handler = () => setIsVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);
  
  return isVisible;
}

export function useInvoicesQuery(role: UserRole, filters: InvoiceFilters = {}) {
  const isVisible = useVisibility();
  const queryClient = useQueryClient();
  
  const queryKey = ['invoices', role, filters];
  
  const query = useQuery<InvoicesResponse>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.year) params.set('year', String(filters.year));
      if (filters.search) params.set('search', filters.search);
      if (filters.partnerId) params.set('partnerId', filters.partnerId);
      if (filters.clientId) params.set('clientId', filters.clientId);
      
      const url = `/invoices?${params.toString()}`;
      return apiGet<InvoicesResponse>(url);
    },
    staleTime: 30000,
    refetchInterval: isVisible ? POLLING_INTERVAL : false,
    retry: 2,
    retryDelay: 1000,
  });

  useEffect(() => {
    if (isVisible && query.isStale) {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    }
  }, [isVisible, query.isStale, queryClient]);

  return query;
}

export function useInvalidateInvoices() {
  const queryClient = useQueryClient();
  
  return useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['invoices'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    queryClient.invalidateQueries({ queryKey: ['/api/dashboard/stats'] });
    queryClient.invalidateQueries({ queryKey: ['/api/admin'] });
  }, [queryClient]);
}

export function usePrefetchInvoices(role: UserRole, filters: InvoiceFilters = {}) {
  const queryClient = useQueryClient();
  
  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.year) params.set('year', String(filters.year));
    
    queryClient.prefetchQuery({
      queryKey: ['invoices', role, filters],
      queryFn: async () => {
        const url = `/invoices?${params.toString()}`;
        return apiGet<InvoicesResponse>(url);
      },
      staleTime: 30000,
    });
  }, [queryClient, role, filters]);
}
