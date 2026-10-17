import { assistantSummarySchema } from '@shared/assistantContract';
import { apiGet } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { TrendingUp } from "lucide-react";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";

interface Props {
  selectedYear: number;
}

export const AssistantMonthlyChart = ({ selectedYear }: Props) => {
  const { data: chartData, isLoading, error, refetch } = useQuery({
    queryKey: ['assistant-monthly-chart', selectedYear],
    queryFn: async () => {
      const summary = await apiGet(`/assistant/invoice-summary?year=${selectedYear}`, assistantSummarySchema);
      const monthlyTotals = Object.fromEntries(summary.monthly.map(row => [row.month, Number(row.total)]));
      const data = Array.from({ length: 12 }, (_, i) => ({
        month: format(new Date(selectedYear, i), 'MMM', { locale: ru }),
        amount: monthlyTotals[i] || 0,
        monthIndex: i
      }));

      const filledMonths = data.filter(d => d.amount > 0);
      const average = filledMonths.length > 0
        ? filledMonths.reduce((sum, d) => sum + d.amount, 0) / filledMonths.length
        : 0;

      const bestMonth = data.reduce((max, d) => 
        d.amount > max.amount ? d : max, data[0]
      );

      return { data, average, bestMonth };
    }
  });

  // Realtime subscriptions for automatic updates
  useRealtimeSubscription({
    channelName: 'assistant_monthly_invoices',
    table: 'invoices',
    event: '*',
    onUpdate: () => refetch(),
    enabled: true,
  });

  useRealtimeSubscription({
    channelName: 'assistant_monthly_calculations',
    table: 'invoice_calculations',
    event: '*',
    onUpdate: () => refetch(),
    enabled: true,
  });

  if (error) return <p role="alert">Не удалось загрузить статистику. <button onClick={() => refetch()}>Повторить</button></p>;

  if (isLoading || !chartData) {
    return (
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Динамика по месяцам</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 animate-pulse bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Динамика по месяцам {selectedYear}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData.data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis 
              dataKey="month" 
              className="text-xs"
              tick={{ fill: 'hsl(var(--muted-foreground))' }}
            />
            <YAxis 
              className="text-xs"
              tick={{ fill: 'hsl(var(--muted-foreground))' }}
              tickFormatter={(value) => `${(value / 1000000).toFixed(1)}М`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px'
              }}
              formatter={(value: number) => [formatMoney(value), 'Сумма']}
            />
            {chartData.average > 0 && (
              <ReferenceLine
                y={chartData.average}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="3 3"
                label={{
                  value: 'Среднее',
                  position: 'right',
                  fill: 'hsl(var(--muted-foreground))',
                  fontSize: 12
                }}
              />
            )}
            <Bar
              dataKey="amount"
              fill="hsl(var(--primary))"
              radius={[8, 8, 0, 0]}
              opacity={0.8}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};
