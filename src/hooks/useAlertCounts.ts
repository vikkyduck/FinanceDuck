import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { useVisibilityAwareInterval } from "./useVisibilityAwareInterval";

interface AlertCounts {
  overdueInvoices: number;
  pendingInvoices: number;
  unresolvedSecurityEvents: number;
}

export const useAlertCounts = () => {
  const refetchInterval = useVisibilityAwareInterval();

  const { data, isLoading } = useQuery<AlertCounts>({
    queryKey: ["/api/alert-counts"],
    queryFn: () => apiGet<AlertCounts>("/alert-counts"),
    refetchInterval,
    staleTime: 30000,
  });

  return {
    overdueInvoices: data?.overdueInvoices ?? 0,
    pendingInvoices: data?.pendingInvoices ?? 0,
    unresolvedSecurityEvents: data?.unresolvedSecurityEvents ?? 0,
    loading: isLoading,
  };
};
