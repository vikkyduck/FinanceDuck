import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet } from "@/lib/api";

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
    queryKey: ['admin-forecast', monthsAhead],
    queryFn: () => apiGet<ForecastData[]>(`/admin/forecast?months=${monthsAhead}`),
  });

  const CustomTooltip = ({ active, payload }: import("recharts").TooltipProps<number, string>) => {
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
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">Прогноз выручки</CardTitle>
          <Skeleton className="h-4 w-48 sm:w-96" />
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
          <div className="h-[280px] sm:h-[400px] space-y-4">
            <div className="flex justify-between items-end h-full gap-1 sm:gap-2">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="flex-1" style={{ height: `${Math.random() * 60 + 40}%` }} />
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
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="text-base sm:text-lg">Прогноз выручки</CardTitle>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Ожидаемые и полученные поступления на следующие {monthsAhead} месяцев
        </p>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
        <div className="h-[280px] sm:h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="month" className="text-xs" tick={{ fontSize: 10 }} />
              <YAxis 
                className="text-xs"
                tick={{ fontSize: 10 }}
                tickFormatter={(value) => `${(value / 1000).toFixed(0)}к`}
                width={35}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
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
        </div>
      </CardContent>
    </Card>
  );
};
