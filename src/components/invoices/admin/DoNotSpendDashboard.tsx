import { useState, Fragment, useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Building2, ChevronDown, ChevronRight, FileText, MessageSquare, Users } from "lucide-react";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
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
  notes: string | null;
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

interface PartnerSchemeInvoice {
  id: string;
  number: string;
  description: string | null;
  notes: string | null;
  clientBill: number;
  plannedExpenses: number;
  spent: number;
  remaining: number;
  commission: number;
  doNotSpend: number;
  createdAt: string | null;
}

interface PartnerSchemeSummary {
  partnerId: string;
  partnerName: string;
  totalPlannedExpenses: number;
  totalSpent: number;
  totalCommission: number;
  totalDoNotSpend: number;
  invoiceCount: number;
  invoices: PartnerSchemeInvoice[];
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
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [expandedPartners, setExpandedPartners] = useState<Set<string>>(new Set());

  const { data: summaries = [], isLoading: loadingAgency } = useQuery<DoNotSpendSummary[]>({
    queryKey: ['/api/do-not-spend'],
    queryFn: () => apiGet<DoNotSpendSummary[]>('/do-not-spend'),
    enabled: isAuthenticated,
    refetchInterval: 120000,
    refetchOnWindowFocus: true,
  });

  const { data: partnerSchemeSummaries = [], isLoading: loadingPartner } = useQuery<PartnerSchemeSummary[]>({
    queryKey: ['/api/do-not-spend/partner-schemes'],
    queryFn: () => apiGet<PartnerSchemeSummary[]>('/do-not-spend/partner-schemes'),
    enabled: isAuthenticated,
    refetchInterval: 120000,
    refetchOnWindowFocus: true,
  });

  const loading = loadingAgency || loadingPartner;

  const totalRemaining = useMemo(() => 
    summaries.reduce((sum: number, s: DoNotSpendSummary) => sum + s.remaining, 0),
    [summaries]
  );

  const totalPartnerSchemeDoNotSpend = useMemo(() => 
    partnerSchemeSummaries.reduce((sum: number, s: PartnerSchemeSummary) => sum + s.totalDoNotSpend, 0),
    [partnerSchemeSummaries]
  );

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

  const hasAgency30Data = summaries.length > 0;
  const hasPartnerSchemeData = partnerSchemeSummaries.length > 0;

  if (!hasAgency30Data && !hasPartnerSchemeData) {
    return null;
  }

  const titleText = role === 'partner' ? 'Клиентские деньги' : 'Не тратить';
  const grandTotal = totalRemaining + totalPartnerSchemeDoNotSpend;

