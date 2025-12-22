import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { FileCheck2, ChevronDown, ChevronUp, Building2, User, RefreshCw, AlertCircle, CheckCircle2, ExternalLink } from "lucide-react";
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
  hasCompanyAct: boolean;
  hasExecutorAct: boolean;
  paymentDate: string | null;
}

interface ClientActsData {
  clientId: string;
  clientName: string;
  totalInvoices: number;
  invoicesWithCompanyAct: number;
  invoicesWithExecutorAct: number;
  invoicesWithBothActs: number;
  invoicesWithoutActs: number;
  invoiceDetails: InvoiceDetail[];
}

export const ClientActsDashboard = () => {
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
        queryClient.invalidateQueries({ queryKey: ['/api/clients/acts-status'] });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [queryClient]);

  const { data: clientsData = [], isLoading, isFetching, isError } = useQuery<ClientActsData[]>({
    queryKey: ['/api/clients/acts-status'],
    queryFn: () => apiGet('/clients/acts-status'),
    refetchInterval,
    staleTime: 10000,
    retry: 2,
  });

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

  // Calculate totals
  const totals = clientsData.reduce((acc, c) => ({
    totalInvoices: acc.totalInvoices + c.totalInvoices,
    withCompanyAct: acc.withCompanyAct + c.invoicesWithCompanyAct,
    withExecutorAct: acc.withExecutorAct + c.invoicesWithExecutorAct,
    withBothActs: acc.withBothActs + c.invoicesWithBothActs,
    withoutActs: acc.withoutActs + c.invoicesWithoutActs,
  }), { totalInvoices: 0, withCompanyAct: 0, withExecutorAct: 0, withBothActs: 0, withoutActs: 0 });

  const companyActsProgress = totals.totalInvoices > 0 ? (totals.withCompanyAct / totals.totalInvoices) * 100 : 0;
  const executorActsProgress = totals.totalInvoices > 0 ? (totals.withExecutorAct / totals.totalInvoices) * 100 : 0;

  if (isError) return null;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCheck2 className="h-5 w-5 text-primary" />
            Статус актов по клиентам
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
            <FileCheck2 className="h-5 w-5 text-primary" />
            Статус актов по клиентам
            {isFetching && (
              <RefreshCw className="h-3 w-3 text-muted-foreground animate-spin" />
            )}
          </CardTitle>
          <CardDescription className="mt-1">
            Оплаченные счета: {totals.totalInvoices} | Без актов: {totals.withoutActs}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary progress bars */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 rounded-md bg-muted/30">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-purple-500" />
                <span>Акты компаний</span>
              </div>
              <span className="font-medium">{totals.withCompanyAct} / {totals.totalInvoices}</span>
            </div>
            <Progress value={companyActsProgress} className="h-1.5" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-blue-500" />
                <span>Акты исполнителей</span>
              </div>
              <span className="font-medium">{totals.withExecutorAct} / {totals.totalInvoices}</span>
            </div>
            <Progress value={executorActsProgress} className="h-1.5" />
          </div>
        </div>

        {/* Client list */}
        {clientsData.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Нет оплаченных счетов для отображения
          </div>
        ) : (
          <div className="space-y-2">
            {clientsData.map(client => {
              const isExpanded = expandedClients.has(client.clientId);
              const clientCompanyProgress = client.totalInvoices > 0 
                ? (client.invoicesWithCompanyAct / client.totalInvoices) * 100 
                : 0;
              const clientExecutorProgress = client.totalInvoices > 0 
                ? (client.invoicesWithExecutorAct / client.totalInvoices) * 100 
                : 0;
              const hasIssues = client.invoicesWithoutActs > 0;

              return (
                <Collapsible key={client.clientId} open={isExpanded} onOpenChange={() => toggleClient(client.clientId)}>
                  {/* Mobile view */}
                  <div className="sm:hidden">
                    <CollapsibleTrigger asChild>
                      <div 
                        className="p-3 rounded-md border hover-elevate active-elevate-2 cursor-pointer"
                        data-testid={`client-acts-row-mobile-${client.clientId}`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium truncate">{client.clientName}</span>
                              {hasIssues ? (
                                <Badge variant="destructive" className="text-xs">
                                  {client.invoicesWithoutActs} без актов
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-xs bg-green-500/10 text-green-600">
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  Все акты
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
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="flex items-center gap-1">
                            <Building2 className="h-3 w-3 text-purple-500" />
                            <span>{client.invoicesWithCompanyAct}/{client.totalInvoices}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <User className="h-3 w-3 text-blue-500" />
                            <span>{client.invoicesWithExecutorAct}/{client.totalInvoices}</span>
                          </div>
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
                            data-testid={`invoice-link-mobile-${inv.id}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm truncate">
                                  {inv.invoiceNumber || inv.id.slice(0, 8)}
                                </div>
                                {inv.paymentDate && (
                                  <div className="text-xs text-muted-foreground">
                                    {format(new Date(inv.paymentDate), 'dd.MM.yyyy', { locale: ru })}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                {inv.hasCompanyAct ? (
                                  <Badge variant="secondary" className="text-xs bg-purple-500/10 text-purple-600">
                                    <Building2 className="h-3 w-3" />
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-xs text-muted-foreground">
                                    <Building2 className="h-3 w-3" />
                                  </Badge>
                                )}
                                {inv.hasExecutorAct ? (
                                  <Badge variant="secondary" className="text-xs bg-blue-500/10 text-blue-600">
                                    <User className="h-3 w-3" />
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-xs text-muted-foreground">
                                    <User className="h-3 w-3" />
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

                  {/* Desktop view */}
                  <div className="hidden sm:block">
                    <CollapsibleTrigger asChild>
                      <div 
                        className="p-4 rounded-md border hover-elevate active-elevate-2 cursor-pointer"
                        data-testid={`client-acts-row-desktop-${client.clientId}`}
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium truncate">{client.clientName}</span>
                                {hasIssues ? (
                                  <Badge variant="destructive" className="text-xs">
                                    <AlertCircle className="h-3 w-3 mr-1" />
                                    {client.invoicesWithoutActs} без актов
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-xs bg-green-500/10 text-green-600">
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                    Все акты прикреплены
                                  </Badge>
                                )}
                              </div>
                              <div className="text-sm text-muted-foreground mt-1">
                                Оплаченных счетов: {client.totalInvoices}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-6">
                            <div className="text-center">
                              <div className="flex items-center gap-1 text-sm">
                                <Building2 className="h-4 w-4 text-purple-500" />
                                <span className="font-medium">{client.invoicesWithCompanyAct}</span>
                                <span className="text-muted-foreground">/ {client.totalInvoices}</span>
                              </div>
                              <div className="text-xs text-muted-foreground">Компания</div>
                            </div>
                            <div className="text-center">
                              <div className="flex items-center gap-1 text-sm">
                                <User className="h-4 w-4 text-blue-500" />
                                <span className="font-medium">{client.invoicesWithExecutorAct}</span>
                                <span className="text-muted-foreground">/ {client.totalInvoices}</span>
                              </div>
                              <div className="text-xs text-muted-foreground">Исполнитель</div>
                            </div>
                            {isExpanded ? (
                              <ChevronUp className="h-5 w-5 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-5 w-5 text-muted-foreground" />
                            )}
                          </div>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-4">
                          <Progress value={clientCompanyProgress} className="h-1" />
                          <Progress value={clientExecutorProgress} className="h-1" />
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="px-4 pb-4 pt-2">
                      <div className="rounded-md border overflow-hidden mt-2">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/50">
                            <tr>
                              <th className="text-left p-2 font-medium">Счёт</th>
                              <th className="text-left p-2 font-medium">Дата оплаты</th>
                              <th className="text-center p-2 font-medium">
                                <Building2 className="h-4 w-4 inline text-purple-500" />
                              </th>
                              <th className="text-center p-2 font-medium">
                                <User className="h-4 w-4 inline text-blue-500" />
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
                                data-testid={`invoice-row-desktop-${inv.id}`}
                              >
                                <td className="p-2">
                                  <span className="font-medium text-foreground hover:underline">
                                    {inv.invoiceNumber || inv.id.slice(0, 8)}
                                  </span>
                                </td>
                                <td className="p-2 text-muted-foreground">
                                  {inv.paymentDate 
                                    ? format(new Date(inv.paymentDate), 'dd.MM.yyyy', { locale: ru })
                                    : '-'
                                  }
                                </td>
                                <td className="p-2 text-center">
                                  {inv.hasCompanyAct ? (
                                    <CheckCircle2 className="h-4 w-4 text-green-500 inline" />
                                  ) : (
                                    <AlertCircle className="h-4 w-4 text-orange-400 inline" />
                                  )}
                                </td>
                                <td className="p-2 text-center">
                                  {inv.hasExecutorAct ? (
                                    <CheckCircle2 className="h-4 w-4 text-green-500 inline" />
                                  ) : (
                                    <AlertCircle className="h-4 w-4 text-orange-400 inline" />
                                  )}
                                </td>
                                <td className="p-2 text-center">
                                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
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

      {/* Invoice Details Dialog */}
      {selectedInvoiceId && (
        <InvoiceDetailsDialog
          invoiceId={selectedInvoiceId}
          open={detailsDialogOpen}
          onOpenChange={(open) => {
            setDetailsDialogOpen(open);
            if (!open) {
              setSelectedInvoiceId(null);
              // Refresh acts status after closing
              queryClient.invalidateQueries({ queryKey: ['/api/clients/acts-status'] });
            }
          }}
          canEdit={true}
          userRole="admin"
        />
      )}
    </Card>
  );
};
