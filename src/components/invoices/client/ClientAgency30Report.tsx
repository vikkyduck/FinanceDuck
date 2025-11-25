import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { useUserRole } from "@/hooks/useUserRole";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, DollarSign, TrendingDown, Wallet } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";

interface ClientAgency30Data {
  total_paid: number;
  agency_margin: number;
  client_budget_70: number;
  total_spent: number;
  remaining_budget: number;
}

export const ClientAgency30Report = () => {
  const { clientId } = useUserRole();
  const [data, setData] = useState<ClientAgency30Data>({
    total_paid: 0,
    agency_margin: 0,
    client_budget_70: 0,
    total_spent: 0,
    remaining_budget: 0,
  });
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!clientId) return;

    try {
      setLoading(true);

      // Получаем все счета клиента со схемой agency_30
      const { data: invoices, error } = await supabase
        .from("invoices")
        .select(`
          id,
          scheme,
          invoice_calculations(
            client_bill,
            agency_margin,
            client_base_after_margin,
            client_spent,
            client_remaining
          )
        `)
        .eq("client_id", clientId)
        .eq("scheme", "agency_30");

      if (error) throw error;

      let totalPaid = 0;
      let agencyMargin = 0;
      let clientBudget = 0;
      let totalSpent = 0;
      let remainingBudget = 0;

      (invoices || []).forEach((invoice: any) => {
        const calc = invoice.invoice_calculations?.[0];
        if (!calc) return;

        totalPaid += Number(calc.client_bill) || 0;
        agencyMargin += Number(calc.agency_margin) || 0;
        clientBudget += Number(calc.client_base_after_margin) || 0;
        totalSpent += Number(calc.client_spent) || 0;
        remainingBudget += Number(calc.client_remaining) || 0;
      });

      setData({
        total_paid: totalPaid,
        agency_margin: agencyMargin,
        client_budget_70: clientBudget,
        total_spent: totalSpent,
        remaining_budget: remainingBudget,
      });
    } catch (error) {
      console.error("Error fetching client agency_30 report:", error);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    if (clientId) {
      fetchData();
    }
  }, [clientId, fetchData]);

  useRealtimeSubscription({
    channelName: 'client_agency30_invoices',
    table: 'invoices',
    filter: clientId ? `client_id=eq.${clientId}` : undefined,
    onUpdate: fetchData,
    enabled: !!clientId,
  });

  useRealtimeSubscription({
    channelName: 'client_agency30_expenses',
    table: 'executor_expenses',
    onUpdate: fetchData,
    enabled: !!clientId,
  });

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Ваш бюджет по схеме «Агентство 30%»</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">Загрузка...</div>
        </CardContent>
      </Card>
    );
  }

  if (data.total_paid === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Ваш бюджет по схеме «Агентство 30%»</CardTitle>
          <CardDescription>Отслеживайте расходование вашего бюджета</CardDescription>
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

  const budgetUsedPercentage = data.client_budget_70 > 0
    ? (data.total_spent / data.client_budget_70) * 100
    : 0;

  const isLowBudget = budgetUsedPercentage >= 80;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ваш бюджет по схеме «Агентство 30%»</CardTitle>
        <CardDescription>Отслеживайте расходование вашего бюджета</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Общая сумма */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <DollarSign className="h-4 w-4" />
            <span>Вы оплатили</span>
          </div>
          <div className="text-3xl font-bold">{formatCurrency(data.total_paid)}</div>
        </div>

        <Separator />

        {/* Распределение средств */}
        <div className="space-y-4">
          <div className="text-sm font-medium text-muted-foreground">
            Распределение ваших средств
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Комиссия агентства */}
            <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
              <div className="text-sm text-muted-foreground">
                Комиссия агентства (30%)
              </div>
              <div className="text-xl font-semibold">
                {formatCurrency(data.agency_margin)}
              </div>
              <p className="text-xs text-muted-foreground">
                Оплата услуг агентства
              </p>
            </div>

            {/* Ваш бюджет */}
            <div className="rounded-lg border bg-primary/5 p-4 space-y-2">
              <div className="text-sm text-muted-foreground">
                Ваш бюджет на услуги (70%)
              </div>
              <div className="text-xl font-semibold text-primary">
                {formatCurrency(data.client_budget_70)}
              </div>
              <p className="text-xs text-muted-foreground">
                Доступно для оплаты исполнителей
              </p>
            </div>
          </div>
        </div>

        <Separator />

        {/* Использование бюджета */}
        <div className="space-y-4">
          <div className="text-sm font-medium text-muted-foreground">
            Использование бюджета
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Прогресс использования</span>
              <span className="font-medium">{budgetUsedPercentage.toFixed(1)}%</span>
            </div>
            <Progress 
              value={budgetUsedPercentage} 
              className="h-3"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Потрачено */}
            <div className="rounded-lg border bg-card p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <TrendingDown className="h-4 w-4" />
                <span>Потрачено</span>
              </div>
              <div className="text-2xl font-bold text-orange-600">
                {formatCurrency(data.total_spent)}
              </div>
              <p className="text-xs text-muted-foreground">
                Оплачено исполнителям
              </p>
            </div>

            {/* Остаток */}
            <div className={`rounded-lg border p-4 space-y-2 ${
              isLowBudget ? 'bg-orange-50 border-orange-200' : 'bg-green-50 border-green-200'
            }`}>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Wallet className="h-4 w-4" />
                <span>Остаток бюджета</span>
              </div>
              <div className={`text-2xl font-bold ${
                isLowBudget ? 'text-orange-600' : 'text-green-600'
              }`}>
                {formatCurrency(data.remaining_budget)}
              </div>
              <p className="text-xs text-muted-foreground">
                Доступно для новых заказов
              </p>
            </div>
          </div>

          {isLowBudget && data.remaining_budget > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Внимание! Ваш бюджет почти израсходован. Осталось только {formatCurrency(data.remaining_budget)}.
              </AlertDescription>
            </Alert>
          )}

          {data.remaining_budget <= 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Ваш бюджет полностью израсходован. Для продолжения работы необходимо пополнение.
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* Пояснение */}
        <div className="rounded-lg bg-muted/50 p-4 space-y-2">
          <div className="text-sm font-medium">Как работает схема «Агентство 30%»:</div>
          <div className="text-xs text-muted-foreground space-y-1">
            <div>• Вы оплачиваете счет: <span className="font-mono">{formatCurrency(data.total_paid)}</span></div>
            <div>• Комиссия агентства (30%): <span className="font-mono">{formatCurrency(data.agency_margin)}</span></div>
            <div>• Ваш бюджет на услуги (70%): <span className="font-mono text-primary">{formatCurrency(data.client_budget_70)}</span></div>
            <div className="pt-2 border-t">
              <div>Из вашего бюджета оплачиваются все услуги исполнителей:</div>
              <div className="ml-4">• Потрачено: <span className="font-mono text-orange-600">{formatCurrency(data.total_spent)}</span></div>
              <div className="ml-4">• Осталось: <span className="font-mono text-green-600">{formatCurrency(data.remaining_budget)}</span></div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
