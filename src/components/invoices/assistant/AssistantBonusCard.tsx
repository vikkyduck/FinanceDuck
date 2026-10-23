import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { formatDate } from "@/lib/format";
import { DollarSign, User, Building2, History, Calendar, RefreshCw } from "lucide-react";
import { apiGet } from "@/lib/api";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { AssistantBonusPayment } from "@shared/schema";
import { bonusRows, type AssistantBonusSummary } from "@/lib/assistantBonus";
import { packagesByStatusKey, packageTitle, type PackageListItem } from "@/lib/documentPackages";
import { useVisibilityAwareInterval } from "@/hooks/useVisibilityAwareInterval";

const rowIcon = { client: Building2, executor: User } as const;

export const AssistantBonusCard = () => {
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const queryClient = useQueryClient();
  const refetchInterval = useVisibilityAwareInterval();

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        queryClient.invalidateQueries({ queryKey: ['/api/assistant/stats'] });
        queryClient.invalidateQueries({ queryKey: ['/api/document-packages'] });
        queryClient.invalidateQueries({ queryKey: ['/api/my-bonus-payments'] });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [queryClient]);

  const { data: stats, isLoading, isFetching } = useQuery<AssistantBonusSummary>({
    queryKey: ['/api/assistant/stats'],
    queryFn: () => apiGet('/assistant/stats'),
    refetchInterval,
    staleTime: 10000,
  });

  const { data: returned = [] } = useQuery<PackageListItem[]>({
    queryKey: packagesByStatusKey("returned"),
    queryFn: () => apiGet("/document-packages?status=returned"),
    refetchInterval,
    staleTime: 10000,
  });

  const { data: paymentHistory = [], isLoading: loadingHistory } = useQuery<AssistantBonusPayment[]>({
    queryKey: ['/api/my-bonus-payments'],
    queryFn: () => apiGet('/my-bonus-payments'),
    enabled: historyDialogOpen,
    refetchInterval: historyDialogOpen ? refetchInterval : false,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-2 w-full" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!stats) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground">
            Не удалось загрузить данные о бонусах
          </div>
        </CardContent>
      </Card>
    );
  }

  const progressPercent = Math.min((stats.unpaid / 50000) * 100, 100);
  const totalPaid = paymentHistory.reduce((sum, p) => sum + parseFloat(p.amount), 0);

  return (
    <>
      <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Ваши бонусы
            {isFetching && (
              <RefreshCw className="h-3 w-3 text-muted-foreground animate-spin" />
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setHistoryDialogOpen(true)}
            data-testid="button-view-my-bonus-history"
          >
            <History className="h-4 w-4 mr-2" />
            История
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <div className="text-3xl font-bold text-primary" data-testid="text-assistant-bonus">
              {formatCurrency(stats.unpaid)}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              К выплате. Бонус начисляется, когда владелец принимает пакет документов, правило действует с {formatDate(stats.since)}
            </p>
            {stats.paid > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Заработано: {formatCurrency(stats.earned)} (выплачено: {formatCurrency(stats.paid)})
              </p>
            )}
          </div>

          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-muted-foreground">Прогресс до 50 000</span>
              <span className="font-medium">{progressPercent.toFixed(0)}%</span>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </div>

          <div className="space-y-2">
            {bonusRows(stats).map(row => {
              const Icon = rowIcon[row.key];
              return (
                <div key={row.key} className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-md bg-background/50">
                  <div className="flex items-center gap-2 text-sm">
                    <Icon className={`h-4 w-4 ${row.key === "client" ? "text-purple-500" : "text-blue-500"}`} />
                    <span>{row.label}</span>
                  </div>
                  <span className="text-sm font-semibold" data-testid={`text-accepted-${row.key}`}>
                    {row.count} x {formatCurrency(row.rate)} = {formatCurrency(row.count * row.rate)}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="warning" data-testid="badge-packages-pending">
              На проверке: {stats.pending}
            </Badge>
            <Badge variant={stats.returned > 0 ? "destructive" : "outline"} data-testid="badge-packages-returned">
              Возвращены: {stats.returned}
            </Badge>
          </div>

          {returned.length > 0 && (
            <div className="space-y-2" data-testid="list-returned-packages">
              <p className="text-sm font-medium">Что исправить</p>
              {returned.map(pkg => (
                <Link key={pkg.id} to={`/invoices/${pkg.invoiceId}`} className="block p-3 rounded-md border hover-elevate text-sm">
                  <span className="font-medium">{pkg.invoiceNumber}</span>
                  {pkg.clientName ? `, ${pkg.clientName}` : ""}
                  <span className="block text-xs text-muted-foreground [overflow-wrap:anywhere]">{packageTitle(pkg)}</span>
                  {pkg.reviewComment && (
                    <span className="block mt-1 [overflow-wrap:anywhere]">{pkg.reviewComment}</span>
                  )}
                </Link>
              ))}
              <p className="text-xs text-muted-foreground">
                Загрузите исправленный документ в карточке счета: пакет снова уйдет на проверку.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="max-w-lg w-[95vw] sm:w-full">
          <DialogHeader>
            <DialogTitle>История выплат бонусов</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 max-h-96 overflow-y-auto">
            {loadingHistory ? (
              <div className="space-y-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : paymentHistory.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Выплат еще не было
              </p>
            ) : (
              <>
                <div className="p-3 rounded-md bg-muted/50 mb-4">
                  <div className="text-sm text-muted-foreground">Всего выплачено:</div>
                  <div className="text-xl font-bold">{formatCurrency(totalPaid)}</div>
                </div>
                {paymentHistory.map((payment) => (
                  <Card key={payment.id} className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="font-semibold text-lg">
                          {formatCurrency(parseFloat(payment.amount))}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(payment.paymentDate), "d MMMM yyyy", { locale: ru })}
                        </div>
                      </div>
                      <Badge variant="secondary">Выплачено</Badge>
                    </div>
                    {payment.notes && (
                      <p className="text-sm text-muted-foreground mt-2 border-t pt-2">
                        {payment.notes}
                      </p>
                    )}
                  </Card>
                ))}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
