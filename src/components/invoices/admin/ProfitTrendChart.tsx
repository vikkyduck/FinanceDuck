import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { useAuth } from "@/hooks/useAuth";

interface MonthlyProfit {
  month: string;
  profit: number;
  cumulative: number;
}

interface ProfitTrendChartProps {
  year: number;
}

export const ProfitTrendChart = ({ year }: ProfitTrendChartProps) => {
  const [data, setData] = useState<MonthlyProfit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProfitData();
  }, [year]);

  const { accessTokenId } = useAuth();

  const fetchProfitData = async () => {
    if (!accessTokenId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_admin_monthly_data', {
        _token_id: accessTokenId,
        _year: year
      });

      if (error) throw error;

      const chartData: MonthlyProfit[] = (data || []).map((row: any) => ({
        month: row.month_name,
        profit: Number(row.total_profit || 0),
        cumulative: Number(row.cumulative_profit || 0),
      }));

      setData(chartData);
    } catch (error) {
      console.error("Error fetching profit data:", error);
    } finally {
      setLoading(false);
    }
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border border-border p-3 rounded-lg shadow-lg">
          <p className="font-semibold mb-2">{payload[0].payload.month}</p>
          <p className="text-sm text-chart-3">
            Прибыль: {formatCurrency(payload[0].payload.profit)}
          </p>
          <p className="text-sm font-semibold text-primary">
            Накопительно: {formatCurrency(payload[0].value)}
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
          <CardTitle>Динамика прибыли</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80 flex items-center justify-center text-muted-foreground">
            Загрузка...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Динамика прибыли</CardTitle>
        <p className="text-sm text-muted-foreground">
          Накопительная чистая прибыль за {year} год
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="month" className="text-xs" />
            <YAxis 
              className="text-xs"
              tickFormatter={(value) => `${(value / 1000).toFixed(0)}к`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line 
              type="monotone" 
              dataKey="cumulative" 
              stroke="hsl(var(--chart-3))" 
              strokeWidth={3}
              dot={{ fill: "hsl(var(--chart-3))", r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};
