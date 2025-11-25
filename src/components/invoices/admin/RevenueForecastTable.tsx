import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { useAuth } from "@/hooks/useAuth";

interface MonthlyForecast {
  month: string;
  monthIndex: number;
  year: number;
  expected: number;
  received: number;
  total: number;
}

export const RevenueForecastTable = () => {
  const [data, setData] = useState<MonthlyForecast[]>([]);
  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState({ expected: 0, received: 0, total: 0 });

  useEffect(() => {
    fetchForecastData();
  }, []);

  const { accessTokenId } = useAuth();

  const fetchForecastData = async () => {
    if (!accessTokenId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_admin_forecast', {
        _token_id: accessTokenId,
        _months_ahead: 6
      });

      if (error) throw error;

      const monthNames = [
        "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
        "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
      ];

      const tableData: MonthlyForecast[] = (data || []).map((row: any) => {
        const monthIndex = Number(row.month_index) - 1;
        const expected = Number(row.expected_amount || 0);
        const received = Number(row.received_amount || 0);
        return {
          month: `${monthNames[monthIndex]} ${row.year_num}`,
          monthIndex,
          year: Number(row.year_num),
          expected,
          received,
          total: expected + received,
        };
      });

      const totalsCalc = tableData.reduce(
        (acc, item) => ({
          expected: acc.expected + item.expected,
          received: acc.received + item.received,
          total: acc.total + item.total,
        }),
        { expected: 0, received: 0, total: 0 }
      );

      setData(tableData);
      setTotals(totalsCalc);
    } catch (error) {
      console.error("Error fetching forecast data:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Детализация прогноза выручки</CardTitle>
          <p className="text-sm text-muted-foreground">
            Помесячная разбивка ожидаемых и полученных средств
          </p>
        </CardHeader>
        <CardContent>
          <TableSkeleton 
            columns={[
              { header: 'Месяц', cellClassName: 'h-4 w-32' },
              { header: 'Ожидается', cellClassName: 'h-4 w-24' },
              { header: 'Получено', cellClassName: 'h-4 w-24' },
              { header: 'Итого', cellClassName: 'h-4 w-24' },
            ]}
            rowCount={6}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Детализация прогноза выручки</CardTitle>
        <p className="text-sm text-muted-foreground">
          Помесячная разбивка ожидаемых и полученных средств
        </p>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Месяц</TableHead>
              <TableHead className="text-right">Ожидается</TableHead>
              <TableHead className="text-right">Получено</TableHead>
              <TableHead className="text-right font-semibold">Итого</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row, index) => (
              <TableRow key={index}>
                <TableCell className="font-medium">{row.month}</TableCell>
                <TableCell className="text-right text-chart-1">
                  {formatCurrency(row.expected)}
                </TableCell>
                <TableCell className="text-right text-chart-2">
                  {formatCurrency(row.received)}
                </TableCell>
                <TableCell className="text-right font-semibold">
                  {formatCurrency(row.total)}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-muted/50 font-semibold">
              <TableCell>Итого</TableCell>
              <TableCell className="text-right">{formatCurrency(totals.expected)}</TableCell>
              <TableCell className="text-right">{formatCurrency(totals.received)}</TableCell>
              <TableCell className="text-right">{formatCurrency(totals.total)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};
