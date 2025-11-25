import { useEffect, useState, useCallback } from "react";
import { querySupabaseWithFilter } from "@/lib/supabaseHelpers";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { StatsGrid, StatConfig } from "@/components/ui/stats-grid";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { useUserRole } from "@/hooks/useUserRole";
import { FileText, DollarSign, CheckCircle2, Clock } from "lucide-react";

export const ClientStats = () => {
  const [stats, setStats] = useState({
    totalInvoices: 0,
    totalAmount: 0,
    paidAmount: 0,
    pendingAmount: 0,
    paidCount: 0,
    pendingCount: 0,
  });
  const { clientId } = useUserRole();

  const fetchStats = useCallback(async () => {
    if (!clientId) return;

    const invoices = await querySupabaseWithFilter<any>(
      "invoices",
      `id, status, invoice_calculations(client_bill)`,
      (query) => query.eq("client_id", clientId)
    );

    if (invoices) {
      let totalAmount = 0;
      let paidAmount = 0;
      let paidCount = 0;

      invoices.forEach((inv: any) => {
        const bill = inv.invoice_calculations?.[0]?.client_bill || 0;
        totalAmount += Number(bill);
        
        if (inv.status === 'paid') {
          paidAmount += Number(bill);
          paidCount++;
        }
      });

      setStats({
        totalInvoices: invoices.length,
        totalAmount,
        paidAmount,
        pendingAmount: totalAmount - paidAmount,
        paidCount,
        pendingCount: invoices.length - paidCount,
      });
    }
  }, [clientId]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useRealtimeSubscription({
    channelName: 'client_stats',
    table: 'invoices',
    filter: clientId ? `client_id=eq.${clientId}` : undefined,
    onUpdate: fetchStats,
    enabled: !!clientId,
  });

  const paidPercentage = stats.totalAmount > 0 ? (stats.paidAmount / stats.totalAmount) * 100 : 0;

  const statsConfig: StatConfig[] = [
    {
      icon: FileText,
      title: "Всего счетов",
      value: stats.totalInvoices,
      description: `Оплачено: ${stats.paidCount} из ${stats.totalInvoices}`,
    },
    {
      icon: DollarSign,
      title: "Общая сумма",
      value: formatCurrency(stats.totalAmount),
      description: `на ${stats.totalInvoices} ${stats.totalInvoices === 1 ? 'счёт' : 'счетов'}`,
    },
    {
      icon: CheckCircle2,
      title: "Оплачено",
      value: formatCurrency(stats.paidAmount),
      valueClassName: "text-green-600",
      description: `${stats.paidCount} ${stats.paidCount === 1 ? 'счёт' : 'счетов'}`,
      progress: paidPercentage,
    },
    {
      icon: Clock,
      title: "К оплате",
      value: formatCurrency(stats.pendingAmount),
      valueClassName: stats.pendingAmount > 0 ? "text-orange-600" : "text-muted-foreground",
      description: `${stats.pendingCount} ${stats.pendingCount === 1 ? 'счёт' : 'счетов'}`,
    },
  ];

  return <StatsGrid stats={statsConfig} />;
};
