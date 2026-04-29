import { useState, useMemo, useCallback } from "react";

export type InvoiceStatus = 'all' | 'draft' | 'sent' | 'paid' | 'cancelled' | 'overdue';
export type SortOption = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc';

export interface FilterOption {
  id: string;
  name: string;
}

type PersistedField = 'searchQuery' | 'statusFilter' | 'sortBy' | 'monthFilter';

interface StorageOptions {
  prefix: string;
  fields?: PersistedField[];
}

const readFromStorage = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const writeToStorage = (key: string, value: unknown): void => {
  try {
    if (value === undefined || value === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(value));
    }
  } catch {
    // ignore storage errors
  }
};

export const useInvoiceFilters = (
  invoices: any[],
  initialStatusFilter?: InvoiceStatus,
  storage?: StorageOptions
) => {
  const persists = useCallback(
    (field: PersistedField) =>
      !!storage && (!storage.fields || storage.fields.includes(field)),
    // storage reference is stable across renders when passed as a constant object
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storage?.prefix, storage?.fields?.join(",")]
  );

  const storageKey = useCallback(
    (field: PersistedField) => (storage ? `${storage.prefix}_${field}` : ""),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storage?.prefix]
  );

  const [searchQuery, setSearchQueryState] = useState<string>(() =>
    persists("searchQuery") ? readFromStorage(storageKey("searchQuery"), "") : ""
  );
  const [statusFilter, setStatusFilterState] = useState<InvoiceStatus>(() =>
    persists("statusFilter")
      ? readFromStorage(storageKey("statusFilter"), initialStatusFilter || "all")
      : initialStatusFilter || "all"
  );
  const [sortBy, setSortByState] = useState<SortOption>(() =>
    persists("sortBy") ? readFromStorage(storageKey("sortBy"), "date-desc") : "date-desc"
  );
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [partnerFilter, setPartnerFilter] = useState<string>("all");
  const [monthFilter, setMonthFilterState] = useState<string>(() =>
    persists("monthFilter") ? readFromStorage(storageKey("monthFilter"), "all") : "all"
  );

  const setSearchQuery = useCallback(
    (value: string) => {
      setSearchQueryState(value);
      if (persists("searchQuery")) writeToStorage(storageKey("searchQuery"), value);
    },
    [persists, storageKey]
  );

  const setStatusFilter = useCallback(
    (value: InvoiceStatus) => {
      setStatusFilterState(value);
      if (persists("statusFilter")) writeToStorage(storageKey("statusFilter"), value);
    },
    [persists, storageKey]
  );

  const setSortBy = useCallback(
    (value: SortOption) => {
      setSortByState(value);
      if (persists("sortBy")) writeToStorage(storageKey("sortBy"), value);
    },
    [persists, storageKey]
  );

  const setMonthFilter = useCallback(
    (value: string) => {
      setMonthFilterState(value);
      if (persists("monthFilter")) writeToStorage(storageKey("monthFilter"), value);
    },
    [persists, storageKey]
  );

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
      result = result.filter(
        (inv) =>
          inv.invoice_number?.toLowerCase().includes(query) ||
          inv.client_name?.toLowerCase().includes(query) ||
          inv.partner_name?.toLowerCase().includes(query) ||
          inv.notes?.toLowerCase().includes(query)
      );
    }

    // Client filter
    if (clientFilter !== "all") {
      result = result.filter((inv) => inv.client_id === clientFilter);
    }

    // Partner filter
    if (partnerFilter !== "all") {
      result = result.filter((inv) => inv.partner_id === partnerFilter);
    }

    // Month filter (format: "YYYY-MM")
    if (monthFilter !== "all") {
      result = result.filter((inv) => {
        const invoiceDate = inv.created_at || inv.issue_date;
        if (!invoiceDate) return false;
        const date = new Date(invoiceDate);
        const invMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        return invMonth === monthFilter;
      });
    }

    // Status filter
    if (statusFilter !== "all") {
      if (statusFilter === "overdue") {
        const today = new Date().toISOString().split("T")[0];
        result = result.filter(
          (inv) =>
            inv.status === "sent" &&
            !inv.actual_payment_date &&
            inv.payment_date < today
        );
      } else {
        result = result.filter((inv) => inv.status === statusFilter);
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
        case "date-desc":
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case "date-asc":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case "amount-desc":
          return getClientBill(b) - getClientBill(a);
        case "amount-asc":
          return getClientBill(a) - getClientBill(b);
        default:
          return 0;
      }
    });

    return result;
  }, [invoices, searchQuery, statusFilter, sortBy, clientFilter, partnerFilter, monthFilter]);

  const statusCounts = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];

    return {
      all: invoices.length,
      draft: invoices.filter((inv) => inv.status === "draft").length,
      sent: invoices.filter((inv) => inv.status === "sent").length,
      paid: invoices.filter((inv) => inv.status === "paid").length,
      cancelled: invoices.filter((inv) => inv.status === "cancelled").length,
      overdue: invoices.filter(
        (inv) =>
          inv.status === "sent" &&
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
    monthFilter,
    setMonthFilter,
    clients,
    partners,
    filteredInvoices: filteredAndSortedInvoices,
    statusCounts,
  };
};
