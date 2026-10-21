import { apiPatch } from '@/lib/api';
import { parseNum } from '@shared/financialEngine';
import { format } from 'date-fns';
import { useMemo, useState } from 'react';
import type { InvoiceEditorContext } from './invoiceEditorContext';
import { useToast } from './use-toast';

/** Status confirmation and payment dates. */
export function useInvoiceStatusCommands({ invoiceId, invoice, expenses, setStatus, refresh: fetchInvoiceDetails }: InvoiceEditorContext) {
  const { toast } = useToast();
  const [pendingStatusChange, setPendingStatusChange] = useState<{
    status: "draft" | "sent" | "paid" | "cancelled";
    label: string;
    hasUnspentReserve?: boolean;
    remainingReserve?: number;
  } | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  // Черновик даты: null — не трогали, показываем дату с сервера; undefined — дату сняли.
  const [plannedDraft, setPlannedPaymentDate] = useState<Date | undefined | null>(null);
  const [actualDraft, setActualPaymentDate] = useState<Date | undefined | null>(null);
  const serverPlanned = useMemo(() => invoice?.payment_date ? new Date(invoice.payment_date) : undefined, [invoice?.payment_date]);
  const serverActual = useMemo(() => invoice?.actual_payment_date ? new Date(invoice.actual_payment_date) : undefined, [invoice?.actual_payment_date]);
  const plannedPaymentDate = plannedDraft === null ? serverPlanned : plannedDraft;
  const actualPaymentDate = actualDraft === null ? serverActual : actualDraft;
  const [updatingPaymentDate, setUpdatingPaymentDate] = useState(false);
  const handleStatusChangeRequest = (
    newStatus: "draft" | "sent" | "paid" | "cancelled",
  ) => {
    const labels = {
      draft: "Черновик",
      sent: "Отправлен",
      paid: "Оплачен",
      cancelled: "Отменён",
    };

    // Требуем подтверждение только для финальных статусов
    if (newStatus === "paid" || newStatus === "cancelled") {
      // Check if there's unspent reserve when trying to mark as paid
      if (newStatus === "paid") {
        const reservedAmount = invoice?.planned_expenses
          ? parseNum(invoice.planned_expenses)
          : 0;
        // Only count expenses paid by partner (from client money) as spent from reserve
        const spentFromReserve = expenses
          .filter((e) => e.paidByAdmin !== true)
          .reduce((sum: number, e) => sum + parseNum(e.amount || "0"), 0);
        const remainingReserve = reservedAmount - spentFromReserve;

        if (remainingReserve > 0) {
          setPendingStatusChange({
            status: newStatus,
            label: labels[newStatus],
            hasUnspentReserve: true,
            remainingReserve: remainingReserve,
          });
          return;
        }
      }
      setPendingStatusChange({ status: newStatus, label: labels[newStatus] });
    } else {
      handleStatusChange(newStatus);
    }
  };
  const handleStatusChange = async (
    newStatus: "draft" | "sent" | "paid" | "cancelled",
  ) => {
    try {
      await apiPatch(`/invoices/${invoiceId}`, { status: newStatus });
      toast({
        title: "Успешно",
        description: "Статус обновлен",
      });
      await fetchInvoiceDetails();
    } catch (error: unknown) {
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }
  };
  const confirmStatusChange = async () => {
    if (!pendingStatusChange || !invoice) return;

    setUpdatingStatus(true);

    const previousStatus = invoice.status;
    setStatus(pendingStatusChange.status);

    try {
      await apiPatch(`/invoices/${invoiceId}`, {
        status: pendingStatusChange.status,
      });
      toast({
        title: "Успешно",
        description: "Статус обновлён",
      });
      await fetchInvoiceDetails();
    } catch (error: unknown) {
      setStatus(previousStatus);
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }

    setPendingStatusChange(null);
    setUpdatingStatus(false);
  };
  const handleUpdatePlannedDate = async (newDate: Date | undefined) => {
    if (!invoiceId) return;

    setUpdatingPaymentDate(true);
    const formattedDate = newDate ? format(newDate, "yyyy-MM-dd") : null;

    try {
      await apiPatch(`/invoices/${invoiceId}`, { paymentDate: formattedDate });
      toast({
        title: "Успешно",
        description: newDate
          ? "Планируемая дата оплаты установлена"
          : "Планируемая дата оплаты удалена",
      });
      await fetchInvoiceDetails();
    } catch (error: unknown) {
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }

    setPlannedPaymentDate(null);
    setUpdatingPaymentDate(false);
  };
  const handleUpdateActualPaymentDate = async (newDate: Date | undefined) => {
    if (!invoiceId || !invoice) return;

    setUpdatingPaymentDate(true);

    const formattedDate = newDate ? format(newDate, "yyyy-MM-dd") : null;
    const newStatus = newDate
      ? "paid"
      : invoice.status === "paid"
        ? "sent"
        : invoice.status;

    try {
      await apiPatch(`/invoices/${invoiceId}`, {
        actualPaymentDate: formattedDate,
        status: newStatus,
      });
      toast({
        title: "Успешно",
        description: newDate
          ? "Фактическая дата оплаты установлена, статус обновлён на 'Оплачен'"
          : "Фактическая дата оплаты удалена",
      });
      await fetchInvoiceDetails();
    } catch (error: unknown) {
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }

    setActualPaymentDate(null);
    setUpdatingPaymentDate(false);
  };
  return {
    pendingStatusChange, setPendingStatusChange, updatingStatus, setUpdatingStatus,
    plannedPaymentDate, setPlannedPaymentDate, actualPaymentDate, setActualPaymentDate,
    updatingPaymentDate, setUpdatingPaymentDate, handleStatusChangeRequest, handleStatusChange,
    confirmStatusChange, handleUpdatePlannedDate, handleUpdateActualPaymentDate,
  };
}
