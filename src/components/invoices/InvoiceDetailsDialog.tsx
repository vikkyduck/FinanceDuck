import { useInvoiceCommands } from "@/hooks/useInvoiceCommands";
import { InvoiceTermsSection } from "./details/InvoiceTermsSection";
import { InvoiceCalculationsSection } from "./details/InvoiceCalculationsSection";
import { InvoiceExpensesSection } from "./details/InvoiceExpensesSection";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { Button } from "@/components/ui/button";

import { formatCurrency } from "@/lib/invoiceCalculations";
import { Loader2, MessageSquare } from "lucide-react";
import { SendMessageDialog } from "@/components/messages/SendMessageDialog";

import { AddExpenseDialog } from "./assistant/AddExpenseDialog";

import { EditExpenseDialog } from "./assistant/EditExpenseDialog";
import { SignedActsSection } from "./SignedActsSection";

import { UserRole } from "@/lib/invoicePermissions";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface InvoiceDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string | null;
  canEdit?: boolean;
  userRole?: UserRole;
}

// Черновики полей живут в состоянии редактора: другой счёт получает новый редактор с чистыми черновиками.
export const InvoiceDetailsDialog = (props: InvoiceDetailsDialogProps) => (
  <InvoiceDetailsEditor key={props.invoiceId ?? ""} {...props} />
);

const InvoiceDetailsEditor = ({
  open,
  onOpenChange,
  invoiceId,
  canEdit = false,
  userRole = "client",
}: InvoiceDetailsDialogProps) => {
  const model = useInvoiceCommands({ open, invoiceId, canEdit, userRole });
  const {
    invoice,
    loading,
    error,
    fetchInvoiceDetails,
    addExpenseOpen,
    setAddExpenseOpen,
    editExpenseOpen,
    setEditExpenseOpen,
    editingExpense,
    deleteExpense,
    setDeleteExpense,
    deletingExpenseId,
    pendingStatusChange,
    setPendingStatusChange,
    updatingStatus,
    invoiceNumber,
    messageInvoiceOpen,
    setMessageInvoiceOpen,
    messageExpense,
    setMessageExpense,
    handleDeleteExpense,
    confirmStatusChange,
    permissions,
  } = model;

  if (loading || !invoice) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl w-[95vw] sm:w-full">
          <DialogHeader>
            <DialogTitle>
              {error ? "Не удалось загрузить счёт" : "Загрузка счёта"}
            </DialogTitle>
            <DialogDescription>
              {error
                ? "Закройте карточку и попробуйте открыть её снова."
                : "Получаем данные счёта и расходов."}
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto w-[95vw] sm:w-full p-4 sm:p-6">
          <DialogHeader className="text-left pr-8">
            <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
              <div>
                <DialogTitle>Счет № {invoice.invoice_number}</DialogTitle>
                <DialogDescription>
                  Детальная информация по счету
                </DialogDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 shrink-0"
                onClick={() => setMessageInvoiceOpen(true)}
                data-testid="button-message-invoice"
              >
                <MessageSquare className="h-4 w-4" />
                Написать
              </Button>
            </div>
          </DialogHeader>

          <div className="space-y-6">
            {/* Основная информация */}
            <InvoiceTermsSection model={model} />

            {/* Расчеты водопад */}
            <InvoiceCalculationsSection model={model} />

            {/* Расходы исполнителей */}
            {permissions.showExpensesList && (
              <InvoiceExpensesSection model={model} />
            )}

            {/* Signed Acts Section — клиенту не нужны: за документооборот
                и за траты отвечают разные люди со стороны клиента. */}
            {userRole !== "client" && (
              <SignedActsSection
                invoiceId={invoiceId || ""}
                userRole={userRole}
                canEdit={canEdit}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {permissions.canAddExpenses && (
        <AddExpenseDialog
          open={addExpenseOpen}
          onOpenChange={setAddExpenseOpen}
          invoiceId={invoiceId || ""}
          onSuccess={fetchInvoiceDetails}
        />
      )}

      {canEdit && (
        <EditExpenseDialog
          open={editExpenseOpen}
          onOpenChange={setEditExpenseOpen}
          expense={editingExpense}
          onSuccess={fetchInvoiceDetails}
        />
      )}

      <AlertDialog
        open={!!deleteExpense}
        onOpenChange={(open) => !open && setDeleteExpense(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить расход?</AlertDialogTitle>
            <AlertDialogDescription>
              Вы действительно хотите удалить расход "
              {deleteExpense?.description}"? Это действие нельзя отменить, и
              пересчитаются все финансовые показатели счёта.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteExpense}
              disabled={!!deletingExpenseId}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deletingExpenseId ? (
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

      <AlertDialog
        open={!!pendingStatusChange}
        onOpenChange={(open) => !open && setPendingStatusChange(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingStatusChange?.hasUnspentReserve
                ? "Работы ещё не завершены!"
                : "Изменить статус счёта?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              {pendingStatusChange?.hasUnspentReserve ? (
                <div className="space-y-3">
                  <p>
                    У вас остался неиспользованный резерв:{" "}
                    <strong className="text-primary">
                      {formatCurrency(
                        pendingStatusChange.remainingReserve || 0,
                      )}
                    </strong>
                  </p>
                  <p className="text-amber-600 dark:text-amber-500">
                    Это может означать, что работы по проекту ещё не завершены.
                    Рекомендуется сначала добавить все расходы исполнителей или
                    уменьшить сумму резерва.
                  </p>
                  <p>Вы уверены, что хотите отметить счёт как "Оплачен"?</p>
                </div>
              ) : (
                <>
                  Вы собираетесь изменить статус счёта на "
                  {pendingStatusChange?.label}".
                  {pendingStatusChange?.status === "paid" &&
                    " Это означает, что оплата получена от клиента."}
                  {pendingStatusChange?.status === "cancelled" &&
                    " Счёт будет помечен как отменённый и не будет учитываться в расчётах."}{" "}
                  Продолжить?
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmStatusChange}
              disabled={updatingStatus}
              className={
                pendingStatusChange?.hasUnspentReserve
                  ? "bg-amber-600 hover:bg-amber-700"
                  : ""
              }
            >
              {updatingStatus ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Обновление...
                </>
              ) : pendingStatusChange?.hasUnspentReserve ? (
                "Всё равно отметить оплаченным"
              ) : (
                "Изменить статус"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {invoiceId && (
        <SendMessageDialog
          open={messageInvoiceOpen}
          onOpenChange={setMessageInvoiceOpen}
          invoiceId={invoiceId}
          invoiceNumber={invoice?.invoice_number ?? undefined}
          currentRole={userRole}
        />
      )}
      {invoiceId && messageExpense && (
        <SendMessageDialog
          open={!!messageExpense}
          onOpenChange={(o) => {
            if (!o) setMessageExpense(null);
          }}
          invoiceId={invoiceId}
          invoiceNumber={invoice?.invoice_number ?? undefined}
          expenseId={messageExpense.id}
          expenseDescription={messageExpense.description}
          expenseAmount={messageExpense.amount}
          currentRole={userRole}
        />
      )}
    </>
  );
};
