import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Wallet, ShieldAlert } from "lucide-react";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { StatsGrid, StatConfig } from "@/components/ui/stats-grid";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";

interface PartnerStatsData {
  total_inflow: number;
  partner_commission: number;
  partner_expenses: number;
  admin_expenses: number;
  debt_to_admin: number;
  client_remaining: number;
  total_paid_to_admin: number;
  remaining_debt: number;
}

export const PartnerStats = () => {
  const { partnerId, isLoading: authLoading } = useAuth();
  const [stats, setStats] = useState<PartnerStatsData>({
    total_inflow: 0,
    partner_commission: 0,
    partner_expenses: 0,
    admin_expenses: 0,
    debt_to_admin: 0,
    client_remaining: 0,
    total_paid_to_admin: 0,
    remaining_debt: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    if (!partnerId) {
      console.log('[PartnerStats] No partnerId provided');
      return;
    }

    console.log('[PartnerStats] Fetching stats for partnerId:', partnerId);
    setLoading(true);
    try {
      // Use database function for stable calculations
      const { data: debtData, error: debtError } = await supabase
        .rpc('get_partner_debt_to_admin', { _partner_id: partnerId });

      if (debtError) {
        console.error('[PartnerStats] RPC error:', debtError);
        throw debtError;
      }

      console.log('[PartnerStats] RPC result:', debtData);

      const debt = debtData?.[0];
      if (!debt) {
        setStats({
          total_inflow: 0,
          partner_commission: 0,
          partner_expenses: 0,
          admin_expenses: 0,
          debt_to_admin: 0,
          client_remaining: 0,
          total_paid_to_admin: 0,
          remaining_debt: 0,
        });
        return;
      }

      setStats({
        total_inflow: debt.total_inflow || 0,
        partner_commission: debt.partner_commission || 0,
        partner_expenses: debt.partner_expenses || 0,
        admin_expenses: debt.admin_expenses || 0,
        debt_to_admin: debt.debt_to_admin || 0,
        client_remaining: debt.client_remaining_total || 0,
        total_paid_to_admin: debt.total_paid_to_admin || 0,
        remaining_debt: debt.remaining_debt || 0,
      });
    } catch (error) {
      console.error('Error fetching partner stats:', error);
      setError('Ошибка при загрузке статистики');
    } finally {
      setLoading(false);
    }
  }, [partnerId]);

  useEffect(() => {
    if (!authLoading && partnerId) {
      fetchStats();
    } else if (!authLoading && !partnerId) {
      console.log('[PartnerStats] No partnerId after auth loaded');
      setLoading(false);
    }
  }, [partnerId, authLoading, fetchStats]);

  useRealtimeSubscription({
    channelName: 'partner_stats_payments',
    table: 'partner_payments',
    filter: partnerId ? `partner_id=eq.${partnerId}` : undefined,
    onUpdate: fetchStats,
    enabled: !!partnerId,
  });

  useRealtimeSubscription({
    channelName: 'partner_stats_invoices',
    table: 'invoices',
    filter: partnerId ? `partner_id=eq.${partnerId}` : undefined,
    onUpdate: fetchStats,
    enabled: !!partnerId,
  });

  const remainingColor = stats.remaining_debt > 0 ? "text-orange-600" : "text-green-600";

  const statsConfig: StatConfig[] = [
    {
      icon: Wallet,
      title: "Ваша доля",
      value: formatCurrency(stats.partner_commission),
      description: "Ваша комиссия от всех проектов",
    },
    {
      icon: ShieldAlert,
      title: "Не тратить. Деньги на проект",
      value: formatCurrency(stats.client_remaining),
      description: "Бюджет клиентов - нельзя трогать",
      valueClassName: "text-green-600",
    },
  ];

  return (
    <>
      <StatsGrid stats={statsConfig} loading={loading} error={error} columns={2} />
      
      {!loading && !error && (
        <Card className="mt-6 border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Детализация долга перед админом</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Ваша комиссия (вычитается):</span>
                <span className="font-medium text-green-600">-{formatCurrency(stats.partner_commission)}</span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Ваши расходы (вычитаются):</span>
                <span className="font-medium text-green-600">-{formatCurrency(stats.partner_expenses)}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Расходы админа (добавляются):</span>
                <span className="font-medium text-destructive">+{formatCurrency(stats.admin_expenses)}</span>
              </div>
              
              <Separator />
              
              <div className="flex justify-between items-center font-semibold text-lg">
                <span>Итого к переводу:</span>
                <span className="text-primary">{formatCurrency(stats.debt_to_admin)}</span>
              </div>
              
              <div className="flex justify-between items-center text-green-600">
                <span>Уже оплачено:</span>
                <span className="font-medium">{formatCurrency(stats.total_paid_to_admin)}</span>
              </div>
              
              <Separator />
              
              <div className="flex justify-between items-center font-bold text-xl">
                <span>Остаток долга:</span>
                <span className={stats.remaining_debt > 0 ? "text-destructive" : "text-green-600"}>
                  {formatCurrency(stats.remaining_debt)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
};
