import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Calendar, DollarSign, AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  ComposedChart,
} from "recharts";

interface MonthlyForecast {
  month: string;
  expectedIncome: number;
  expectedExpenses: number;
  netFlow: number;
  cumulativeBalance: number;
}

export const AdminCashFlowForecast = () => {
  const { accessTokenId } = useAuth();
  const [forecast, setForecast] = useState<MonthlyForecast[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentBalance, setCurrentBalance] = useState(0);

  useEffect(() => {
    fetchCashFlowForecast();
  }, [accessTokenId]);

  const fetchCashFlowForecast = async () => {
    if (!accessTokenId) return;
    
    try {
      const { data, error } = await supabase.rpc('get_admin_cashflow_forecast', {
        _token_id: accessTokenId
      });

      if (error) throw error;

      if (data && data.length > 0) {
        // First row contains current balance
        setCurrentBalance(Number(data[0].current_balance || 0));

        // Rest are monthly forecasts (skip first row which is current balance)
        const forecastData: MonthlyForecast[] = data
          .filter((row: any) => row.month_index > 0)
          .map((row: any) => ({
            month: row.month_name,
            expectedIncome: Number(row.expected_income || 0),
            expectedExpenses: Number(row.expected_expenses || 0),
            netFlow: Number(row.net_flow || 0),
            cumulativeBalance: Number(row.cumulative_balance || 0),
          }));

        setForecast(forecastData);
      }
    } catch (error) {
      console.error("Error fetching cash flow forecast:", error);
    } finally {
      setLoading(false);
    }
  };

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
          {/* Текущий баланс */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <DollarSign className="h-4 w-4" />
                Текущий баланс
              </div>
              <p className="text-2xl font-bold text-primary">
                {formatCurrency(currentBalance)}
              </p>
            </div>
            
            <div className="p-4 rounded-lg bg-green-50 border border-green-200">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <TrendingUp className="h-4 w-4" />
                Средний приход/мес
              </div>
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(
                  forecast.reduce((sum, m) => sum + m.expectedIncome, 0) / 6
                )}
              </p>
            </div>
            
            <div className="p-4 rounded-lg bg-orange-50 border border-orange-200">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <TrendingDown className="h-4 w-4" />
                Средний расход/мес
              </div>
              <p className="text-2xl font-bold text-orange-600">
                {formatCurrency(
                  forecast.reduce((sum, m) => sum + m.expectedExpenses, 0) / 6
                )}
              </p>
            </div>
          </div>

          {/* Предупреждение */}
          {(hasNegativeFlow || hasNegativeBalance) && (
            <div className="p-4 rounded-lg bg-red-50 border border-red-200 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
              <div>
                <p className="font-semibold text-red-900">
                  Внимание: прогнозируется отрицательный баланс
                </p>
                <p className="text-sm text-red-700 mt-1">
                  Рекомендуется ускорить получение платежей от клиентов или
                  отложить выплаты партнерам
                </p>
              </div>
            </div>
          )}

          {/* График */}
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
                  name="Ожидаемый приход"
                  fill="hsl(var(--chart-2))"
                  fillOpacity={0.3}
                  stroke="hsl(var(--chart-2))"
                  strokeWidth={2}
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

          {/* Таблица детализации */}
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
                      ? "border-red-300 bg-red-50/50"
                      : "border-border bg-muted/30"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{month.month}</span>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-green-600">
                        +{formatCurrency(month.expectedIncome)}
                      </span>
                      <span className="text-orange-600">
                        -{formatCurrency(month.expectedExpenses)}
                      </span>
                      <span
                        className={`font-semibold ${
                          month.netFlow >= 0 ? "text-green-600" : "text-red-600"
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
