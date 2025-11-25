import { useEffect, useRef } from "react";
import { useAlertCounts } from "./useAlertCounts";
import { toast } from "@/hooks/use-toast";
import { AlertCircle, AlertTriangle } from "lucide-react";

export const useAlertNotifications = () => {
  const { overdueInvoices, unresolvedSecurityEvents, loading } = useAlertCounts();
  const prevCounts = useRef({ overdueInvoices: 0, unresolvedSecurityEvents: 0 });
  const isInitialized = useRef(false);

  useEffect(() => {
    // Skip notifications on initial load
    if (loading || !isInitialized.current) {
      if (!loading) {
        prevCounts.current = { overdueInvoices, unresolvedSecurityEvents };
        isInitialized.current = true;
      }
      return;
    }

    // Check for new overdue invoices
    if (overdueInvoices > prevCounts.current.overdueInvoices) {
      const newCount = overdueInvoices - prevCounts.current.overdueInvoices;
      toast({
        title: "Новые просроченные счета",
        description: `Обнаружено ${newCount} ${newCount === 1 ? 'новый просроченный счет' : 'новых просроченных счетов'}`,
        variant: "destructive",
        duration: 8000,
      });
    }

    // Check for new critical security events
    if (unresolvedSecurityEvents > prevCounts.current.unresolvedSecurityEvents) {
      const newCount = unresolvedSecurityEvents - prevCounts.current.unresolvedSecurityEvents;
      toast({
        title: "Критические события безопасности",
        description: `Обнаружено ${newCount} ${newCount === 1 ? 'новое событие' : 'новых событий'} высокой важности`,
        variant: "destructive",
        duration: 10000,
      });
    }

    // Update previous counts
    prevCounts.current = { overdueInvoices, unresolvedSecurityEvents };
  }, [overdueInvoices, unresolvedSecurityEvents, loading]);
};
