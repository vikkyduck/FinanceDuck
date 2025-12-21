import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, DollarSign, Target, PiggyBank, HelpCircle } from "lucide-react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { MetricCardSkeletonGrid } from "@/components/ui/metric-card-skeleton";
import { apiGet } from "@/lib/api";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface MonthlyData {
  monthNumber: number;
  totalSales: number;
  totalProfit: number;
  invoiceCount: number;
  expenses: number;
}

interface Metric {
  label: string;
  value: number;
  trend: number;
  icon: any;
  format: "currency" | "percent";
  tooltip: string;
}

export const CurrentPeriodMetrics = ({ selectedYear }: { selectedYear: number }) => {
  const { data: currentYearData, isLoading: loadingCurrent, isError: errorCurrent } = useQuery<MonthlyData[]>({
    queryKey: ['admin-monthly-data', selectedYear],
    queryFn: () => apiGet<MonthlyData[]>(`/admin/monthly-data?year=${selectedYear}`),
    retry: 2,
  });

  const { data: lastYearData, isLoading: loadingLast, isError: errorLast } = useQuery<MonthlyData[]>({
    queryKey: ['admin-monthly-data', selectedYear - 1],
    queryFn: () => apiGet<MonthlyData[]>(`/admin/monthly-data?year=${selectedYear - 1}`),
    retry: 2,
  });

  const loading = loadingCurrent || loadingLast;
  
  // Handle errors gracefully
  if (errorCurrent || errorLast) return null;

  if (loading) {
    return (
      <MetricCardSkeletonGrid
        count={3}
        columns={3}
        showHeader
        showIcon={false}
        size="default"
        gridClassName="grid-cols-1 md:grid-cols-3"
        className="gap-4"
      />
    );
  }

  const currentMonth = new Date().getMonth() + 1;

  const currentYearTotals = (currentYearData || [])
    .filter(row => row.monthNumber <= currentMonth)
    .reduce((acc, row) => ({
      revenue: acc.revenue + row.totalSales,
      profit: acc.profit + row.totalProfit,
    }), { revenue: 0, profit: 0 });

  const lastYearTotals = (lastYearData || [])
    .filter(row => row.monthNumber <= currentMonth)
    .reduce((acc, row) => ({
      revenue: acc.revenue + row.totalSales,
      profit: acc.profit + row.totalProfit,
    }), { revenue: 0, profit: 0 });

  const revenueTrend = lastYearTotals.revenue > 0
    ? ((currentYearTotals.revenue - lastYearTotals.revenue) / lastYearTotals.revenue) * 100
    : 0;
  const profitTrend = lastYearTotals.profit > 0
    ? ((currentYearTotals.profit - lastYearTotals.profit) / lastYearTotals.profit) * 100
    : 0;
  const marginTrend = currentYearTotals.revenue > 0
    ? (currentYearTotals.profit / currentYearTotals.revenue) * 100
    : 0;

  const metrics: Metric[] = [
    {
      label: "Выручка",
      value: currentYearTotals.revenue,
      trend: revenueTrend,
      icon: DollarSign,
      format: "currency",
      tooltip: "Сумма clientBill по ОПЛАЧЕННЫМ счетам с начала года. Учитываются только счета со статусом 'paid' и датой оплаты в текущем году.",
    },
    {
      label: "Чистая прибыль",
      value: currentYearTotals.profit,
      trend: profitTrend,
      icon: PiggyBank,
      format: "currency",
      tooltip: "Формула: netProfitAdmin = amountToAdmin - expensesPaidByAdmin. Это доля админа минус расходы, оплаченные админом. Расходы партнёра НЕ вычитаются.",
    },
    {
      label: "Маржинальность",
      value: marginTrend,
      trend: 0,
      icon: Target,
      format: "percent",
      tooltip: "Формула: Чистая прибыль / Выручка × 100%. Показывает, какой процент от выручки остаётся как чистая прибыль.",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {metrics.map((metric, index) => {
        const Icon = metric.icon;
        const isPositive = metric.trend >= 0;
        const TrendIcon = isPositive ? TrendingUp : TrendingDown;

        return (
          <motion.div
            key={metric.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="hover-scale">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2 p-4 sm:p-6">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {metric.label}
                  </CardTitle>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-sm">{metric.tooltip}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="p-2 rounded-full bg-primary/10">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
                <div className="text-xl sm:text-3xl font-bold">
                  {metric.format === "currency"
                    ? `${metric.value.toLocaleString("ru-RU")} ₽`
                    : `${metric.value.toFixed(1)}%`}
                </div>
                {metric.trend !== 0 && (
                  <div
                    className={`flex items-center gap-1 text-sm mt-2 ${
                      isPositive ? "text-success" : "text-destructive"
                    }`}
                  >
                    <TrendIcon className="w-4 h-4" />
                    <span>{Math.abs(metric.trend).toFixed(1)}% vs прошлый год</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
};
