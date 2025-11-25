import { useState, useMemo } from "react";

export type InvoiceStatus = 'all' | 'draft' | 'sent' | 'paid' | 'cancelled' | 'overdue';
export type SortOption = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc';

export const useInvoiceFilters = (invoices: any[], initialStatusFilter?: InvoiceStatus) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus>(initialStatusFilter || 'all');
  const [sortBy, setSortBy] = useState<SortOption>('date-desc');

  const filteredAndSortedInvoices = useMemo(() => {
    let result = [...invoices];

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(inv => 
        inv.invoice_number?.toLowerCase().includes(query) ||
        inv.clients?.name?.toLowerCase().includes(query) ||
        inv.partners?.name?.toLowerCase().includes(query)
      );
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
        return calc?.client_bill || 0;
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
  }, [invoices, searchQuery, statusFilter, sortBy]);

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
    filteredInvoices: filteredAndSortedInvoices,
    statusCounts,
  };
};
