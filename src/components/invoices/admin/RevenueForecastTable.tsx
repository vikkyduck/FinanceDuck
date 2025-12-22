import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
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
  const navigate = useNavigate();
  
  const { data, isLoading } = useQuery<ForecastData[]>({
    queryKey: ['admin-forecast', 6],
    queryFn: () => apiGet<ForecastData[]>('/admin/forecast?months=6'),
  });
  
  const openMonthInvoices = (monthIndex: number, year: number) => {
    navigate(`/invoices?month=${monthIndex}&year=${year}`);
  };

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
    monthIndex: row.monthIndex,
    yearNum: row.yearNum,
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
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="text-base sm:text-lg">Детализация прогноза выручки</CardTitle>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Помесячная разбивка ожидаемых и полученных средств
        </p>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <div className="min-w-[400px] px-4 sm:px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs sm:text-sm">Месяц</TableHead>
                  <TableHead className="text-xs sm:text-sm text-right">Ожидается</TableHead>
                  <TableHead className="text-xs sm:text-sm text-right">Получено</TableHead>
                  <TableHead className="text-xs sm:text-sm text-right font-semibold">Итого</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableData.map((row, index) => (
                  <TableRow 
                    key={index}
                    className="cursor-pointer hover:bg-muted/50 active:bg-muted/70 min-h-[44px]"
                    onClick={() => openMonthInvoices(row.monthIndex, row.yearNum)}
                    data-testid={`row-forecast-${row.monthIndex}-${row.yearNum}`}
                  >
                    <TableCell className="text-xs sm:text-sm py-3 sm:py-2">
                      <div className="flex items-center gap-2">
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="font-medium text-primary">{row.month}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs sm:text-sm text-right text-chart-1 py-3 sm:py-2">
                      {formatCurrency(row.expected)}
                    </TableCell>
                    <TableCell className="text-xs sm:text-sm text-right text-chart-2 py-3 sm:py-2">
                      {formatCurrency(row.received)}
                    </TableCell>
                    <TableCell className="text-xs sm:text-sm text-right font-semibold py-3 sm:py-2">
                      {formatCurrency(row.total)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50 font-semibold">
                  <TableCell className="text-xs sm:text-sm py-3 sm:py-2">Итого</TableCell>
                  <TableCell className="text-xs sm:text-sm text-right py-3 sm:py-2">{formatCurrency(totals.expected)}</TableCell>
                  <TableCell className="text-xs sm:text-sm text-right py-3 sm:py-2">{formatCurrency(totals.received)}</TableCell>
                  <TableCell className="text-xs sm:text-sm text-right py-3 sm:py-2">{formatCurrency(totals.total)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
