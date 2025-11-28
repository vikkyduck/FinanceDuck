import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { apiGet } from "@/lib/api";

interface ForecastData {
  monthIndex: number;
  monthName: string;
  yearNum: number;
  expectedAmount: number;
  receivedAmount: number;
}

export const RevenueForecastTable = () => {
  const { data, isLoading } = useQuery<ForecastData[]>({
    queryKey: ['admin-forecast', 6],
    queryFn: () => apiGet<ForecastData[]>('/admin/forecast?months=6'),
  });

  if (isLoading) {
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

  const tableData = (data || []).map(row => ({
    month: `${row.monthName} ${row.yearNum}`,
    expected: row.expectedAmount,
    received: row.receivedAmount,
    total: row.expectedAmount + row.receivedAmount,
  }));

  const totals = tableData.reduce(
    (acc, item) => ({
      expected: acc.expected + item.expected,
      received: acc.received + item.received,
      total: acc.total + item.total,
    }),
    { expected: 0, received: 0, total: 0 }
  );

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
            {tableData.map((row, index) => (
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
