import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/invoiceCalculations";

interface MonthlyData {
  month: string;
  plan: number;
  fact: number;
}

interface FinancialPlanningChartProps {
  year: number;
}

export const FinancialPlanningChart = ({ year }: FinancialPlanningChartProps) => {
  const [data, setData] = useState<MonthlyData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMonthlyData();
  }, [year]);

  const fetchMonthlyData = async () => {
    setLoading(true);
    try {
      // Fetch invoices with calculations
      const { data: invoices, error } = await supabase
        .from("invoices")
        .select(`
          id,
          created_at,
          payment_date,
          actual_payment_date,
          invoice_calculations (
            client_bill,
            net_profit_admin
          )
        `)
        .gte('payment_date', `${year}-01-01`)
        .lte('payment_date', `${year}-12-31`)
        .not('payment_date', 'is', null);

      if (error) throw error;

      // Group by month - plan based on payment_date, fact based on actual_payment_date
      const monthlyMap = new Map<number, { plan: number; fact: number }>();

      invoices?.forEach((invoice: any) => {
        const calc = invoice.invoice_calculations?.[0];
        if (!calc) return;

        // Plan based on payment_date (planned date)
        const planMonth = new Date(invoice.payment_date).getMonth();
        if (!monthlyMap.has(planMonth)) {
          monthlyMap.set(planMonth, { plan: 0, fact: 0 });
        }
        monthlyMap.get(planMonth)!.plan += Number(calc.client_bill);

        // Fact based on actual_payment_date (actual payment date)
        if (invoice.actual_payment_date) {
          const factMonth = new Date(invoice.actual_payment_date).getMonth();
          if (!monthlyMap.has(factMonth)) {
            monthlyMap.set(factMonth, { plan: 0, fact: 0 });
          }
          monthlyMap.get(factMonth)!.fact += Number(calc.client_bill);
        }
      });

      // Create array for all 12 months
      const monthNames = [
        "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
        "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
      ];

      const chartData: MonthlyData[] = Array.from({ length: 12 }, (_, i) => {
        const monthData = monthlyMap.get(i) || { plan: 0, fact: 0 };
        return {
          month: monthNames[i],
          plan: monthData.plan,
          fact: monthData.fact,
        };
      });

      setData(chartData);
    } catch (error) {
      console.error("Error fetching monthly data:", error);
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
            План (продано): {formatCurrency(payload[0].value)}
          </p>
          <p className="text-sm text-chart-2">
            Факт (поступило): {formatCurrency(payload[1].value)}
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
          <CardTitle>План vs Факт</CardTitle>
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
        <CardTitle>План vs Факт по месяцам</CardTitle>
        <p className="text-sm text-muted-foreground">
          Сравнение продаж и поступлений за {year} год
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis 
              dataKey="month" 
              className="text-xs"
              angle={-45}
              textAnchor="end"
              height={100}
            />
            <YAxis 
              className="text-xs"
              tickFormatter={(value) => `${(value / 1000).toFixed(0)}к`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend 
              wrapperStyle={{ paddingTop: "20px" }}
              formatter={(value) => value === "plan" ? "Продано" : "Поступило"}
            />
            <Bar dataKey="plan" fill="hsl(var(--primary))" name="plan" radius={[4, 4, 0, 0]} />
            <Bar dataKey="fact" fill="hsl(var(--chart-2))" name="fact" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};
