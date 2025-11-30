import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { useVisibilityAwareInterval } from "@/hooks/useVisibilityAwareInterval";
import { 
  ArrowUpRight, 
  Wallet, 
  TrendingUp, 
  FileCheck, 
  AlertTriangle,
  ChevronDown,
  ChevronRight
} from "lucide-react";
import { useState, Fragment } from "react";
import { cn } from "@/lib/utils";

interface PartnerHeroMetricsData {
  debtToAdmin: number;
  reservedForExpenses: number;
  yearlyCommission: number;
  signedActsCount: number;
  totalPaidInvoices: number;
  invoicesWithDebt: { id: string; number: string; amount: number }[];
}

export const PartnerHeroMetrics = () => {
  const refetchInterval = useVisibilityAwareInterval();
  const [showDebtDetails, setShowDebtDetails] = useState(false);

  const { data: metrics, isLoading } = useQuery<PartnerHeroMetricsData>({
    queryKey: ['/api/partner/hero-metrics'],
    refetchInterval,
    refetchOnWindowFocus: true,
  });

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    );
  }

  if (!metrics) {
    return null;
  }

  const currentYear = new Date().getFullYear();
  const hasDebt = metrics.debtToAdmin > 0;
  const actsPercentage = metrics.totalPaidInvoices > 0 
    ? Math.round((metrics.signedActsCount / metrics.totalPaidInvoices) * 100) 
    : 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card 
          className={cn(
            "border-2 cursor-pointer transition-colors",
            hasDebt 
              ? "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20" 
              : "border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20"
          )}
          onClick={() => hasDebt && setShowDebtDetails(!showDebtDetails)}
          data-testid="card-debt-to-admin"
        >
          <CardContent className="pt-6">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground mb-1">
                  Долг админу
                </p>
                <p className={cn(
                  "text-2xl font-bold",
                  hasDebt ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
                )} data-testid="text-debt-amount">
                  {formatCurrency(metrics.debtToAdmin)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {hasDebt 
                    ? `${metrics.invoicesWithDebt.length} счетов с долгом` 
                    : "Всё оплачено"}
                </p>
              </div>
              <div className={cn(
                "p-2 rounded-full",
                hasDebt 
                  ? "bg-red-100 dark:bg-red-900/30" 
                  : "bg-green-100 dark:bg-green-900/30"
              )}>
                {hasDebt ? (
                  <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                ) : (
                  <ArrowUpRight className="h-5 w-5 text-green-600 dark:text-green-400" />
                )}
              </div>
            </div>
            {hasDebt && (
              <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                {showDebtDetails ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                <span>Детали</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-reserved-expenses">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground mb-1">
                  Резерв на расходы
                </p>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400" data-testid="text-reserved-amount">
                  {formatCurrency(metrics.reservedForExpenses)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  На проектные расходы
                </p>
              </div>
              <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900/30">
                <Wallet className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-yearly-commission">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground mb-1">
                  Комиссия {currentYear}
                </p>
                <p className="text-2xl font-bold text-primary" data-testid="text-commission-amount">
                  {formatCurrency(metrics.yearlyCommission)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  За текущий год
                </p>
              </div>
              <div className="p-2 rounded-full bg-primary/10">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-signed-acts">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground mb-1">
                  Подписано актов
                </p>
                <p className="text-2xl font-bold" data-testid="text-acts-count">
                  {metrics.signedActsCount} / {metrics.totalPaidInvoices}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {actsPercentage}% от оплаченных счетов
                </p>
              </div>
              <div className={cn(
                "p-2 rounded-full",
                actsPercentage === 100 
                  ? "bg-green-100 dark:bg-green-900/30" 
                  : "bg-amber-100 dark:bg-amber-900/30"
              )}>
                <FileCheck className={cn(
                  "h-5 w-5",
                  actsPercentage === 100 
                    ? "text-green-600 dark:text-green-400" 
                    : "text-amber-600 dark:text-amber-400"
                )} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {showDebtDetails && metrics.invoicesWithDebt.length > 0 && (
        <Card className="border-red-200/50 dark:border-red-800/30 bg-red-50/30 dark:bg-red-950/10">
          <CardContent className="pt-4">
            <p className="text-sm font-medium text-muted-foreground mb-3">
              Счета с долгом к переводу:
            </p>
            <div className="space-y-2">
              {metrics.invoicesWithDebt.map((invoice) => (
                <div 
                  key={invoice.id}
                  className="flex items-center justify-between p-2 bg-background/80 rounded-md"
                  data-testid={`debt-invoice-${invoice.id}`}
                >
                  <span className="text-sm font-medium">{invoice.number}</span>
                  <span className="text-sm font-semibold text-red-600 dark:text-red-400">
                    {formatCurrency(invoice.amount)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
