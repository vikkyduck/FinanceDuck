import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
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
  sales: number;
  count: number;
}

interface MonthlySalesChartProps {
  year: number;
}

const monthNames = [
  "Янв", "Фев", "Мар", "Апр", "Май", "Июн",
  "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"
];

export const MonthlySalesChart = ({ year }: MonthlySalesChartProps) => {
  const { data, isLoading } = useQuery<MonthlyData[]>({
    queryKey: ['admin-monthly-data', year],
    queryFn: () => apiGet<MonthlyData[]>(`/admin/monthly-data?year=${year}`),
  });

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

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">Продажи по месяцам</CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
          <div className="h-[240px] sm:h-80 flex items-end justify-between gap-1 sm:gap-2 pt-8">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton 
                key={i} 
                className="flex-1" 
                style={{ height: `${Math.random() * 60 + 20}%` }} 
              />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartData: ChartData[] = Array.from({ length: 12 }, (_, i) => {
    const monthData = (data || []).find(d => d.monthNumber === i + 1);
    return {
      month: monthNames[i],
      sales: monthData?.totalSales || 0,
      count: monthData?.invoiceCount || 0,
    };
  });

  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="text-base sm:text-lg">Продажи по месяцам</CardTitle>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Сумма новых счетов за {year} год
        </p>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
        <div className="h-[280px] sm:h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="month" 
                className="text-xs"
                tick={{ fontSize: 10 }}
              />
              <YAxis 
                className="text-xs"
                tick={{ fontSize: 10 }}
                tickFormatter={(value) => `${(value / 1000).toFixed(0)}к`}
                width={35}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                wrapperStyle={{ paddingTop: "10px", fontSize: '12px' }}
                formatter={() => "Продано"}
              />
              <Bar dataKey="sales" fill="hsl(var(--chart-1))" name="sales" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};
