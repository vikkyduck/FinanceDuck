import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { Skeleton } from "@/components/ui/skeleton";

interface ForecastData {
  monthIndex: number;
  monthName: string;
  yearNum: number;
  expectedAmount: number;
  receivedAmount: number;
}

interface RevenueForecastChartProps {
  monthsAhead?: number;
}

export const RevenueForecastChart = ({ monthsAhead = 6 }: RevenueForecastChartProps) => {
  const { data, isLoading } = useQuery<ForecastData[]>({
    queryKey: ['/api/admin/forecast', monthsAhead],
  });

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border border-border p-3 rounded-lg shadow-lg">
          <p className="font-semibold mb-2">{payload[0].payload.monthName}</p>
          <p className="text-sm text-chart-1">
            Ожидается: {formatCurrency(payload[0]?.value || 0)}
          </p>
          <p className="text-sm text-chart-2">
            Получено: {formatCurrency(payload[1]?.value || 0)}
          </p>
          <p className="text-sm font-semibold text-primary mt-1">
            Итого: {formatCurrency((payload[0]?.value || 0) + (payload[1]?.value || 0))}
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

  const chartData = (data || []).map(item => ({
    month: item.monthName,
    expected: item.expectedAmount,
    received: item.receivedAmount,
  }));

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
          <BarChart data={chartData}>
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
