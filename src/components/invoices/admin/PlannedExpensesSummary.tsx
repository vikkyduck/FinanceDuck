import { useEffect, useState, useCallback, Fragment } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, ChevronDown, ChevronRight, FileText, User } from "lucide-react";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface PlannedExpense {
  id: string;
  description: string;
  expectedAmount: number;
  expectedDate: string;
  status: string;
}

interface InvoicePlannedData {
  invoiceId: string;
  invoiceNumber: string;
  clientName: string;
  scheme: string;
  pendingAmount: number;
  plannedExpenses: PlannedExpense[];
}

interface PartnerPlannedSummary {
  partnerId: string;
  partnerName: string;
  totalPending: number;
  invoices: InvoicePlannedData[];
}

interface PlannedExpensesSummaryProps {
  showTitle?: boolean;
  className?: string;
}

const getSchemeLabel = (scheme: string) => {
  switch (scheme) {
    case 'partner_10': return '10%';
    case 'partner_15': return '15%';
    case 'commission_based': return 'Комиссия';
    default: return scheme;
  }
};

export const PlannedExpensesSummary = ({
  showTitle = true,
  className,
}: PlannedExpensesSummaryProps) => {
  const { isAuthenticated, role } = useAuth();
  const [summaries, setSummaries] = useState<PartnerPlannedSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalPending, setTotalPending] = useState(0);
  const [expandedPartners, setExpandedPartners] = useState<Set<string>>(new Set());
  const [expandedInvoices, setExpandedInvoices] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    
    try {
      const response = await fetch('/api/planned-expenses-summary', {
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        setSummaries(data);
        setTotalPending(data.reduce((sum: number, s: PartnerPlannedSummary) => sum + s.totalPending, 0));
      } else if (response.status !== 401 && response.status !== 403) {
        console.error("Error fetching planned expenses summary:", await response.text());
      }
    } catch (error) {
      console.error("Error fetching planned expenses summary:", error);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchData();
    
    let isVisible = document.visibilityState === 'visible';
    
    const handleVisibilityChange = () => {
      isVisible = document.visibilityState === 'visible';
      if (isVisible) fetchData();
    };
    
    const interval = setInterval(() => {
      if (isVisible) fetchData();
    }, 120000);
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchData]);

  const togglePartner = (partnerId: string) => {
    setExpandedPartners(prev => {
      const next = new Set(prev);
      if (next.has(partnerId)) {
        next.delete(partnerId);
      } else {
        next.add(partnerId);
      }
      return next;
    });
  };

  const toggleInvoice = (invoiceId: string) => {
    setExpandedInvoices(prev => {
      const next = new Set(prev);
      if (next.has(invoiceId)) {
        next.delete(invoiceId);
      } else {
        next.add(invoiceId);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div
        className={cn(
          "bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-800/30",
          "rounded-2xl p-6 shadow-standard",
          className
        )}
      >
        {showTitle && <Skeleton className="h-7 w-48 mb-6" />}
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (summaries.length === 0 || totalPending === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-800/30",
        "rounded-2xl p-6 shadow-standard",
        className
      )}
      data-testid="planned-expenses-summary"
    >
      {showTitle && (
        <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
              <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3
                className="text-[18px] font-semibold text-foreground"
                style={{ letterSpacing: "-0.2px" }}
              >
                Ожидаемые расходы
              </h3>
              <p className="text-xs text-muted-foreground">
                Плановые расходы по партнёрским счетам
              </p>
            </div>
          </div>
          <div className="text-right">
            <Badge 
              variant="outline" 
              className="text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-700 bg-blue-100/50 dark:bg-blue-900/30"
            >
              {formatCurrency(totalPending)}
            </Badge>
          </div>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-blue-200/50 dark:border-blue-800/30">
            <TableHead className="text-xs w-8"></TableHead>
            <TableHead className="text-xs">Партнёр / Счёт</TableHead>
            <TableHead className="text-xs">Схема</TableHead>
            <TableHead className="text-xs text-right">Ожидается</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {summaries.map((summary) => {
            const isPartnerExpanded = expandedPartners.has(summary.partnerId);
            return (
              <Fragment key={summary.partnerId}>
                <TableRow 
                  className="hover:bg-blue-100/50 dark:hover:bg-blue-900/20 border-blue-200/50 dark:border-blue-800/30 cursor-pointer"
                  onClick={() => togglePartner(summary.partnerId)}
                  data-testid={`row-partner-${summary.partnerId}`}
                >
                  <TableCell className="text-sm w-8 p-2">
                    {isPartnerExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    <div className="flex items-center gap-2">
                      <User className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium">{summary.partnerName}</span>
                      <Badge variant="secondary" className="text-xs">
                        {summary.invoices.length} счетов
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-sm text-right">
                    <span className="font-semibold text-blue-700 dark:text-blue-400">
                      {formatCurrency(summary.totalPending)}
                    </span>
                  </TableCell>
                </TableRow>
                {isPartnerExpanded && summary.invoices.map((invoice) => {
                  const isInvoiceExpanded = expandedInvoices.has(invoice.invoiceId);
                  return (
                    <Fragment key={invoice.invoiceId}>
                      <TableRow 
                        className="bg-blue-50/80 dark:bg-blue-950/30 border-blue-200/30 dark:border-blue-800/20 cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleInvoice(invoice.invoiceId);
                        }}
                        data-testid={`row-invoice-${invoice.invoiceId}`}
                      >
                        <TableCell className="p-2 pl-6">
                          {isInvoiceExpanded ? (
                            <ChevronDown className="h-3 w-3 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-3 w-3 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="flex items-center gap-2">
                            <FileText className="h-3 w-3 text-muted-foreground" />
                            <span className="font-medium text-xs">{invoice.invoiceNumber}</span>
                            <span className="text-xs text-muted-foreground">• {invoice.clientName}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {getSchemeLabel(invoice.scheme)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-right font-medium text-blue-600 dark:text-blue-400">
                          {formatCurrency(invoice.pendingAmount)}
                        </TableCell>
                      </TableRow>
                      {isInvoiceExpanded && invoice.plannedExpenses.filter(pe => pe.status === 'pending').map((expense) => (
                        <TableRow 
                          key={expense.id}
                          className="bg-blue-50/40 dark:bg-blue-950/20 border-blue-200/20 dark:border-blue-800/10"
                          data-testid={`row-expense-${expense.id}`}
                        >
                          <TableCell className="p-2"></TableCell>
                          <TableCell className="text-xs pl-10" colSpan={2}>
                            <div className="flex items-center gap-2">
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              <span>{expense.description}</span>
                              <span className="text-muted-foreground">
                                • {format(new Date(expense.expectedDate), "d MMM yyyy", { locale: ru })}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-right text-muted-foreground">
                            {formatCurrency(expense.expectedAmount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </Fragment>
                  );
                })}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>

      <div className="mt-4 pt-4 border-t border-blue-200/50 dark:border-blue-800/30">
        <div className="flex items-center justify-between text-sm flex-wrap gap-2">
          <span className="text-muted-foreground">
            Эти суммы учтены в прогнозе долга партнёров
          </span>
          <span className="font-semibold text-blue-700 dark:text-blue-400">
            Итого ожидается: {formatCurrency(totalPending)}
          </span>
        </div>
      </div>
    </div>
  );
};
