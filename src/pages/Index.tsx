import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUserRole } from "@/hooks/useUserRole";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { 
  TrendingUp, 
  AlertCircle, 
  DollarSign, 
  Clock, 
  ArrowRight,
  Sparkles,
  BarChart3,
  FileText
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface QuickStats {
  revenue: number;
  revenueChange: number;
  overdueCount: number;
  overdueAmount: number;
  pendingCount: number;
  criticalEvents: number;
}

const Index = () => {
  const { role, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();

  useEffect(() => {
    if (!roleLoading && (role === 'admin' || role === 'assistant')) {
      navigate('/invoices', { replace: true });
      return;
    }
  }, [role, roleLoading, navigate]);

  interface DashboardStats {
    invoiceStats?: {
      totalReceived?: number;
      overdueCount?: number;
      overdueAmount?: number;
      pendingCount?: number;
    };
  }

  // Fetch dashboard stats from Express API
  const { data: dashboardData, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ['/api/dashboard/stats'],
    enabled: !roleLoading && !!role,
  });

  // Calculate quick stats from dashboard data
  const stats: QuickStats | null = dashboardData ? {
    revenue: dashboardData.invoiceStats?.totalReceived || 0,
    revenueChange: 0,
    overdueCount: dashboardData.invoiceStats?.overdueCount || 0,
    overdueAmount: dashboardData.invoiceStats?.overdueAmount || 0,
    pendingCount: dashboardData.invoiceStats?.pendingCount || 0,
    criticalEvents: 0,
  } : null;

  const loading = statsLoading;

  if (roleLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-muted/20 to-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const hasCriticalAlerts = stats && (stats.overdueCount > 0 || stats.criticalEvents > 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/20 to-background">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5" />
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-secondary/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
        
        <div className="relative container mx-auto px-8 pt-24 pb-16">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass border border-primary/20">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-primary">Финансовая панель</span>
            </div>
            
            <h1 className="text-6xl md:text-7xl font-bold tracking-tight">
              Управление{" "}
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                финансами
              </span>
            </h1>
            
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Все ключевые показатели бизнеса в одном месте. Контролируйте выручку, 
              отслеживайте платежи и принимайте решения на основе данных.
            </p>

            {role && (
              <div className="flex flex-wrap justify-center gap-4 pt-4">
                <Button 
                  size="lg" 
                  onClick={() => navigate('/invoices')}
                  className="gap-2 shadow-lg hover:shadow-xl transition-all"
                >
                  <FileText className="h-5 w-5" />
                  Перейти к счетам
                </Button>
                {role === 'admin' && (
                  <Button 
                    size="lg" 
                    variant="outline"
                    onClick={() => navigate('/stats')}
                    className="gap-2 glass border-primary/20"
                  >
                    <BarChart3 className="h-5 w-5" />
                    Детальная статистика
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Stats Dashboard */}
      {role && (
        <div className="container mx-auto px-8 pb-24 -mt-8">
          <div className="max-w-6xl mx-auto space-y-8">
            {/* Critical Alerts */}
            {hasCriticalAlerts && !loading && (
              <Card className="border-destructive/50 bg-destructive/5 glass-strong shadow-xl animate-fade-in">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="flex-shrink-0">
                      <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center pulse-ring">
                        <AlertCircle className="h-6 w-6 text-destructive" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-bold text-destructive">
                        Требуется внимание
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {stats.overdueCount > 0 && `${stats.overdueCount} просроченных счетов`}
                        {stats.overdueCount > 0 && stats.criticalEvents > 0 && ' • '}
                        {stats.criticalEvents > 0 && `${stats.criticalEvents} критических событий`}
                      </p>
                    </div>
                    <Button 
                      variant="destructive" 
                      onClick={() => navigate(stats.overdueCount > 0 ? '/stats' : '/security')}
                      className="gap-2"
                    >
                      Посмотреть
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Stats Grid */}
            <div className="grid gap-6 md:grid-cols-3">
              {loading ? (
                <>
                  {[1, 2, 3].map((i) => (
                    <Card key={i} className="glass-strong border-primary/20 shadow-xl">
                      <CardContent className="pt-6">
                        <div className="space-y-4">
                          <div className="flex justify-between items-start">
                            <Skeleton className="h-5 w-32" />
                            <Skeleton className="h-10 w-10 rounded-lg" />
                          </div>
                          <Skeleton className="h-12 w-40" />
                          <Skeleton className="h-5 w-32" />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </>
              ) : stats ? (
                <>
                  {/* Revenue Card */}
                  <Card className="glass-strong border-primary/20 shadow-xl hover-lift group">
                    <CardContent className="pt-6">
                      <div className="space-y-4">
                        <div className="flex justify-between items-start">
                          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                            Выручка месяца
                          </p>
                          <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 group-hover:from-primary/30 group-hover:to-primary/20 transition-all">
                            <DollarSign className="h-5 w-5 text-primary" />
                          </div>
                        </div>
                        
                        <div>
                          <p className="text-4xl font-bold tracking-tight">
                            {formatCurrency(stats.revenue)}
                          </p>
                          {stats.revenueChange !== 0 && (
                            <div className={`flex items-center gap-1 text-sm font-medium mt-2 ${
                              stats.revenueChange > 0 ? 'text-success' : 'text-destructive'
                            }`}>
                              <TrendingUp className={`h-4 w-4 ${stats.revenueChange < 0 ? 'rotate-180' : ''}`} />
                              <span>{Math.abs(stats.revenueChange).toFixed(1)}%</span>
                              <span className="text-muted-foreground ml-1">от прошлого</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Overdue Card */}
                  <Card className={`glass-strong shadow-xl hover-lift group ${
                    stats.overdueCount > 0 
                      ? 'border-destructive/30 bg-destructive/5' 
                      : 'border-success/30 bg-success/5'
                  }`}>
                    <CardContent className="pt-6">
                      <div className="space-y-4">
                        <div className="flex justify-between items-start">
                          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                            Просроченные
                          </p>
                          <div className={`p-2.5 rounded-xl transition-all ${
                            stats.overdueCount > 0
                              ? 'bg-destructive/20 group-hover:bg-destructive/30'
                              : 'bg-success/20 group-hover:bg-success/30'
                          }`}>
                            <AlertCircle className={`h-5 w-5 ${
                              stats.overdueCount > 0 ? 'text-destructive' : 'text-success'
                            }`} />
                          </div>
                        </div>
                        
                        <div>
                          <p className="text-4xl font-bold tracking-tight">
                            {stats.overdueCount}
                          </p>
                          {stats.overdueAmount > 0 && (
                            <p className="text-sm text-muted-foreground mt-2">
                              На сумму {formatCurrency(stats.overdueAmount)}
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Pending Card */}
                  <Card className="glass-strong border-info/20 bg-info/5 shadow-xl hover-lift group">
                    <CardContent className="pt-6">
                      <div className="space-y-4">
                        <div className="flex justify-between items-start">
                          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                            Ожидают оплаты
                          </p>
                          <div className="p-2.5 rounded-xl bg-info/20 group-hover:bg-info/30 transition-all">
                            <Clock className="h-5 w-5 text-info" />
                          </div>
                        </div>
                        
                        <div>
                          <p className="text-4xl font-bold tracking-tight">
                            {stats.pendingCount}
                          </p>
                          <p className="text-sm text-muted-foreground mt-2">
                            Отправленных счетов
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </>
              ) : null}
            </div>

            {/* Quick Actions */}
            {role === 'admin' && (
              <Card className="glass-strong border-primary/20 shadow-xl">
                <CardContent className="pt-6">
                  <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="text-center md:text-left">
                      <h3 className="text-2xl font-bold mb-2">Готовы к анализу?</h3>
                      <p className="text-muted-foreground">
                        Изучите детальную статистику и прогнозы в разделе аналитики
                      </p>
                    </div>
                    <Button 
                      size="lg"
                      onClick={() => navigate('/stats')}
                      className="gap-2 shadow-lg"
                    >
                      <BarChart3 className="h-5 w-5" />
                      Открыть статистику
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Index;
