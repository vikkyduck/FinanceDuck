import { invalidateFinancialQueries } from '@/lib/financialQueries';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiDelete } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { showSuccess } from "@/lib/errorHandler";
import { format } from "date-fns";
import { useState } from "react";

interface PartnerPayment {
  id: string;
  amount: string;
  paymentDate: string;
  notes: string | null;
  createdAt: string;
  partnerId?: string;
}

interface PartnerInvoicesDetailProps {
  partnerId: string;
  partnerName: string;
  onPaymentRecorded?: () => void;
}

export function PartnerInvoicesDetail({ partnerId, onPaymentRecorded }: PartnerInvoicesDetailProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState<PartnerPayment | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: payments = [], isLoading } = useQuery<PartnerPayment[]>({
    queryKey: ["/api/partner-payments", partnerId],
    queryFn: () => apiGet<PartnerPayment[]>(`/partner-payments?partnerId=${partnerId}`),
    enabled: !!partnerId,
  });

  const deletePaymentMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      return apiDelete(`/partner-payments/${paymentId}`);
    },
    onSuccess: () => {
      showSuccess("Готово", "Приход удалён");
      setDeleteDialogOpen(false);
      setPaymentToDelete(null);
      void invalidateFinancialQueries(queryClient);
      onPaymentRecorded?.();
    },
    onError: (error) => {
      toast({ title: "Ошибка", description: "Не удалось удалить приход", variant: "destructive" });
      console.error("Error deleting payment:", error);
    },
  });

  const handleDeletePayment = (payment: PartnerPayment) => {
    setPaymentToDelete(payment);
    setDeleteDialogOpen(true);
  };

  const confirmDeletePayment = () => {
    if (paymentToDelete) {
      deletePaymentMutation.mutate(paymentToDelete.id);
    }
  };

  if (isLoading) {
    return <div className="text-center py-2 text-xs text-muted-foreground">Загрузка...</div>;
  }

  if (payments.length === 0) {
    return (
      <div className="text-center py-2 text-xs text-muted-foreground">
        Приходов пока нет
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid={`partner-payments-${partnerId}`}>
      <div className="text-xs font-medium text-muted-foreground mb-2">История приходов:</div>
      
      <div className="space-y-1.5">
        {payments.map((payment) => (
          <div 
            key={payment.id} 
            className="flex items-start justify-between gap-3 py-2 px-3 rounded-md bg-muted/50 text-sm"
            data-testid={`payment-row-${payment.id}`}
          >
            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-muted-foreground whitespace-nowrap">
                  {format(new Date(payment.paymentDate), 'dd.MM.yyyy')}
                </span>
                <span className="font-medium text-green-600 whitespace-nowrap">
                  {formatCurrency(parseFloat(payment.amount))}
                </span>
              </div>
              {payment.notes && (
                <span className="text-xs text-muted-foreground break-words">
                  {payment.notes}
                </span>
              )}
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => handleDeletePayment(payment)}
              data-testid={`button-delete-payment-${payment.id}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить приход?</AlertDialogTitle>
            <AlertDialogDescription>
              Удалить приход на сумму {formatCurrency(parseFloat(paymentToDelete?.amount || "0"))} 
              от {paymentToDelete ? format(new Date(paymentToDelete.paymentDate), 'dd.MM.yyyy') : ''}?
              {paymentToDelete?.notes && (
                <span className="block mt-1 text-foreground">{paymentToDelete.notes}</span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDeletePayment}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deletePaymentMutation.isPending}
            >
              {deletePaymentMutation.isPending ? "Удаление..." : "Удалить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
