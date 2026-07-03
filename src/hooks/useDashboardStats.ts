import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { useEffect, useState } from "react";

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
  expectedProfit?: number;  // Profit from unpaid invoices
  receivedProfit?: number;  // Profit from paid invoices
  totalPlannedExpenses?: number;  // Reserved for planned expenses
  partnerDebt?: number;
  clientRemaining?: number;
  recurringExpectedMonthly?: number;
  recurringExpectedYearly?: number;
}

export function useDashboardStats(interval = 120000) {
  const queryClient = useQueryClient();
  const [isVisible, setIsVisible] = useState(document.visibilityState === "visible");
  
  useEffect(() => {
    const handleVisibilityChange = () => {
      const visible = document.visibilityState === "visible";
      setIsVisible(visible);
      if (visible) {
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [queryClient]);
  
  const query = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => apiGet<DashboardStats>("/dashboard/stats"),
    staleTime: 30000,
    refetchInterval: isVisible ? interval : false,
  });

  return query;
}

export function useInvalidateDashboardStats() {
  const queryClient = useQueryClient();
  
  return () => {
    queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
  };
}
