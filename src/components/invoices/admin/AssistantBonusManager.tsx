import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { formatDate } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { DollarSign, CheckCircle, History, Calendar, CreditCard, RefreshCw, User, Building2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";
import { useVisibilityAwareInterval } from "@/hooks/useVisibilityAwareInterval";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { AssistantBonusPayment } from "@shared/schema";
import { bonusRows, type AssistantBonusSummary } from "@/lib/assistantBonus";

const rowIcon = { client: Building2, executor: User } as const;

/** Бонус ассистенту за принятые пакеты: владелец платит его с личного счета. */
export const AssistantBonusManager = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const refetchInterval = useVisibilityAwareInterval();
  const [payoutDialogOpen, setPayoutDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        queryClient.invalidateQueries({ queryKey: ['/api/admin/unpaid-bonus'] });
        queryClient.invalidateQueries({ queryKey: ['/api/admin/bonus-payments'] });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [queryClient]);

  const { data: summary, isLoading, isFetching, isError } = useQuery<AssistantBonusSummary & { total: number }>({
    queryKey: ['/api/admin/unpaid-bonus'],
    queryFn: () => apiGet('/admin/unpaid-bonus'),
    refetchInterval,
    staleTime: 10000,
    retry: 2,
  });

  const { data: paymentHistory = [], isLoading: loadingHistory } = useQuery<AssistantBonusPayment[]>({
    queryKey: ['/api/admin/bonus-payments'],
    queryFn: () => apiGet('/admin/bonus-payments'),
    enabled: historyDialogOpen,
    refetchInterval: historyDialogOpen ? refetchInterval : false,
    retry: 2,
  });

  const payoutMutation = useMutation({
    mutationFn: async (payoutData: { amount: number; notes: string | null }) => {
      return apiPost('/admin/bonus-payout', payoutData);
    },
    onSuccess: (_, variables) => {
      toast({
        title: "Выплата записана",
        description: `Сумма ${formatCurrency(variables.amount)} отмечена как выплаченная`,
      });
      for (const queryKey of [['/api/admin/unpaid-bonus'], ['/api/admin/bonus-payments'], ['/api/admin/payables'], ['/api/assistant/stats'], ['/api/my-bonus-payments']]) {
        queryClient.invalidateQueries({ queryKey });
      }
      setPayoutDialogOpen(false);
      setNotes("");
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (isError) return null;

  if (isLoading || !summary) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Бонусы ассистента
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-24" />
          <div className="grid grid-cols-2 gap-4 pt-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const unpaid = summary.unpaid;
  const progressPercent = Math.min((unpaid / 50000) * 100, 100);

  return (
    <>
      <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Бонусы ассистента
            {isFetching && (
              <RefreshCw className="h-3 w-3 text-muted-foreground animate-spin" />
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setHistoryDialogOpen(true)}
            data-testid="button-view-bonus-history"
          >
            <History className="h-4 w-4 mr-2" />
            История выплат
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <div className="flex items-baseline gap-3">
              <div className="text-3xl font-bold text-primary" data-testid="text-admin-bonus-total">
                {formatCurrency(unpaid)}
              </div>
              {unpaid > 0 && (
                <Badge variant="secondary" className="text-xs">
                  К выплате
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Бонус за пакеты, которые вы приняли с {formatDate(summary.since)}. Вы платите его с личного счета.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Заработано: {formatCurrency(summary.earned)}, выплачено с {formatDate(summary.since)}: {formatCurrency(summary.paid)}
            </p>
          </div>

          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-muted-foreground">Прогресс до 50 000</span>
              <span className="font-medium">{progressPercent.toFixed(0)}%</span>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </div>

          <div className="space-y-2">
            {bonusRows(summary).map(row => {
              const Icon = rowIcon[row.key];
              return (
                <div key={row.key} className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-md bg-background/50">
                  <div className="flex items-center gap-2 text-sm">
                    <Icon className={`h-4 w-4 ${row.key === "client" ? "text-purple-500" : "text-blue-500"}`} />
                    <span>{row.label}</span>
                  </div>
                  <span className="text-sm font-semibold" data-testid={`text-admin-accepted-${row.key}`}>
                    {row.count} x {formatCurrency(row.rate)} = {formatCurrency(row.count * row.rate)}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant="warning">Ждут проверки: {summary.pending}</Badge>
            <Badge variant={summary.returned > 0 ? "destructive" : "outline"}>Возвращены: {summary.returned}</Badge>
          </div>

          <Button
            onClick={() => setPayoutDialogOpen(true)}
            disabled={payoutMutation.isPending || unpaid === 0}
            className="w-full"
            variant={unpaid > 0 ? "default" : "outline"}
            data-testid="button-payout-bonus"
          >
            <CreditCard className="h-4 w-4 mr-2" />
            {unpaid > 0 ? `Выплатить ${formatCurrency(unpaid)}` : "Все выплачено"}
          </Button>
        </CardContent>
      </Card>

      <Dialog open={payoutDialogOpen} onOpenChange={setPayoutDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Записать выплату бонуса</DialogTitle>
            <DialogDescription>
              Выплата запишется сегодняшней датой и уменьшит сумму к выплате. Вы переводите ее ассистенту с личного счета, на счет ИП она не влияет.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-md">
              <div className="text-2xl font-bold text-center">
                {formatCurrency(unpaid)}
              </div>
              <p className="text-sm text-muted-foreground text-center mt-1">
                Сумма к выплате
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Комментарий, если нужен</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Например: перевод на карту"
                data-testid="input-bonus-notes"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPayoutDialogOpen(false)}
              data-testid="button-cancel-payout"
            >
              Отмена
            </Button>
            <Button
              onClick={() => payoutMutation.mutate({ amount: unpaid, notes: notes || null })}
              disabled={payoutMutation.isPending}
              data-testid="button-confirm-payout"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              {payoutMutation.isPending ? "Записываю..." : "Записать выплату"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              paymentHistory.map((payment) => (
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
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
