import { useEffect, useState, useCallback, Fragment } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Building2, ChevronDown, ChevronRight, FileText } from "lucide-react";
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

interface InvoiceDetail {
  id: string;
  number: string;
  description: string | null;
  budget: number;
  spent: number;
  remaining: number;
  createdAt: string | null;
}

interface DoNotSpendSummary {
  clientId: string;
  clientName: string;
  totalBudget: number;
  totalSpent: number;
  remaining: number;
  invoiceCount: number;
  invoices: InvoiceDetail[];
}

interface DoNotSpendDashboardProps {
  showTitle?: boolean;
  className?: string;
}

export const DoNotSpendDashboard = ({
  showTitle = true,
  className,
}: DoNotSpendDashboardProps) => {
  const { isAuthenticated, role } = useAuth();
  const [summaries, setSummaries] = useState<DoNotSpendSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalRemaining, setTotalRemaining] = useState(0);
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    
    try {
      const response = await fetch('/api/do-not-spend', {
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        setSummaries(data);
        setTotalRemaining(data.reduce((sum: number, s: DoNotSpendSummary) => sum + s.remaining, 0));
      } else if (response.status !== 401 && response.status !== 403) {
        console.error("Error fetching do-not-spend data:", await response.text());
      }
    } catch (error) {
      console.error("Error fetching do-not-spend data:", error);
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

  const toggleClient = (clientId: string) => {
    setExpandedClients(prev => {
      const next = new Set(prev);
      if (next.has(clientId)) {
        next.delete(clientId);
      } else {
        next.add(clientId);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div
        className={cn(
          "bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/30",
          "rounded-2xl p-6 shadow-standard",
          className
        )}
      >
        {showTitle && <Skeleton className="h-7 w-48 mb-6" />}
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (summaries.length === 0) {
    return null;
  }

  const titleText = role === 'partner' ? 'Клиентские деньги' : 'Не тратить';
  const subtitleText = role === 'partner' 
    ? 'Остаток бюджета по схеме Агентство 30%' 
    : 'Клиентские деньги по схеме Агентство 30%';

  return (
    <div
      className={cn(
        "bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/30",
        "rounded-2xl p-6 shadow-standard",
        className
      )}
      data-testid="do-not-spend-dashboard"
    >
      {showTitle && (
        <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h3
                className="text-[18px] font-semibold text-foreground"
                style={{ letterSpacing: "-0.2px" }}
              >
                {titleText}
              </h3>
              <p className="text-xs text-muted-foreground">
                {subtitleText}
              </p>
            </div>
          </div>
          <div className="text-right">
            <Badge 
              variant="outline" 
              className="text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700 bg-amber-100/50 dark:bg-amber-900/30"
            >
              {formatCurrency(totalRemaining)}
            </Badge>
          </div>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-amber-200/50 dark:border-amber-800/30">
            <TableHead className="text-xs w-8"></TableHead>
            <TableHead className="text-xs">Клиент</TableHead>
            <TableHead className="text-xs text-center">Счетов</TableHead>
            <TableHead className="text-xs text-right">Бюджет (70%)</TableHead>
            <TableHead className="text-xs text-right">Потрачено</TableHead>
            <TableHead className="text-xs text-right">Остаток</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {summaries.map((summary) => {
            const isExpanded = expandedClients.has(summary.clientId);
            return (
              <Fragment key={summary.clientId}>
                <TableRow 
                  className="hover:bg-amber-100/50 dark:hover:bg-amber-900/20 border-amber-200/50 dark:border-amber-800/30 cursor-pointer"
                  onClick={() => toggleClient(summary.clientId)}
                  data-testid={`row-client-${summary.clientId}`}
                >
                  <TableCell className="text-sm w-8 p-2">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-3 w-3 text-muted-foreground" />
                      {summary.clientName}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-center text-muted-foreground">
                    {summary.invoiceCount}
                  </TableCell>
                  <TableCell className="text-sm text-right text-muted-foreground">
                    {formatCurrency(summary.totalBudget)}
                  </TableCell>
                  <TableCell className="text-sm text-right text-muted-foreground">
                    {formatCurrency(summary.totalSpent)}
                  </TableCell>
                  <TableCell className="text-sm text-right">
                    <span className="font-semibold text-amber-700 dark:text-amber-400">
                      {formatCurrency(summary.remaining)}
                    </span>
                  </TableCell>
                </TableRow>
                {isExpanded && summary.invoices.map((invoice) => (
                  <TableRow 
                    key={invoice.id}
                    className="bg-amber-50/80 dark:bg-amber-950/30 border-amber-200/30 dark:border-amber-800/20"
                    data-testid={`row-invoice-${invoice.id}`}
                  >
                    <TableCell className="p-2"></TableCell>
                    <TableCell className="text-sm pl-8" colSpan={2}>
                      <div className="flex items-start gap-2">
                        <FileText className="h-3 w-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="font-medium text-xs">
                            {invoice.number}
                          </div>
                          {invoice.description && (
                            <div className="text-xs text-muted-foreground truncate max-w-[200px]" title={invoice.description}>
                              {invoice.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-right text-muted-foreground">
                      {formatCurrency(invoice.budget)}
                    </TableCell>
                    <TableCell className="text-xs text-right text-muted-foreground">
                      {formatCurrency(invoice.spent)}
                    </TableCell>
                    <TableCell className="text-xs text-right">
                      <span className={cn(
                        "font-medium",
                        invoice.remaining > 0 
                          ? "text-amber-600 dark:text-amber-400" 
                          : "text-muted-foreground"
                      )}>
                        {formatCurrency(invoice.remaining)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>

      <div className="mt-4 pt-4 border-t border-amber-200/50 dark:border-amber-800/30">
        <div className="flex items-center justify-between text-sm flex-wrap gap-2">
          <span className="text-muted-foreground">
            Эта сумма уменьшается по мере добавления расходов
          </span>
          <span className="font-semibold text-amber-700 dark:text-amber-400">
            Итого: {formatCurrency(totalRemaining)}
          </span>
        </div>
      </div>
    </div>
  );
};
