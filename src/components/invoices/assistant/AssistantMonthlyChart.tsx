import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { TrendingUp } from "lucide-react";
import { callRPC } from "@/lib/supabaseHelpers";
import { useSessionToken } from "@/hooks/useSessionToken";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";

interface Props {
  selectedYear: number;
}

export const AssistantMonthlyChart = ({ selectedYear }: Props) => {
  const { getTokenId } = useSessionToken();
  
  const { data: chartData, isLoading, refetch } = useQuery({
    queryKey: ['assistant-monthly-chart', selectedYear],
    queryFn: async () => {
      const tokenId = getTokenId();
      if (!tokenId) {
        console.error('[AssistantMonthlyChart] No token ID');
        return { data: [], average: 0, bestMonth: null };
      }

      const invoices = await callRPC<any>('get_assistant_stats_invoices', {
        _token_id: tokenId,
        _year: selectedYear
      });

      if (!invoices || invoices.length === 0) {
        return { data: [], average: 0, bestMonth: null };
      }

      const monthlyTotals: Record<number, number> = {};
      
      invoices.forEach(inv => {
        const month = new Date(inv.actual_payment_date!).getMonth();
        monthlyTotals[month] = (monthlyTotals[month] || 0) + (inv.client_bill || 0);
      });

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
              formatter={(value: number) => [`${value.toLocaleString('ru-RU')} ₽`, 'Сумма']}
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
