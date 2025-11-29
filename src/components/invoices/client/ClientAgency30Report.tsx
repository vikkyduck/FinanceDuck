import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { useUserRole } from "@/hooks/useUserRole";
import { useVisibilityAwareInterval } from "@/hooks/useVisibilityAwareInterval";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, DollarSign, TrendingDown, Wallet } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

interface ClientAgency30Data {
  total_paid: number;
  agency_margin: number;
  client_budget_70: number;
  total_spent: number;
  remaining_budget: number;
}

export const ClientAgency30Report = () => {
  const { clientId, loading: authLoading } = useUserRole();
  const refetchInterval = useVisibilityAwareInterval();

  const { data, isLoading, error } = useQuery<ClientAgency30Data>({
    queryKey: ["/api/client/agency30"],
    queryFn: () => apiGet<ClientAgency30Data>("/client/agency30"),
    enabled: !authLoading && !!clientId,
    refetchInterval,
  });

  if (isLoading || authLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Ваш бюджет по схеме «Агентство 30%»</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Ваш бюджет по схеме «Агентство 30%»</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Ошибка загрузки данных</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.total_paid === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Ваш бюджет по схеме «Агентство 30%»</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            У вас пока нет счетов по схеме «Агентство 30%»
          </div>
        </CardContent>
      </Card>
    );
  }

  const spentPercent = data.client_budget_70 > 0
    ? Math.min(100, (data.total_spent / data.client_budget_70) * 100)
    : 0;
  const isOverBudget = data.remaining_budget < 0;
  const isLowBudget = data.remaining_budget > 0 && data.remaining_budget < data.client_budget_70 * 0.2;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Ваш бюджет по схеме «Агентство 30%»
        </CardTitle>
        <CardDescription>
          Общая картина по всем счетам с агентской схемой
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="p-4 rounded-md border bg-muted/50">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Wallet className="h-4 w-4" />
              Всего оплачено
            </div>
            <p className="text-2xl font-bold">{formatCurrency(data.total_paid)}</p>
          </div>

          <div className="p-4 rounded-md border bg-muted/50">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <DollarSign className="h-4 w-4" />
              Агентская комиссия (30%)
            </div>
            <p className="text-2xl font-bold text-muted-foreground">
              {formatCurrency(data.agency_margin)}
            </p>
          </div>
        </div>

        <Separator />

        <div>
          <h3 className="font-medium mb-3 flex items-center gap-2">
            Ваш бюджет (70% от оплаты)
            {isOverBudget && (
              <AlertCircle className="h-4 w-4 text-destructive" />
            )}
          </h3>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">Бюджет на проект:</span>
              <span className="font-semibold">{formatCurrency(data.client_budget_70)}</span>
            </div>

            <Progress
              value={spentPercent}
              className="h-3"
              indicatorClassName={
                isOverBudget
                  ? "bg-destructive"
                  : isLowBudget
                  ? "bg-warning"
                  : "bg-success"
              }
            />

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1 text-sm">
                <TrendingDown className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Потрачено:</span>
                <span className="font-medium">{formatCurrency(data.total_spent)}</span>
              </div>
              <div className={`font-semibold ${isOverBudget ? "text-destructive" : "text-green-600"}`}>
                Остаток: {formatCurrency(data.remaining_budget)}
              </div>
            </div>
          </div>
        </div>

        {isOverBudget && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Внимание! Расходы превысили бюджет на {formatCurrency(Math.abs(data.remaining_budget))}
            </AlertDescription>
          </Alert>
        )}

        {isLowBudget && !isOverBudget && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Внимание! Осталось менее 20% бюджета
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};