  return (
    <div className={cn("space-y-6", className)}>
      {hasAgency30Data && (
        <div
          className="bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/30 rounded-2xl p-6 shadow-standard"
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
                    Клиентские деньги по схеме Агентство 30%
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
                            <div className="min-w-0 space-y-1">
                              <div className="font-medium text-xs">
                                {invoice.number}
                              </div>
                              {invoice.description && (
                                <div className="text-xs text-muted-foreground" title={invoice.description}>
                                  {invoice.description}
                                </div>
                              )}
                              {invoice.notes && (
                                <div className="flex items-start gap-1 text-xs text-muted-foreground/80 italic">
                                  <MessageSquare className="h-3 w-3 flex-shrink-0 mt-0.5" />
                                  <span className="line-clamp-2" title={invoice.notes}>
                                    {invoice.notes}
                                  </span>
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
      )}

      {hasPartnerSchemeData && (
        <div
          className="bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-800/30 rounded-2xl p-6 shadow-standard"
          data-testid="partner-scheme-do-not-spend-dashboard"
        >
          <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3
                  className="text-[18px] font-semibold text-foreground"
                  style={{ letterSpacing: "-0.2px" }}
                >
                  {role === 'partner' ? 'Резерв на ИП' : 'Партнёрские схемы'}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {role === 'assistant' 
                    ? 'Планируемые расходы по партнёрским схемам'
                    : 'Планируемые расходы + комиссия'}
                </p>
              </div>
            </div>
            <div className="text-right">
              <Badge 
                variant="outline" 
                className="text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-700 bg-blue-100/50 dark:bg-blue-900/30"
              >
                {formatCurrency(totalPartnerSchemeDoNotSpend)}
              </Badge>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-blue-200/50 dark:border-blue-800/30">
                <TableHead className="text-xs w-8"></TableHead>
                <TableHead className="text-xs">Партнёр</TableHead>
                <TableHead className="text-xs text-center">Счетов</TableHead>
                <TableHead className="text-xs text-right">План. расходы</TableHead>
                <TableHead className="text-xs text-right">Потрачено</TableHead>
                {role !== 'assistant' && (
                  <TableHead className="text-xs text-right">Комиссия</TableHead>
                )}
                <TableHead className="text-xs text-right">Не тратить</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {partnerSchemeSummaries.map((summary) => {
                const isExpanded = expandedPartners.has(summary.partnerId);
                return (
                  <Fragment key={summary.partnerId}>
                    <TableRow 
                      className="hover:bg-blue-100/50 dark:hover:bg-blue-900/20 border-blue-200/50 dark:border-blue-800/30 cursor-pointer"
                      onClick={() => togglePartner(summary.partnerId)}
                      data-testid={`row-partner-${summary.partnerId}`}
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
                          <Users className="h-3 w-3 text-muted-foreground" />
                          {summary.partnerName}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-center text-muted-foreground">
                        {summary.invoiceCount}
                      </TableCell>
                      <TableCell className="text-sm text-right text-muted-foreground">
                        {formatCurrency(summary.totalPlannedExpenses)}
                      </TableCell>
                      <TableCell className="text-sm text-right text-muted-foreground">
                        {formatCurrency(summary.totalSpent)}
                      </TableCell>
                      {role !== 'assistant' && (
                        <TableCell className="text-sm text-right text-muted-foreground">
                          {formatCurrency(summary.totalCommission)}
                        </TableCell>
                      )}
                      <TableCell className="text-sm text-right">
                        <span className="font-semibold text-blue-700 dark:text-blue-400">
                          {formatCurrency(summary.totalDoNotSpend)}
                        </span>
                      </TableCell>
                    </TableRow>
                    {isExpanded && summary.invoices.map((invoice) => (
                      <TableRow 
                        key={invoice.id}
                        className="bg-blue-50/80 dark:bg-blue-950/30 border-blue-200/30 dark:border-blue-800/20"
                        data-testid={`row-partner-invoice-${invoice.id}`}
                      >
                        <TableCell className="p-2"></TableCell>
                        <TableCell className="text-sm pl-8" colSpan={2}>
                          <div className="flex items-start gap-2">
                            <FileText className="h-3 w-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                            <div className="min-w-0 space-y-1">
                              <div className="font-medium text-xs">
                                {invoice.number}
                              </div>
                              {invoice.description && (
                                <div className="text-xs text-muted-foreground" title={invoice.description}>
                                  {invoice.description}
                                </div>
                              )}
                              {invoice.notes && (
                                <div className="flex items-start gap-1 text-xs text-muted-foreground/80 italic">
                                  <MessageSquare className="h-3 w-3 flex-shrink-0 mt-0.5" />
                                  <span className="line-clamp-2" title={invoice.notes}>
                                    {invoice.notes}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-right text-muted-foreground">
                          {formatCurrency(invoice.plannedExpenses)}
                        </TableCell>
                        <TableCell className="text-xs text-right text-muted-foreground">
                          {formatCurrency(invoice.spent)}
                        </TableCell>
                        {role !== 'assistant' && (
                          <TableCell className="text-xs text-right text-muted-foreground">
                            {formatCurrency(invoice.commission)}
                          </TableCell>
                        )}
                        <TableCell className="text-xs text-right">
                          <span className={cn(
                            "font-medium",
                            invoice.doNotSpend > 0 
                              ? "text-blue-600 dark:text-blue-400" 
                              : "text-muted-foreground"
                          )}>
                            {formatCurrency(invoice.doNotSpend)}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>

          <div className="mt-4 pt-4 border-t border-blue-200/50 dark:border-blue-800/30">
            <div className="flex items-center justify-between text-sm flex-wrap gap-2">
              <span className="text-muted-foreground">
                {role === 'assistant' 
                  ? 'Деньги зарезервированы на расходы проекта'
                  : 'Деньги зарезервированы на расходы + комиссию'}
              </span>
              <span className="font-semibold text-blue-700 dark:text-blue-400">
                Итого: {formatCurrency(totalPartnerSchemeDoNotSpend)}
              </span>
            </div>
          </div>
        </div>
      )}

      {(hasAgency30Data && hasPartnerSchemeData) && (
        <div className="bg-gradient-to-r from-amber-100/50 to-blue-100/50 dark:from-amber-950/30 dark:to-blue-950/30 border border-muted-foreground/10 rounded-xl p-4 text-center">
          <span className="text-sm text-muted-foreground">Общая сумма резерва: </span>
          <span className="text-lg font-bold text-foreground">
            {formatCurrency(grandTotal)}
          </span>
        </div>
      )}
    </div>
  );
};
