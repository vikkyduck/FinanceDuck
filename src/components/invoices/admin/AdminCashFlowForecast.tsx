import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ensureSessionContext } from "@/lib/supabaseHelpers";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Calendar, DollarSign, AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { addMonths, format, startOfMonth, endOfMonth } from "date-fns";
import { ru } from "date-fns/locale";
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
  const [forecast, setForecast] = useState<MonthlyForecast[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentBalance, setCurrentBalance] = useState(0);

  useEffect(() => {
    fetchCashFlowForecast();
  }, []);

  const fetchCashFlowForecast = async () => {
    try {
      await ensureSessionContext();
      // Получаем текущий баланс
      const { data: paidInvoices } = await supabase
        .from("invoices")
        .select(`
          invoice_calculations(amount_to_admin)
        `)
        .eq("status", "paid");

      const { data: partnerPayments } = await supabase
        .from("partner_payments")
        .select("amount");

      const totalReceived = (paidInvoices || []).reduce(
        (sum: number, inv: any) =>
          sum + (Number(inv.invoice_calculations?.[0]?.amount_to_admin) || 0),
        0
      );

      const totalPaidToPartners = (partnerPayments || []).reduce(
        (sum: number, p: any) => sum + Number(p.amount),
        0
      );

      const balance = totalReceived - totalPaidToPartners;
      setCurrentBalance(balance);

      // Прогноз на следующие 6 месяцев
      const forecastData: MonthlyForecast[] = [];
      let cumulativeBalance = balance;

      for (let i = 0; i < 6; i++) {
        const targetMonth = addMonths(new Date(), i);
        const monthStart = startOfMonth(targetMonth);
        const monthEnd = endOfMonth(targetMonth);

        // Ожидаемый доход (счета со статусом sent и датой оплаты в этом месяце)
        const { data: expectedInvoices } = await supabase
          .from("invoices")
          .select(`
            invoice_calculations(amount_to_admin)
          `)
          .eq("status", "sent")
          .gte("payment_date", monthStart.toISOString())
          .lte("payment_date", monthEnd.toISOString());

        const expectedIncome = (expectedInvoices || []).reduce(
          (sum: number, inv: any) =>
            sum + (Number(inv.invoice_calculations?.[0]?.amount_to_admin) || 0),
          0
        );

        // Ожидаемые расходы (долги партнерам)
        const { data: partnerDebts } = await supabase
          .from("invoices")
          .select(`
            id,
            partner_id,
            invoice_calculations(
              partner_share_from_margin,
              commission_amount
            )
          `)
          .in("status", ["sent", "paid"]);

        const { data: existingPayments } = await supabase
          .from("partner_payments")
          .select("amount, partner_id");

        // Расчет долгов по партнерам
        const partnerDebtsMap = new Map<string, number>();
        (partnerDebts || []).forEach((inv: any) => {
          const calc = inv.invoice_calculations?.[0];
          if (!calc) return;

          const partnerShare =
            Number(calc.partner_share_from_margin) ||
            Number(calc.commission_amount) ||
            0;

          const currentDebt = partnerDebtsMap.get(inv.partner_id) || 0;
          partnerDebtsMap.set(inv.partner_id, currentDebt + partnerShare);
        });

        // Вычитаем уже оплаченное
        (existingPayments || []).forEach((p: any) => {
          const currentDebt = partnerDebtsMap.get(p.partner_id) || 0;
          partnerDebtsMap.set(p.partner_id, Math.max(0, currentDebt - Number(p.amount)));
        });

        const totalPartnerDebt = Array.from(partnerDebtsMap.values()).reduce(
          (sum, debt) => sum + debt,
          0
        );

        // Предполагаем, что выплачиваем 1/6 долга в месяц
        const expectedExpenses = totalPartnerDebt / 6;

        const netFlow = expectedIncome - expectedExpenses;
        cumulativeBalance += netFlow;

        forecastData.push({
          month: format(targetMonth, "LLL yyyy", { locale: ru }),
          expectedIncome,
          expectedExpenses,
          netFlow,
          cumulativeBalance,
        });
      }

      setForecast(forecastData);
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
