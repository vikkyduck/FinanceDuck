import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { useAuth } from "@/hooks/useAuth";
import { ensureSessionContext } from "@/lib/supabaseHelpers";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, TrendingUp, Wallet, ShieldCheck, CheckCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Agency30Data {
  total_from_client: number;
  partner_share_15: number;
  admin_share_15: number;
  admin_expenses: number;
  total_debt_to_admin: number;
  payments_to_admin: number;
  remaining_debt: number;
  client_remaining_70: number;
}

export const PartnerAgency30Report = () => {
  const { partnerId, isLoading: authLoading } = useAuth();
  const [data, setData] = useState<Agency30Data>({
    total_from_client: 0,
    partner_share_15: 0,
    admin_share_15: 0,
    admin_expenses: 0,
    total_debt_to_admin: 0,
    payments_to_admin: 0,
    remaining_debt: 0,
    client_remaining_70: 0,
  });
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (authLoading) return;

    if (!partnerId) {
      console.log('[PartnerAgency30Report] No partnerId, stopping');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      console.log('[PartnerAgency30Report] Fetching data for partnerId:', partnerId);

      // Ensure session context so RLS works for partner
      await ensureSessionContext();

      // Получаем все счета партнера со схемой agency_30 (только paid)
      const { data: invoices, error: invoicesError } = await supabase
        .from("invoices")
        .select(`
          id,
          scheme,
          invoice_calculations(
            client_bill,
            partner_share_from_margin,
            admin_share_from_margin,
            amount_to_admin,
            client_remaining
          ),
          executor_expenses(
            amount,
            is_admin_expense
          )
        `)
        .eq("partner_id", partnerId)
        .eq("scheme", "agency_30")
        .eq("status", "paid")
        .not("actual_payment_date", "is", null);

      if (invoicesError) throw invoicesError;

      // Получаем все платежи партнера админу
      const { data: payments, error: paymentsError } = await supabase
        .from("partner_payments")
        .select("amount")
        .eq("partner_id", partnerId);

      if (paymentsError) throw paymentsError;

      let totalFromClient = 0;
      let partnerShare = 0;
      let adminShare = 0;
      let adminExpenses = 0;
      let totalDebtToAdmin = 0;
      let clientRemaining = 0;

      console.log('[PartnerAgency30Report] Invoices count:', invoices?.length || 0);

      (invoices || []).forEach((invoice: any) => {
        // Handle both array and object formats for invoice_calculations
        const calcSource = invoice.invoice_calculations;
        const calc = Array.isArray(calcSource) ? calcSource[0] : calcSource;
        if (!calc) return;

        totalFromClient += Number(calc.client_bill) || 0;
        partnerShare += Number(calc.partner_share_from_margin) || 0;
        adminShare += Number(calc.admin_share_from_margin) || 0;
        totalDebtToAdmin += Number(calc.amount_to_admin) || 0;
        clientRemaining += Number(calc.client_remaining) || 0;

        // Считаем расходы админа
        (invoice.executor_expenses || []).forEach((expense: any) => {
          if (expense.is_admin_expense) {
            adminExpenses += Number(expense.amount) || 0;
          }
        });
      });

      const paymentsToAdmin = (payments || []).reduce(
        (sum, p) => sum + Number(p.amount),
        0
      );

      const calculatedData = {
        total_from_client: totalFromClient,
        partner_share_15: partnerShare,
        admin_share_15: adminShare,
        admin_expenses: adminExpenses,
        total_debt_to_admin: totalDebtToAdmin,
        payments_to_admin: paymentsToAdmin,
        remaining_debt: totalDebtToAdmin - paymentsToAdmin,
        client_remaining_70: clientRemaining,
      };

      console.log('[PartnerAgency30Report] Calculated data:', calculatedData);
      setData(calculatedData);
    } catch (error) {
      console.error("[PartnerAgency30Report] Error:", error);
      setData({
        total_from_client: 0,
        partner_share_15: 0,
        admin_share_15: 0,
        admin_expenses: 0,
        total_debt_to_admin: 0,
        payments_to_admin: 0,
        remaining_debt: 0,
        client_remaining_70: 0,
      });
    } finally {
      setLoading(false);
    }
  }, [partnerId, authLoading]);

  useEffect(() => {
    if (!authLoading) {
      fetchData();
    }
  }, [authLoading, fetchData]);

  useRealtimeSubscription({
    channelName: 'partner_agency30_invoices',
    table: 'invoices',
    filter: partnerId ? `partner_id=eq.${partnerId}` : undefined,
    onUpdate: fetchData,
    enabled: !!partnerId,
  });

  useRealtimeSubscription({
    channelName: 'partner_agency30_payments',
    table: 'partner_payments',
    filter: partnerId ? `partner_id=eq.${partnerId}` : undefined,
    onUpdate: fetchData,
    enabled: !!partnerId,
  });

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Отчет по схеме «Агентство 30%»</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">Загрузка...</div>
        </CardContent>
      </Card>
    );
  }

  if (data.total_from_client === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Отчет по схеме «Агентство 30%»</CardTitle>
          <CardDescription>Детальная разбивка доходов и обязательств</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              У вас пока нет счетов по схеме «Агентство 30%»
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Отчет по схеме «Агентство 30%»</CardTitle>
        <CardDescription>Детальная разбивка доходов и обязательств</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Общая сумма от клиентов */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Wallet className="h-4 w-4" />
            <span>Получено от клиентов</span>
          </div>
          <div className="text-3xl font-bold">{formatCurrency(data.total_from_client)}</div>
        </div>

        <Separator />

        {/* Распределение средств */}
        <div className="space-y-4">
          <div className="text-sm font-medium text-muted-foreground">
            Распределение комиссии агентства
          </div>
          
          <div className="grid gap-4 md:grid-cols-2">
            {/* Ваша доля */}
            <div className="rounded-lg border bg-primary/5 p-4 space-y-2">
              <div className="text-sm text-muted-foreground">
                Ваша комиссия
              </div>
              <div className="text-2xl font-bold text-primary">
                {formatCurrency(data.partner_share_15)}
              </div>
              <p className="text-xs text-muted-foreground">
                Ваша комиссия за привлечение клиента
              </p>
            </div>

            {/* Доля админа */}
            <div className="rounded-lg border bg-card p-4 space-y-2">
              <div className="text-sm text-muted-foreground">
                Часть для перевода админу
              </div>
              <div className="text-2xl font-bold">
                {formatCurrency(data.admin_share_15)}
              </div>
              <p className="text-xs text-muted-foreground">
                Базовая часть для перевода
              </p>
            </div>
          </div>

          {/* Расходы админа */}
          {data.admin_expenses > 0 && (
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-orange-600" />
                <div className="text-sm font-medium text-orange-900">
                  Расходы админа на исполнителей
                </div>
              </div>
              <div className="text-2xl font-bold text-orange-600">
                {formatCurrency(data.admin_expenses)}
              </div>
              <p className="text-xs text-muted-foreground">
                Админ авансировал эти средства — вы должны их вернуть
              </p>
            </div>
          )}
        </div>

        <Separator />

        {/* Переводы админу */}
        <div className="space-y-4">
          <div className="text-sm font-medium text-muted-foreground">
            К оплате админу
          </div>

          <div className="rounded-lg border-2 border-primary bg-primary/5 p-6 space-y-4">
            <div className="text-sm text-muted-foreground">
              Итого к переводу админу:
            </div>
            <div className="text-4xl font-bold text-primary">
              {formatCurrency(data.total_debt_to_admin)}
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <div className="flex justify-between">
                <span>Часть комиссии для админа</span>
                <span className="font-mono">{formatCurrency(data.admin_share_15)}</span>
              </div>
              {data.admin_expenses > 0 && (
                <div className="flex justify-between text-orange-600">
                  <span>+ Расходы админа на исполнителей</span>
                  <span className="font-mono">{formatCurrency(data.admin_expenses)}</span>
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Уже оплачено */}
            <div className="rounded-lg border bg-card p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle className="h-4 w-4" />
                <span>Уже переведено</span>
              </div>
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(data.payments_to_admin)}
              </div>
              <p className="text-xs text-muted-foreground">
                Выполненные платежи
              </p>
            </div>

            {/* Осталось заплатить */}
            <div className={`rounded-lg border p-4 space-y-2 ${
              data.remaining_debt > 0 
                ? 'bg-orange-50 border-orange-200' 
                : 'bg-green-50 border-green-200'
            }`}>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Wallet className="h-4 w-4" />
                <span>Осталось перевести</span>
              </div>
              <div className={`text-2xl font-bold ${
                data.remaining_debt > 0 ? 'text-orange-600' : 'text-green-600'
              }`}>
                {formatCurrency(data.remaining_debt)}
              </div>
              <p className="text-xs text-muted-foreground">
                {data.remaining_debt > 0 
                  ? 'Необходимо перевести в ближайшее время'
                  : 'Все платежи выполнены'}
              </p>
            </div>
          </div>

          {data.remaining_debt > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Внимание! У вас есть задолженность перед админом в размере {formatCurrency(data.remaining_debt)}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <Separator />

        {/* Деньги клиента (нельзя трогать) */}
        <div className="rounded-lg border-2 border-destructive/20 bg-destructive/5 p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck className="h-4 w-4 text-destructive" />
            <span>Деньги клиента — трогать нельзя!</span>
          </div>
          <div className="text-2xl font-bold">
            {formatCurrency(data.client_remaining_70)}
          </div>
          <Alert variant="destructive" className="mt-2">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Это средства Вики
            </AlertDescription>
          </Alert>
        </div>

        {/* Формула */}
        <div className="rounded-lg bg-muted/50 p-4 space-y-2">
          <div className="text-sm font-medium">Формула расчета:</div>
          <div className="text-xs text-muted-foreground space-y-1 font-mono">
            <div>Общая сумма от клиента: <span className="text-foreground">{formatCurrency(data.total_from_client)}</span></div>
            <div className="ml-4">├─ Ваша комиссия: <span className="text-primary font-semibold">{formatCurrency(data.partner_share_15)}</span></div>
            <div className="ml-4">├─ Часть для админа: <span className="text-foreground">{formatCurrency(data.admin_share_15)}</span></div>
            {data.admin_expenses > 0 && (
              <div className="ml-4">├─ Расходы админа: <span className="text-orange-600">{formatCurrency(data.admin_expenses)}</span></div>
            )}
            <div className="ml-4 pt-1 border-t border-border">└─ К оплате админу: <span className="text-foreground font-semibold">{formatCurrency(data.total_debt_to_admin)}</span></div>
            <div className="pt-2">Деньги клиента (нельзя трогать): <span className="text-muted-foreground">{formatCurrency(data.client_remaining_70)}</span></div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
