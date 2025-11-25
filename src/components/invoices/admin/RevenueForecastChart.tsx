import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";

interface MonthlyForecast {
  month: string;
  monthIndex: number;
  year: number;
  expected: number;
  received: number;
}

interface RevenueForecastChartProps {
  monthsAhead?: number;
}

export const RevenueForecastChart = ({ monthsAhead = 6 }: RevenueForecastChartProps) => {
  const [data, setData] = useState<MonthlyForecast[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchForecastData();
  }, [monthsAhead]);

  const { accessTokenId } = useAuth();

  const fetchForecastData = async () => {
    if (!accessTokenId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_admin_forecast', {
        _token_id: accessTokenId,
        _months_ahead: monthsAhead
      });

      if (error) throw error;

      const chartData: MonthlyForecast[] = (data || []).map((row: any) => ({
        month: row.month_name,
        monthIndex: Number(row.month_index),
        year: Number(row.year_num),
        expected: Number(row.expected_amount || 0),
        received: Number(row.received_amount || 0),
      }));

      setData(chartData);
    } catch (error) {
      console.error("Error fetching forecast data:", error);
    } finally {
      setLoading(false);
    }
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border border-border p-3 rounded-lg shadow-lg">
          <p className="font-semibold mb-2">{payload[0].payload.month}</p>
          <p className="text-sm text-chart-1">
            Ожидается: {formatCurrency(payload[0].value)}
          </p>
          <p className="text-sm text-chart-2">
            Получено: {formatCurrency(payload[1].value)}
          </p>
          <p className="text-sm font-semibold text-primary mt-1">
            Итого: {formatCurrency(payload[0].value + payload[1].value)}
          </p>
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Прогноз выручки</CardTitle>
          <Skeleton className="h-4 w-96" />
        </CardHeader>
        <CardContent>
          <div className="h-[400px] space-y-4">
            <div className="flex justify-between items-end h-full">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="w-16" style={{ height: `${Math.random() * 60 + 40}%` }} />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Прогноз выручки</CardTitle>
        <p className="text-sm text-muted-foreground">
          Ожидаемые и полученные поступления на следующие {monthsAhead} месяцев
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="month" className="text-xs" />
            <YAxis 
              className="text-xs"
              tickFormatter={(value) => `${(value / 1000).toFixed(0)}к`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Bar 
              dataKey="expected" 
              name="Ожидается"
              fill="hsl(var(--chart-1))" 
              stackId="a"
            />
            <Bar 
              dataKey="received" 
              name="Получено"
              fill="hsl(var(--chart-2))" 
              stackId="a"
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};
