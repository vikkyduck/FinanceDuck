import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { apiGet } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";

interface PlanFactData {
  monthNumber: number;
  monthName: string;
  salesTarget: number;
  receiptsTarget: number;
  actualSales: number;
  actualReceipts: number;
}

interface ChartData {
  month: string;
  sales: number;
  receipts: number;
}

interface FinancialPlanningChartProps {
  year: number;
}

const monthNames = [
  "Янв", "Фев", "Мар", "Апр", "Май", "Июн",
  "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"
];

export const FinancialPlanningChart = ({ year }: FinancialPlanningChartProps) => {
  const { data, isLoading } = useQuery<PlanFactData[]>({
    queryKey: ['/api/admin/plan-fact', year],
    queryFn: () => apiGet<PlanFactData[]>(`/api/admin/plan-fact?year=${year}`),
  });

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border border-border p-3 rounded-lg shadow-lg">
          <p className="font-semibold mb-2">{payload[0].payload.month}</p>
          <p className="text-sm text-primary">
            Продажи: {formatCurrency(payload[0]?.value || 0)}
          </p>
          <p className="text-sm text-chart-2">
            Поступления: {formatCurrency(payload[1]?.value || 0)}
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
          <CardTitle>Продажи vs Поступления</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80 flex items-end justify-between gap-2 pt-8">
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
      sales: monthData?.actualSales || 0,
      receipts: monthData?.actualReceipts || 0,
    };
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Продажи vs Поступления по месяцам</CardTitle>
        <p className="text-sm text-muted-foreground">
          Сравнение продаж и фактических поступлений за {year} год
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={chartData}>
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
              formatter={(value) => value === "sales" ? "Продажи" : "Поступления"}
            />
            <Bar dataKey="sales" fill="hsl(var(--primary))" name="sales" radius={[4, 4, 0, 0]} />
            <Bar dataKey="receipts" fill="hsl(var(--chart-2))" name="receipts" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};
