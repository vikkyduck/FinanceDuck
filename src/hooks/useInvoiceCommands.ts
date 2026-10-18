import { useInvoiceExpenseActions } from './useInvoiceExpenseActions';
import { useInvoicePeriodCommands } from './useInvoicePeriodCommands';
import { invalidateFinancialQueries } from '@/lib/financialQueries';
import { useInvoice } from "@/hooks/useInvoice";
import { parseNum } from "@shared/financialEngine";
import { useState, useEffect } from "react";

import { isAgencyScheme, normalizeCalculations } from "@/lib/invoiceHelpers";

import { formatCurrency } from "@/lib/invoiceCalculations";

import { format } from "date-fns";

import { useToast } from "@/hooks/use-toast";
import { getVisibleFields, UserRole } from "@/lib/invoicePermissions";
import { apiPatch } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";

export function useInvoiceCommands({
  open,
  invoiceId,
  canEdit = false,
  userRole = "client",
}: {
  open: boolean;
  invoiceId: string | null;
  canEdit?: boolean;
  userRole?: UserRole;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { invoice, setStatus, expenses, loading, error } = useInvoice(
    invoiceId,
    open,
  );
  const fetchInvoiceDetails = () => invalidateFinancialQueries(queryClient);
  const [pendingStatusChange, setPendingStatusChange] = useState<{
    status: "draft" | "sent" | "paid" | "cancelled";
    label: string;
    hasUnspentReserve?: boolean;
    remainingReserve?: number;
  } | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [plannedPaymentDate, setPlannedPaymentDate] = useState<
    Date | undefined
  >(undefined);
  const [actualPaymentDate, setActualPaymentDate] = useState<Date | undefined>(
    undefined,
  );
  const [updatingPaymentDate, setUpdatingPaymentDate] = useState(false);
  const [notes, setNotes] = useState("");
  const [updatingNotes, setUpdatingNotes] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [updatingInvoiceNumber, setUpdatingInvoiceNumber] = useState(false);
  const [partnerRate, setPartnerRate] = useState<number | "">("");
  const [updatingPartnerRate, setUpdatingPartnerRate] = useState(false);
  const [clientBillEdit, setClientBillEdit] = useState<number | "">("");
  const [updatingClientBill, setUpdatingClientBill] = useState(false);
  const [hideFromAssistant, setHideFromAssistant] = useState(false);
  const [updatingHideFromAssistant, setUpdatingHideFromAssistant] =
    useState(false);
  const [messageInvoiceOpen, setMessageInvoiceOpen] = useState(false);
  const [messageExpense, setMessageExpense] = useState<{
    id: string;
    description: string;
    amount: number | null;
  } | null>(null);
  const [clientTitleEdit, setClientTitleEdit] = useState<string>("");
  const [updatingClientTitle, setUpdatingClientTitle] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveClientId, setMoveClientId] = useState<string>("");
  const [movingInvoice, setMovingInvoice] = useState(false);
  const [plannedExpensesEdit, setPlannedExpensesEdit] = useState<number | "">(
    "",
  );
  const [updatingPlannedExpenses, setUpdatingPlannedExpenses] = useState(false);
  useEffect(() => {
    if (invoice?.payment_date) {
      setPlannedPaymentDate(new Date(invoice.payment_date));
    } else {
      setPlannedPaymentDate(undefined);
    }

    if (invoice?.actual_payment_date) {
      setActualPaymentDate(new Date(invoice.actual_payment_date));
    } else {
      setActualPaymentDate(undefined);
    }

    setNotes(invoice?.notes || "");
    setInvoiceNumber(invoice?.invoice_number || "");

    // Сбрасываем локальное значение процента партнёра при смене счёта
    if (invoice?.scheme === "commission_based") {
      const calcRaw = invoice?.invoice_calculations ?? null;
      const calc = normalizeCalculations(calcRaw);
      const rate =
        calc?.commission_rate ?? invoice.partner_commission_rate ?? 10;
      setPartnerRate(rate);
    } else {
      setPartnerRate("");
    }

    // Устанавливаем значение client_bill для редактирования
    if (invoice) {
      const calcRaw = invoice?.invoice_calculations ?? null;
      const calc = normalizeCalculations(calcRaw);
      const bill = calc?.client_bill ?? invoice.client_bill ?? 0;
      setClientBillEdit(bill);
      setHideFromAssistant(invoice.hidden_from_assistant || false);

      // Устанавливаем значение planned_expenses для партнёрских схем
      const plannedExp = invoice.planned_expenses
        ? parseNum(invoice.planned_expenses)
        : 0;
      setPlannedExpensesEdit(plannedExp);

      // Текущее число закрытых периодов

      // Текущее «Название для клиента»
      setClientTitleEdit(invoice.client_title ?? "");
    }
  }, [invoice]);
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

    setUpdatingPaymentDate(false);
  };
  const handleUpdateNotes = async () => {
    if (!invoiceId) return;

    setUpdatingNotes(true);

    try {
      await apiPatch(`/invoices/${invoiceId}`, { notes: notes.trim() || null });
      toast({
        title: "Успешно",
        description: "Комментарий обновлён",
      });
      await fetchInvoiceDetails();
    } catch (error: unknown) {
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }

    setUpdatingNotes(false);
  };
  const handleUpdateInvoiceNumber = async () => {
    if (!invoiceId) return;

    const trimmedNumber = invoiceNumber.trim();
    if (!trimmedNumber) {
      toast({
        title: "Ошибка",
        description: "Номер счета не может быть пустым",
        variant: "destructive",
      });
      return;
    }

    setUpdatingInvoiceNumber(true);

    try {
      await apiPatch(`/invoices/${invoiceId}`, {
        invoiceNumber: trimmedNumber,
      });
      toast({
        title: "Успешно",
        description: "Номер счета обновлён",
      });
      await fetchInvoiceDetails();
    } catch (error: unknown) {
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }

    setUpdatingInvoiceNumber(false);
  };
  const handleUpdateCommission = async (rate: number) => {
    if (!invoiceId || !invoice) return;

    // Комиссию можно изменять только для комиссионной схемы
    if (invoice.scheme !== "commission_based") {
      toast({
        title: "Недопустимая операция",
        description:
          "Процент партнёра можно изменять только для комиссионной схемы",
        variant: "destructive",
      });
      return;
    }

    // Базовая валидация диапазона
    if (Number.isNaN(rate) || rate < 0 || rate > 100) {
      toast({
        title: "Некорректное значение",
        description: "Процент партнёра должен быть в диапазоне от 0 до 100",
        variant: "destructive",
      });
      return;
    }

    // Если значение не поменялось — ничего не делаем
    const currentRate =
      (Array.isArray(invoice.invoice_calculations)
        ? invoice.invoice_calculations[0]?.commission_rate
        : invoice.invoice_calculations?.commission_rate) ??
      invoice.partner_commission_rate ??
      10;
    if (currentRate === rate) return;

    try {
      setUpdatingPartnerRate(true);
      await apiPatch(`/invoices/${invoiceId}`, {
        partnerCommissionRate: rate,
        calculations: { commissionRate: rate },
      });
      toast({
        title: "Успешно",
        description: `Комиссия ${rate}% установлена, расчёты будут обновлены`,
      });
      await fetchInvoiceDetails();
    } catch (error: unknown) {
      toast({
        title: "Системная ошибка",
        description:
          (error instanceof Error ? error.message : String(error)) ??
          "Не удалось обновить процент партнёра",
        variant: "destructive",
      });
    } finally {
      setUpdatingPartnerRate(false);
    }
  };
  const handleUpdateClientBill = async (newBill: number) => {
    if (!invoiceId || !invoice) return;

    if (Number.isNaN(newBill) || newBill < 0) {
      toast({
        title: "Некорректное значение",
        description: "Сумма счёта должна быть положительным числом",
        variant: "destructive",
      });
      return;
    }

    const calcRaw = invoice?.invoice_calculations ?? null;
    const calc = normalizeCalculations(calcRaw);
    const currentBill = calc?.client_bill ?? invoice.client_bill ?? 0;
    if (currentBill === newBill) return;

    try {
      setUpdatingClientBill(true);
      await apiPatch(`/invoices/${invoiceId}`, {
        clientBill: newBill,
        calculations: { clientBill: newBill.toString() },
      });
      toast({
        title: "Успешно",
        description: `Сумма счёта обновлена: ${formatCurrency(newBill)}`,
      });
      await fetchInvoiceDetails();
    } catch (error: unknown) {
      toast({
        title: "Системная ошибка",
        description:
          (error instanceof Error ? error.message : String(error)) ??
          "Не удалось обновить сумму счёта",
        variant: "destructive",
      });
    } finally {
      setUpdatingClientBill(false);
    }
  };
  const handleUpdatePlannedExpenses = async (newAmount: number) => {
    if (!invoiceId || !invoice) return;

    if (Number.isNaN(newAmount) || newAmount < 0) {
      toast({
        title: "Некорректное значение",
        description: "Планируемые расходы должны быть положительным числом",
        variant: "destructive",
      });
      return;
    }

    const currentAmount = invoice.planned_expenses
      ? parseNum(invoice.planned_expenses)
      : 0;
    if (currentAmount === newAmount) return;

    try {
      setUpdatingPlannedExpenses(true);
      await apiPatch(`/invoices/${invoiceId}`, {
        plannedExpenses: newAmount.toString(),
      });
      toast({
        title: "Успешно",
        description: `Планируемые расходы обновлены: ${formatCurrency(newAmount)}`,
      });

      await fetchInvoiceDetails();
    } catch (error: unknown) {
      toast({
        title: "Системная ошибка",
        description:
          (error instanceof Error ? error.message : String(error)) ??
          "Не удалось обновить планируемые расходы",
        variant: "destructive",
      });
    } finally {
      setUpdatingPlannedExpenses(false);
    }
  };
  const handleToggleHideFromAssistant = async (newValue: boolean) => {
    if (!invoiceId) return;

    setUpdatingHideFromAssistant(true);

    try {
      await apiPatch(`/invoices/${invoiceId}`, { hideFromAssistant: newValue });
      setHideFromAssistant(newValue);

      // Invalidate invoices cache so lists update immediately

      toast({
        title: "Успешно",
        description: newValue
          ? "Счёт скрыт от ассистента"
          : "Счёт виден ассистенту",
      });
    } catch (error: unknown) {
      toast({
        title: "Ошибка",
        description:
          (error instanceof Error ? error.message : String(error)) ??
          "Не удалось обновить настройку",
        variant: "destructive",
      });
    } finally {
      setUpdatingHideFromAssistant(false);
    }
  };
  const handleMoveInvoice = async () => {
    if (!invoiceId || !moveClientId) return;
    if (moveClientId === invoice?.client_id) {
      toast({
        title: "Это тот же клиент",
        description: "Выберите другого клиента.",
      });
      return;
    }
    if (
      !confirm(
        "Перенести счёт другому клиенту? Все списания, расчёты и история останутся привязаны к счёту.",
      )
    )
      return;
    setMovingInvoice(true);
    try {
      await apiPatch(`/invoices/${invoiceId}`, { clientId: moveClientId });
      await fetchInvoiceDetails();
      setMoveOpen(false);
      setMoveClientId("");
      toast({
        title: "Перенесено",
        description: "Счёт теперь у другого клиента.",
      });
    } catch (error: unknown) {
      toast({
        title: "Ошибка",
        description:
          (error instanceof Error ? error.message : String(error)) ||
          "Не удалось перенести счёт",
        variant: "destructive",
      });
    } finally {
      setMovingInvoice(false);
    }
  };
  const handleSaveClientTitle = async () => {
    if (!invoiceId) return;
    const trimmed = clientTitleEdit.trim();
    setUpdatingClientTitle(true);
    try {
      await apiPatch(`/invoices/${invoiceId}`, {
        clientTitle: trimmed || null,
      });
      await fetchInvoiceDetails();
      toast({
        title: "Сохранено",
        description: trimmed
          ? "Название клиенту обновлено."
          : "Название убрано.",
      });
    } catch (error: unknown) {
      toast({
        title: "Ошибка",
        description:
          (error instanceof Error ? error.message : String(error)) ||
          "Не удалось сохранить",
        variant: "destructive",
      });
    } finally {
      setUpdatingClientTitle(false);
    }
  };
  const expenseActions = useInvoiceExpenseActions();
  const periodActions = useInvoicePeriodCommands({ invoiceId, invoice, refresh: fetchInvoiceDetails });
  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      draft: "Черновик",
      sent: "Отправлен",
      paid: "Оплачен",
      cancelled: "Отменен",
    };
    return labels[status] || status;
  };
  const calcRaw = invoice?.invoice_calculations ?? null;
  const calc = normalizeCalculations(calcRaw);
  const isAgency30 = isAgencyScheme(invoice?.scheme);
  const permissions = getVisibleFields(
    userRole,
    invoice?.scheme ?? "agency_30",
  );
  return {
    ...expenseActions, ...periodActions,
    toast,
    queryClient,
    invoice,
    setStatus,
    expenses,
    loading,
    error,
    fetchInvoiceDetails,
    pendingStatusChange,
    setPendingStatusChange,
    updatingStatus,
    setUpdatingStatus,
    plannedPaymentDate,
    setPlannedPaymentDate,
    actualPaymentDate,
    setActualPaymentDate,
    updatingPaymentDate,
    setUpdatingPaymentDate,
    notes,
    setNotes,
    updatingNotes,
    setUpdatingNotes,
    invoiceNumber,
    setInvoiceNumber,
    updatingInvoiceNumber,
    setUpdatingInvoiceNumber,
    partnerRate,
    setPartnerRate,
    updatingPartnerRate,
    setUpdatingPartnerRate,
    clientBillEdit,
    setClientBillEdit,
    updatingClientBill,
    setUpdatingClientBill,
    hideFromAssistant,
    setHideFromAssistant,
    updatingHideFromAssistant,
    setUpdatingHideFromAssistant,
    messageInvoiceOpen,
    setMessageInvoiceOpen,
    messageExpense,
    setMessageExpense,
    clientTitleEdit,
    setClientTitleEdit,
    updatingClientTitle,
    setUpdatingClientTitle,
    moveOpen,
    setMoveOpen,
    moveClientId,
    setMoveClientId,
    movingInvoice,
    setMovingInvoice,
    plannedExpensesEdit,
    setPlannedExpensesEdit,
    updatingPlannedExpenses,
    setUpdatingPlannedExpenses,
    handleStatusChangeRequest,
    handleStatusChange,
    confirmStatusChange,
    handleUpdatePlannedDate,
    handleUpdateActualPaymentDate,
    handleUpdateNotes,
    handleUpdateInvoiceNumber,
    handleUpdateCommission,
    handleUpdateClientBill,
    handleUpdatePlannedExpenses,
    handleToggleHideFromAssistant,
    handleMoveInvoice,
    handleSaveClientTitle,
    getStatusLabel,
    calcRaw,
    calc,
    isAgency30,
    permissions,
    open,
    invoiceId,
    canEdit,
    userRole,
  };
}
export type InvoiceDetailsModel = ReturnType<typeof useInvoiceCommands>;
