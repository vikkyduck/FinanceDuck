import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { Loader2, Wallet, AlertTriangle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface ClientFunds {
  clientId: string;
  clientName: string;
  totalBudget: number;
  totalSpent: number;
  remaining: number;
  invoiceCount: number;
}

interface Agency30FundsResponse {
  clients: ClientFunds[];
  totalRemaining: number;
}

export const Agency30ClientFundsTracker = () => {
  const { data, isLoading, error } = useQuery<Agency30FundsResponse>({
    queryKey: ['/api/partner/agency30-funds'],
    refetchInterval: 120000,
    refetchOnWindowFocus: true,
  });

  if (isLoading) {
    return (
      <Card data-testid="card-agency30-funds">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Клиентские деньги (Agency 30%)
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data || data.clients.length === 0) {
    return null;
  }

  const { clients, totalRemaining } = data;

  return (
    <Card data-testid="card-agency30-funds">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          Клиентские деньги (Agency 30%)
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          70% от счёта клиента - это его бюджет на проект. Эти деньги нельзя тратить на свои нужды.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div 
          className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg"
        >
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <span className="font-semibold text-amber-900 dark:text-amber-100">
              Всего на проекты
            </span>
          </div>
          <p 
            className="text-2xl font-bold text-amber-700 dark:text-amber-400"
            data-testid="text-total-remaining"
          >
            {formatCurrency(totalRemaining)}
          </p>
        </div>

        <div className="space-y-3">
          {clients.map((client) => {
            const percentSpent = client.totalBudget > 0 
              ? (client.totalSpent / client.totalBudget) * 100 
              : 0;
            const isOverBudget = percentSpent > 90;

            return (
              <div 
                key={client.clientId}
                className="p-3 bg-accent/30 rounded-lg"
                data-testid={`card-client-funds-${client.clientId}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium" data-testid={`text-client-name-${client.clientId}`}>
                    {client.clientName}
                  </span>
                  <span 
                    className={`font-bold ${isOverBudget ? 'text-red-600' : 'text-green-600 dark:text-green-400'}`}
                    data-testid={`text-client-remaining-${client.clientId}`}
                  >
                    {formatCurrency(client.remaining)}
                  </span>
                </div>
                
                <Progress 
                  value={Math.min(percentSpent, 100)} 
                  className={`h-2 ${isOverBudget ? '[&>div]:bg-red-500' : ''}`}
                />
                
                <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                  <span>Потрачено: {formatCurrency(client.totalSpent)}</span>
                  <span>Бюджет: {formatCurrency(client.totalBudget)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
