import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { UnifiedInvoicesList } from "./UnifiedInvoicesList";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { ViewModeToggle } from "@/components/shared/ViewModeToggle";
import { apiGet } from "@/lib/api";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { cn } from "@/lib/utils";
import { 
  ArrowUpRight, 
  Wallet, 
  TrendingUp, 
  FileCheck, 
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  RefreshCw
} from "lucide-react";

interface InvoiceData {
  id: string;
  invoice_number: string;
  status: string;
  scheme: string;
  payment_date: string | null;
  created_at: string;
  calculations?: {
    partnerTransferDue?: string;
    plannedExpenses?: string;
    expensesPaidByPartner?: string;
    partnerCommission?: string;
  };
}

interface DocumentRiskData {
  status: 'green' | 'red';
  missingActsCount: number;
  missingActsInvoices: Array<{ id: string; invoiceNumber: string }>;
}

interface PartnerMetrics {
  debtToAdmin: number;
  reservedForExpenses: number;
  yearlyCommission: number;
  signedActsCount: number;
  totalPaidInvoices: number;
  invoicesWithDebt: Array<{ id: string; number: string; amount: number }>;
}

const calculatePartnerMetrics = (invoices: InvoiceData[], documentRisk: DocumentRiskData | null): PartnerMetrics => {
  const currentYear = new Date().getFullYear();
  
  let debtToAdmin = 0;
  let reservedForExpenses = 0;
  let yearlyCommission = 0;
  let totalPaidInvoices = 0;
  const invoicesWithDebt: Array<{ id: string; number: string; amount: number }> = [];

  for (const inv of invoices) {
    if (inv.status !== 'paid') continue;
    
    totalPaidInvoices++;
    
    const calc = inv.calculations || {};
    const partnerTransferDue = parseFloat(calc.partnerTransferDue || "0");
    const plannedExpenses = parseFloat(calc.plannedExpenses || "0");
    const expensesPaidByPartner = parseFloat(calc.expensesPaidByPartner || "0");
    const partnerCommission = parseFloat(calc.partnerCommission || "0");
    
    // Debt to admin
    if (partnerTransferDue > 0) {
      debtToAdmin += partnerTransferDue;
      invoicesWithDebt.push({
        id: inv.id,
        number: inv.invoice_number || `INV-${inv.id.slice(0, 8)}`,
        amount: partnerTransferDue,
      });
    }
    
    // Reserved for expenses (plannedExpenses - already spent)
    if (plannedExpenses > 0) {
      const reserved = Math.max(0, plannedExpenses - expensesPaidByPartner);
      reservedForExpenses += reserved;
    }
    
    // Yearly commission - check if invoice is from current year
    const invoiceYear = inv.payment_date 
      ? new Date(inv.payment_date).getFullYear()
      : new Date(inv.created_at).getFullYear();
    
    if (invoiceYear === currentYear) {
      yearlyCommission += partnerCommission;
    }
  }

  // Signed acts count = total paid - missing acts
  const signedActsCount = documentRisk 
    ? totalPaidInvoices - documentRisk.missingActsCount 
    : 0;

  return {
    debtToAdmin,
    reservedForExpenses,
    yearlyCommission,
    signedActsCount,
    totalPaidInvoices,
    invoicesWithDebt,
  };
};

export const PartnerDashboard = () => {
  const { partnerId, isLoading: authLoading } = useAuth();
  const { viewMode, setViewMode } = useViewMode();
  const [invoices, setInvoices] = useState<InvoiceData[]>([]);
  const [documentRisk, setDocumentRisk] = useState<DocumentRiskData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDebtDetails, setShowDebtDetails] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    if (!partnerId) return;
    
    try {
      // Fetch both invoices and document risk in parallel
      const [invoicesData, riskData] = await Promise.all([
        apiGet<any[]>('/invoices'),
        apiGet<DocumentRiskData>('/partner/document-risk').catch(() => null),
      ]);
      
      const mapped: InvoiceData[] = invoicesData.map((inv: any) => ({
        id: inv.id,
        invoice_number: inv.invoiceNumber,
        status: inv.status,
        scheme: inv.scheme,
        payment_date: inv.paymentDate,
        created_at: inv.createdAt,
        calculations: inv.calculations ? {
          partnerTransferDue: inv.calculations.partnerTransferDue,
          plannedExpenses: inv.calculations.plannedExpenses,
          expensesPaidByPartner: inv.calculations.expensesPaidByPartner,
          partnerCommission: inv.calculations.partnerCommission,
        } : undefined,
      }));
      
      setInvoices(mapped);
      setDocumentRisk(riskData);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    
    // Refresh on visibility change
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchData();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibility);
    
    // Poll every 2 minutes
    const interval = setInterval(fetchData, 120000);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(interval);
    };
  }, [partnerId]);

  const metrics = useMemo(() => calculatePartnerMetrics(invoices, documentRisk), [invoices, documentRisk]);
  
  const currentYear = new Date().getFullYear();
  const hasDebt = metrics.debtToAdmin > 0;
  const actsPercentage = metrics.totalPaidInvoices > 0 
    ? Math.round((metrics.signedActsCount / metrics.totalPaidInvoices) * 100) 
    : 0;

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
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
          disabled={refreshing}
          data-testid="button-refresh"
        >
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
        </Button>
      </div>

      <div className="space-y-8">
        {/* 4 Hero Metrics */}
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {/* Card 1: Debt to Admin */}
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
                        Перевести админу
                      </p>
                      <p className={cn(
                        "text-2xl font-bold",
                        hasDebt ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
                      )} data-testid="text-debt-amount">
                        {formatCurrency(metrics.debtToAdmin)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {hasDebt 
                          ? `${metrics.invoicesWithDebt.length} счетов` 
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
                      <span>Показать детали</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Card 2: Reserved for Expenses */}
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

              {/* Card 3: Yearly Commission */}
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

              {/* Card 4: Signed Acts */}
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

            {/* Debt Details Expandable */}
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
                        <Badge variant="destructive">
                          {formatCurrency(invoice.amount)}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Invoices List */}
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
