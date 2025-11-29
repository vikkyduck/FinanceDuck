import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { Loader2, Users, Calendar, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";

interface ClientMonthStats {
  clientId: string;
  clientName: string;
  month: number;
  monthName: string;
  clientBill: number;
  partnerCommission: number;
  clientRemaining: number;
  invoiceCount: number;
}

interface ClientStatsResponse {
  stats: ClientMonthStats[];
  selectedYear: number;
  availableYears: number[];
}

export const PartnerClientStats = () => {
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  const { data, isLoading, error } = useQuery<ClientStatsResponse>({
    queryKey: ['/api/partner/client-stats', selectedYear],
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });

  if (isLoading) {
    return (
      <Card data-testid="card-partner-client-stats">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            Доходы по клиентам
          </CardTitle>
          <Skeleton className="h-9 w-24" />
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card data-testid="card-partner-client-stats">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            Доходы по клиентам
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Не удалось загрузить данные</p>
        </CardContent>
      </Card>
    );
  }

  const { stats, availableYears } = data;

  const groupedByClient = stats.reduce((acc, item) => {
    if (!acc[item.clientId]) {
      acc[item.clientId] = {
        clientId: item.clientId,
        clientName: item.clientName,
        months: [],
        totalBill: 0,
        totalCommission: 0,
        totalRemaining: 0,
      };
    }
    acc[item.clientId].months.push(item);
    acc[item.clientId].totalBill += item.clientBill;
    acc[item.clientId].totalCommission += item.partnerCommission;
    acc[item.clientId].totalRemaining += item.clientRemaining;
    return acc;
  }, {} as Record<string, {
    clientId: string;
    clientName: string;
    months: ClientMonthStats[];
    totalBill: number;
    totalCommission: number;
    totalRemaining: number;
  }>);

  const clientsArray = Object.values(groupedByClient).sort((a, b) => 
    b.totalCommission - a.totalCommission
  );

  const grandTotalCommission = clientsArray.reduce((sum, c) => sum + c.totalCommission, 0);

  return (
    <Card data-testid="card-partner-client-stats">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4">
        <CardTitle className="text-lg flex items-center gap-2">
          <Users className="h-5 w-5" />
          Доходы по клиентам
        </CardTitle>
        <Select
          value={selectedYear.toString()}
          onValueChange={(value) => setSelectedYear(parseInt(value))}
        >
          <SelectTrigger className="w-24" data-testid="select-year">
            <Calendar className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {availableYears.map((year) => (
              <SelectItem key={year} value={year.toString()}>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="space-y-4">
        {clientsArray.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Нет данных за {selectedYear} год
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Итого за {selectedYear}</span>
              </div>
              <span className="text-lg font-bold" data-testid="text-total-commission">
                {formatCurrency(grandTotalCommission)}
              </span>
            </div>

            <Separator />

            <div className="space-y-4">
              {clientsArray.map((client) => (
                <div 
                  key={client.clientId} 
                  className="p-4 bg-accent/30 rounded-lg space-y-3"
                  data-testid={`card-client-${client.clientId}`}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold" data-testid={`text-client-name-${client.clientId}`}>
                      {client.clientName}
                    </h3>
                    <span className="text-lg font-bold text-primary" data-testid={`text-client-commission-${client.clientId}`}>
                      {formatCurrency(client.totalCommission)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    {client.months.map((monthData) => (
                      <div 
                        key={`${client.clientId}-${monthData.month}`}
                        className="p-2 bg-background rounded-md"
                      >
                        <div className="text-muted-foreground">{monthData.monthName}</div>
                        <div className="font-medium">{formatCurrency(monthData.partnerCommission)}</div>
                        <div className="text-muted-foreground">
                          {monthData.invoiceCount} счёт{monthData.invoiceCount === 1 ? '' : monthData.invoiceCount < 5 ? 'а' : 'ов'}
                        </div>
                      </div>
                    ))}
                  </div>

                  {client.totalRemaining > 0 && (
                    <div className="flex items-center justify-between text-sm pt-2 border-t border-border/50">
                      <span className="text-muted-foreground">Остаток на проекте:</span>
                      <span className="text-green-600 dark:text-green-400 font-medium">
                        {formatCurrency(client.totalRemaining)}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
