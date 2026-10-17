import { useInvoice } from "@/hooks/useInvoice";
import type { ExpenseDto } from "@shared/contracts";
import { parseNum } from "@shared/financialEngine";
import { useState, useEffect } from "react";

import { isAgencyScheme, normalizeCalculations } from "@/lib/invoiceHelpers";

import { formatCurrency } from "@/lib/invoiceCalculations";

import { format } from "date-fns";

import { useToast } from "@/hooks/use-toast";
import { getVisibleFields, UserRole } from "@/lib/invoicePermissions";
import { apiPost, apiPatch, apiDelete } from "@/lib/api";
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
  const fetchInvoiceDetails = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/partner/stats"] }),
      queryClient.invalidateQueries({
        queryKey: ["/api/do-not-spend/partner-schemes"],
      }),
      queryClient.invalidateQueries({ queryKey: ["/api/do-not-spend/agency"] }),
    ]);
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);
  const [editExpenseOpen, setEditExpenseOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<
    (ExpenseDto & { invoice_id?: string; amount: string }) | null
  >(null);
  const [deleteExpense, setDeleteExpense] = useState<{
    id: string;
    description: string;
  } | null>(null);
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(
    null,
  );
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
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertUnit, setConvertUnit] = useState<"month" | "day" | "hour">(
    "month",
  );
  const [convertPrice, setConvertPrice] = useState<string>("");
  const [convertTotal, setConvertTotal] = useState<string>("");
  const [converting, setConverting] = useState(false);
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
  const handleDeleteExpense = async () => {
    if (!deleteExpense) return;
    setDeletingExpenseId(deleteExpense.id);

    try {
      await apiDelete(`/expenses/${deleteExpense.id}`);
      toast({
        title: "Успешно",
        description: "Расход удалён",
      });

      // Invalidate all invoice-related caches to update partner debt everywhere
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/partner/stats"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/do-not-spend/partner-schemes"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/do-not-spend/agency"] });

      fetchInvoiceDetails();
    } catch (error: unknown) {
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }

    setDeleteExpense(null);
    setDeletingExpenseId(null);
  };
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
      fetchInvoiceDetails();
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
      fetchInvoiceDetails();
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
      fetchInvoiceDetails();
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
      fetchInvoiceDetails();
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
      fetchInvoiceDetails();
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
      fetchInvoiceDetails();
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
      fetchInvoiceDetails();
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
      fetchInvoiceDetails();
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

      queryClient.invalidateQueries({
        queryKey: ["/api/do-not-spend/partner-schemes"],
      });
      fetchInvoiceDetails();
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
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assistant/stats"] });

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
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/client/budget"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/client/overview-buckets"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/client/budget"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/client/overview-buckets"],
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
  const handleConvertToSubscription = async () => {
    if (!invoiceId) return;
    const price = parseNum(convertPrice);
    const total = parseInt(convertTotal, 10);
    if (!Number.isFinite(price) || price <= 0) {
      toast({
        title: "Ошибка",
        description: "Цена за единицу должна быть > 0",
        variant: "destructive",
      });
      return;
    }
    if (!Number.isInteger(total) || total < 1) {
      toast({
        title: "Ошибка",
        description: "Количество должно быть ≥ 1",
        variant: "destructive",
      });
      return;
    }
    setConverting(true);
    try {
      await apiPatch(`/invoices/${invoiceId}`, {
        serviceType: "periodic",
        periodUnit: convertUnit,
        pricePerPeriod: price.toString(),
        totalPeriods: total,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/client/budget"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/client/overview-buckets"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      await fetchInvoiceDetails();
      setConvertOpen(false);
      setConvertPrice("");
      setConvertTotal("");
      toast({ title: "Готово", description: "Счёт превращён в подписку." });
    } catch (error: unknown) {
      toast({
        title: "Ошибка",
        description:
          (error instanceof Error ? error.message : String(error)) ||
          "Не удалось превратить счёт",
        variant: "destructive",
      });
    } finally {
      setConverting(false);
    }
  };
  const handleSetPeriod = async (closed: boolean) => {
    if (!invoiceId || !invoice || converting) return;
    const period = Number(invoice.periods_used ?? 0) + (closed ? 1 : 0);
    setConverting(true);
    try {
      await apiPost(`/invoices/${invoiceId}/periods`, { period, closed });
      await queryClient.invalidateQueries();
      await fetchInvoiceDetails();
      toast({ title: closed ? `Период ${period} закрыт` : `Закрытие периода ${period} отменено` });
    } catch (error) {
      toast({ title: "Ошибка", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
      await fetchInvoiceDetails();
    } finally { setConverting(false); }
  };
  const handleRevertToOneTime = async () => {
    if (!invoiceId) return;
    if (
      !confirm(
        "Превратить подписку обратно в разовый счёт? Цена за период и количество периодов будут очищены.",
      )
    )
      return;
    setConverting(true);
    try {
      await apiPatch(`/invoices/${invoiceId}`, {
        serviceType: "one_time",
        pricePerPeriod: null,
        totalPeriods: null,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/client/budget"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/client/overview-buckets"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      await fetchInvoiceDetails();
      toast({
        title: "Готово",
        description: "Подписка превращена обратно в разовый счёт.",
      });
    } catch (error: unknown) {
      toast({
        title: "Ошибка",
        description:
          (error instanceof Error ? error.message : String(error)) ||
          "Не удалось преобразовать",
        variant: "destructive",
      });
    } finally {
      setConverting(false);
    }
  };
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
    toast,
    queryClient,
    invoice,
    setStatus,
    expenses,
    loading,
    error,
    fetchInvoiceDetails,
    addExpenseOpen,
    setAddExpenseOpen,
    editExpenseOpen,
    setEditExpenseOpen,
    editingExpense,
    setEditingExpense,
    deleteExpense,
    setDeleteExpense,
    deletingExpenseId,
    setDeletingExpenseId,
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
    convertOpen,
    setConvertOpen,
    convertUnit,
    setConvertUnit,
    convertPrice,
    setConvertPrice,
    convertTotal,
    setConvertTotal,
    converting,
    setConverting,
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
    handleDeleteExpense,
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
    handleConvertToSubscription,
    handleRevertToOneTime,
    handleSetPeriod,
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
