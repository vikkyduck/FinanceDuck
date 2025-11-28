import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { apiGet } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";

interface MonthlyData {
  monthNumber: number;
  totalSales: number;
  totalProfit: number;
  invoiceCount: number;
  expenses: number;
}

interface ChartData {
  month: string;
  profit: number;
  cumulative: number;
}

interface ProfitTrendChartProps {
  year: number;
}

const monthNames = [
  "Янв", "Фев", "Мар", "Апр", "Май", "Июн",
  "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"
];

export const ProfitTrendChart = ({ year }: ProfitTrendChartProps) => {
  const { data, isLoading } = useQuery<MonthlyData[]>({
    queryKey: ['admin-monthly-data', year],
    queryFn: () => apiGet<MonthlyData[]>(`/admin/monthly-data?year=${year}`),
  });

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

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Динамика прибыли</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-80 w-full" />
        </CardContent>
      </Card>
    );
  }

  let cumulativeProfit = 0;
  const chartData: ChartData[] = Array.from({ length: 12 }, (_, i) => {
    const monthData = (data || []).find(d => d.monthNumber === i + 1);
    const profit = monthData?.totalProfit || 0;
    cumulativeProfit += profit;
    return {
      month: monthNames[i],
      profit,
      cumulative: cumulativeProfit,
    };
  });

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
          <LineChart data={chartData}>
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
