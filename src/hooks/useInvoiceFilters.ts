import { useState, useMemo } from "react";

export type InvoiceStatus = 'all' | 'draft' | 'sent' | 'paid' | 'cancelled' | 'overdue';
export type SortOption = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc';

export interface FilterOption {
  id: string;
  name: string;
}

export const useInvoiceFilters = (invoices: any[], initialStatusFilter?: InvoiceStatus) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus>(initialStatusFilter || 'all');
  const [sortBy, setSortBy] = useState<SortOption>('date-desc');
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [partnerFilter, setPartnerFilter] = useState<string>('all');

  // Extract unique clients and partners from invoices
  const { clients, partners } = useMemo(() => {
    const clientMap = new Map<string, string>();
    const partnerMap = new Map<string, string>();
    
    for (const inv of invoices) {
      if (inv.client_id && inv.client_name) {
        clientMap.set(inv.client_id, inv.client_name);
      }
      if (inv.partner_id && inv.partner_name) {
        partnerMap.set(inv.partner_id, inv.partner_name);
      }
    }
    
    const clientsList: FilterOption[] = Array.from(clientMap.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    
    const partnersList: FilterOption[] = Array.from(partnerMap.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    
    return { clients: clientsList, partners: partnersList };
  }, [invoices]);

  const filteredAndSortedInvoices = useMemo(() => {
    let result = [...invoices];

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(inv => 
        inv.invoice_number?.toLowerCase().includes(query) ||
        inv.client_name?.toLowerCase().includes(query) ||
        inv.partner_name?.toLowerCase().includes(query) ||
        inv.notes?.toLowerCase().includes(query)
      );
    }

    // Client filter
    if (clientFilter !== 'all') {
      result = result.filter(inv => inv.client_id === clientFilter);
    }

    // Partner filter
    if (partnerFilter !== 'all') {
      result = result.filter(inv => inv.partner_id === partnerFilter);
    }

    // Status filter
    if (statusFilter !== 'all') {
      if (statusFilter === 'overdue') {
        const today = new Date().toISOString().split('T')[0];
        result = result.filter(inv => 
          inv.status === 'sent' && 
          !inv.actual_payment_date &&
          inv.payment_date < today
        );
      } else {
        result = result.filter(inv => inv.status === statusFilter);
      }
    }

    // Sorting
    result.sort((a, b) => {
      const getClientBill = (inv: any) => {
        const calcRaw = inv.invoice_calculations;
        const calc = Array.isArray(calcRaw) ? calcRaw[0] : calcRaw;
        return calc?.client_bill || inv.client_bill || 0;
      };

      switch (sortBy) {
        case 'date-desc':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'date-asc':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'amount-desc':
          return getClientBill(b) - getClientBill(a);
        case 'amount-asc':
          return getClientBill(a) - getClientBill(b);
        default:
          return 0;
      }
    });

    return result;
  }, [invoices, searchQuery, statusFilter, sortBy, clientFilter, partnerFilter]);

  const statusCounts = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    
    return {
      all: invoices.length,
      draft: invoices.filter(inv => inv.status === 'draft').length,
      sent: invoices.filter(inv => inv.status === 'sent').length,
      paid: invoices.filter(inv => inv.status === 'paid').length,
      cancelled: invoices.filter(inv => inv.status === 'cancelled').length,
      overdue: invoices.filter(inv => 
        inv.status === 'sent' && 
        !inv.actual_payment_date &&
        inv.payment_date < today
      ).length,
    };
  }, [invoices]);

  return {
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    sortBy,
    setSortBy,
    clientFilter,
    setClientFilter,
    partnerFilter,
    setPartnerFilter,
    clients,
    partners,
    filteredInvoices: filteredAndSortedInvoices,
    statusCounts,
  };
};
