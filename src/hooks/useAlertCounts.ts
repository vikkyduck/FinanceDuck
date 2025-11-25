import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "./useUserRole";

interface AlertCounts {
  overdueInvoices: number;
  pendingInvoices: number;
  unresolvedSecurityEvents: number;
  loading: boolean;
}

export const useAlertCounts = () => {
  const { role } = useUserRole();
  const [counts, setCounts] = useState<AlertCounts>({
    overdueInvoices: 0,
    pendingInvoices: 0,
    unresolvedSecurityEvents: 0,
    loading: true,
  });

  useEffect(() => {
    if (!role) return;
    
    const fetchCounts = async () => {
      try {
        const today = new Date().toISOString().split('T')[0];

        // Overdue invoices (only for admin/assistant)
        let overdueCount = 0;
        if (role === 'admin' || role === 'assistant') {
          const { count: overdue } = await supabase
            .from("invoices")
            .select("*", { count: 'exact', head: true })
            .eq('status', 'sent')
            .is('actual_payment_date', null)
            .lt('payment_date', today)
            .not('payment_date', 'is', null);
          
          overdueCount = overdue || 0;
        }

        // Pending invoices (for all roles)
        const { count: pending } = await supabase
          .from("invoices")
          .select("*", { count: 'exact', head: true })
          .eq('status', 'draft');
        
        const pendingCount = pending || 0;

        // Unresolved security events (only for admin)
        let securityCount = 0;
        if (role === 'admin') {
          const { count: security } = await supabase
            .from("security_events")
            .select("*", { count: 'exact', head: true })
            .eq('resolved', false)
            .in('severity', ['high', 'critical']);
          
          securityCount = security || 0;
        }

        setCounts({
          overdueInvoices: overdueCount,
          pendingInvoices: pendingCount,
          unresolvedSecurityEvents: securityCount,
          loading: false,
        });
      } catch (error) {
        console.error("Error fetching alert counts:", error);
        setCounts(prev => ({ ...prev, loading: false }));
      }
    };

    fetchCounts();

    // Refresh counts every 30 seconds
    const interval = setInterval(fetchCounts, 30000);
    return () => clearInterval(interval);
  }, [role]);

  return counts;
};
