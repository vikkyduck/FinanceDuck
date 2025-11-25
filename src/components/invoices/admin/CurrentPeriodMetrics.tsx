import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, DollarSign, Target, PiggyBank } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { useAuth } from "@/hooks/useAuth";

interface Metric {
  label: string;
  value: number;
  trend: number;
  icon: any;
  format: "currency" | "percent";
}

export const CurrentPeriodMetrics = ({ selectedYear }: { selectedYear: number }) => {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(true);

  const { accessTokenId } = useAuth();

  const fetchMetrics = async () => {
    if (!accessTokenId) return;
    
    try {
      // Получаем данные за текущий и прошлый год
      const { data: currentData, error: currentError } = await supabase.rpc('get_admin_monthly_data', {
        _token_id: accessTokenId,
        _year: selectedYear
      });

      const { data: lastData, error: lastError } = await supabase.rpc('get_admin_monthly_data', {
        _token_id: accessTokenId,
        _year: selectedYear - 1
      });

      if (currentError || lastError) throw currentError || lastError;

      const now = new Date();
      const currentMonth = now.getMonth() + 1;

      // Суммируем данные до текущего месяца включительно
      const currentYearData = (currentData || [])
        .filter((row: any) => row.month_number <= currentMonth)
        .reduce((acc, row: any) => ({
          revenue: acc.revenue + Number(row.total_sales || 0),
          profit: acc.profit + Number(row.total_profit || 0),
        }), { revenue: 0, profit: 0 });

      const lastYearData = (lastData || [])
        .filter((row: any) => row.month_number <= currentMonth)
        .reduce((acc, row: any) => ({
          revenue: acc.revenue + Number(row.total_sales || 0),
          profit: acc.profit + Number(row.total_profit || 0),
        }), { revenue: 0, profit: 0 });

      const revenueTrend = lastYearData.revenue ? 
        ((currentYearData.revenue - lastYearData.revenue) / lastYearData.revenue) * 100 : 0;
      const profitTrend = lastYearData.profit ? 
        ((currentYearData.profit - lastYearData.profit) / lastYearData.profit) * 100 : 0;
      const marginTrend = currentYearData.revenue ? 
        ((currentYearData.profit / currentYearData.revenue) * 100) : 0;

      setMetrics([
        {
          label: "Выручка",
          value: currentYearData.revenue,
          trend: revenueTrend,
          icon: DollarSign,
          format: "currency",
        },
        {
          label: "Чистая прибыль",
          value: currentYearData.profit,
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
      ]);
    } catch (error) {
      console.error("Error fetching metrics:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, [selectedYear, accessTokenId]);

  // Realtime subscriptions for automatic updates
  useRealtimeSubscription({
    channelName: 'current_period_calculations',
    table: 'invoice_calculations',
    event: '*',
    onUpdate: fetchMetrics,
    enabled: true,
  });

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-10 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

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
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
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
