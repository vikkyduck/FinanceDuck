import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { History, TrendingDown, Check, AlertCircle, Pencil, Trash2, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useVisibilityAwareInterval } from "@/hooks/useVisibilityAwareInterval";
import { useToast } from "@/hooks/use-toast";
import { showSuccess } from "@/lib/errorHandler";
import { apiPut, apiDelete } from "@/lib/api";

interface PaymentHistoryEntry {
  id: string;
  paymentDate: string;
  amount: number;
  notes: string | null;
  runningBalance: number;
}

interface PartnerPaymentHistoryProps {
  partnerId?: string;
  showTitle?: boolean;
  className?: string;
  compact?: boolean;
  editable?: boolean;
  onPaymentChanged?: () => void;
}

export function PartnerPaymentHistory({ 
  partnerId, 
  showTitle = true, 
  className,
  compact = false,
  editable = false,
  onPaymentChanged
}: PartnerPaymentHistoryProps) {
  const refetchInterval = useVisibilityAwareInterval();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<PaymentHistoryEntry | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editNotes, setEditNotes] = useState("");
  
  const apiUrl = partnerId 
    ? `/api/partners/${partnerId}/payment-history` 
    : "/api/my-payment-history";

  const { data: history, isLoading, error, refetch } = useQuery<PaymentHistoryEntry[]>({
    queryKey: ["partner-payment-history", partnerId || "self"],
    queryFn: async () => {
      const response = await fetch(apiUrl, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch payment history");
      return response.json();
    },
    staleTime: 30000,
    refetchInterval,
  });
  
  const updatePaymentMutation = useMutation({
    mutationFn: async (data: { id: string; amount: string; paymentDate: string; notes: string }) => {
      return apiPut(`/partner-payments/${data.id}`, {
        amount: data.amount,
        paymentDate: data.paymentDate,
        notes: data.notes || null,
      });
    },
    onSuccess: () => {
      showSuccess("Готово", "Платёж обновлён");
      setEditDialogOpen(false);
      setSelectedPayment(null);
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/partner-debt"] });
      queryClient.invalidateQueries({ queryKey: ["/api/partner-payments"] });
      onPaymentChanged?.();
    },
    onError: (error) => {
      toast({ title: "Ошибка", description: "Не удалось обновить платёж", variant: "destructive" });
      console.error("Update payment error:", error);
    },
  });

  const deletePaymentMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiDelete(`/partner-payments/${id}`);
    },
    onSuccess: () => {
      showSuccess("Готово", "Платёж удалён");
      setDeleteDialogOpen(false);
      setSelectedPayment(null);
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/partner-debt"] });
      queryClient.invalidateQueries({ queryKey: ["/api/partner-payments"] });
      onPaymentChanged?.();
    },
    onError: (error) => {
      toast({ title: "Ошибка", description: "Не удалось удалить платёж", variant: "destructive" });
      console.error("Delete payment error:", error);
    },
  });

  const handleEdit = (payment: PaymentHistoryEntry) => {
    setSelectedPayment(payment);
    setEditAmount(payment.amount.toString());
    setEditDate(payment.paymentDate);
    setEditNotes(payment.notes || "");
    setEditDialogOpen(true);
  };

  const handleDelete = (payment: PaymentHistoryEntry) => {
    setSelectedPayment(payment);
    setDeleteDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!selectedPayment) return;
    
    const amount = parseFloat(editAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: "Ошибка", description: "Введите корректную сумму", variant: "destructive" });
      return;
    }
    
    if (!editDate) {
      toast({ title: "Ошибка", description: "Введите дату платежа", variant: "destructive" });
      return;
    }

    updatePaymentMutation.mutate({
      id: selectedPayment.id,
      amount: editAmount,
      paymentDate: editDate,
      notes: editNotes,
    });
  };

  const handleConfirmDelete = () => {
    if (!selectedPayment) return;
    deletePaymentMutation.mutate(selectedPayment.id);
  };

  if (isLoading) {
    return (
      <Card className={cn("shadow-standard", className)}>
        {showTitle && (
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <History className="h-4 w-4" />
              История платежей
            </CardTitle>
          </CardHeader>
        )}
        <CardContent className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={cn("shadow-standard", className)}>
        <CardContent className="py-6">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span>Ошибка загрузки истории платежей</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!history || history.length === 0) {
    return (
      <Card className={cn("shadow-standard", className)}>
        {showTitle && (
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <History className="h-4 w-4" />
              История платежей
            </CardTitle>
          </CardHeader>
        )}
        <CardContent>
          <p className="text-muted-foreground text-sm text-center py-4">
            Платежей пока нет
          </p>
        </CardContent>
      </Card>
    );
  }

  const totalPaid = history.reduce((sum, entry) => sum + entry.amount, 0);
  const currentBalance = history[0]?.runningBalance || 0;

  return (
    <Card className={cn("shadow-standard", className)} data-testid="partner-payment-history">
      {showTitle && (
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <History className="h-4 w-4" />
              История платежей
            </CardTitle>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground">
                Всего: <span className="font-medium text-foreground">{formatCurrency(totalPaid)}</span>
              </span>
              {currentBalance <= 0 ? (
                <Badge variant="outline" className="gap-1 bg-green-500/10 text-green-600 border-green-200">
                  <Check className="h-3 w-3" />
                  {currentBalance < 0 
                    ? `Переплата: ${formatCurrency(Math.abs(currentBalance))}`
                    : "Всё оплачено"
                  }
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 bg-amber-500/10 text-amber-600 border-amber-200">
                  Остаток: {formatCurrency(currentBalance)}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
      )}
      <CardContent className={cn(compact ? "pt-0" : "")}>
        <div className="space-y-2">
          {history.map((entry, index) => (
            <div
              key={entry.id}
              className={cn(
                "flex items-center justify-between gap-4 py-3",
                index !== history.length - 1 && "border-b border-border/50"
              )}
              data-testid={`payment-entry-${entry.id}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="shrink-0 w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center">
                  <TrendingDown className="h-4 w-4 text-green-600" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground">
                    {format(new Date(entry.paymentDate), "d MMMM yyyy", { locale: ru })}
                  </div>
                  {entry.notes && (
                    <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                      {entry.notes}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold text-green-600">
                    -{formatCurrency(entry.amount)}
                  </div>
                  <div className={cn(
                    "text-xs",
                    entry.runningBalance < 0 ? "text-green-600" : "text-muted-foreground"
                  )}>
                    {entry.runningBalance < 0 
                      ? `Переплата: ${formatCurrency(Math.abs(entry.runningBalance))}`
                      : `Остаток: ${formatCurrency(entry.runningBalance)}`
                    }
                  </div>
                </div>
                {editable && (
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleEdit(entry)}
                      data-testid={`button-edit-payment-${entry.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleDelete(entry)}
                      data-testid={`button-delete-payment-${entry.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Редактировать платёж</DialogTitle>
            <DialogDescription>
              Изменение данных платежа от {selectedPayment && format(new Date(selectedPayment.paymentDate), "d MMMM yyyy", { locale: ru })}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-amount">Сумма</Label>
              <Input
                id="edit-amount"
                type="number"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                placeholder="0"
                data-testid="input-edit-payment-amount"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="edit-date">Дата платежа</Label>
              <Input
                id="edit-date"
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                data-testid="input-edit-payment-date"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="edit-notes">Примечание</Label>
              <Input
                id="edit-notes"
                type="text"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Необязательно"
                data-testid="input-edit-payment-notes"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Отмена
            </Button>
            <Button onClick={handleSaveEdit} disabled={updatePaymentMutation.isPending}>
              {updatePaymentMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Сохранение...
                </>
              ) : (
                "Сохранить"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить платёж?</AlertDialogTitle>
            <AlertDialogDescription>
              Вы уверены, что хотите удалить платёж на сумму {formatCurrency(selectedPayment?.amount || 0)} 
              от {selectedPayment && format(new Date(selectedPayment.paymentDate), "d MMMM yyyy", { locale: ru })}?
              Это действие нельзя отменить и повлияет на расчёт долга партнёра.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deletePaymentMutation.isPending}
            >
              {deletePaymentMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Удаление...
                </>
              ) : (
                "Удалить"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
