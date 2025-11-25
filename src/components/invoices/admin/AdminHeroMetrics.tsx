import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { TrendingUp, Wallet, Calendar, Target, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { useAuth } from "@/hooks/useAuth";

interface HeroMetrics {
  myNetProfit: number;
  workingCapital: number;
  leverageRatio: number;
  workingCapitalWarning: boolean;
}

interface AdminHeroMetricsProps {
  period?: 'month' | 'year' | 'all';
}

export const AdminHeroMetrics = ({ period = 'month' }: AdminHeroMetricsProps) => {
  const [metrics, setMetrics] = useState<HeroMetrics>({
    myNetProfit: 0,
    workingCapital: 0,
    leverageRatio: 0,
    workingCapitalWarning: false,
  });
  const [loading, setLoading] = useState(true);

  const { accessTokenId } = useAuth();

  const fetchMetrics = async () => {
    if (!accessTokenId) return;
    
    try {
      setLoading(true);
      
      const { data, error } = await supabase.rpc('get_admin_hero_metrics', {
        _token_id: accessTokenId,
        _period: period
      });

      if (error) throw error;
      
      if (data && data.length > 0) {
        const metrics = data[0];
        setMetrics({
          myNetProfit: Number(metrics.my_net_profit || 0),
          workingCapital: Number(metrics.working_capital || 0),
          leverageRatio: Number(metrics.leverage_ratio || 0),
          workingCapitalWarning: metrics.working_capital_warning || false,
        });
      }
    } catch (error) {
      console.error('Error fetching hero metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, [period]);

  // Realtime subscriptions for automatic updates
  useRealtimeSubscription({
    channelName: 'admin_hero_metrics_invoices',
    table: 'invoices',
    event: '*',
    onUpdate: fetchMetrics,
    enabled: true,
  });

  useRealtimeSubscription({
    channelName: 'admin_hero_metrics_calculations',
    table: 'invoice_calculations',
    event: '*',
    onUpdate: fetchMetrics,
    enabled: true,
  });

  useRealtimeSubscription({
    channelName: 'admin_hero_metrics_wc',
    table: 'working_capital_balance',
    event: '*',
    onUpdate: fetchMetrics,
    enabled: true,
  });

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="border-0 shadow-lg">
            <CardContent className="p-6">
              <Skeleton className="h-8 w-32 mb-4" />
              <Skeleton className="h-12 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <>
      {metrics.workingCapitalWarning && (
        <Alert variant="destructive" className="mb-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Внимание!</strong> Working Capital ниже критического порога 300,000 ₽
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Моя чистая прибыль */}
        <Card className="border-0 shadow-lg bg-gradient-to-br from-emerald-500/10 to-emerald-600/10 hover:shadow-xl transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-emerald-500/20 rounded-lg">
                <TrendingUp className="h-6 w-6 text-emerald-600" />
              </div>
              <span className="text-sm font-medium text-muted-foreground">
                {period === 'month' ? 'За месяц' : period === 'year' ? 'За год' : 'Все время'}
              </span>
            </div>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">
              Моя чистая прибыль
            </h3>
            <p className="text-3xl font-bold text-emerald-600">
              {formatCurrency(metrics.myNetProfit)}
            </p>
          </CardContent>
        </Card>

        {/* Working Capital */}
        <Card className={`border-0 shadow-lg hover:shadow-xl transition-shadow ${
          metrics.workingCapitalWarning 
            ? 'bg-gradient-to-br from-red-500/10 to-red-600/10' 
            : 'bg-gradient-to-br from-blue-500/10 to-blue-600/10'
        }`}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className={`p-3 rounded-lg ${
                metrics.workingCapitalWarning ? 'bg-red-500/20' : 'bg-blue-500/20'
              }`}>
                <Wallet className={`h-6 w-6 ${
                  metrics.workingCapitalWarning ? 'text-red-600' : 'text-blue-600'
                }`} />
              </div>
              {metrics.workingCapitalWarning && (
                <AlertTriangle className="h-5 w-5 text-red-600" />
              )}
            </div>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">
              Working Capital
            </h3>
            <p className={`text-3xl font-bold ${
              metrics.workingCapitalWarning ? 'text-red-600' : 'text-blue-600'
            }`}>
              {formatCurrency(metrics.workingCapital)}
            </p>
          </CardContent>
        </Card>

        {/* Платежный календарь - заглушка */}
        <Card className="border-0 shadow-lg bg-gradient-to-br from-purple-500/10 to-purple-600/10 hover:shadow-xl transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-purple-500/20 rounded-lg">
                <Calendar className="h-6 w-6 text-purple-600" />
              </div>
            </div>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">
              Платежный календарь
            </h3>
            <p className="text-sm text-purple-600 font-medium">
              См. детали ниже
            </p>
          </CardContent>
        </Card>

        {/* Эффективность (Leverage Ratio) */}
        <Card className="border-0 shadow-lg bg-gradient-to-br from-amber-500/10 to-amber-600/10 hover:shadow-xl transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-amber-500/20 rounded-lg">
                <Target className="h-6 w-6 text-amber-600" />
              </div>
              <span className="text-sm font-medium text-muted-foreground">
                Leverage
              </span>
            </div>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">
              Эффективность
            </h3>
            <p className="text-3xl font-bold text-amber-600">
              {metrics.leverageRatio.toFixed(2)}x
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Прибыль партнеров / Моя прибыль
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
};
