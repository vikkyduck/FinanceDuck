import { assistantSummarySchema } from '@shared/assistantContract';
import { apiGet } from '@/lib/api';
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, Receipt, DollarSign, Calendar, Wallet } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { formatMoney } from "@/lib/format";

interface Props {
  selectedYear: number;
}

export const AssistantYearlyOverview = ({ selectedYear }: Props) => {
  const { data: stats, isLoading, error, refetch } = useQuery({
    queryKey: ['assistant-yearly-stats', selectedYear],
    queryFn: async () => {
      const summary = await apiGet(`/assistant/invoice-summary?year=${selectedYear}`, assistantSummarySchema);
      const total = Number(summary.total), totalExpenses = Number(summary.totalExpenses);
      const monthlyTotals = Object.fromEntries(summary.monthly.map(row => [row.month, Number(row.total)]));
      const bestMonth = Object.entries(monthlyTotals)
        .sort(([, a], [, b]) => b - a)[0];

      return {
        total,
        totalExpenses,
        count: summary.count,
        average: summary.count ? total / summary.count : 0,
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

  if (error) return <p role="alert">Не удалось загрузить статистику. <button onClick={() => refetch()}>Повторить</button></p>;

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
            <h2 className="text-2xl sm:text-4xl md:text-5xl font-bold text-foreground">
              {formatMoney(stats.total)}
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
                  {formatMoney(stats.totalExpenses)}
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
                  {formatMoney(stats.average)}
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
