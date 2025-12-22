import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { ArrowUp, ArrowDown, Minus, ChevronRight, ChevronDown, Loader2 } from "lucide-react";
import { apiGet } from "@/lib/api";
import { InvoiceDetailsDialog } from "@/components/invoices/InvoiceDetailsDialog";

interface MonthlyData {
  monthNumber: number;
  totalSales: number;
  totalProfit: number;
  invoiceCount: number;
  expenses: number;
}

interface MonthInvoiceDetail {
  id: string;
  invoiceNumber: string | null;
  clientName: string | null;
  clientBill: number;
  netProfitAdmin: number;
  status: string;
  paymentDate: string | null;
  isExpected: boolean;
  isPaid: boolean;
}

interface MonthlyFinancialTableProps {
  year: number;
}

export const MonthlyFinancialTable = ({ year }: MonthlyFinancialTableProps) => {
  const queryClient = useQueryClient();
  const [expandedMonths, setExpandedMonths] = useState<Set<number>>(new Set());
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  
  const { data, isLoading } = useQuery<MonthlyData[]>({
    queryKey: ['admin-monthly-data', year],
    queryFn: () => apiGet<MonthlyData[]>(`/admin/monthly-data?year=${year}`),
  });
  
  const toggleMonth = (monthNumber: number) => {
    setExpandedMonths(prev => {
      const next = new Set(prev);
      if (next.has(monthNumber)) {
        next.delete(monthNumber);
      } else {
        next.add(monthNumber);
      }
      return next;
    });
  };

  const handleDialogClose = () => {
    setSelectedInvoiceId(null);
    queryClient.invalidateQueries({ queryKey: ['admin-monthly-data'] });
    queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
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
  const tableData = (data || []).map((row) => {
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
    <>
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">Детализация по месяцам</CardTitle>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Подробный анализ финансовых показателей за {year} год
          </p>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
          {/* Mobile cards layout */}
          <div className="sm:hidden space-y-2">
            {tableData.map((row) => {
              const isExpanded = expandedMonths.has(row.monthNumber);
              
              return (
                <div key={row.monthNumber} className="rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleMonth(row.monthNumber)}
                    className="w-full p-3 text-left bg-muted/30 min-h-[56px] active:bg-muted/50"
                    data-testid={`mobile-row-month-${row.monthNumber}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                        <span className="font-medium text-sm text-primary">{row.month}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-primary">{formatCurrency(row.netProfit)}</span>
                        <GrowthIndicator value={row.growthPercent} />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-2 text-xs text-muted-foreground pl-6">
                      <span>Продано: {formatCurrency(row.totalSold)}</span>
                      <span>Поступило: {formatCurrency(row.totalReceived)}</span>
                      <span>Расходы: {formatCurrency(row.expenses)}</span>
                    </div>
                  </button>
                  {isExpanded && (
                    <MonthInvoices 
                      month={row.monthNumber} 
                      year={year}
                      type="financial"
                      onInvoiceClick={setSelectedInvoiceId}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop table layout */}
          <div className="hidden sm:block rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-sm">Месяц</TableHead>
                  <TableHead className="text-sm text-right">Продано</TableHead>
                  <TableHead className="text-sm text-right">Поступило</TableHead>
                  <TableHead className="text-sm text-right">Расходы</TableHead>
                  <TableHead className="text-sm text-right">Чистая прибыль</TableHead>
                  <TableHead className="text-sm text-right">Рост</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableData.map((row) => {
                  const isExpanded = expandedMonths.has(row.monthNumber);
                  
                  return (
                    <>
                      <TableRow 
                        key={row.monthNumber}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => toggleMonth(row.monthNumber)}
                        data-testid={`row-month-${row.monthNumber}`}
                      >
                        <TableCell className="text-sm py-2">
                          <div className="flex items-center gap-2">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                            )}
                            <span className="font-medium text-primary">{row.month}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-right py-2">{formatCurrency(row.totalSold)}</TableCell>
                        <TableCell className="text-sm text-right py-2">{formatCurrency(row.totalReceived)}</TableCell>
                        <TableCell className="text-sm text-right text-muted-foreground py-2">{formatCurrency(row.expenses)}</TableCell>
                        <TableCell className="text-sm text-right font-semibold text-primary py-2">
                          {formatCurrency(row.netProfit)}
                        </TableCell>
                        <TableCell className="text-sm text-right py-2">
                          <GrowthIndicator value={row.growthPercent} />
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow key={`${row.monthNumber}-details`}>
                          <TableCell colSpan={6} className="p-0 bg-muted/20">
                            <MonthInvoices 
                              month={row.monthNumber} 
                              year={year}
                              type="financial"
                              onInvoiceClick={setSelectedInvoiceId}
                            />
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      
      <InvoiceDetailsDialog
        invoiceId={selectedInvoiceId}
        open={!!selectedInvoiceId}
        onOpenChange={(open) => {
          if (!open) handleDialogClose();
        }}
      />
    </>
  );
};

interface MonthInvoicesProps {
  month: number;
  year: number;
  type: string;
  onInvoiceClick: (id: string) => void;
}

function MonthInvoices({ month, year, type, onInvoiceClick }: MonthInvoicesProps) {
  const { data, isLoading } = useQuery<MonthInvoiceDetail[]>({
    queryKey: ['invoices-by-month', month, year, type],
    queryFn: () => apiGet<MonthInvoiceDetail[]>(`/admin/invoices-by-month?month=${month}&year=${year}&type=${type}`),
  });

  if (isLoading) {
    return (
      <div className="p-4 flex items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        Нет счетов за этот период
      </div>
    );
  }

  return (
    <div className="p-3 space-y-1">
      {data.map((invoice) => (
        <button
          key={invoice.id}
          onClick={(e) => {
            e.stopPropagation();
            onInvoiceClick(invoice.id);
          }}
          className="w-full p-2 text-left bg-background/50 rounded-md hover:bg-background flex items-center justify-between gap-2"
          data-testid={`invoice-row-${invoice.id}`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-medium truncate">
              {invoice.invoiceNumber || 'Без номера'}
            </span>
            <span className="text-xs text-muted-foreground truncate">
              {invoice.clientName}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant={invoice.isPaid ? "default" : "secondary"} className="text-xs">
              {invoice.isPaid ? 'Оплачен' : 'Ожидает'}
            </Badge>
            <span className="text-xs font-medium">{formatCurrency(invoice.netProfitAdmin)}</span>
          </div>
        </button>
      ))}
    </div>
  );
}
