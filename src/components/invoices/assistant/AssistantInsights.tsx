import { Card, CardContent } from "@/components/ui/card";
import { Trophy, TrendingUp, Lightbulb, Target } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { callRPC } from "@/lib/supabaseHelpers";
import { useSessionToken } from "@/hooks/useSessionToken";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";

interface Props {
  selectedYear: number;
}

export const AssistantInsights = ({ selectedYear }: Props) => {
  const { getTokenId } = useSessionToken();
  
  const { data: insights, isLoading, refetch } = useQuery({
    queryKey: ['assistant-insights', selectedYear],
    queryFn: async () => {
      const tokenId = getTokenId();
      if (!tokenId) {
        console.error('[AssistantInsights] No token ID');
        return [];
      }

      const invoices = await callRPC<any>('get_assistant_stats_invoices', {
        _token_id: tokenId,
        _year: selectedYear
      });

      if (!invoices || invoices.length === 0) {
        return [];
      }

      const partnerTotals = new Map<string, number>();
      const monthlyTotals = new Map<number, number>();
      let totalAmount = 0;

      invoices.forEach(inv => {
        const amount = inv.client_bill || 0;
        totalAmount += amount;

        const partnerName = inv.partner_name || 'Неизвестный';
        partnerTotals.set(partnerName, (partnerTotals.get(partnerName) || 0) + amount);

        const month = new Date(inv.actual_payment_date!).getMonth();
        monthlyTotals.set(month, (monthlyTotals.get(month) || 0) + amount);
      });

      const topPartner = Array.from(partnerTotals.entries())
        .sort(([, a], [, b]) => b - a)[0];

      const bestMonth = Array.from(monthlyTotals.entries())
        .sort(([, a], [, b]) => b - a)[0];

      const averageCheck = totalAmount / invoices.length;

      const insightsList = [];

      if (topPartner) {
        const percentage = ((topPartner[1] / totalAmount) * 100).toFixed(0);
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

      if (invoices.length >= 10) {
        insightsList.push({
          icon: Lightbulb,
          color: "text-purple-600 dark:text-purple-400",
          bg: "bg-purple-500/10",
          text: `Отлично! Обработано ${invoices.length} оплаченных счетов в этом году`
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
