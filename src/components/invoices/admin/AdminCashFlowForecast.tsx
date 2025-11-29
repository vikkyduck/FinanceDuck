import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Calendar, DollarSign, AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { useVisibilityAwareInterval } from "@/hooks/useVisibilityAwareInterval";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  ComposedChart,
  Line,
} from "recharts";

interface ForecastData {
  monthIndex: number;
  monthName: string;
  yearNum: number;
  expectedAmount: number;
  receivedAmount: number;
  recurringAmount?: number;
}

interface MonthlyForecast {
  month: string;
  expectedIncome: number;
  expectedExpenses: number;
  recurringIncome: number;
  totalExpected: number;
  netFlow: number;
  cumulativeBalance: number;
}

const apiGet = async (path: string) => {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to fetch');
  }
  return response.json();
};

export const AdminCashFlowForecast = () => {
  const { isAuthenticated } = useAuth();
  const refetchInterval = useVisibilityAwareInterval();

  const { data: forecastData, isLoading: loadingForecast } = useQuery<ForecastData[]>({
    queryKey: ['/api/admin/forecast'],
    queryFn: () => apiGet('/admin/forecast?months=6'),
    enabled: isAuthenticated,
    refetchInterval,
  });

  const { data: stats, isLoading: loadingStats } = useQuery<{ totalNetProfit?: number; totalClientBill?: number }>({
    queryKey: ['/api/dashboard/stats'],
    queryFn: () => apiGet('/dashboard/stats'),
    enabled: isAuthenticated,
    refetchInterval,
  });

  const loading = loadingForecast || loadingStats;

  const forecast: MonthlyForecast[] = (forecastData || []).map(f => {
    const recurringIncome = f.recurringAmount || 0;
    const expectedIncome = f.expectedAmount + f.receivedAmount;
    const totalExpected = expectedIncome + recurringIncome;
    const expectedExpenses = totalExpected * 0.3;
    const netFlow = totalExpected - expectedExpenses;
    return {
      month: f.monthName,
      expectedIncome,
      expectedExpenses,
      recurringIncome,
      totalExpected,
      netFlow,
      cumulativeBalance: 0,
    };
  });

  let runningBalance = stats?.totalNetProfit || 0;
  forecast.forEach(m => {
    runningBalance += m.netFlow;
    m.cumulativeBalance = runningBalance;
  });

  const currentBalance = stats?.totalNetProfit || 0;

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (forecast.length === 0) {
    return null;
  }

  const hasNegativeFlow = forecast.some((m) => m.netFlow < 0);
  const hasNegativeBalance = forecast.some((m) => m.cumulativeBalance < 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Прогноз Cash Flow
          </CardTitle>
          <CardDescription>
            Прогноз денежных потоков на следующие 6 месяцев
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <DollarSign className="h-4 w-4" />
                Текущий баланс
              </div>
              <p className="text-2xl font-bold text-primary">
                {formatCurrency(currentBalance)}
              </p>
            </div>
            
            <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <TrendingUp className="h-4 w-4" />
                Средний приход/мес
              </div>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                {formatCurrency(
                  forecast.length > 0 
                    ? forecast.reduce((sum, m) => sum + m.totalExpected, 0) / forecast.length
                    : 0
                )}
              </p>
            </div>
            
            <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Calendar className="h-4 w-4" />
                Recurring/мес
              </div>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {formatCurrency(
                  forecast.length > 0 
                    ? forecast.reduce((sum, m) => sum + m.recurringIncome, 0) / forecast.length
                    : 0
                )}
              </p>
            </div>
            
            <div className="p-4 rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <TrendingDown className="h-4 w-4" />
                Средний расход/мес
              </div>
              <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                {formatCurrency(
                  forecast.length > 0
                    ? forecast.reduce((sum, m) => sum + m.expectedExpenses, 0) / forecast.length
                    : 0
                )}
              </p>
            </div>
          </div>

          {(hasNegativeFlow || hasNegativeBalance) && (
            <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" />
              <div>
                <p className="font-semibold text-red-900 dark:text-red-100">
                  Внимание: прогнозируется отрицательный баланс
                </p>
                <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                  Рекомендуется ускорить получение платежей от клиентов или
                  отложить выплаты партнерам
                </p>
              </div>
            </div>
          )}

          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={forecast}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 12 }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) =>
                    `${(value / 1000).toFixed(0)}K`
                  }
                />
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  contentStyle={{
                    backgroundColor: "rgba(255, 255, 255, 0.95)",
                    border: "1px solid #ccc",
                    borderRadius: "8px",
                  }}
                />
                <Legend />
                
                <Area
                  type="monotone"
                  dataKey="expectedIncome"
                  name="Разовые счета"
                  fill="hsl(var(--chart-2))"
                  fillOpacity={0.3}
                  stroke="hsl(var(--chart-2))"
                  strokeWidth={2}
                  stackId="income"
                />
                
                <Area
                  type="monotone"
                  dataKey="recurringIncome"
                  name="Регулярные счета"
                  fill="hsl(var(--chart-4))"
                  fillOpacity={0.5}
                  stroke="hsl(var(--chart-4))"
                  strokeWidth={2}
                  stackId="income"
                />
                
                <Area
                  type="monotone"
                  dataKey="expectedExpenses"
                  name="Ожидаемый расход"
                  fill="hsl(var(--chart-1))"
                  fillOpacity={0.3}
                  stroke="hsl(var(--chart-1))"
                  strokeWidth={2}
                />
                
                <Line
                  type="monotone"
                  dataKey="cumulativeBalance"
                  name="Накопленный баланс"
                  stroke="hsl(var(--primary))"
                  strokeWidth={3}
                  dot={{ fill: "hsl(var(--primary))", r: 4 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-2">
            <h4 className="font-semibold flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Помесячная детализация
            </h4>
            <div className="space-y-2">
              {forecast.map((month, index) => (
                <motion.div
                  key={month.month}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`p-3 rounded-lg border ${
                    month.netFlow < 0
                      ? "border-red-300 dark:border-red-700 bg-red-50/50 dark:bg-red-950/30"
                      : "border-border bg-muted/30"
                  }`}
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="font-medium">{month.month}</span>
                    <div className="flex items-center gap-4 text-sm flex-wrap">
                      <span className="text-green-600 dark:text-green-400">
                        +{formatCurrency(month.expectedIncome)}
                      </span>
                      {month.recurringIncome > 0 && (
                        <span className="text-blue-600 dark:text-blue-400">
                          +{formatCurrency(month.recurringIncome)} (recurring)
                        </span>
                      )}
                      <span className="text-orange-600 dark:text-orange-400">
                        -{formatCurrency(month.expectedExpenses)}
                      </span>
                      <span
                        className={`font-semibold ${
                          month.netFlow >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                        }`}
                      >
                        {month.netFlow >= 0 ? "+" : ""}
                        {formatCurrency(month.netFlow)}
                      </span>
                      <span className="text-muted-foreground">
                        Баланс: {formatCurrency(month.cumulativeBalance)}
                      </span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};
