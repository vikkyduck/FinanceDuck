import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { INVOICE_STATUS_LABELS as STATUS_LABELS } from "@/lib/invoiceHelpers";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { FileText, ChevronDown, ChevronUp, RefreshCw, AlertCircle, CheckCircle2, ExternalLink, Link2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { useVisibilityAwareInterval } from "@/hooks/useVisibilityAwareInterval";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { InvoiceDetailsDialog } from "../InvoiceDetailsDialog";

interface InvoiceDetail {
  id: string;
  invoiceNumber: string | null;
  status: string;
  hasClosingDoc: boolean;
  closingDocumentUrl: string | null;
  paymentDate: string | null;
}

interface ClientDocsData {
  clientId: string;
  clientName: string;
  totalInvoices: number;
  invoicesWithDoc: number;
  invoicesWithoutDoc: number;
  invoiceDetails: InvoiceDetail[];
}

export const ClosingDocsDashboard = () => {
  const queryClient = useQueryClient();
  const refetchInterval = useVisibilityAwareInterval();
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);

  const openInvoiceDetails = (invoiceId: string) => {
    setSelectedInvoiceId(invoiceId);
    setDetailsDialogOpen(true);
  };

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        queryClient.invalidateQueries({ queryKey: ['/api/closing-docs-status'] });
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [queryClient]);

  const { data: clientsData = [], isLoading, isFetching, isError } = useQuery<ClientDocsData[]>({
    queryKey: ['/api/closing-docs-status'],
    queryFn: () => apiGet('/closing-docs-status'),
    refetchInterval,
    staleTime: 10000,
    retry: 2,
  });

  const toggleClient = (clientId: string) => {
    setExpandedClients(prev => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  };

  const totals = clientsData.reduce((acc, c) => ({
    totalInvoices: acc.totalInvoices + c.totalInvoices,
    withDoc: acc.withDoc + c.invoicesWithDoc,
    withoutDoc: acc.withoutDoc + c.invoicesWithoutDoc,
  }), { totalInvoices: 0, withDoc: 0, withoutDoc: 0 });

  const docsProgress = totals.totalInvoices > 0 ? (totals.withDoc / totals.totalInvoices) * 100 : 0;

  if (isError) return null;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Закрывающие документы бухгалтерии
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-24" />
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Закрывающие документы бухгалтерии
            {isFetching && (
              <RefreshCw className="h-3 w-3 text-muted-foreground animate-spin" />
            )}
          </CardTitle>
          <CardDescription className="mt-1">
            Счетов: {totals.totalInvoices} | Без документов: {totals.withoutDoc}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-3 rounded-md bg-muted/30">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-emerald-500" />
                <span>Закрывающие документы</span>
              </div>
              <span className="font-medium">{totals.withDoc} / {totals.totalInvoices}</span>
            </div>
            <Progress value={docsProgress} className="h-1.5" />
          </div>
        </div>

        {clientsData.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Нет счетов бухгалтерии для отображения
          </div>
        ) : (
          <div className="space-y-2">
            {clientsData.map(client => {
              const isExpanded = expandedClients.has(client.clientId);
              const clientProgress = client.totalInvoices > 0
                ? (client.invoicesWithDoc / client.totalInvoices) * 100
                : 0;
              const hasIssues = client.invoicesWithoutDoc > 0;

              return (
                <Collapsible key={client.clientId} open={isExpanded} onOpenChange={() => toggleClient(client.clientId)}>
                  <div className="sm:hidden">
                    <CollapsibleTrigger asChild>
                      <div
                        className="p-3 rounded-md border hover-elevate active-elevate-2 cursor-pointer"
                        data-testid={`closing-docs-row-mobile-${client.clientId}`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium truncate">{client.clientName}</span>
                              {hasIssues ? (
                                <Badge variant="destructive" className="text-xs">
                                  {client.invoicesWithoutDoc} без док.
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-xs bg-green-500/10 text-green-600">
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  Все есть
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              Счетов: {client.totalInvoices}
                            </div>
                          </div>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <Link2 className="h-3 w-3 text-emerald-500" />
                          <span>{client.invoicesWithDoc}/{client.totalInvoices}</span>
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="px-3 pb-3 pt-1">
                      <div className="space-y-2 mt-2">
                        {client.invoiceDetails.map(inv => (
                          <div
                            key={inv.id}
                            onClick={() => openInvoiceDetails(inv.id)}
                            className="block p-2 rounded border bg-muted/30 hover-elevate cursor-pointer"
                            data-testid={`closing-doc-link-mobile-${inv.id}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm truncate">
                                  {inv.invoiceNumber || inv.id.slice(0, 8)}
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <Badge variant="outline" className="text-xs">
                                    {STATUS_LABELS[inv.status] || inv.status}
                                  </Badge>
                                  {inv.paymentDate && (
                                    <span className="text-xs text-muted-foreground">
                                      {format(new Date(inv.paymentDate), 'dd.MM.yyyy', { locale: ru })}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                {inv.hasClosingDoc ? (
                                  <Badge variant="secondary" className="text-xs bg-emerald-500/10 text-emerald-600">
                                    <Link2 className="h-3 w-3" />
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-xs text-muted-foreground">
                                    <Link2 className="h-3 w-3" />
                                  </Badge>
                                )}
                                <ExternalLink className="h-3 w-3 text-muted-foreground" />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </div>

                  <div className="hidden sm:block">
                    <CollapsibleTrigger asChild>
                      <div
                        className="p-4 rounded-md border hover-elevate active-elevate-2 cursor-pointer"
                        data-testid={`closing-docs-row-desktop-${client.clientId}`}
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium truncate">{client.clientName}</span>
                                {hasIssues ? (
                                  <Badge variant="destructive" className="text-xs">
                                    <AlertCircle className="h-3 w-3 mr-1" />
                                    {client.invoicesWithoutDoc} без документов
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-xs bg-green-500/10 text-green-600">
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                    Все документы прикреплены
                                  </Badge>
                                )}
                              </div>
                              <div className="text-sm text-muted-foreground mt-1">
                                Счетов бухгалтерии: {client.totalInvoices}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-6">
                            <div className="text-center">
                              <div className="flex items-center gap-1 text-sm">
                                <Link2 className="h-4 w-4 text-emerald-500" />
                                <span className="font-medium">{client.invoicesWithDoc}</span>
                                <span className="text-muted-foreground">/ {client.totalInvoices}</span>
                              </div>
                              <div className="text-xs text-muted-foreground">Документы</div>
                            </div>
                            {isExpanded ? (
                              <ChevronUp className="h-5 w-5 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-5 w-5 text-muted-foreground" />
                            )}
                          </div>
                        </div>
                        <div className="mt-3">
                          <Progress value={clientProgress} className="h-1" />
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="px-4 pb-4 pt-2">
                      <div className="rounded-md border overflow-hidden mt-2">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/50">
                            <tr>
                              <th className="text-left p-2 font-medium">Счёт</th>
                              <th className="text-left p-2 font-medium">Статус</th>
                              <th className="text-left p-2 font-medium">Дата оплаты</th>
                              <th className="text-center p-2 font-medium">
                                <Link2 className="h-4 w-4 inline text-emerald-500" />
                              </th>
                              <th className="p-2"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {client.invoiceDetails.map(inv => (
                              <tr
                                key={inv.id}
                                className="hover:bg-muted/30 cursor-pointer"
                                onClick={() => openInvoiceDetails(inv.id)}
                                data-testid={`closing-doc-row-desktop-${inv.id}`}
                              >
                                <td className="p-2">
                                  <span className="font-medium text-foreground hover:underline">
                                    {inv.invoiceNumber || inv.id.slice(0, 8)}
                                  </span>
                                </td>
                                <td className="p-2">
                                  <Badge variant={inv.status === 'paid' ? 'default' : 'outline'} className="text-xs">
                                    {STATUS_LABELS[inv.status] || inv.status}
                                  </Badge>
                                </td>
                                <td className="p-2 text-muted-foreground">
                                  {inv.paymentDate
                                    ? format(new Date(inv.paymentDate), 'dd.MM.yyyy', { locale: ru })
                                    : '—'
                                  }
                                </td>
                                <td className="p-2 text-center">
                                  {inv.hasClosingDoc ? (
                                    <CheckCircle2 className="h-4 w-4 text-green-500 inline" />
                                  ) : (
                                    <AlertCircle className="h-4 w-4 text-orange-400 inline" />
                                  )}
                                </td>
                                <td className="p-2 text-center">
                                  {inv.closingDocumentUrl ? (
                                    <a
                                      href={inv.closingDocumentUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="text-primary hover:underline"
                                    >
                                      <ExternalLink className="h-4 w-4 inline" />
                                    </a>
                                  ) : (
                                    <ExternalLink className="h-4 w-4 text-muted-foreground inline" />
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            })}
          </div>
        )}
      </CardContent>

      {selectedInvoiceId && (
        <InvoiceDetailsDialog
          invoiceId={selectedInvoiceId}
          open={detailsDialogOpen}
          onOpenChange={(open) => {
            setDetailsDialogOpen(open);
            if (!open) {
              setSelectedInvoiceId(null);
              queryClient.invalidateQueries({ queryKey: ['/api/closing-docs-status'] });
            }
          }}
          canEdit={true}
          userRole="admin"
        />
      )}
    </Card>
  );
};
