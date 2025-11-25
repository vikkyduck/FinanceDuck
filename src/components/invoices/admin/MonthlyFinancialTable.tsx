import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface MonthlyFinancialData {
  month: string;
  totalSold: number;
  totalReceived: number;
  expenses: number;
  netProfit: number;
  growthPercent: number | null;
}

interface MonthlyFinancialTableProps {
  year: number;
}

export const MonthlyFinancialTable = ({ year }: MonthlyFinancialTableProps) => {
  const [data, setData] = useState<MonthlyFinancialData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMonthlyFinancialData();
  }, [year]);

  const { accessTokenId } = useAuth();

  const fetchMonthlyFinancialData = async () => {
    if (!accessTokenId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_admin_monthly_data', {
        _token_id: accessTokenId,
        _year: year
      });

      if (error) throw error;

      const monthNames = [
        "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
        "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
      ];

      const tableData: MonthlyFinancialData[] = [];
      let previousProfit = 0;

      (data || []).forEach((row: any, index: number) => {
        const netProfit = Number(row.total_profit || 0);
        
        let growthPercent: number | null = null;
        if (previousProfit > 0 && netProfit > 0) {
          growthPercent = ((netProfit - previousProfit) / previousProfit) * 100;
        }

        tableData.push({
          month: monthNames[index],
          totalSold: Number(row.total_sales || 0),
          totalReceived: Number(row.total_sales || 0),
          expenses: Number(row.expenses || 0),
          netProfit,
          growthPercent,
        });

        if (netProfit > 0) {
          previousProfit = netProfit;
        }
      });

      setData(tableData);
    } catch (error) {
      console.error("Error fetching monthly financial data:", error);
    } finally {
      setLoading(false);
    }
  };

  const GrowthIndicator = ({ value }: { value: number | null }) => {
    if (value === null) return <Minus className="h-4 w-4 text-muted-foreground" />;
    if (value > 0) return (
      <span className="flex items-center gap-1 text-chart-2">
        <ArrowUp className="h-4 w-4" />
        +{value.toFixed(0)}%
      </span>
    );
    if (value < 0) return (
      <span className="flex items-center gap-1 text-destructive">
        <ArrowDown className="h-4 w-4" />
        {value.toFixed(0)}%
      </span>
    );
    return <span className="text-muted-foreground">0%</span>;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Детализация по месяцам</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-8 text-center text-muted-foreground">Загрузка...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Детализация по месяцам</CardTitle>
        <p className="text-sm text-muted-foreground">
          Подробный анализ финансовых показателей за {year} год
        </p>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Месяц</TableHead>
                <TableHead className="text-right">Продано</TableHead>
                <TableHead className="text-right">Поступило</TableHead>
                <TableHead className="text-right">Расходы</TableHead>
                <TableHead className="text-right">Чистая прибыль</TableHead>
                <TableHead className="text-right">Рост</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">{row.month}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.totalSold)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.totalReceived)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{formatCurrency(row.expenses)}</TableCell>
                  <TableCell className="text-right font-semibold text-primary">
                    {formatCurrency(row.netProfit)}
                  </TableCell>
                  <TableCell className="text-right">
                    <GrowthIndicator value={row.growthPercent} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};
