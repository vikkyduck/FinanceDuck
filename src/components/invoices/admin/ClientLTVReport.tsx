import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { TrendingUp, Users, AlertCircle, Clock, ChevronRight, Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ClientLTV {
  client_id: string;
  client_name: string;
  total_invoices: number;
  paid_invoices: number;
  total_admin_profit: number;
  potential_profit: number;
}

interface ClientLTVResponse {
  data: ClientLTV[];
  availableYears: number[];
}

export const ClientLTVReport = () => {
  const navigate = useNavigate();
  const [sortBy, setSortBy] = useState<'total_admin_profit' | 'potential_profit' | 'total_invoices'>('total_admin_profit');
  const [selectedYear, setSelectedYear] = useState<string>("all");

  const openClientInvoices = (clientId: string) => {
    navigate(`/stats?tab=invoices&clientId=${clientId}`);
  };

  const { data: response, isLoading, error } = useQuery<ClientLTVResponse>({
    queryKey: ["/api/admin/client-ltv", selectedYear],
    queryFn: () => apiGet<ClientLTVResponse>(`/admin/client-ltv${selectedYear !== "all" ? `?year=${selectedYear}` : ""}`),
    retry: 1,
  });

  const clients = response?.data || [];
  const availableYears = response?.availableYears || [];

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>LTV Драконов (Клиентов)</CardTitle>
          <CardDescription>Загрузка...</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-muted-foreground" />
            LTV Драконов (Клиентов)
          </CardTitle>
          <CardDescription>Данные недоступны</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Не удалось загрузить данные LTV. Попробуйте обновить страницу.
          </p>
        </CardContent>
      </Card>
    );
  }

  const sortedClients = [...clients].sort((a, b) => b[sortBy] - a[sortBy]);

  const totals = clients.reduce(
    (acc, client) => ({
      total_admin_profit: acc.total_admin_profit + client.total_admin_profit,
      potential_profit: acc.potential_profit + client.potential_profit,
      total_invoices: acc.total_invoices + client.total_invoices,
      paid_invoices: acc.paid_invoices + client.paid_invoices,
    }),
    { total_admin_profit: 0, potential_profit: 0, total_invoices: 0, paid_invoices: 0 }
  );

  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Users className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
                LTV Драконов (Клиентов)
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-sm">
                      LTV считается по <strong>чистой прибыли админа</strong> (netProfitAdmin), 
                      а не по обороту. Это сумма после вычета доли партнёра, расходов и резервов.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Чистая прибыль админа по каждому клиенту (не оборот)
              </CardDescription>
            </div>
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-[120px]" data-testid="select-ltv-year">
                <SelectValue placeholder="Год" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все годы</SelectItem>
                {availableYears.map((year) => (
                  <SelectItem key={year} value={year.toString()}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-4 text-xs sm:text-sm">
            <div className="text-center">
              <div className="text-muted-foreground">Заработано</div>
              <div className="text-sm sm:text-lg font-semibold text-green-600">{formatCurrency(totals.total_admin_profit)}</div>
            </div>
            <div className="text-center">
              <div className="text-muted-foreground">В ожидании</div>
              <div className="text-sm sm:text-lg font-semibold text-amber-600">{formatCurrency(totals.potential_profit)}</div>
            </div>
            <div className="text-center">
              <div className="text-muted-foreground">Счетов</div>
              <div className="text-sm sm:text-lg font-semibold">{totals.paid_invoices} / {totals.total_invoices}</div>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <div className="min-w-[600px] px-4 sm:px-0">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs sm:text-sm">Клиент</TableHead>
                    <TableHead className="text-xs sm:text-sm text-right">Счетов</TableHead>
                    <TableHead 
                      className="text-xs sm:text-sm text-right cursor-pointer hover:bg-muted/50 transition-colors duration-150"
                      onClick={() => setSortBy('total_admin_profit')}
                      data-testid="sort-total-profit"
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center justify-end gap-1">
                            <span className="hidden sm:inline">ЧП (оплачено)</span>
                            <span className="sm:hidden">ЧП</span>
                            {sortBy === 'total_admin_profit' && <TrendingUp className="h-3 w-3" />}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">Чистая прибыль админа по оплаченным счетам</p>
                        </TooltipContent>
                      </Tooltip>
                    </TableHead>
                    <TableHead 
                      className="text-xs sm:text-sm text-right cursor-pointer hover:bg-muted/50 transition-colors duration-150"
                      onClick={() => setSortBy('potential_profit')}
                      data-testid="sort-potential-profit"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span className="hidden sm:inline">В ожидании</span>
                        <span className="sm:hidden">Ожид.</span>
                        {sortBy === 'potential_profit' && <TrendingUp className="h-3 w-3" />}
                      </div>
                    </TableHead>
                    <TableHead className="text-xs sm:text-sm text-right">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>Всего LTV</span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">ЧП оплаченных + ожидаемая ЧП</p>
                        </TooltipContent>
                      </Tooltip>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedClients.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        Нет данных по клиентам
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedClients.map((client) => {
                      const totalLTV = client.total_admin_profit + client.potential_profit;
                      return (
                        <TableRow 
                          key={client.client_id} 
                          className="cursor-pointer hover:bg-muted/50 active:bg-muted/70"
                          onClick={() => openClientInvoices(client.client_id)}
                          data-testid={`row-client-${client.client_id}`}
                        >
                          <TableCell className="text-xs sm:text-sm">
                            <div className="flex items-center gap-1.5">
                              <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                              <span className="font-medium text-primary">{client.client_name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {client.paid_invoices} / {client.total_invoices}
                          </TableCell>
                          <TableCell className="text-right font-medium text-green-600">
                            {formatCurrency(client.total_admin_profit)}
                          </TableCell>
                          <TableCell className="text-right">
                            {client.potential_profit > 0 ? (
                              <span className="text-amber-600 font-medium flex items-center justify-end gap-1">
                                <Clock className="h-3 w-3" />
                                {formatCurrency(client.potential_profit)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatCurrency(totalLTV)}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
