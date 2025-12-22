import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { ArrowUp, ArrowDown, Minus, ChevronRight } from "lucide-react";
import { apiGet } from "@/lib/api";

interface MonthlyData {
  monthNumber: number;
  totalSales: number;
  totalProfit: number;
  invoiceCount: number;
  expenses: number;
}

interface MonthlyFinancialTableProps {
  year: number;
}

export const MonthlyFinancialTable = ({ year }: MonthlyFinancialTableProps) => {
  const navigate = useNavigate();
  
  const { data, isLoading } = useQuery<MonthlyData[]>({
    queryKey: ['admin-monthly-data', year],
    queryFn: () => apiGet<MonthlyData[]>(`/admin/monthly-data?year=${year}`),
  });
  
  const openMonthInvoices = (monthNumber: number) => {
    navigate(`/invoices?month=${monthNumber}&year=${year}`);
  };

  const monthNames = [
    "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
    "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
  ];

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

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">Детализация по месяцам</CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
          <div className="py-8 text-center text-muted-foreground text-sm">Загрузка...</div>
        </CardContent>
      </Card>
    );
  }

  let previousProfit = 0;
  const tableData = (data || []).map((row, index) => {
    let growthPercent: number | null = null;
    if (previousProfit > 0 && row.totalProfit > 0) {
      growthPercent = ((row.totalProfit - previousProfit) / previousProfit) * 100;
    }
    if (row.totalProfit > 0) {
      previousProfit = row.totalProfit;
    }

    return {
      monthNumber: row.monthNumber,
      month: monthNames[row.monthNumber - 1],
      totalSold: row.totalSales,
      totalReceived: row.totalSales,
      expenses: row.expenses,
      netProfit: row.totalProfit,
      growthPercent,
    };
  });

  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="text-base sm:text-lg">Детализация по месяцам</CardTitle>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Подробный анализ финансовых показателей за {year} год
        </p>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
        <div className="rounded-md border overflow-x-auto -mx-4 sm:mx-0">
          <div className="min-w-[600px] px-4 sm:px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs sm:text-sm">Месяц</TableHead>
                  <TableHead className="text-xs sm:text-sm text-right">Продано</TableHead>
                  <TableHead className="text-xs sm:text-sm text-right">Поступило</TableHead>
                  <TableHead className="text-xs sm:text-sm text-right">Расходы</TableHead>
                  <TableHead className="text-xs sm:text-sm text-right">Чистая прибыль</TableHead>
                  <TableHead className="text-xs sm:text-sm text-right">Рост</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableData.map((row, index) => (
                  <TableRow 
                    key={index}
                    className="cursor-pointer hover:bg-muted/50 active:bg-muted/70"
                    onClick={() => openMonthInvoices(row.monthNumber)}
                    data-testid={`row-month-${row.monthNumber}`}
                  >
                    <TableCell className="text-xs sm:text-sm">
                      <div className="flex items-center gap-1.5">
                        <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="font-medium text-primary">{row.month}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs sm:text-sm text-right">{formatCurrency(row.totalSold)}</TableCell>
                    <TableCell className="text-xs sm:text-sm text-right">{formatCurrency(row.totalReceived)}</TableCell>
                    <TableCell className="text-xs sm:text-sm text-right text-muted-foreground">{formatCurrency(row.expenses)}</TableCell>
                    <TableCell className="text-xs sm:text-sm text-right font-semibold text-primary">
                      {formatCurrency(row.netProfit)}
                    </TableCell>
                    <TableCell className="text-xs sm:text-sm text-right">
                      <GrowthIndicator value={row.growthPercent} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
