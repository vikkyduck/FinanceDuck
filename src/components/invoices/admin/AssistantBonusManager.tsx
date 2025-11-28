import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { useToast } from "@/hooks/use-toast";
import { DollarSign, CheckCircle, History, FileCheck2, FileText, Calendar, CreditCard } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, apiGet, apiPost } from "@/lib/api";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { AssistantBonusPayment } from "@shared/schema";

interface UnpaidBonusData {
  total: number;
  invoiceCount: number;
  invoiceIds: string[];
  executorActs: number;
  companyActs: number;
}

interface ActStats {
  executorActs: number;
  companyActs: number;
  totalPaidInvoices: number;
}

export const AssistantBonusManager = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [payoutDialogOpen, setPayoutDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [notes, setNotes] = useState("");

  const { data: unpaidBonus, isLoading: loadingUnpaid } = useQuery<UnpaidBonusData>({
    queryKey: ['/api/admin/unpaid-bonus'],
  });

  const { data: actStats, isLoading: loadingStats } = useQuery<ActStats>({
    queryKey: ['/api/acts-statistics'],
  });

  const { data: paymentHistory = [], isLoading: loadingHistory } = useQuery<AssistantBonusPayment[]>({
    queryKey: ['/api/admin/bonus-payments'],
    enabled: historyDialogOpen,
  });

  const payoutMutation = useMutation({
    mutationFn: async () => {
      return apiPost('/admin/bonus-payout', {
        amount: unpaidBonus?.total || 0,
        notes: notes || null,
        invoiceIds: unpaidBonus?.invoiceIds || [],
      });
    },
    onSuccess: () => {
      toast({
        title: "Выплата зафиксирована",
        description: `Сумма ${formatCurrency(unpaidBonus?.total || 0)} отмечена как выплаченная`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/unpaid-bonus'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/bonus-payments'] });
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

  const executorActsAmount = (actStats?.executorActs || 0) * 1000;
  const companyActsAmount = (actStats?.companyActs || 0) * 2000;
  const calculatedTotal = executorActsAmount + companyActsAmount;

  const loading = loadingUnpaid || loadingStats;

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

  const unpaidTotal = unpaidBonus?.total || 0;
  const hasUnpaidBonuses = unpaidTotal > 0;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <DollarSign className="h-5 w-5 text-primary" />
              Бонусы ассистента
            </CardTitle>
            <CardDescription>
              За подписанные акты с исполнителями и клиентами
            </CardDescription>
          </div>
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
        <CardContent className="space-y-4">
          <div className="flex items-baseline gap-3">
            <div className="text-3xl font-bold text-primary">
              {formatCurrency(calculatedTotal)}
            </div>
            {hasUnpaidBonuses && (
              <Badge variant="secondary" className="text-xs">
                К выплате: {formatCurrency(unpaidTotal)}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Всего начислено за {actStats?.totalPaidInvoices || 0} оплаченных счетов
          </p>

          <div className="grid grid-cols-2 gap-4 pt-3 border-t">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileCheck2 className="h-4 w-4" />
                Акты с исполнителями
              </div>
              <p className="font-semibold">
                {actStats?.executorActs || 0} x 1000 = {formatCurrency(executorActsAmount)}
              </p>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileText className="h-4 w-4" />
                Акты с клиентами (компании)
              </div>
              <p className="font-semibold">
                {actStats?.companyActs || 0} x 2000 = {formatCurrency(companyActsAmount)}
              </p>
            </div>
          </div>

          {hasUnpaidBonuses && (
            <Button 
              onClick={() => setPayoutDialogOpen(true)}
              disabled={payoutMutation.isPending}
              className="w-full mt-4"
              variant="default"
              data-testid="button-payout-bonus"
            >
              <CreditCard className="h-4 w-4 mr-2" />
              Выплатить {formatCurrency(unpaidTotal)}
            </Button>
          )}
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
                <span>{unpaidBonus?.executorActs || 0} актов исполнителей</span>
                <span>{unpaidBonus?.companyActs || 0} актов компаний</span>
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
              onClick={() => payoutMutation.mutate()}
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
        <DialogContent className="max-w-lg">
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
