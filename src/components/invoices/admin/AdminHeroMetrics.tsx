import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { TrendingUp, Wallet, Calendar, FileText, AlertTriangle, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MetricCardSkeletonGrid } from "@/components/ui/metric-card-skeleton";
import { useDashboardStats } from "@/hooks/useDashboardStats";

interface AdminHeroMetricsProps {
  period?: 'month' | 'year' | 'all';
}

export const AdminHeroMetrics = ({ period = 'month' }: AdminHeroMetricsProps) => {
  const { data: stats, isLoading, error } = useDashboardStats();

  if (isLoading) {
    return (
      <MetricCardSkeletonGrid
        count={4}
        columns={4}
        showIcon={false}
        size="lg"
        borderless
        className="mb-8"
        gridClassName="grid-cols-1 md:grid-cols-2 lg:grid-cols-4"
      />
    );
  }

  if (error || !stats) {
    return (
      <div className="flex items-center gap-2 text-destructive mb-8">
        <AlertCircle className="h-4 w-4" />
        <span>Ошибка загрузки метрик</span>
      </div>
    );
  }

  const netProfit = stats.totalNetProfit || 0;
  const overdueWarning = stats.overdueInvoices > 0;

  return (
    <>
      {overdueWarning && (
        <Alert variant="destructive" className="mb-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Внимание!</strong> {stats.overdueInvoices} счетов просрочено
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
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
              Чистая прибыль
            </h3>
            <p className="text-3xl font-bold text-emerald-600" data-testid="value-net-profit">
              {formatCurrency(netProfit)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg bg-gradient-to-br from-blue-500/10 to-blue-600/10 hover:shadow-xl transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-blue-500/20 rounded-lg">
                <Wallet className="h-6 w-6 text-blue-600" />
              </div>
            </div>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">
              Оборот (выставлено)
            </h3>
            <p className="text-3xl font-bold text-blue-600" data-testid="value-total-revenue">
              {formatCurrency(stats.totalClientBill)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg bg-gradient-to-br from-purple-500/10 to-purple-600/10 hover:shadow-xl transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-purple-500/20 rounded-lg">
                <Calendar className="h-6 w-6 text-purple-600" />
              </div>
              {overdueWarning && (
                <AlertTriangle className="h-5 w-5 text-orange-600" />
              )}
            </div>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">
              К оплате
            </h3>
            <p className="text-3xl font-bold text-purple-600" data-testid="value-pending">
              {formatCurrency(stats.pendingClientBill)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.pendingInvoices} счетов
            </p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg bg-gradient-to-br from-amber-500/10 to-amber-600/10 hover:shadow-xl transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-amber-500/20 rounded-lg">
                <FileText className="h-6 w-6 text-amber-600" />
              </div>
            </div>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">
              Расходы исполнителей
            </h3>
            <p className="text-3xl font-bold text-amber-600" data-testid="value-expenses">
              {formatCurrency(stats.totalExpenses)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              по всем счетам
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
};
