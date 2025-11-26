import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { querySupabaseWithFilter } from "@/lib/supabaseHelpers";
import { useAuth } from "@/hooks/useAuth";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { Loader2, TrendingUp, Wallet, Receipt, CreditCard, ShieldAlert } from "lucide-react";

interface CommissionData {
  total_from_client: number;
  partner_commission: number;
  admin_remainder: number;
  admin_expenses: number;
  total_to_admin: number;
  payments_to_admin: number;
  remaining_debt: number;
  client_remaining: number;
}

export const PartnerCommissionReport = () => {
  const { partnerId, isLoading: authLoading } = useAuth();
  const [data, setData] = useState<CommissionData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!partnerId) {
      console.log('[PartnerCommissionReport] No partnerId provided');
      return;
    }

    console.log('[PartnerCommissionReport] Fetching data for partnerId:', partnerId);

    setLoading(true);
    try {
      // Fetch commission-based invoices (only paid)
      const invoices = await querySupabaseWithFilter<any>(
        'invoices',
        `
          *,
          invoice_calculations(*),
          executor_expenses(amount, is_admin_expense)
        `,
        (query) => query
          .eq('partner_id', partnerId)
          .eq('scheme', 'commission_based')
          .eq('status', 'paid')
          .not('actual_payment_date', 'is', null),
        { operation: 'fetch_commission_invoices' }
      );

      if (!invoices) {
        setData(null);
        return;
      }

      // Fetch partner payments
      const payments = await querySupabaseWithFilter<any>(
        'partner_payments',
        'amount',
        (query) => query.eq('partner_id', partnerId),
        { operation: 'fetch_partner_payments' }
      );

      // Calculate totals
      let totalFromClient = 0;
      let partnerCommission = 0;
      let clientRemaining = 0;

      invoices.forEach((invoice: any) => {
        const calcSource = invoice.invoice_calculations;
        const calc = Array.isArray(calcSource) ? calcSource[0] : calcSource;
        if (calc) {
          totalFromClient += calc.client_bill || 0;
          partnerCommission += calc.commission_amount || 0;
          clientRemaining += calc.client_remaining || 0;
        }
      });

      // К переводу админу = Сумма от клиентов - Комиссия партнёра
      // Расходы админа НЕ добавляются к долгу партнёра
      const totalToAdmin = totalFromClient - partnerCommission;
      const paymentsToAdmin = payments?.reduce((sum: number, p: any) => sum + (p.amount || 0), 0) || 0;
      const remainingDebt = totalToAdmin - paymentsToAdmin;

      setData({
        total_from_client: totalFromClient,
        partner_commission: partnerCommission,
        admin_remainder: totalToAdmin,
        admin_expenses: 0, // Не учитываем - это расходы админа, не долг партнёра
        total_to_admin: totalToAdmin,
        payments_to_admin: paymentsToAdmin,
        remaining_debt: remainingDebt,
        client_remaining: clientRemaining,
      });

      console.log('[PartnerCommissionReport] Calculated commission data:', {
        invoicesCount: invoices.length,
        totalFromClient,
        partnerCommission,
        totalToAdmin,
        paymentsToAdmin,
        remainingDebt,
        clientRemaining
      });
    } catch (error) {
      console.error('Error fetching commission report:', error);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [partnerId]);

  useEffect(() => {
    if (!authLoading && partnerId) {
      fetchData();
    } else if (!authLoading && !partnerId) {
      console.log('[PartnerCommissionReport] No partnerId after auth loaded');
      setLoading(false);
    }
  }, [partnerId, authLoading, fetchData]);

  // Real-time subscriptions
  useRealtimeSubscription({
    channelName: 'partner_commission_invoices',
    table: 'invoices',
    filter: partnerId ? `partner_id=eq.${partnerId}` : undefined,
    onUpdate: fetchData,
    enabled: !!partnerId,
  });

  useRealtimeSubscription({
    channelName: 'partner_commission_payments',
    table: 'partner_payments',
    filter: partnerId ? `partner_id=eq.${partnerId}` : undefined,
    onUpdate: fetchData,
    enabled: !!partnerId,
  });

  if (loading) {
    return (
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Отчет: Комиссионная схема</CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.total_from_client === 0) {
    return (
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Отчет: Комиссионная схема</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertDescription>
              У вас пока нет счетов по комиссионной схеме
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-2xl">Отчет: Комиссионная схема</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Total from clients */}
        <div className="flex items-center justify-between p-4 bg-primary/5 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Всего получено от клиентов</p>
              <p className="text-2xl font-bold">{formatCurrency(data.total_from_client)}</p>
            </div>
          </div>
        </div>

        <Separator />

        {/* Commission breakdown */}
        <div className="space-y-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            Распределение комиссии
          </h3>
          
          <div className="grid gap-4 md:grid-cols-2">
            <div className="p-4 bg-accent/50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Receipt className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Ваша комиссия</p>
              </div>
              <p className="text-xl font-semibold">{formatCurrency(data.partner_commission)}</p>
            </div>

            <div className="p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <CreditCard className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Остаток для админа</p>
              </div>
              <p className="text-xl font-semibold">{formatCurrency(data.admin_remainder)}</p>
            </div>
          </div>
        </div>

        <Separator />

        {/* Debt to admin */}
        <div className="space-y-4">
          <h3 className="font-semibold">Долг перед админом</h3>
          
          <div className="space-y-3">
            <div className="flex justify-between items-center font-semibold text-lg">
              <span>К переводу админу:</span>
              <span className="text-primary">{formatCurrency(data.total_to_admin)}</span>
            </div>
            
            <div className="flex justify-between items-center text-green-600">
              <span>Уже оплачено:</span>
              <span className="font-medium">{formatCurrency(data.payments_to_admin)}</span>
            </div>
            
            <Separator />
            
            <div className="flex justify-between items-center font-bold text-xl">
              <span>Остаток долга:</span>
              <span className={data.remaining_debt > 0 ? "text-destructive" : "text-green-600"}>
                {formatCurrency(data.remaining_debt)}
              </span>
            </div>
          </div>
        </div>

        <Separator />

        {/* Client money */}
        <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg border-2 border-green-200 dark:border-green-900">
          <div className="flex items-center gap-2 mb-2">
            <ShieldAlert className="h-5 w-5 text-green-600" />
            <p className="font-semibold text-green-900 dark:text-green-100">Не тратить. Деньги на проект</p>
          </div>
          <p className="text-2xl font-bold text-green-700 dark:text-green-400">{formatCurrency(data.client_remaining)}</p>
          <p className="text-sm text-green-600 dark:text-green-500 mt-1">
            Это бюджет клиентов, который нельзя использовать
          </p>
        </div>

        {/* Summary formula */}
        <Alert className="bg-muted/50">
          <AlertDescription className="text-sm">
            <strong>Формула:</strong> К переводу = Сумма от клиентов - Ваша комиссия
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
};
