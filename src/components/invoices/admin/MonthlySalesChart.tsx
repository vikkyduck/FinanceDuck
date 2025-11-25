import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { useAuth } from "@/hooks/useAuth";

interface MonthlyData {
  month: string;
  sales: number;
  count: number;
}

interface MonthlySalesChartProps {
  year: number;
}

export const MonthlySalesChart = ({ year }: MonthlySalesChartProps) => {
  const [data, setData] = useState<MonthlyData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMonthlyData();
  }, [year]);

  const { accessTokenId } = useAuth();

  const fetchMonthlyData = async () => {
    if (!accessTokenId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_admin_monthly_data', {
        _token_id: accessTokenId,
        _year: year
      });

      if (error) throw error;

      const chartData: MonthlyData[] = (data || []).map((row: any) => ({
        month: row.month_name,
        sales: Number(row.total_sales || 0),
        count: Number(row.invoice_count || 0),
      }));

      setData(chartData);
    } catch (error) {
      console.error("Error fetching monthly sales data:", error);
    } finally {
      setLoading(false);
    }
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border border-border p-3 rounded-lg shadow-lg">
          <p className="font-semibold mb-2">{payload[0].payload.month}</p>
          <p className="text-sm text-primary">
            Продано: {formatCurrency(payload[0].value)}
          </p>
          <p className="text-sm text-muted-foreground">
            Счетов: {payload[0].payload.count}
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
          <CardTitle>Продажи по месяцам</CardTitle>
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
        <CardTitle>Продажи по месяцам</CardTitle>
        <p className="text-sm text-muted-foreground">
          Сумма новых счетов за {year} год (без ретроспективных)
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis 
              dataKey="month" 
              className="text-xs"
            />
            <YAxis 
              className="text-xs"
              tickFormatter={(value) => `${(value / 1000).toFixed(0)}к`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend 
              wrapperStyle={{ paddingTop: "20px" }}
              formatter={() => "Продано"}
            />
            <Bar dataKey="sales" fill="hsl(var(--chart-1))" name="sales" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};
