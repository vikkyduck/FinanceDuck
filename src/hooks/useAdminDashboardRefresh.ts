import { invalidateFinancialQueries, isFinancialQuery } from '@/lib/financialQueries';
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useCallback, useState } from "react";

const DEFAULT_REFETCH_INTERVAL = 120000;

export function useAdminDashboardRefresh(enabled = true) {
  const queryClient = useQueryClient();
  const [isVisible, setIsVisible] = useState(document.visibilityState === "visible");

  const invalidateAll = useCallback(() => {
    invalidateFinancialQueries(queryClient);
  }, [queryClient]);

  const refetchAll = useCallback(() => {
    queryClient.refetchQueries({
      predicate: query => isFinancialQuery(query.queryKey),
    });
  }, [queryClient]);

  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = () => {
      const visible = document.visibilityState === "visible";
      setIsVisible(visible);
      if (visible) {
        invalidateAll();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, invalidateAll]);

  useEffect(() => {
    if (!enabled || !isVisible) return;

    const intervalId = setInterval(() => {
      invalidateAll();
    }, DEFAULT_REFETCH_INTERVAL);

    return () => clearInterval(intervalId);
  }, [enabled, isVisible, invalidateAll]);

  return {
    invalidateAll,
    refetchAll,
    refetchInterval: DEFAULT_REFETCH_INTERVAL,
  };
}

export function useInvalidateAllDashboards() {
  const queryClient = useQueryClient();

  return useCallback(() => {
    invalidateFinancialQueries(queryClient);
  }, [queryClient]);
}
