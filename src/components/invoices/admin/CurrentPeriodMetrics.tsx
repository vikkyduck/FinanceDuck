import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, DollarSign, Target, PiggyBank } from "lucide-react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { MetricCardSkeletonGrid } from "@/components/ui/metric-card-skeleton";

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
}

export const CurrentPeriodMetrics = ({ selectedYear }: { selectedYear: number }) => {
  const { data: currentYearData, isLoading: loadingCurrent } = useQuery<MonthlyData[]>({
    queryKey: ['/api/admin/monthly-data', selectedYear],
  });

  const { data: lastYearData, isLoading: loadingLast } = useQuery<MonthlyData[]>({
    queryKey: ['/api/admin/monthly-data', selectedYear - 1],
  });

  const loading = loadingCurrent || loadingLast;

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
    },
    {
      label: "Чистая прибыль",
      value: currentYearTotals.profit,
      trend: profitTrend,
      icon: PiggyBank,
      format: "currency",
    },
    {
      label: "Маржинальность",
      value: marginTrend,
      trend: 0,
      icon: Target,
      format: "percent",
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
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {metric.label}
                </CardTitle>
                <div className="p-2 rounded-full bg-primary/10">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
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
