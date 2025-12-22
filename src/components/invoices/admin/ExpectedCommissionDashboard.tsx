import { useState, Fragment, useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { InvoiceDetailsDialog } from "../InvoiceDetailsDialog";
import { Clock, ChevronDown, ChevronRight, FileText, Users } from "lucide-react";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ExpectedCommissionInvoice {
  id: string;
  number: string;
  clientName: string | null;
  clientBill: number;
  commission: number;
  scheme: string;
  createdAt: string | null;
}

interface ExpectedCommissionSummary {
  partnerId: string;
  partnerName: string;
  totalExpectedCommission: number;
  invoiceCount: number;
  invoices: ExpectedCommissionInvoice[];
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

interface ExpectedCommissionDashboardProps {
  className?: string;
}

export const ExpectedCommissionDashboard = ({
  className,
}: ExpectedCommissionDashboardProps) => {
  const { isAuthenticated, role } = useAuth();
  const queryClient = useQueryClient();
  const [expandedPartners, setExpandedPartners] = useState<Set<string>>(new Set());
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  
  const openInvoice = (invoiceId: string) => {
    setSelectedInvoiceId(invoiceId);
    setDetailsDialogOpen(true);
  };

  const { data: summaries = [], isLoading } = useQuery<ExpectedCommissionSummary[]>({
    queryKey: ['/api/expected-commission'],
    queryFn: () => apiGet<ExpectedCommissionSummary[]>('/expected-commission'),
    enabled: isAuthenticated && (role === 'admin' || role === 'partner'),
    refetchInterval: 120000,
    refetchOnWindowFocus: true,
  });

  const totalExpected = useMemo(() => 
    summaries.reduce((sum: number, s: ExpectedCommissionSummary) => sum + s.totalExpectedCommission, 0),
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

  if (isLoading) {
    return (
      <div
        className={cn(
          "bg-green-50/50 dark:bg-green-950/20 border border-green-200/50 dark:border-green-800/30",
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

  const titleText = role === 'partner' ? 'Ожидаемая комиссия' : 'Ожидаемые комиссии партнёров';

  return (
    <div
      className={cn(
        "bg-green-50/50 dark:bg-green-950/20 border border-green-200/50 dark:border-green-800/30",
        "rounded-2xl p-4 sm:p-6 shadow-standard",
        className
      )}
      data-testid="expected-commission-dashboard"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3 sm:gap-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="p-1.5 sm:p-2 bg-green-100 dark:bg-green-900/50 rounded-lg shrink-0">
            <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 dark:text-green-400" />
          </div>
          <div className="min-w-0">
            <h3
              className="text-sm sm:text-[18px] font-semibold text-foreground"
              style={{ letterSpacing: "-0.2px" }}
            >
              {titleText}
            </h3>
            <p className="text-xs text-muted-foreground">
              Комиссия по неоплаченным счетам
            </p>
          </div>
        </div>
        <div className="text-left sm:text-right">
          <Badge 
            variant="outline" 
            className="text-green-700 dark:text-green-400 border-green-300 dark:border-green-700 bg-green-100/50 dark:bg-green-900/30 text-xs sm:text-sm"
          >
            {formatCurrency(totalExpected)}
          </Badge>
        </div>
      </div>

      <div className="overflow-x-auto -mx-4 sm:mx-0">
        <div className="min-w-[350px] px-4 sm:px-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-green-200/50 dark:border-green-800/30">
                <TableHead className="text-xs w-8"></TableHead>
                <TableHead className="text-xs">{role === 'partner' ? 'Клиент' : 'Партнёр'}</TableHead>
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
                  className="hover:bg-green-100/50 dark:hover:bg-green-900/20 border-green-200/50 dark:border-green-800/30 cursor-pointer"
                  onClick={() => togglePartner(summary.partnerId)}
                  data-testid={`row-expected-${summary.partnerId}`}
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
                  <TableCell className="text-sm text-right">
                    <span className="font-semibold text-green-700 dark:text-green-400">
                      {formatCurrency(summary.totalExpectedCommission)}
                    </span>
                  </TableCell>
                </TableRow>
                {isExpanded && summary.invoices.map((invoice) => (
                  <TableRow 
                    key={invoice.id}
                    className="bg-green-50/80 dark:bg-green-950/30 border-green-200/30 dark:border-green-800/20"
                    data-testid={`row-expected-invoice-${invoice.id}`}
                  >
                    <TableCell className="p-2"></TableCell>
                    <TableCell className="text-sm pl-8" colSpan={2}>
                      <div className="flex items-start gap-2">
                        <FileText className="h-3 w-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <div className="min-w-0 space-y-1">
                          <div className="font-medium text-xs flex items-center gap-2">
                            <button
                              onClick={() => openInvoice(invoice.id)}
                              className="text-primary hover:underline cursor-pointer text-left"
                              data-testid={`link-expected-invoice-${invoice.id}`}
                            >
                              {invoice.number}
                            </button>
                            <Badge variant="secondary" className="text-xs">
                              {getSchemeLabel(invoice.scheme)}
                            </Badge>
                          </div>
                          {invoice.clientName && (
                            <div className="text-xs text-muted-foreground">
                              {invoice.clientName}
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground">
                            Счёт: {formatCurrency(invoice.clientBill)}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-right">
                      <span className="font-medium text-green-600 dark:text-green-400">
                        {formatCurrency(invoice.commission)}
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
    </div>

      <div className="mt-4 pt-4 border-t border-green-200/50 dark:border-green-800/30">
        <div className="flex items-center justify-between text-sm flex-wrap gap-2">
          <span className="text-muted-foreground">
            Будет начислено после оплаты счетов клиентами
          </span>
          <span className="font-semibold text-green-700 dark:text-green-400">
            Итого: {formatCurrency(totalExpected)}
          </span>
        </div>
      </div>

      {/* Invoice Details Dialog */}
      {selectedInvoiceId && (
        <InvoiceDetailsDialog
          invoiceId={selectedInvoiceId}
          open={detailsDialogOpen}
          onOpenChange={(open) => {
            setDetailsDialogOpen(open);
            if (!open) {
              setSelectedInvoiceId(null);
              queryClient.invalidateQueries({ queryKey: ['/api/expected-commission'] });
              queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
            }
          }}
          canEdit={role === 'admin'}
          userRole={role || 'partner'}
        />
      )}
    </div>
  );
};
