import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useCallback } from "react";

const DEFAULT_REFETCH_INTERVAL = 30000;

const ADMIN_PREFIXES = [
  "/api/admin",
  "/api/invoices",
  "/api/partners",
  "/api/clients",
  "/api/partner",
  "/api/do-not-spend",
  "dashboard-stats",
  "invoices",
  "admin-stats",
];

export function useAdminDashboardRefresh(enabled = true) {
  const queryClient = useQueryClient();

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey;
        if (!key || key.length === 0) return false;
        const firstKey = String(key[0]);
        return ADMIN_PREFIXES.some(prefix => firstKey.startsWith(prefix));
      },
    });
  }, [queryClient]);

  const refetchAll = useCallback(() => {
    queryClient.refetchQueries({
      predicate: (query) => {
        const key = query.queryKey;
        if (!key || key.length === 0) return false;
        const firstKey = String(key[0]);
        return ADMIN_PREFIXES.some(prefix => firstKey.startsWith(prefix));
      },
    });
  }, [queryClient]);

  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        invalidateAll();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, invalidateAll]);

  useEffect(() => {
    if (!enabled) return;

    const intervalId = setInterval(() => {
      invalidateAll();
    }, DEFAULT_REFETCH_INTERVAL);

    return () => clearInterval(intervalId);
  }, [enabled, invalidateAll]);

  return {
    invalidateAll,
    refetchAll,
    refetchInterval: DEFAULT_REFETCH_INTERVAL,
  };
}

export function useInvalidateAllDashboards() {
  const queryClient = useQueryClient();

  return useCallback(() => {
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey;
        if (!key || key.length === 0) return false;
        const firstKey = String(key[0]);
        return ADMIN_PREFIXES.some(prefix => firstKey.startsWith(prefix));
      },
    });
  }, [queryClient]);
}
