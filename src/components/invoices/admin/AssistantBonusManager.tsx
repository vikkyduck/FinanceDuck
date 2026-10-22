import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { useToast } from "@/hooks/use-toast";
import { DollarSign, CheckCircle, History, FileCheck2, FileText, Calendar, CreditCard, RefreshCw, User, Building2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";
import { useVisibilityAwareInterval } from "@/hooks/useVisibilityAwareInterval";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { AssistantBonusPayment } from "@shared/schema";
import { ASSISTANT_BONUS_PER_ACT } from "@shared/financialEngine";

interface UnpaidBonusData {
  total: number;
  invoiceCount: number;
  invoiceIds: string[];
  executorActs: number;
  companyActs: number;
}

interface AssistantStats {
  paidInvoicesCount: number;
  executorActsCount: number;
  companyActsCount: number;
  totalPaidInvoices: number;
  assistantBonus: number;
  totalEarned: number;
  totalPaid: number;
}

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
        queryClient.invalidateQueries({ queryKey: ['/api/assistant/stats'] });
        queryClient.invalidateQueries({ queryKey: ['/api/admin/bonus-payments'] });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [queryClient]);

  // Use the same API as AssistantBonusCard for unified data source
  const { data: stats, isLoading: loadingStats, isFetching: fetchingStats, isError: errorStats } = useQuery<AssistantStats>({
    queryKey: ['/api/assistant/stats'],
    queryFn: () => apiGet('/assistant/stats'),
    refetchInterval,
    staleTime: 10000,
    retry: 2,
  });

  const { data: unpaidBonus, isLoading: loadingUnpaid, isError: errorUnpaid } = useQuery<UnpaidBonusData>({
    queryKey: ['/api/admin/unpaid-bonus'],
    queryFn: () => apiGet('/admin/unpaid-bonus'),
    refetchInterval,
    staleTime: 10000,
    retry: 2,
  });

  const { data: paymentHistory = [], isLoading: loadingHistory, isError: errorHistory } = useQuery<AssistantBonusPayment[]>({
    queryKey: ['/api/admin/bonus-payments'],
    queryFn: () => apiGet('/admin/bonus-payments'),
    enabled: historyDialogOpen,
    refetchInterval: historyDialogOpen ? refetchInterval : false,
    retry: 2,
  });

  const payoutMutation = useMutation({
    mutationFn: async (payoutData: { amount: number; notes: string | null; invoiceIds: string[] }) => {
      return apiPost('/admin/bonus-payout', payoutData);
    },
    onSuccess: (_, variables) => {
      toast({
        title: "Выплата зафиксирована",
        description: `Сумма ${formatCurrency(variables.amount)} отмечена как выплаченная`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/unpaid-bonus'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/bonus-payments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/assistant/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/my-bonus-payments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/acts-statistics'] });
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

  // Use unified stats from /api/assistant/stats
  const executorActsCount = stats?.executorActsCount || 0;
  const companyActsCount = stats?.companyActsCount || 0;
  const totalPaidInvoices = stats?.totalPaidInvoices || 0;
  const executorActsAmount = executorActsCount * ASSISTANT_BONUS_PER_ACT.executor;
  const companyActsAmount = companyActsCount * ASSISTANT_BONUS_PER_ACT.company;
  // Stats provides historical totals (totalEarned, totalPaid)
  const totalEarnedAmount = stats?.totalEarned || (executorActsAmount + companyActsAmount);
  const totalPaidAmount = stats?.totalPaid || 0;
  
  // Use unpaidBonus for payout operations (amount + invoiceIds) to ensure consistency
  const unpaidTotal = unpaidBonus?.total || 0;
  const hasUnpaidBonuses = unpaidTotal > 0;

  const loading = loadingUnpaid || loadingStats;
  
  // Handle errors gracefully
  if (errorStats || errorUnpaid) return null;
  
  // Progress calculations based on unpaid amount (same as AssistantBonusCard)
  const progressPercent = Math.min((unpaidTotal / 50000) * 100, 100);
  const executorProgress = totalPaidInvoices > 0 
    ? (executorActsCount / totalPaidInvoices) * 100 
    : 0;
  const companyProgress = totalPaidInvoices > 0 
    ? (companyActsCount / totalPaidInvoices) * 100 
    : 0;

  if (loading) {
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

  return (
    <>
      <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Бонусы ассистента
            {fetchingStats && (
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
                {formatCurrency(unpaidTotal)}
              </div>
              {hasUnpaidBonuses && (
                <Badge variant="secondary" className="text-xs">
                  К выплате
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Накоплено после последней выплаты
            </p>
            {totalPaidAmount > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Всего заработано: {formatCurrency(totalEarnedAmount)} (выплачено: {formatCurrency(totalPaidAmount)})
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

          <div className="space-y-4 pt-2">
            <div className="p-3 rounded-md bg-background/50 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <Building2 className="h-4 w-4 text-purple-500" />
                  <span>Акты компаний</span>
                </div>
                <span className="text-sm font-medium">
                  {companyActsCount} / {totalPaidInvoices}
                </span>
              </div>
              <Progress value={companyProgress} className="h-1.5" />
              <div className="text-sm font-semibold text-right">
                {companyActsCount} x 2 000 = {formatCurrency(companyActsAmount)}
              </div>
            </div>

            <div className="p-3 rounded-md bg-background/50 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <User className="h-4 w-4 text-blue-500" />
                  <span>Акты исполнителей</span>
                </div>
                <span className="text-sm font-medium">
                  {executorActsCount} / {totalPaidInvoices}
                </span>
              </div>
              <Progress value={executorProgress} className="h-1.5" />
              <div className="text-sm font-semibold text-right">
                {executorActsCount} x 1 000 = {formatCurrency(executorActsAmount)}
              </div>
            </div>
          </div>

          <div className="pt-2 border-t">
            <div className="flex items-center justify-between p-2 rounded-md bg-primary/10">
              <span className="font-medium">К выплате:</span>
              <span className="font-bold text-primary">{formatCurrency(unpaidTotal)}</span>
            </div>
          </div>

          <Button 
            onClick={() => setPayoutDialogOpen(true)}
            disabled={payoutMutation.isPending || unpaidTotal === 0}
            className="w-full"
            variant={hasUnpaidBonuses ? "default" : "outline"}
            data-testid="button-payout-bonus"
          >
            <CreditCard className="h-4 w-4 mr-2" />
            {hasUnpaidBonuses 
              ? `Выплатить ${formatCurrency(unpaidTotal)}`
              : "Всё выплачено"
            }
          </Button>
        </CardContent>
      </Card>

      <Dialog open={payoutDialogOpen} onOpenChange={setPayoutDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Подтвердить выплату бонуса</DialogTitle>
            <DialogDescription>
              После подтверждения бонусы за {unpaidBonus?.invoiceCount || 0} счетов будут отмечены как выплаченные
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-md">
              <div className="text-2xl font-bold text-center">
                {formatCurrency(unpaidTotal)}
              </div>
              <p className="text-sm text-muted-foreground text-center mt-1">
                Сумма к выплате
              </p>
              <div className="flex justify-center gap-4 mt-2 text-sm text-muted-foreground">
                <span>{executorActsCount} актов исполнителей</span>
                <span>{companyActsCount} актов компаний</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Комментарий (опционально)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Например: Перевод на карту"
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
              onClick={() => payoutMutation.mutate({
                amount: unpaidTotal,
                notes: notes || null,
                invoiceIds: unpaidBonus?.invoiceIds || [],
              })}
              disabled={payoutMutation.isPending}
              data-testid="button-confirm-payout"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              {payoutMutation.isPending ? "Обработка..." : "Подтвердить выплату"}
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
                Выплат ещё не было
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
