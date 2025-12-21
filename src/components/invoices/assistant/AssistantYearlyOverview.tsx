import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, Receipt, DollarSign, Calendar, Wallet } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { callRPC } from "@/lib/supabaseHelpers";
import { useSessionToken } from "@/hooks/useSessionToken";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";

interface Props {
  selectedYear: number;
}

export const AssistantYearlyOverview = ({ selectedYear }: Props) => {
  const { getTokenId } = useSessionToken();
  
  const { data: stats, isLoading, refetch } = useQuery({
    queryKey: ['assistant-yearly-stats', selectedYear],
    queryFn: async () => {
      const tokenId = getTokenId();
      if (!tokenId) {
        console.error('[AssistantYearlyOverview] No token ID');
        return { total: 0, totalExpenses: 0, count: 0, average: 0, bestMonth: null };
      }

      const invoices = await callRPC<any>('get_assistant_stats_invoices', {
        _token_id: tokenId,
        _year: selectedYear
      });

      if (!invoices || invoices.length === 0) {
        return { total: 0, totalExpenses: 0, count: 0, average: 0, bestMonth: null };
      }

      const total = invoices.reduce((sum, inv) => sum + (inv.client_bill || 0), 0);
      const totalExpenses = invoices.reduce((sum, inv) => sum + (inv.executor_expenses_total || 0), 0);

      const monthlyTotals: Record<number, number> = {};
      invoices.forEach(inv => {
        const month = new Date(inv.actual_payment_date!).getMonth();
        monthlyTotals[month] = (monthlyTotals[month] || 0) + (inv.client_bill || 0);
      });

      const bestMonth = Object.entries(monthlyTotals)
        .sort(([, a], [, b]) => b - a)[0];

      return {
        total,
        totalExpenses,
        count: invoices.length,
        average: total / invoices.length,
        bestMonth: bestMonth ? {
          name: format(new Date(selectedYear, parseInt(bestMonth[0])), 'LLLL', { locale: ru }),
          amount: bestMonth[1]
        } : null
      };
    }
  });

  // Realtime subscriptions for automatic updates
  useRealtimeSubscription({
    channelName: 'assistant_yearly_invoices',
    table: 'invoices',
    event: '*',
    onUpdate: () => refetch(),
    enabled: true,
  });

  useRealtimeSubscription({
    channelName: 'assistant_yearly_calculations',
    table: 'invoice_calculations',
    event: '*',
    onUpdate: () => refetch(),
    enabled: true,
  });

  useRealtimeSubscription({
    channelName: 'assistant_yearly_expenses',
    table: 'executor_expenses',
    event: '*',
    onUpdate: () => refetch(),
    enabled: true,
  });

  if (isLoading || !stats) {
    return (
      <Card className="border-0 shadow-lg bg-gradient-to-br from-primary/5 via-background to-accent/5">
        <CardContent className="p-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-1/3" />
            <div className="h-16 bg-muted rounded w-2/3" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-lg bg-gradient-to-br from-primary/5 via-background to-accent/5 overflow-hidden">
      <CardContent className="p-4 sm:p-6 md:p-8">
        <div className="space-y-4 sm:space-y-6">
          {/* Hero Number */}
          <div>
            <p className="text-xs sm:text-sm text-muted-foreground font-medium mb-1 sm:mb-2">
              Переведено от клиентов в {selectedYear}
            </p>
            <h2 className="text-2xl sm:text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              {stats.total.toLocaleString('ru-RU')} ₽
            </h2>
          </div>

          {/* Sub Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="flex items-center sm:items-start gap-3 p-3 sm:p-4 rounded-lg bg-background/50 border border-border/50">
              <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                <Receipt className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-lg sm:text-2xl font-bold">{stats.count}</p>
                <p className="text-xs text-muted-foreground">Оплаченных счетов</p>
              </div>
            </div>

            <div className="flex items-center sm:items-start gap-3 p-3 sm:p-4 rounded-lg bg-background/50 border border-border/50">
              <div className="p-2 rounded-lg bg-orange-500/10 shrink-0">
                <Wallet className="h-4 w-4 sm:h-5 sm:w-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div className="min-w-0">
                <p className="text-lg sm:text-2xl font-bold break-words">
                  {stats.totalExpenses.toLocaleString('ru-RU')} ₽
                </p>
                <p className="text-xs text-muted-foreground">Проведено расходов</p>
              </div>
            </div>

            <div className="flex items-center sm:items-start gap-3 p-3 sm:p-4 rounded-lg bg-background/50 border border-border/50">
              <div className="p-2 rounded-lg bg-accent/10 shrink-0">
                <DollarSign className="h-4 w-4 sm:h-5 sm:w-5 text-accent-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-lg sm:text-2xl font-bold break-words">
                  {Math.round(stats.average).toLocaleString('ru-RU')} ₽
                </p>
                <p className="text-xs text-muted-foreground">Средний чек</p>
              </div>
            </div>

            {stats.bestMonth && (
              <div className="flex items-center sm:items-start gap-3 p-3 sm:p-4 rounded-lg bg-background/50 border border-border/50">
                <div className="p-2 rounded-lg bg-green-500/10 shrink-0">
                  <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 dark:text-green-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-lg sm:text-2xl font-bold">
                    {(stats.bestMonth.amount / 1000000).toFixed(1)}М ₽
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Лучший — {stats.bestMonth.name}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
