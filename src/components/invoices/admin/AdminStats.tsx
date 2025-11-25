import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { StatsGrid, StatConfig } from "@/components/ui/stats-grid";
import { TrendingUp, Wallet, FileText, PiggyBank } from "lucide-react";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { useAuth } from "@/hooks/useAuth";

export const AdminStats = () => {
  const { accessTokenId } = useAuth();
  const [stats, setStats] = useState({
    totalRevenue: 0,
    adminShare: 0,
    catShare: 0,
    totalInvoices: 0,
  });

  const fetchStats = async () => {
    if (!accessTokenId) return;
    
    try {
      const { data, error } = await supabase.rpc('get_admin_stats', {
        _token_id: accessTokenId
      });

      if (error) throw error;
      
      if (data && data.length > 0) {
        const stats = data[0];
        setStats({
          totalRevenue: Number(stats.current_month_revenue || 0),
          adminShare: Number(stats.current_month_admin_share || 0),
          catShare: Number(stats.current_month_cat_share || 0),
          totalInvoices: Number(stats.current_month_invoices_count || 0),
        });
      }
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [accessTokenId]);

  // Realtime subscriptions for automatic updates
  useRealtimeSubscription({
    channelName: 'admin_stats_invoices',
    table: 'invoices',
    event: '*',
    onUpdate: fetchStats,
    enabled: true,
  });

  useRealtimeSubscription({
    channelName: 'admin_stats_calculations',
    table: 'invoice_calculations',
    event: '*',
    onUpdate: fetchStats,
    enabled: true,
  });

  const statsConfig: StatConfig[] = [
    {
      icon: FileText,
      title: "Всего выставлено",
      value: formatCurrency(stats.totalRevenue),
      description: `${stats.totalInvoices} счетов`,
    },
    {
      icon: Wallet,
      title: "Доля админа",
      value: formatCurrency(stats.adminShare),
      valueClassName: "text-primary",
      description: `${stats.totalRevenue > 0 ? ((stats.adminShare / stats.totalRevenue) * 100).toFixed(0) : 0}% от общей суммы`,
    },
    {
      icon: PiggyBank,
      title: "Доля Кота",
      value: formatCurrency(stats.catShare),
      valueClassName: "text-primary",
      description: "от чистой прибыли",
    },
    {
      icon: TrendingUp,
      title: "Чистая прибыль",
      value: formatCurrency(stats.adminShare + stats.catShare),
      description: "админ + кот",
    },
  ];

  return <StatsGrid stats={statsConfig} />;
};
