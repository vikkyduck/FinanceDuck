import { useState, Fragment, useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { InvoiceDetailsDialog } from "../InvoiceDetailsDialog";
import { AlertTriangle, Building2, ChevronDown, ChevronRight, Download, FileText, Loader2, MessageSquare, Users } from "lucide-react";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { useDownloadReport } from "@/hooks/useDownloadReport";
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
  partnerDebt: number;
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
  totalPartnerDebt: number;
  totalClientBill: number;
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
  const queryClient = useQueryClient();
  const { download: downloadReport, isDownloadingKey } = useDownloadReport();
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [expandedPartners, setExpandedPartners] = useState<Set<string>>(new Set());
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);

  const openInvoice = (invoiceId: string) => {
    setSelectedInvoiceId(invoiceId);
    setDetailsDialogOpen(true);
  };

  const handleDownloadClientReport = (clientId: string, clientName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const safeName = clientName.replace(/\s+/g, '_');
    const filename = `отчёт_для_клиента_${safeName}_${new Date().toISOString().split('T')[0]}.xlsx`;
    downloadReport({
      url: '/api/admin/export/client-report',
      body: { clientId },
      filename,
      key: clientId,
    });
  };

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
          className="bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/30 rounded-2xl p-4 sm:p-6 shadow-standard"
          data-testid="do-not-spend-dashboard"
        >
          {showTitle && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3 sm:gap-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 bg-amber-100 dark:bg-amber-900/50 rounded-lg shrink-0">
                  <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="min-w-0">
                  <h3
                    className="text-sm sm:text-[18px] font-semibold text-foreground"
                    style={{ letterSpacing: "-0.2px" }}
                  >
                    {titleText}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Клиентские деньги по схеме Агентство 30%
                  </p>
                </div>
              </div>
              <div className="text-left sm:text-right">
                <Badge 
                  variant="outline" 
                  className="text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700 bg-amber-100/50 dark:bg-amber-900/30 text-xs sm:text-sm"
                >
                  {formatCurrency(totalRemaining)}
                </Badge>
              </div>
            </div>
          )}

          {/* Mobile cards layout */}
          <div className="sm:hidden space-y-3">
            {summaries.map((summary) => {
              const isExpanded = expandedClients.has(summary.clientId);
              return (
                <Card 
                  key={summary.clientId}
                  className="bg-amber-50/30 dark:bg-amber-950/10 border-amber-200/50 dark:border-amber-800/30"
                >
                  <div className="flex items-center gap-2 p-4">
                    <button
                      className="flex-1 text-left min-h-[40px] active:bg-amber-100/50 dark:active:bg-amber-900/20"
                      onClick={() => toggleClient(summary.clientId)}
                      data-testid={`mobile-row-client-${summary.clientId}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                          )}
                          <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="font-medium text-sm truncate">{summary.clientName}</span>
                        </div>
                        <span className="font-semibold text-amber-700 dark:text-amber-400 text-sm shrink-0">
                          {formatCurrency(summary.remaining)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground pl-10">
                        <span>{summary.invoiceCount} счетов</span>
                        <span>Потрачено: {formatCurrency(summary.totalSpent)}</span>
                      </div>
                    </button>
                    {role === 'partner' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        disabled={isDownloadingKey(summary.clientId)}
                        onClick={(e) => handleDownloadClientReport(summary.clientId, summary.clientName, e)}
                        data-testid={`mobile-button-download-client-report-${summary.clientId}`}
                        title="Скачать отчёт для клиента"
                      >
                        {isDownloadingKey(summary.clientId)
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <Download className="h-4 w-4" />}
                      </Button>
                    )}
                  </div>
                  {isExpanded && (
                    <div className="border-t border-amber-200/50 dark:border-amber-800/30 px-4 pb-3">
                      {summary.invoices.map((invoice) => (
                        <button
                          key={invoice.id}
                          onClick={() => openInvoice(invoice.id)}
                          className="w-full py-3 text-left border-b border-amber-200/30 dark:border-amber-800/20 last:border-0 min-h-[56px] active:bg-amber-100/50"
                          data-testid={`mobile-link-invoice-${invoice.id}`}
                        >
                          <div className="flex items-start gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium text-xs text-primary">{invoice.number}</span>
                                <span className={cn(
                                  "font-medium text-xs shrink-0",
                                  invoice.remaining > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
                                )}>
                                  {formatCurrency(invoice.remaining)}
                                </span>
                              </div>
                              {invoice.description && (
                                <div className="text-xs text-muted-foreground mt-1 line-clamp-1">{invoice.description}</div>
                              )}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          {/* Desktop table layout */}
          <div className="hidden sm:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-amber-200/50 dark:border-amber-800/30">
                  <TableHead className="text-xs w-8"></TableHead>
                  <TableHead className="text-xs">Клиент</TableHead>
                  <TableHead className="text-xs text-center">Счетов</TableHead>
                  <TableHead className="text-xs text-right">Бюджет</TableHead>
                  <TableHead className="text-xs text-right">Потрачено</TableHead>
                  <TableHead className="text-xs text-right">Остаток</TableHead>
                  {role === 'partner' && <TableHead className="text-xs w-10"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {summaries.map((summary) => {
                  const isExpanded = expandedClients.has(summary.clientId);
                  return (
                    <Fragment key={summary.clientId}>
                      <TableRow 
                        className="hover:bg-amber-100/50 dark:hover:bg-amber-900/20 active:bg-amber-100/70 border-amber-200/50 dark:border-amber-800/30 cursor-pointer"
                        onClick={() => toggleClient(summary.clientId)}
                        data-testid={`row-client-${summary.clientId}`}
                      >
                        <TableCell className="text-sm w-8 py-2 px-2">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell className="text-sm py-2">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="font-medium">{summary.clientName}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-center text-muted-foreground py-2">
                          {summary.invoiceCount}
                        </TableCell>
                        <TableCell className="text-sm text-right text-muted-foreground py-2">
                          {formatCurrency(summary.totalBudget)}
                        </TableCell>
                        <TableCell className="text-sm text-right text-muted-foreground py-2">
                          {formatCurrency(summary.totalSpent)}
                        </TableCell>
                        <TableCell className="text-sm text-right py-2">
                          <span className="font-semibold text-amber-700 dark:text-amber-400">
                            {formatCurrency(summary.remaining)}
                          </span>
                        </TableCell>
                        {role === 'partner' && (
                          <TableCell className="py-2 text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              disabled={isDownloadingKey(summary.clientId)}
                              onClick={(e) => handleDownloadClientReport(summary.clientId, summary.clientName, e)}
                              data-testid={`button-download-client-report-${summary.clientId}`}
                              title="Скачать отчёт для клиента"
                            >
                              {isDownloadingKey(summary.clientId)
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <Download className="h-3.5 w-3.5" />}
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                      {isExpanded && summary.invoices.map((invoice) => (
                        <TableRow 
                          key={invoice.id}
                          className="bg-amber-50/80 dark:bg-amber-950/30 border-amber-200/30 dark:border-amber-800/20"
                          data-testid={`row-invoice-${invoice.id}`}
                        >
                          <TableCell className="py-2 px-2"></TableCell>
                          <TableCell className="text-sm pl-8 py-2" colSpan={2}>
                            <div className="flex items-start gap-2">
                              <FileText className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                              <div className="min-w-0 space-y-1">
                                <button
                                  onClick={() => openInvoice(invoice.id)}
                                  className="font-medium text-xs text-primary hover:underline cursor-pointer text-left"
                                  data-testid={`link-invoice-${invoice.id}`}
                                >
                                  {invoice.number}
                                </button>
                                {invoice.description && (
                                  <div className="text-xs text-muted-foreground">{invoice.description}</div>
                                )}
                                {invoice.notes && (
                                  <div className="flex items-start gap-1 text-xs text-muted-foreground/80 italic">
                                    <MessageSquare className="h-3 w-3 flex-shrink-0 mt-0.5" />
                                    <span className="line-clamp-2">{invoice.notes}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-right text-muted-foreground py-2">
                            {formatCurrency(invoice.budget)}
                          </TableCell>
                          <TableCell className="text-xs text-right text-muted-foreground py-2">
                            {formatCurrency(invoice.spent)}
                          </TableCell>
                          <TableCell className="text-xs text-right py-2">
                            <span className={cn(
                              "font-medium",
                              invoice.remaining > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
                            )}>
                              {formatCurrency(invoice.remaining)}
                            </span>
                          </TableCell>
                          {role === 'partner' && <TableCell className="py-2"></TableCell>}
                        </TableRow>
                      ))}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 pt-4 border-t border-amber-200/50 dark:border-amber-800/30">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs sm:text-sm gap-2">
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
          className="bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-800/30 rounded-2xl p-4 sm:p-6 shadow-standard"
          data-testid="partner-scheme-do-not-spend-dashboard"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg shrink-0">
                <Users className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="min-w-0">
                <h3
                  className="text-sm sm:text-[18px] font-semibold text-foreground"
                  style={{ letterSpacing: "-0.2px" }}
                >
                  Партнёрские схемы
                </h3>
                <p className="text-xs text-muted-foreground">
                  Планируемые расходы по партнёрским схемам
                </p>
              </div>
            </div>
            <div className="text-left sm:text-right">
              <Badge 
                variant="outline" 
                className="text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-700 bg-blue-100/50 dark:bg-blue-900/30 text-xs sm:text-sm"
              >
                {formatCurrency(totalPartnerSchemeDoNotSpend)}
              </Badge>
            </div>
          </div>

          {/* Mobile cards layout */}
          <div className="sm:hidden space-y-3">
            {partnerSchemeSummaries.map((summary) => {
              const isExpanded = expandedPartners.has(summary.partnerId);
              return (
                <Card 
                  key={summary.partnerId}
                  className="bg-blue-50/30 dark:bg-blue-950/10 border-blue-200/50 dark:border-blue-800/30"
                >
                  <button
                    className="w-full p-4 text-left min-h-[56px] active:bg-blue-100/50 dark:active:bg-blue-900/20"
                    onClick={() => togglePartner(summary.partnerId)}
                    data-testid={`mobile-row-partner-${summary.partnerId}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                        <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="font-medium text-sm truncate">{summary.partnerName}</span>
                      </div>
                      <span className="font-semibold text-blue-700 dark:text-blue-400 text-sm shrink-0">
                        {formatCurrency(summary.totalDoNotSpend)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground pl-10">
                      <span>{summary.invoiceCount} счетов</span>
                      <span>Потрачено: {formatCurrency(summary.totalSpent)}</span>
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="border-t border-blue-200/50 dark:border-blue-800/30 px-4 pb-3">
                      {summary.invoices.map((invoice) => (
                        <button
                          key={invoice.id}
                          onClick={() => openInvoice(invoice.id)}
                          className="w-full py-3 text-left border-b border-blue-200/30 dark:border-blue-800/20 last:border-0 min-h-[56px] active:bg-blue-100/50"
                          data-testid={`mobile-link-partner-invoice-${invoice.id}`}
                        >
                          <div className="flex items-start gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium text-xs text-primary">{invoice.number}</span>
                                <span className={cn(
                                  "font-medium text-xs shrink-0",
                                  invoice.doNotSpend > 0 ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"
                                )}>
                                  {formatCurrency(invoice.doNotSpend)}
                                </span>
                              </div>
                              {invoice.description && (
                                <div className="text-xs text-muted-foreground mt-1 line-clamp-1">{invoice.description}</div>
                              )}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          {/* Desktop table layout */}
          <div className="hidden sm:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-blue-200/50 dark:border-blue-800/30">
                  <TableHead className="text-xs w-8"></TableHead>
                  <TableHead className="text-xs">Партнёр</TableHead>
                  <TableHead className="text-xs text-center">Счетов</TableHead>
                  <TableHead className="text-xs text-right">План. расходы</TableHead>
                  <TableHead className="text-xs text-right">Потрачено</TableHead>
                  <TableHead className="text-xs text-right">Остаток</TableHead>
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
                        <TableCell className="text-sm w-8 py-2 px-2">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell className="text-sm py-2">
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="font-medium">{summary.partnerName}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-center text-muted-foreground py-2">
                          {summary.invoiceCount}
                        </TableCell>
                        <TableCell className="text-sm text-right text-muted-foreground py-2">
                          {formatCurrency(summary.totalPlannedExpenses)}
                        </TableCell>
                        <TableCell className="text-sm text-right text-muted-foreground py-2">
                          {formatCurrency(summary.totalSpent)}
                        </TableCell>
                        <TableCell className="text-sm text-right py-2">
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
                          <TableCell className="py-2 px-2"></TableCell>
                          <TableCell className="text-sm pl-8 py-2" colSpan={2}>
                            <div className="flex items-start gap-2">
                              <FileText className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                              <div className="min-w-0 space-y-1">
                                <button
                                  onClick={() => openInvoice(invoice.id)}
                                  className="font-medium text-xs text-primary hover:underline cursor-pointer text-left"
                                  data-testid={`link-partner-invoice-${invoice.id}`}
                                >
                                  {invoice.number}
                                </button>
                                {invoice.description && (
                                  <div className="text-xs text-muted-foreground">{invoice.description}</div>
                                )}
                                {invoice.notes && (
                                  <div className="flex items-start gap-1 text-xs text-muted-foreground/80 italic">
                                    <MessageSquare className="h-3 w-3 flex-shrink-0 mt-0.5" />
                                    <span className="line-clamp-2">{invoice.notes}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-right text-muted-foreground py-2">
                            {formatCurrency(invoice.plannedExpenses)}
                          </TableCell>
                          <TableCell className="text-xs text-right text-muted-foreground py-2">
                            {formatCurrency(invoice.spent)}
                          </TableCell>
                          <TableCell className="text-xs text-right py-2">
                            <span className={cn(
                              "font-medium",
                              invoice.doNotSpend > 0 ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"
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
          </div>

          <div className="mt-4 pt-4 border-t border-blue-200/50 dark:border-blue-800/30">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs sm:text-sm gap-2">
              <span className="text-muted-foreground">
                Деньги зарезервированы на расходы проекта
              </span>
              <span className="font-semibold text-blue-700 dark:text-blue-400">
                Итого: {formatCurrency(totalPartnerSchemeDoNotSpend)}
              </span>
            </div>
          </div>
        </div>
      )}

      {(hasAgency30Data && hasPartnerSchemeData) && (
        <div className="bg-gradient-to-r from-amber-100/50 to-blue-100/50 dark:from-amber-950/30 dark:to-blue-950/30 border border-muted-foreground/10 rounded-xl p-3 sm:p-4 text-center">
          <span className="text-xs sm:text-sm text-muted-foreground">Общая сумма резерва: </span>
          <span className="text-sm sm:text-lg font-bold text-foreground break-words">
            {formatCurrency(grandTotal)}
          </span>
        </div>
      )}

      {/* Invoice Details Dialog */}
      {selectedInvoiceId && (
        <InvoiceDetailsDialog
          invoiceId={selectedInvoiceId}
          open={detailsDialogOpen}
          onOpenChange={(open) => {
            setDetailsDialogOpen(open);
            if (!open) {
              setSelectedInvoiceId(null);
              queryClient.invalidateQueries({ queryKey: ['/api/do-not-spend'] });
              queryClient.invalidateQueries({ queryKey: ['/api/do-not-spend/partner-schemes'] });
              queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
            }
          }}
          canEdit={role === 'admin'}
          userRole={role || 'admin'}
        />
      )}
    </div>
  );
};
