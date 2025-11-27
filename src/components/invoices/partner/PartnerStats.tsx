import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Wallet, ShieldAlert } from "lucide-react";
import { formatCurrency, calculatePartnerDebt, InvoiceScheme } from "@/lib/invoiceCalculations";
import { querySupabaseWithFilter } from "@/lib/supabaseHelpers";
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
      // Fetch all paid invoices for this partner with calculations
      const invoices = await querySupabaseWithFilter<any>(
        'invoices',
        `
          id,
          scheme,
          invoice_calculations(
            client_bill,
            commission_amount,
            partner_share_from_margin,
            client_remaining,
            client_base_after_margin,
            executor_expenses_total
          )
        `,
        (query) => query
          .eq('partner_id', partnerId)
          .eq('status', 'paid')
          .not('actual_payment_date', 'is', null),
        { operation: 'fetch_partner_stats_invoices' }
      );

      // Fetch partner payments
      const payments = await querySupabaseWithFilter<any>(
        'partner_payments',
        'amount',
        (query) => query.eq('partner_id', partnerId),
        { operation: 'fetch_partner_stats_payments' }
      );

      let totalInflow = 0;
      let partnerCommission = 0;
      let clientRemaining = 0;
      let totalDebtToAdmin = 0;

      (invoices || []).forEach((invoice: any) => {
        const calcSource = invoice.invoice_calculations;
        const calc = Array.isArray(calcSource) ? calcSource[0] : calcSource;
        if (!calc) return;

        const scheme = invoice.scheme as InvoiceScheme;
        const clientBill = Number(calc.client_bill) || 0;
        const executorExpenses = Number(calc.executor_expenses_total) || 0;
        
        totalInflow += clientBill;

        let commission = 0;
        if (scheme === 'agency_30') {
          commission = Number(calc.partner_share_from_margin) || 0;
          const clientBase = Number(calc.client_base_after_margin) || clientBill * 0.70;
          clientRemaining += Math.max(0, clientBase - executorExpenses);
        } else {
          commission = Number(calc.commission_amount) || 0;
          clientRemaining += Number(calc.client_remaining) || 0;
        }
        
        partnerCommission += commission;
        
        // Use centralized debt calculation
        const { debtToAdmin } = calculatePartnerDebt(scheme, clientBill, commission, executorExpenses);
        totalDebtToAdmin += debtToAdmin;
      });

      const totalPaidToAdmin = (payments || []).reduce(
        (sum, p: any) => sum + Number(p.amount), 0
      );

      const remainingDebt = totalDebtToAdmin - totalPaidToAdmin;

      console.log('[PartnerStats] Calculated stats:', {
        totalInflow,
        partnerCommission,
        totalDebtToAdmin,
        totalPaidToAdmin,
        remainingDebt,
        clientRemaining
      });

      setStats({
        total_inflow: totalInflow,
        partner_commission: partnerCommission,
        partner_expenses: 0,
        admin_expenses: 0,
        debt_to_admin: totalDebtToAdmin,
        client_remaining: clientRemaining,
        total_paid_to_admin: totalPaidToAdmin,
        remaining_debt: remainingDebt,
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

  useRealtimeSubscription({
    channelName: 'partner_stats_expenses',
    table: 'invoice_expenses',
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
                <span className="text-muted-foreground">Получено от клиентов:</span>
                <span className="font-medium">{formatCurrency(stats.total_inflow)}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Ваша комиссия:</span>
                <span className="font-medium text-green-600">-{formatCurrency(stats.partner_commission)}</span>
              </div>
              
              <Separator />
              
              <div className="flex justify-between items-center font-semibold text-lg">
                <span>К переводу админу:</span>
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
