import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, DollarSign, PiggyBank, Clock, Lock, HelpCircle } from "lucide-react";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { MetricCardSkeleton } from "@/components/ui/metric-card-skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";

interface DashboardStats {
  totalClientBill?: number;
  totalNetProfit?: number;
  paidInvoicesCount?: number;
  draftInvoicesCount?: number;
  sentInvoicesCount?: number;
  totalClientRemaining?: number;
}

export const KeyMetricsCards = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const { isAuthenticated } = useAuth();

  const fetchMetrics = useCallback(async () => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    
    try {
      const response = await fetch('/api/dashboard/stats', {
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error("Error fetching metrics:", error);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchMetrics();
    
    let isVisible = document.visibilityState === 'visible';
    
    const handleVisibilityChange = () => {
      isVisible = document.visibilityState === 'visible';
      if (isVisible) {
        fetchMetrics();
      }
    };
    
    const interval = setInterval(() => {
      if (isVisible) fetchMetrics();
    }, 120000);
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchMetrics]);

  const revenue = stats?.totalClientBill || 0;
  const profit = stats?.totalNetProfit || 0;
  const clientRemaining = stats?.totalClientRemaining || 0;
  const sentCount = stats?.sentInvoicesCount || 0;

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
        <CardContent className="pt-4 sm:pt-6 pb-4 sm:pb-6">
          <div className="flex items-center justify-between mb-3 sm:mb-4 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <p className="text-xs sm:text-sm font-medium text-muted-foreground uppercase tracking-wide truncate">
                {title}
              </p>
              {tooltip && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help shrink-0" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-sm">{tooltip}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            <div className="p-2 rounded-lg bg-primary/10 shrink-0">
              <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            </div>
          </div>
          
          <div className="space-y-2">
            <p className={`text-xl sm:text-2xl md:text-4xl font-bold tracking-tight ${valueClassName || ''}`}>
              {formatCurrency(value)}
            </p>
            
            {showTrend && trend !== undefined && (
              <div className={`flex flex-wrap items-center gap-1 text-xs sm:text-sm font-medium ${
                isPositive ? 'text-green-600' : 'text-red-600'
              }`}>
                <TrendIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                <span>{Math.abs(trend).toFixed(1)}%</span>
                <span className="text-muted-foreground">от прошлого месяца</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        title="Выручка"
        value={revenue}
        icon={DollarSign}
        delay={0}
        showTrend={false}
        tooltip="Общая сумма по всем оплаченным счетам"
      />
      <MetricCard
        title="Прибыль"
        value={profit}
        icon={PiggyBank}
        delay={100}
        showTrend={false}
        tooltip="Чистая прибыль после всех расходов и выплат партнерам"
      />
      <MetricCard
        title="Ожидаемые"
        value={sentCount}
        icon={Clock}
        delay={200}
        showTrend={false}
        tooltip="Количество отправленных счетов, ожидающих оплаты"
      />
      <MetricCard
        title="Средства клиентов"
        value={clientRemaining}
        icon={Lock}
        delay={300}
        showTrend={false}
        valueClassName="text-green-600 dark:text-green-400"
        tooltip="Бюджет клиентов, зарезервированный на их счетах"
      />
    </div>
  );
};
