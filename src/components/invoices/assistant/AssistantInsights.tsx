import { assistantSummarySchema } from '@shared/assistantContract';
import { apiGet } from '@/lib/api';
import { Card, CardContent } from "@/components/ui/card";
import { Trophy, TrendingUp, Lightbulb, Target } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";

interface Props {
  selectedYear: number;
}

export const AssistantInsights = ({ selectedYear }: Props) => {
  const { data: insights, isLoading, error, refetch } = useQuery({
    queryKey: ['assistant-insights', selectedYear],
    queryFn: async () => {
      const summary = await apiGet(`/assistant/invoice-summary?year=${selectedYear}`, assistantSummarySchema);
      if (!summary.count) return [];
      const totalAmount = Number(summary.total);
      const topPartner = summary.topPartner ? [summary.topPartner.name, Number(summary.topPartner.total)] as const : null;
      const bestMonth = summary.monthly.map(row => [row.month, Number(row.total)] as const).sort((a, b) => b[1] - a[1])[0];
      const averageCheck = totalAmount / summary.count;

      const insightsList: { icon: typeof Trophy; color: string; bg: string; text: string }[] = [];

      if (topPartner) {
        const percentage = (totalAmount ? (topPartner[1] / totalAmount) * 100 : 0).toFixed(0);
        insightsList.push({
          icon: Trophy,
          color: "text-yellow-600 dark:text-yellow-400",
          bg: "bg-yellow-500/10",
          text: `${topPartner[0]} — ваш топ-партнёр (${percentage}% выручки)`
        });
      }

      if (bestMonth) {
        const monthName = format(new Date(selectedYear, bestMonth[0]), 'LLLL', { locale: ru });
        const amount = (bestMonth[1] / 1000000).toFixed(1);
        insightsList.push({
          icon: TrendingUp,
          color: "text-green-600 dark:text-green-400",
          bg: "bg-green-500/10",
          text: `${monthName} был лучшим месяцем — ${amount}М ₽`
        });
      }

      insightsList.push({
        icon: Target,
        color: "text-blue-600 dark:text-blue-400",
        bg: "bg-blue-500/10",
        text: `Средний чек: ${Math.round(averageCheck / 1000)}К ₽`
      });

      if (summary.count >= 10) {
        insightsList.push({
          icon: Lightbulb,
          color: "text-purple-600 dark:text-purple-400",
          bg: "bg-purple-500/10",
          text: `Отлично! Обработано ${summary.count} оплаченных счетов в этом году`
        });
      }

      return insightsList;
    }
  });

  // Realtime subscriptions for automatic updates
  useRealtimeSubscription({
    channelName: 'assistant_insights_invoices',
    table: 'invoices',
    event: '*',
    onUpdate: () => refetch(),
    enabled: true,
  });

  useRealtimeSubscription({
    channelName: 'assistant_insights_calculations',
    table: 'invoice_calculations',
    event: '*',
    onUpdate: () => refetch(),
    enabled: true,
  });

  if (error) return <p role="alert">Не удалось загрузить статистику. <button onClick={() => refetch()}>Повторить</button></p>;

  if (isLoading || !insights?.length) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {insights.map((insight, index) => (
        <Card key={index} className="border-0 shadow-sm overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-lg ${insight.bg}`}>
                <insight.icon className={`h-5 w-5 ${insight.color}`} />
              </div>
              <p className="text-sm leading-relaxed flex-1 pt-1">
                {insight.text}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
