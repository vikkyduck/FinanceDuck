import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { useEffect } from "react";

export interface DashboardStats {
  totalInvoices: number;
  paidInvoices: number;
  pendingInvoices: number;
  overdueInvoices: number;
  totalClientBill: number;
  paidClientBill: number;
  pendingClientBill: number;
  totalExpenses: number;
  totalPartnerCommission?: number;
  totalAdminShare?: number;
  totalNetProfit?: number;
  partnerDebt?: number;
  clientRemaining?: number;
}

export function useDashboardStats(refetchInterval = 30000) {
  const queryClient = useQueryClient();
  
  const query = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => apiGet<DashboardStats>("/dashboard/stats"),
    staleTime: 10000,
    refetchInterval,
  });

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [queryClient]);

  return query;
}

export function useInvalidateDashboardStats() {
  const queryClient = useQueryClient();
  
  return () => {
    queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    queryClient.invalidateQueries({ queryKey: ["invoices"] });
  };
}
