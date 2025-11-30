import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { UnifiedInvoicesList } from "./UnifiedInvoicesList";
import { DoNotSpendDashboard } from "./admin/DoNotSpendDashboard";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { ViewModeToggle } from "@/components/shared/ViewModeToggle";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { 
  ArrowUpRight, 
  Wallet, 
  TrendingUp, 
  FileCheck, 
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  CreditCard
} from "lucide-react";
import { useState } from "react";

interface DebtInvoice {
  id: string;
  invoiceNumber: string;
  scheme: string;
  clientBill: number;
  partnerCommission: number;
  amountToAdmin: number;
  expensesByPartner: number;
  expensesByAdmin: number;
}

interface DebtPayment {
  id: string;
  amount: string;
  paymentDate: string;
  notes: string | null;
  invoiceNumber: string | null;
}

interface DebtDetails {
  summary: {
    totalDebt: number;
    totalPaid: number;
    remainingDebt: number;
    invoiceCount: number;
  };
  invoices: DebtInvoice[];
  payments: DebtPayment[];
}

interface DocumentRiskData {
  status: 'green' | 'red';
  missingActsCount: number;
  missingActsInvoices: Array<{ id: string; invoiceNumber: string }>;
}

interface DoNotSpendSummary {
  clientId: string;
  clientName: string;
  invoiceCount: number;
  totalBudget: number;
  totalSpent: number;
  remaining: number;
  invoices: Array<{
    id: string;
    number: string;
    budget: number;
    spent: number;
    remaining: number;
  }>;
}

interface PartnerSchemeSummary {
  partnerId: string;
  partnerName: string;
  invoiceCount: number;
  totalPlannedExpenses: number;
  totalSpent: number;
  totalCommission: number;
  totalDoNotSpend: number;
  invoices: Array<{
    id: string;
    number: string;
    plannedExpenses: number;
    spent: number;
    commission: number;
    doNotSpend: number;
  }>;
}

interface InvoiceData {
  id: string;
  invoiceNumber: string;
  status: string;
  scheme: string;
  paymentDate: string | null;
  createdAt: string;
  calculations?: {
    partnerTransferDue?: string;
    plannedExpenses?: string;
    expensesPaidByPartner?: string;
    commissionAmount?: string;
    partnerShareFromMargin?: string;
  };
}

