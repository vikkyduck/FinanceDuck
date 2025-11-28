import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";

interface PlanFactData {
  monthNumber: number;
  monthName: string;
  salesTarget: number;
  receiptsTarget: number;
  actualSales: number;
  actualReceipts: number;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

export const CurrentMonthPlanFact = () => {
  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();
  
  const monthNames = [
    "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
    "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
  ];

  const { data: planFactData, isLoading } = useQuery<PlanFactData[]>({
    queryKey: ['/api/admin/plan-fact', currentYear],
    queryFn: () => apiGet(`/api/admin/plan-fact?year=${currentYear}`),
    staleTime: 30000,
  });

  const currentMonthData = planFactData?.find(d => d.monthNumber === currentMonth);

  const salesTarget = currentMonthData?.salesTarget || 0;
  const receiptsTarget = currentMonthData?.receiptsTarget || 0;
  const actualSales = currentMonthData?.actualSales || 0;
  const actualReceipts = currentMonthData?.actualReceipts || 0;

  const salesProgress = salesTarget > 0 ? Math.min(100, (actualSales / salesTarget) * 100) : 0;
  const receiptsProgress = receiptsTarget > 0 ? Math.min(100, (actualReceipts / receiptsTarget) * 100) : 0;
  const hasAnyTarget = salesTarget > 0 || receiptsTarget > 0;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent className="space-y-6">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle data-testid="text-plan-fact-title">
          План / Факт: {monthNames[currentMonth - 1]} {currentYear}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {hasAnyTarget 
            ? "Сравнение плановых и фактических показателей" 
            : "Для отслеживания выполнения плана необходимо задать целевые показатели"}
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {!hasAnyTarget ? (
          <div className="p-6 bg-muted/30 rounded-lg border border-dashed text-center">
            <p className="text-lg font-medium text-muted-foreground">
              Целевые показатели не заданы
            </p>
            <div className="mt-4 space-y-2">
              <p className="text-sm text-muted-foreground">
                Фактические продажи: {formatCurrency(actualSales)}
              </p>
              <p className="text-sm text-muted-foreground">
                Фактические поступления: {formatCurrency(actualReceipts)}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2" data-testid="progress-sales">
              <div className="flex justify-between gap-2 text-sm">
                <span>Продажи</span>
                <span className="text-muted-foreground">
                  {formatCurrency(actualSales)} / {salesTarget > 0 ? formatCurrency(salesTarget) : '—'}
                </span>
              </div>
              {salesTarget > 0 ? (
                <>
                  <Progress value={salesProgress} className="h-2" />
                  <p className="text-xs text-muted-foreground text-right">
                    {salesProgress.toFixed(1)}% выполнено
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Цель продаж не задана
                </p>
              )}
            </div>
            
            <div className="space-y-2" data-testid="progress-receipts">
              <div className="flex justify-between gap-2 text-sm">
                <span>Поступления</span>
                <span className="text-muted-foreground">
                  {formatCurrency(actualReceipts)} / {receiptsTarget > 0 ? formatCurrency(receiptsTarget) : '—'}
                </span>
              </div>
              {receiptsTarget > 0 ? (
                <>
                  <Progress value={receiptsProgress} className="h-2" />
                  <p className="text-xs text-muted-foreground text-right">
                    {receiptsProgress.toFixed(1)}% выполнено
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Цель поступлений не задана
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
