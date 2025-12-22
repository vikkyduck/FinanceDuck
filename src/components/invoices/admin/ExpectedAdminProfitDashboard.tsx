import { useState, Fragment, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, ChevronDown, ChevronRight, FileText, Users } from "lucide-react";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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

interface ExpectedAdminProfitInvoice {
  id: string;
  number: string;
  clientName: string | null;
  clientBill: number;
  netProfitAdmin: number;
  scheme: string;
  createdAt: string | null;
}

interface ExpectedAdminProfitSummary {
  partnerId: string;
  partnerName: string;
  totalExpectedProfit: number;
  invoiceCount: number;
  invoices: ExpectedAdminProfitInvoice[];
}

const getSchemeLabel = (scheme: string): string => {
  const labels: Record<string, string> = {
    'partner_10': '10%',
    'partner_15': '15%',
    'agency_30': 'Агентский',
    'commission_based': 'По договору',
  };
  return labels[scheme] || scheme;
};

interface ExpectedAdminProfitDashboardProps {
  className?: string;
}

export const ExpectedAdminProfitDashboard = ({
  className,
}: ExpectedAdminProfitDashboardProps) => {
  const { isAuthenticated, role } = useAuth();
  const navigate = useNavigate();
  const [expandedPartners, setExpandedPartners] = useState<Set<string>>(new Set());
  
  const openInvoice = (invoiceId: string) => {
    navigate(`/invoices?open=${invoiceId}`);
  };

  const { data: summaries = [], isLoading } = useQuery<ExpectedAdminProfitSummary[]>({
    queryKey: ['/api/expected-admin-profit'],
    queryFn: () => apiGet<ExpectedAdminProfitSummary[]>('/expected-admin-profit'),
    enabled: isAuthenticated && role === 'admin',
    refetchInterval: 120000,
    refetchOnWindowFocus: true,
  });

  const totalExpected = useMemo(() => 
    summaries.reduce((sum: number, s: ExpectedAdminProfitSummary) => sum + s.totalExpectedProfit, 0),
    [summaries]
  );

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

  if (role !== 'admin') {
    return null;
  }

  if (isLoading) {
    return (
      <div
        className={cn(
          "bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-800/30",
          "rounded-2xl p-6 shadow-standard",
          className
        )}
      >
        <Skeleton className="h-7 w-48 mb-6" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (summaries.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-800/30",
        "rounded-2xl p-4 sm:p-6 shadow-standard",
        className
      )}
      data-testid="expected-admin-profit-dashboard"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3 sm:gap-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="p-1.5 sm:p-2 bg-emerald-100 dark:bg-emerald-900/50 rounded-lg shrink-0">
            <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="min-w-0">
            <h3
              className="text-sm sm:text-[18px] font-semibold text-foreground"
              style={{ letterSpacing: "-0.2px" }}
            >
              Ожидаемая прибыль
            </h3>
            <p className="text-xs text-muted-foreground">
              Прибыль админа по неоплаченным счетам
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <Badge 
            variant="outline" 
            className="text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700 bg-emerald-100/50 dark:bg-emerald-900/30"
          >
            {formatCurrency(totalExpected)}
          </Badge>
        </div>
      </div>

      {/* Mobile cards layout */}
      <div className="sm:hidden space-y-3">
        {summaries.map((summary) => {
          const isExpanded = expandedPartners.has(summary.partnerId);
          return (
            <Card 
              key={summary.partnerId}
              className="bg-emerald-50/30 dark:bg-emerald-950/10 border-emerald-200/50 dark:border-emerald-800/30"
            >
              <button
                className="w-full p-4 text-left min-h-[56px] active:bg-emerald-100/50 dark:active:bg-emerald-900/20"
                onClick={() => togglePartner(summary.partnerId)}
                data-testid={`mobile-row-admin-profit-${summary.partnerId}`}
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
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400 text-sm shrink-0">
                    {formatCurrency(summary.totalExpectedProfit)}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground pl-10">
                  <span>{summary.invoiceCount} счетов</span>
                </div>
              </button>
              {isExpanded && (
                <div className="border-t border-emerald-200/50 dark:border-emerald-800/30 px-4 pb-3">
                  {summary.invoices.map((invoice) => (
                    <button
                      key={invoice.id}
                      onClick={() => openInvoice(invoice.id)}
                      className="w-full py-3 text-left border-b border-emerald-200/30 dark:border-emerald-800/20 last:border-0 min-h-[56px] active:bg-emerald-100/50"
                      data-testid={`mobile-link-admin-profit-invoice-${invoice.id}`}
                    >
                      <div className="flex items-start gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <span className="font-medium text-xs text-primary">{invoice.number}</span>
                              <Badge variant="secondary" className="text-xs shrink-0">{getSchemeLabel(invoice.scheme)}</Badge>
                            </div>
                            <span className="font-medium text-xs text-emerald-600 dark:text-emerald-400 shrink-0">
                              {formatCurrency(invoice.netProfitAdmin)}
                            </span>
                          </div>
                          {invoice.clientName && (
                            <div className="text-xs text-muted-foreground mt-1">{invoice.clientName}</div>
                          )}
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Счёт: {formatCurrency(invoice.clientBill)}
                          </div>
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
            <TableRow className="hover:bg-transparent border-emerald-200/50 dark:border-emerald-800/30">
              <TableHead className="text-xs w-8"></TableHead>
              <TableHead className="text-xs">Партнёр</TableHead>
              <TableHead className="text-xs text-center">Счетов</TableHead>
              <TableHead className="text-xs text-right">Ожидается</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {summaries.map((summary) => {
              const isExpanded = expandedPartners.has(summary.partnerId);
              return (
                <Fragment key={summary.partnerId}>
                  <TableRow 
                    className="hover:bg-emerald-100/50 dark:hover:bg-emerald-900/20 border-emerald-200/50 dark:border-emerald-800/30 cursor-pointer"
                    onClick={() => togglePartner(summary.partnerId)}
                    data-testid={`row-admin-profit-${summary.partnerId}`}
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
                    <TableCell className="text-sm text-right py-2">
                      <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                        {formatCurrency(summary.totalExpectedProfit)}
                      </span>
                    </TableCell>
                  </TableRow>
                  {isExpanded && summary.invoices.map((invoice) => (
                    <TableRow 
                      key={invoice.id}
                      className="bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-200/30 dark:border-emerald-800/20"
                      data-testid={`row-admin-profit-invoice-${invoice.id}`}
                    >
                      <TableCell className="py-2 px-2"></TableCell>
                      <TableCell className="text-sm pl-8 py-2" colSpan={2}>
                        <div className="flex items-start gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                          <div className="min-w-0 space-y-1">
                            <div className="font-medium text-xs flex flex-wrap items-center gap-2">
                              <button
                                onClick={() => openInvoice(invoice.id)}
                                className="text-primary hover:underline cursor-pointer text-left"
                                data-testid={`link-admin-profit-invoice-${invoice.id}`}
                              >
                                {invoice.number}
                              </button>
                              <Badge variant="secondary" className="text-xs">
                                {getSchemeLabel(invoice.scheme)}
                              </Badge>
                            </div>
                            {invoice.clientName && (
                              <div className="text-xs text-muted-foreground">{invoice.clientName}</div>
                            )}
                            <div className="text-xs text-muted-foreground">
                              Счёт: {formatCurrency(invoice.clientBill)}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-right py-2">
                        <span className="font-medium text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(invoice.netProfitAdmin)}
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

      <div className="mt-4 pt-4 border-t border-emerald-200/50 dark:border-emerald-800/30">
        <div className="flex items-center justify-between text-sm flex-wrap gap-2">
          <span className="text-muted-foreground">
            Будет получено после оплаты счетов клиентами
          </span>
          <span className="font-semibold text-emerald-700 dark:text-emerald-400">
            Итого: {formatCurrency(totalExpected)}
          </span>
        </div>
      </div>
    </div>
  );
};