export const PartnerDashboard = () => {
  const { partnerId, isLoading: authLoading } = useAuth();
  const { viewMode, setViewMode } = useViewMode();
  const [showDebtDetails, setShowDebtDetails] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryClient = useQueryClient();

  const { data: debtDetails, isLoading: debtLoading } = useQuery<DebtDetails>({
    queryKey: ['/api/my-debt'],
    queryFn: () => apiGet<DebtDetails>('/my-debt'),
    enabled: !!partnerId,
    refetchInterval: 120000,
    refetchOnWindowFocus: true,
  });

  const { data: documentRisk } = useQuery<DocumentRiskData>({
    queryKey: ['/api/partner/document-risk'],
    queryFn: () => apiGet<DocumentRiskData>('/partner/document-risk'),
    enabled: !!partnerId,
    refetchInterval: 120000,
    refetchOnWindowFocus: true,
  });

  const { data: agency30Summaries = [] } = useQuery<DoNotSpendSummary[]>({
    queryKey: ['/api/do-not-spend'],
    queryFn: () => apiGet<DoNotSpendSummary[]>('/do-not-spend'),
    enabled: !!partnerId,
    refetchInterval: 120000,
    refetchOnWindowFocus: true,
  });

  const { data: partnerSchemeSummaries = [] } = useQuery<PartnerSchemeSummary[]>({
    queryKey: ['/api/do-not-spend/partner-schemes'],
    queryFn: () => apiGet<PartnerSchemeSummary[]>('/do-not-spend/partner-schemes'),
    enabled: !!partnerId,
    refetchInterval: 120000,
    refetchOnWindowFocus: true,
  });

  const { data: invoices = [], isLoading: invoicesLoading } = useQuery<InvoiceData[]>({
    queryKey: ['/api/invoices'],
    queryFn: async () => {
      const data = await apiGet<any[]>('/invoices');
      return data.map((inv: any) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        status: inv.status,
        scheme: inv.scheme,
        paymentDate: inv.paymentDate,
        createdAt: inv.createdAt,
        calculations: inv.calculations ? {
          partnerTransferDue: inv.calculations.partnerTransferDue,
          plannedExpenses: inv.calculations.plannedExpenses,
          expensesPaidByPartner: inv.calculations.expensesPaidByPartner,
          commissionAmount: inv.calculations.commissionAmount,
          partnerShareFromMargin: inv.calculations.partnerShareFromMargin,
        } : undefined,
      }));
    },
    enabled: !!partnerId,
    refetchInterval: 120000,
    refetchOnWindowFocus: true,
  });

  const metrics = useMemo(() => {
    const currentYear = new Date().getFullYear();
    let yearlyCommission = 0;
    let totalPaidInvoices = 0;

    for (const inv of invoices) {
      if (inv.status !== 'paid') continue;
      
      totalPaidInvoices++;
      
      const calc = inv.calculations || {};
      const commissionAmount = parseFloat(calc.commissionAmount || "0");
      const partnerShareFromMargin = parseFloat(calc.partnerShareFromMargin || "0");
      const partnerCommission = inv.scheme === 'agency_30' ? partnerShareFromMargin : commissionAmount;
      
      const invoiceYear = inv.paymentDate 
        ? new Date(inv.paymentDate).getFullYear()
        : new Date(inv.createdAt).getFullYear();
      
      if (invoiceYear === currentYear) {
        yearlyCommission += partnerCommission;
      }
    }

    const signedActsCount = documentRisk 
      ? totalPaidInvoices - documentRisk.missingActsCount 
      : 0;

    const agency30Remaining = agency30Summaries.reduce((sum, s) => sum + s.remaining, 0);
    const partnerSchemeDoNotSpend = partnerSchemeSummaries.reduce((sum, s) => sum + s.totalDoNotSpend, 0);
    const reservedForExpenses = agency30Remaining + partnerSchemeDoNotSpend;

    return {
      reservedForExpenses,
      yearlyCommission,
      signedActsCount,
      totalPaidInvoices,
    };
  }, [invoices, documentRisk, agency30Summaries, partnerSchemeSummaries]);

  const currentYear = new Date().getFullYear();
  const loading = debtLoading || invoicesLoading;
  
  const remainingDebt = debtDetails?.summary.remainingDebt ?? 0;
  const totalPaid = debtDetails?.summary.totalPaid ?? 0;
  const totalDebt = debtDetails?.summary.totalDebt ?? 0;
  const hasDebt = remainingDebt > 0;
  const hasPayments = (debtDetails?.payments.length ?? 0) > 0;
  const canExpand = hasDebt || hasPayments || totalDebt > 0;
  
  const actsPercentage = metrics.totalPaidInvoices > 0 
    ? Math.round((metrics.signedActsCount / metrics.totalPaidInvoices) * 100) 
    : 0;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/api/my-debt'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/invoices'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/partner/document-risk'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/do-not-spend'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/do-not-spend/partner-schemes'] }),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  };

  if (authLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <Skeleton className="h-12 w-64" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <DashboardHeader
          title="Панель партнёра"
          subtitle="Ваша статистика и счета"
        />
        <Button 
          variant="outline" 
          size="icon"
          onClick={handleRefresh}
          disabled={loading || isRefreshing}
          data-testid="button-refresh"
        >
          <RefreshCw className={cn("h-4 w-4", (loading || isRefreshing) && "animate-spin")} />
        </Button>
      </div>

      <div className="space-y-8">
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card 
                className={cn(
                  "border-2 transition-colors",
                  canExpand && "cursor-pointer",
                  hasDebt 
                    ? "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20" 
                    : "border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20"
                )}
                onClick={() => canExpand && setShowDebtDetails(!showDebtDetails)}
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
                        {formatCurrency(remainingDebt)}
                      </p>
                      <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                        {totalPaid > 0 && (
                          <div className="flex items-center gap-1">
                            <CreditCard className="h-3 w-3" />
                            <span>Оплачено: {formatCurrency(totalPaid)}</span>
                          </div>
                        )}
                        <span>
                          {hasDebt 
                            ? `${debtDetails?.invoices.length || 0} счетов` 
                            : "Всё оплачено"}
                        </span>
                      </div>
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
                  {canExpand && (
                    <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                      {showDebtDetails ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                      <span>Показать детали</span>
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
                        {actsPercentage}% от оплаченных
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

            {showDebtDetails && debtDetails && (
              <Card className={cn(
                hasDebt 
                  ? "border-red-200/50 dark:border-red-800/30 bg-red-50/30 dark:bg-red-950/10"
                  : "border-green-200/50 dark:border-green-800/30 bg-green-50/30 dark:bg-green-950/10"
              )}>
                <CardContent className="pt-4 space-y-4">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-sm font-medium text-muted-foreground">
                      Детали долга
                    </p>
                    <div className="flex items-center gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Общий долг: </span>
                        <span className="font-semibold">{formatCurrency(debtDetails.summary.totalDebt)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Оплачено: </span>
                        <span className="font-semibold text-green-600 dark:text-green-400">{formatCurrency(debtDetails.summary.totalPaid)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Остаток: </span>
                        <span className="font-semibold text-red-600 dark:text-red-400">{formatCurrency(debtDetails.summary.remainingDebt)}</span>
                      </div>
                    </div>
                  </div>

                  {debtDetails.summary.totalDebt > 0 && (
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full transition-all duration-300 bg-green-500"
                        style={{ 
                          width: `${Math.min(100, (debtDetails.summary.totalPaid / debtDetails.summary.totalDebt) * 100)}%`,
                        }}
                      />
                    </div>
                  )}

                  {debtDetails.invoices.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">
                        Счета (начислено к переводу):
                      </p>
                      {debtDetails.invoices.map((invoice) => (
                        <div 
                          key={invoice.id}
                          className="flex items-center justify-between p-2 bg-background/80 rounded-md"
                          data-testid={`debt-invoice-${invoice.id}`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{invoice.invoiceNumber}</span>
                            <Badge variant="secondary" className="text-xs">
                              {invoice.scheme}
                            </Badge>
                          </div>
                          <span className="text-sm text-muted-foreground">
                            {formatCurrency(invoice.amountToAdmin)}
                          </span>
                        </div>
                      ))}
                      <p className="text-xs text-muted-foreground italic pt-1">
                        Оплаты вычитаются из общей суммы долга
                      </p>
                    </div>
                  )}

                  {debtDetails.payments.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">
                        История приходов:
                      </p>
                      <div className="space-y-1.5">
                        {debtDetails.payments.map((payment) => (
                          <div 
                            key={payment.id}
                            className="flex items-start justify-between gap-3 py-2 px-3 rounded-md bg-muted/50 text-sm"
                          >
                            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                              <div className="flex items-center gap-3 flex-wrap">
                                <span className="text-muted-foreground whitespace-nowrap">
                                  {new Date(payment.paymentDate).toLocaleDateString('ru-RU')}
                                </span>
                                <span className="font-medium text-green-600 dark:text-green-400 whitespace-nowrap">
                                  {formatCurrency(parseFloat(payment.amount))}
                                </span>
                              </div>
                              {payment.notes && (
                                <span className="text-xs text-muted-foreground break-words">
                                  {payment.notes}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        <DoNotSpendDashboard />

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-4 flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-2xl">Мои счета</CardTitle>
            <ViewModeToggle 
              value={viewMode}
              onValueChange={setViewMode}
              className="hidden sm:flex"
            />
          </CardHeader>
          <CardContent className="px-0">
            <UnifiedInvoicesList 
              role="partner" 
              viewMode={viewMode}
              partnerId={partnerId || undefined}
              enableRealtime={true}
            />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};
