import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, DollarSign, PiggyBank, Clock, Lock, HelpCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { MetricCardSkeleton } from "@/components/ui/metric-card-skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { useAuth } from "@/hooks/useAuth";

interface MetricData {
  currentMonth: number;
  previousMonth: number;
  trend: number;
}

export const KeyMetricsCards = () => {
  const [revenue, setRevenue] = useState<MetricData>({ currentMonth: 0, previousMonth: 0, trend: 0 });
  const [profit, setProfit] = useState<MetricData>({ currentMonth: 0, previousMonth: 0, trend: 0 });
  const [expected, setExpected] = useState<number>(0);
  const [clientRemaining, setClientRemaining] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const { accessTokenId } = useAuth();

  const fetchMetrics = async () => {
    if (!accessTokenId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_admin_stats', {
        _token_id: accessTokenId
      });

      if (error) throw error;
      
      if (data && data.length > 0) {
        const stats = data[0];
        
        setRevenue({ 
          currentMonth: Number(stats.current_month_revenue || 0),
          previousMonth: Number(stats.previous_month_revenue || 0),
          trend: Number(stats.revenue_trend || 0)
        });
        
        setProfit({ 
          currentMonth: Number(stats.current_month_profit || 0),
          previousMonth: Number(stats.previous_month_profit || 0),
          trend: Number(stats.profit_trend || 0)
        });
        
        setExpected(Number(stats.expected_revenue_3months || 0));
        setClientRemaining(Number(stats.total_client_remaining || 0));
      }
    } catch (error) {
      console.error("Error fetching metrics:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, [accessTokenId]);

  // Realtime subscriptions for automatic updates
  useRealtimeSubscription({
    channelName: 'key_metrics_invoices',
    table: 'invoices',
    event: '*',
    onUpdate: fetchMetrics,
    enabled: true,
  });

  useRealtimeSubscription({
    channelName: 'key_metrics_calculations',
    table: 'invoice_calculations',
    event: '*',
    onUpdate: fetchMetrics,
    enabled: true,
  });

  const MetricCard = ({
    title, 
    value, 
    trend, 
    icon: Icon, 
    delay,
    showTrend = true,
    tooltip,
    valueClassName
  }: { 
    title: string; 
    value: number; 
    trend?: number; 
    icon: any; 
    delay: number;
    showTrend?: boolean;
    tooltip?: string;
    valueClassName?: string;
  }) => {
    const isPositive = trend && trend > 0;
    const TrendIcon = isPositive ? TrendingUp : TrendingDown;
    
    if (loading) {
      return (
        <MetricCardSkeleton
          showIcon
          showTrend={showTrend}
          size="lg"
          delay={delay}
          borderless
        />
      );
    }
    
    return (
      <Card 
        className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 animate-fade-in"
        style={{ animationDelay: `${delay}ms` }}
      >
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                {title}
              </p>
              {tooltip && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-sm">{tooltip}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            <div className="p-2 rounded-lg bg-primary/10">
              <Icon className="h-5 w-5 text-primary" />
            </div>
          </div>
          
          <div className="space-y-2">
            <p className={`text-4xl font-bold tracking-tight ${valueClassName || ''}`}>
              {formatCurrency(value)}
            </p>
            
            {showTrend && trend !== undefined && (
              <div className={`flex items-center gap-1 text-sm font-medium ${
                isPositive ? 'text-green-600' : 'text-red-600'
              }`}>
                <TrendIcon className="h-4 w-4" />
                <span>{Math.abs(trend).toFixed(1)}%</span>
                <span className="text-muted-foreground ml-1">от прошлого месяца</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        title="Выручка"
        value={revenue.currentMonth}
        trend={revenue.trend}
        icon={DollarSign}
        delay={0}
        tooltip="Общая сумма по всем оплаченным счетам в текущем месяце"
      />
      <MetricCard
        title="Прибыль"
        value={profit.currentMonth}
        trend={profit.trend}
        icon={PiggyBank}
        delay={100}
        tooltip="Чистая прибыль после всех расходов и выплат партнерам"
      />
      <MetricCard
        title="Прогноз 3 мес."
        value={expected}
        icon={Clock}
        delay={200}
        showTrend={false}
        tooltip="Ожидаемые поступления по отправленным счетам в ближайшие 3 месяца"
      />
      <MetricCard
        title="Средства клиентов"
        value={clientRemaining}
        icon={Lock}
        delay={300}
        showTrend={false}
        valueClassName="text-green-600"
        tooltip="Бюджет клиентов, зарезервированный на их счетах"
      />
    </div>
  );
};
