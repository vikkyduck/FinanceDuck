import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { isAgencyScheme, normalizeCalculations } from "@/lib/invoiceHelpers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { formatCurrency, formatDate, getSchemeLabel, calculateInvoice } from "@/lib/invoiceCalculations";
import { CalendarIcon, Plus, Trash2, FileText, Loader2, X, MessageSquare } from "lucide-react";
import { SendMessageDialog } from "@/components/messages/SendMessageDialog";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { AddExpenseDialog } from "./assistant/AddExpenseDialog";
import { ClientCombobox } from "./assistant/ClientCombobox";
import { EditExpenseDialog } from "./assistant/EditExpenseDialog";
import { SignedActsSection } from "./SignedActsSection";
import { useToast } from "@/hooks/use-toast";
import { getVisibleFields, UserRole } from "@/lib/invoicePermissions";
import { apiGet, apiPatch, apiDelete, apiPost } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { InvoiceWaterfallChart } from "./InvoiceWaterfallChart";
import { CatShareBadge } from "./CatShareBadge";
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

export const InvoiceDetailsDialog = ({ open, onOpenChange, invoiceId, canEdit = false, userRole = 'client' }: InvoiceDetailsDialogProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [invoice, setInvoice] = useState<any>(null);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);
  const [editExpenseOpen, setEditExpenseOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const [deleteExpense, setDeleteExpense] = useState<{id: string, description: string} | null>(null);
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);
  
  const [pendingStatusChange, setPendingStatusChange] = useState<{
    status: "draft" | "sent" | "paid" | "cancelled",
    label: string,
    hasUnspentReserve?: boolean,
    remainingReserve?: number
  } | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  
  const [plannedPaymentDate, setPlannedPaymentDate] = useState<Date | undefined>(undefined);
  const [actualPaymentDate, setActualPaymentDate] = useState<Date | undefined>(undefined);
  const [updatingPaymentDate, setUpdatingPaymentDate] = useState(false);
  
  const [notes, setNotes] = useState("");
  const [updatingNotes, setUpdatingNotes] = useState(false);
  
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [updatingInvoiceNumber, setUpdatingInvoiceNumber] = useState(false);

  // Локальное состояние для редактируемого процента партнёра (для админа)
  const [partnerRate, setPartnerRate] = useState<number | ''>('');
  const [updatingPartnerRate, setUpdatingPartnerRate] = useState(false);
  
  // Состояние для редактирования суммы счёта (client_bill) для админа
  const [clientBillEdit, setClientBillEdit] = useState<number | ''>('');
  const [updatingClientBill, setUpdatingClientBill] = useState(false);

  // Состояние для скрытия от ассистента (только для админа)
  const [hideFromAssistant, setHideFromAssistant] = useState(false);
  const [updatingHideFromAssistant, setUpdatingHideFromAssistant] = useState(false);

  // Периодические услуги — управление числом закрытых периодов.
  const [periodsUsedEdit, setPeriodsUsedEdit] = useState<number | ''>('');
  const [updatingPeriodsUsed, setUpdatingPeriodsUsed] = useState(false);
  const [closingPeriod, setClosingPeriod] = useState(false);
  // Сообщения по счёту/списанию.
  const [messageInvoiceOpen, setMessageInvoiceOpen] = useState(false);
  const [messageExpense, setMessageExpense] = useState<{ id: string; description: string; amount: number } | null>(null);

  // Конвертация one_time → periodic (превратить в подписку).
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertUnit, setConvertUnit] = useState<'month' | 'day' | 'hour'>('month');
  const [convertPrice, setConvertPrice] = useState<string>('');
  const [convertTotal, setConvertTotal] = useState<string>('');
  const [converting, setConverting] = useState(false);

  // Название для клиента (отдельно от notes/description).
  const [clientTitleEdit, setClientTitleEdit] = useState<string>('');
  const [updatingClientTitle, setUpdatingClientTitle] = useState(false);

  // Перенос счёта между клиентами (admin only).
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveClientId, setMoveClientId] = useState<string>('');
  const [movingInvoice, setMovingInvoice] = useState(false);

  // Состояние для планируемых расходов (только для партнёрских схем и админа)
  const [plannedExpensesEdit, setPlannedExpensesEdit] = useState<number | ''>('');
  const [updatingPlannedExpenses, setUpdatingPlannedExpenses] = useState(false);

  useEffect(() => {
    if (open && invoiceId) {
      fetchInvoiceDetails();
    }
  }, [open, invoiceId]);

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
    if (invoice?.scheme === 'commission_based') {
      const calcRaw = invoice.invoice_calculations;
      const calc = normalizeCalculations(calcRaw);
      const rate = calc?.commission_rate ?? invoice.partner_commission_rate ?? 10;
      setPartnerRate(rate);
    } else {
      setPartnerRate('');
    }
    
    // Устанавливаем значение client_bill для редактирования
    if (invoice) {
      const calcRaw = invoice.invoice_calculations;
      const calc = normalizeCalculations(calcRaw);
      const bill = calc?.client_bill ?? invoice.client_bill ?? 0;
      setClientBillEdit(bill);
      setHideFromAssistant(invoice.hidden_from_assistant || false);

      // Устанавливаем значение planned_expenses для партнёрских схем
      const plannedExp = invoice.planned_expenses ? parseFloat(invoice.planned_expenses) : 0;
      setPlannedExpensesEdit(plannedExp);

      // Текущее число закрытых периодов
      setPeriodsUsedEdit(invoice.periods_used ?? 0);

      // Текущее «Название для клиента»
      setClientTitleEdit(invoice.client_title ?? "");
    }
  }, [invoice]);

  const fetchInvoiceDetails = async () => {
    setLoading(true);

    try {
      if (!invoiceId) {
        setLoading(false);
        return;
      }

      const [invoiceData, expensesData] = await Promise.all([
        apiGet<any>(`/invoices/${invoiceId}`),
        apiGet<any[]>(`/invoices/${invoiceId}/expenses`).catch(() => [])
      ]);

      const mappedInvoice = {
        id: invoiceData.id,
        invoice_number: invoiceData.invoiceNumber,
        client_id: invoiceData.clientId,
        partner_id: invoiceData.partnerId,
        scheme: invoiceData.scheme,
        status: invoiceData.status,
        payment_date: invoiceData.paymentDate,
        actual_payment_date: invoiceData.actualPaymentDate,
        notes: invoiceData.notes,
        created_at: invoiceData.createdAt,
        hidden_from_assistant: invoiceData.hideFromAssistant,
        planned_expenses: invoiceData.plannedExpenses,
        clients: invoiceData.client ? { name: invoiceData.client.name } : null,
        partners: invoiceData.partner ? { name: invoiceData.partner.name } : null,
        client_bill: invoiceData.calculations?.clientBill || invoiceData.clientBill,
        partner_commission_rate: invoiceData.calculations?.commissionRate,
        client_title: invoiceData.clientTitle ?? null,
        service_type:    invoiceData.serviceType    ?? 'one_time',
        period_unit:     invoiceData.periodUnit     ?? 'month',
        price_per_period: invoiceData.pricePerPeriod,
        total_periods:   invoiceData.totalPeriods,
        periods_used:    invoiceData.periodsUsed ?? 0,
        invoice_calculations: invoiceData.calculations ? {
          client_bill: invoiceData.calculations.clientBill,
          commission_rate: invoiceData.calculations.commissionRate,
          commission_amount: invoiceData.calculations.commissionAmount,
          amount_to_admin: invoiceData.calculations.amountToAdmin,
          partner_transfer_due: invoiceData.calculations.partnerTransferDue,
          agency_margin: invoiceData.calculations.agencyMargin,
          partner_share_from_margin: invoiceData.calculations.partnerShareFromMargin,
          admin_share_from_margin: invoiceData.calculations.adminShareFromMargin,
          client_base_after_margin: invoiceData.calculations.clientBaseAfterMargin,
          client_spent: invoiceData.calculations.clientSpent,
          executor_expenses_total: invoiceData.calculations.executorExpensesTotal,
          net_profit_admin: invoiceData.calculations.netProfitAdmin,
          admin_share_50: invoiceData.calculations.adminShare50,
          cat_share_50: invoiceData.calculations.catShare50,
          client_remaining: invoiceData.calculations.clientRemaining,
        } : null,
      };

      setInvoice(mappedInvoice);

      const mappedExpenses = (expensesData || []).map((exp: any) => ({
        id: exp.id,
        invoice_id: exp.invoiceId,
        description: exp.description,
        amount: exp.amount,
        date: exp.date,
        notes: exp.notes,
        paidByAdmin: exp.paidByAdmin === true,
      }));
      setExpenses(mappedExpenses);
    } catch (error: any) {
      console.error("[InvoiceDetailsDialog] === FETCH FAILED ===", error);
      toast({
        title: "Ошибка загрузки",
        description: error.message || "Не удалось загрузить детали счёта",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

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
      queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/partner/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/do-not-spend/partner-schemes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/do-not-spend/agency'] });
      
      fetchInvoiceDetails();
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    }
    
    setDeleteExpense(null);
    setDeletingExpenseId(null);
  };

  const handleStatusChangeRequest = (newStatus: "draft" | "sent" | "paid" | "cancelled") => {
    const labels = {
      draft: "Черновик",
      sent: "Отправлен",
      paid: "Оплачен",
      cancelled: "Отменён"
    };
    
    // Требуем подтверждение только для финальных статусов
    if (newStatus === "paid" || newStatus === "cancelled") {
      // Check if there's unspent reserve when trying to mark as paid
      if (newStatus === "paid") {
        const reservedAmount = invoice?.planned_expenses ? parseFloat(invoice.planned_expenses) : 0;
        // Only count expenses paid by partner (from client money) as spent from reserve
        const spentFromReserve = expenses
          .filter((e: any) => e.paidByAdmin !== true)
          .reduce((sum: number, e: any) => sum + parseFloat(e.amount || "0"), 0);
        const remainingReserve = reservedAmount - spentFromReserve;
        
        if (remainingReserve > 0) {
          setPendingStatusChange({ 
            status: newStatus, 
            label: labels[newStatus],
            hasUnspentReserve: true,
            remainingReserve: remainingReserve
          });
          return;
        }
      }
      setPendingStatusChange({ status: newStatus, label: labels[newStatus] });
    } else {
      handleStatusChange(newStatus);
    }
  };

  const handleStatusChange = async (newStatus: "draft" | "sent" | "paid" | "cancelled") => {
    try {
      await apiPatch(`/invoices/${invoiceId}`, { status: newStatus });
      toast({
        title: "Успешно",
        description: "Статус обновлен",
      });
      fetchInvoiceDetails();
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const confirmStatusChange = async () => {
    if (!pendingStatusChange) return;
    
    setUpdatingStatus(true);
    
    const previousStatus = invoice.status;
    setInvoice((prev: any) => ({ ...prev, status: pendingStatusChange.status }));
    
    try {
      await apiPatch(`/invoices/${invoiceId}`, { status: pendingStatusChange.status });
      toast({
        title: "Успешно",
        description: "Статус обновлён",
      });
      fetchInvoiceDetails();
    } catch (error: any) {
      setInvoice((prev: any) => ({ ...prev, status: previousStatus }));
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    }
    
    setPendingStatusChange(null);
    setUpdatingStatus(false);
  };

  const handleUpdatePlannedDate = async (newDate: Date | undefined) => {
    if (!invoiceId) return;
    
    setUpdatingPaymentDate(true);
    const formattedDate = newDate ? format(newDate, 'yyyy-MM-dd') : null;
    
    try {
      await apiPatch(`/invoices/${invoiceId}`, { paymentDate: formattedDate });
      toast({
        title: "Успешно",
        description: newDate 
          ? "Планируемая дата оплаты установлена"
          : "Планируемая дата оплаты удалена",
      });
      fetchInvoiceDetails();
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    }
    
    setUpdatingPaymentDate(false);
  };

  const handleUpdateActualPaymentDate = async (newDate: Date | undefined) => {
    if (!invoiceId) return;
    
    setUpdatingPaymentDate(true);
    
    const formattedDate = newDate ? format(newDate, 'yyyy-MM-dd') : null;
    const newStatus = newDate ? 'paid' : (invoice.status === 'paid' ? 'sent' : invoice.status);
    
    try {
      await apiPatch(`/invoices/${invoiceId}`, { 
        actualPaymentDate: formattedDate,
        status: newStatus
      });
      toast({
        title: "Успешно",
        description: newDate 
          ? "Фактическая дата оплаты установлена, статус обновлён на 'Оплачен'"
          : "Фактическая дата оплаты удалена",
      });
      fetchInvoiceDetails();
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error.message,
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
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error.message,
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
      await apiPatch(`/invoices/${invoiceId}`, { invoiceNumber: trimmedNumber });
      toast({
        title: "Успешно",
        description: "Номер счета обновлён",
      });
      fetchInvoiceDetails();
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    }
    
    setUpdatingInvoiceNumber(false);
  };

  const handleUpdateCommission = async (rate: number) => {
    if (!invoiceId || !invoice) return;

    // Комиссию можно изменять только для комиссионной схемы
    if (invoice.scheme !== 'commission_based') {
      toast({
        title: "Недопустимая операция",
        description: "Процент партнёра можно изменять только для комиссионной схемы",
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
    const currentRate = (Array.isArray(invoice.invoice_calculations)
      ? invoice.invoice_calculations[0]?.commission_rate
      : invoice.invoice_calculations?.commission_rate) ?? invoice.partner_commission_rate ?? 10;
    if (currentRate === rate) return;

    try {
      setUpdatingPartnerRate(true);
      await apiPatch(`/invoices/${invoiceId}`, { 
        partnerCommissionRate: rate,
        calculations: { commissionRate: rate }
      });
      toast({
        title: "Успешно",
        description: `Комиссия ${rate}% установлена, расчёты будут обновлены`,
      });
      fetchInvoiceDetails();
    } catch (error: any) {
      toast({
        title: "Системная ошибка",
        description: error.message ?? "Не удалось обновить процент партнёра",
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

    const calcRaw = invoice.invoice_calculations;
    const calc = normalizeCalculations(calcRaw);
    const currentBill = calc?.client_bill ?? invoice.client_bill ?? 0;
    if (currentBill === newBill) return;

    try {
      setUpdatingClientBill(true);
      await apiPatch(`/invoices/${invoiceId}`, { 
        clientBill: newBill,
        calculations: { clientBill: newBill.toString() }
      });
      toast({
        title: "Успешно",
        description: `Сумма счёта обновлена: ${formatCurrency(newBill)}`,
      });
      fetchInvoiceDetails();
    } catch (error: any) {
      toast({
        title: "Системная ошибка",
        description: error.message ?? "Не удалось обновить сумму счёта",
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

    const currentAmount = invoice.planned_expenses ? parseFloat(invoice.planned_expenses) : 0;
    if (currentAmount === newAmount) return;

    try {
      setUpdatingPlannedExpenses(true);
      await apiPatch(`/invoices/${invoiceId}`, { 
        plannedExpenses: newAmount.toString()
      });
      toast({
        title: "Успешно",
        description: `Планируемые расходы обновлены: ${formatCurrency(newAmount)}`,
      });
      
      queryClient.invalidateQueries({ queryKey: ['/api/do-not-spend/partner-schemes'] });
      fetchInvoiceDetails();
    } catch (error: any) {
      toast({
        title: "Системная ошибка",
        description: error.message ?? "Не удалось обновить планируемые расходы",
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
      queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
      queryClient.invalidateQueries({ queryKey: ['/api/assistant/stats'] });
      
      toast({
        title: "Успешно",
        description: newValue 
          ? "Счёт скрыт от ассистента" 
          : "Счёт виден ассистенту",
      });
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error.message ?? "Не удалось обновить настройку",
        variant: "destructive",
      });
    } finally {
      setUpdatingHideFromAssistant(false);
    }
  };

  const handleClosePeriod = async () => {
    if (!invoiceId) return;
    setClosingPeriod(true);
    try {
      await apiPost(`/invoices/${invoiceId}/close-period`, {});
      queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
      queryClient.invalidateQueries({ queryKey: ['/api/client/budget'] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/stats'] });
      await fetchInvoiceDetails();
      toast({ title: "Период закрыт", description: "Использовано на 1 больше." });
    } catch (error: any) {
      toast({ title: "Ошибка", description: error.message || "Не удалось закрыть период", variant: "destructive" });
    } finally {
      setClosingPeriod(false);
    }
  };

  const handleSavePeriodsUsed = async () => {
    if (!invoiceId) return;
    const total = Number(invoice?.total_periods ?? 0);
    const value = Number(periodsUsedEdit);
    if (!Number.isInteger(value) || value < 0) {
      toast({ title: "Ошибка", description: "Значение должно быть целым ≥ 0", variant: "destructive" });
      return;
    }
    if (value > total) {
      toast({ title: "Ошибка", description: `Не может быть больше ${total}`, variant: "destructive" });
      return;
    }
    setUpdatingPeriodsUsed(true);
    try {
      await apiPatch(`/invoices/${invoiceId}`, { periodsUsed: value });
      queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
      queryClient.invalidateQueries({ queryKey: ['/api/client/budget'] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/stats'] });
      await fetchInvoiceDetails();
      toast({ title: "Сохранено", description: "Число закрытых периодов обновлено." });
    } catch (error: any) {
      toast({ title: "Ошибка", description: error.message || "Не удалось сохранить", variant: "destructive" });
    } finally {
      setUpdatingPeriodsUsed(false);
    }
  };

  const handleMoveInvoice = async () => {
    if (!invoiceId || !moveClientId) return;
    if (moveClientId === invoice?.client_id) {
      toast({ title: "Это тот же клиент", description: "Выберите другого клиента." });
      return;
    }
    if (!confirm("Перенести счёт другому клиенту? Все списания, расчёты и история останутся привязаны к счёту.")) return;
    setMovingInvoice(true);
    try {
      await apiPatch(`/invoices/${invoiceId}`, { clientId: moveClientId });
      queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
      queryClient.invalidateQueries({ queryKey: ['/api/client/budget'] });
      queryClient.invalidateQueries({ queryKey: ['/api/client/overview-buckets'] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/clients'] });
      await fetchInvoiceDetails();
      setMoveOpen(false);
      setMoveClientId('');
      toast({ title: "Перенесено", description: "Счёт теперь у другого клиента." });
    } catch (error: any) {
      toast({ title: "Ошибка", description: error.message || "Не удалось перенести счёт", variant: "destructive" });
    } finally {
      setMovingInvoice(false);
    }
  };

  const handleSaveClientTitle = async () => {
    if (!invoiceId) return;
    const trimmed = clientTitleEdit.trim();
    setUpdatingClientTitle(true);
    try {
      await apiPatch(`/invoices/${invoiceId}`, { clientTitle: trimmed || null });
      queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
      queryClient.invalidateQueries({ queryKey: ['/api/client/budget'] });
      queryClient.invalidateQueries({ queryKey: ['/api/client/overview-buckets'] });
      await fetchInvoiceDetails();
      toast({ title: "Сохранено", description: trimmed ? "Название клиенту обновлено." : "Название убрано." });
    } catch (error: any) {
      toast({ title: "Ошибка", description: error.message || "Не удалось сохранить", variant: "destructive" });
    } finally {
      setUpdatingClientTitle(false);
    }
  };

  const handleConvertToSubscription = async () => {
    if (!invoiceId) return;
    const price = parseFloat(convertPrice);
    const total = parseInt(convertTotal, 10);
    if (!Number.isFinite(price) || price <= 0) {
      toast({ title: "Ошибка", description: "Цена за единицу должна быть > 0", variant: "destructive" });
      return;
    }
    if (!Number.isInteger(total) || total < 1) {
      toast({ title: "Ошибка", description: "Количество должно быть ≥ 1", variant: "destructive" });
      return;
    }
    setConverting(true);
    try {
      await apiPatch(`/invoices/${invoiceId}`, {
        serviceType: 'periodic',
        periodUnit: convertUnit,
        pricePerPeriod: price.toString(),
        totalPeriods: total,
        periodsUsed: 0,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
      queryClient.invalidateQueries({ queryKey: ['/api/client/budget'] });
      queryClient.invalidateQueries({ queryKey: ['/api/client/overview-buckets'] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/stats'] });
      await fetchInvoiceDetails();
      setConvertOpen(false);
      setConvertPrice('');
      setConvertTotal('');
      toast({ title: "Готово", description: "Счёт превращён в подписку." });
    } catch (error: any) {
      toast({ title: "Ошибка", description: error.message || "Не удалось превратить счёт", variant: "destructive" });
    } finally {
      setConverting(false);
    }
  };

  const handleRevertToOneTime = async () => {
    if (!invoiceId) return;
    if (!confirm("Превратить подписку обратно в разовый счёт? Цена за период и количество периодов будут очищены.")) return;
    setConverting(true);
    try {
      await apiPatch(`/invoices/${invoiceId}`, {
        serviceType: 'one_time',
        pricePerPeriod: null,
        totalPeriods: null,
        periodsUsed: 0,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
      queryClient.invalidateQueries({ queryKey: ['/api/client/budget'] });
      queryClient.invalidateQueries({ queryKey: ['/api/client/overview-buckets'] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/stats'] });
      await fetchInvoiceDetails();
      toast({ title: "Готово", description: "Подписка превращена обратно в разовый счёт." });
    } catch (error: any) {
      toast({ title: "Ошибка", description: error.message || "Не удалось преобразовать", variant: "destructive" });
    } finally {
      setConverting(false);
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      draft: "Черновик",
      sent: "Отправлен",
      paid: "Оплачен",
      cancelled: "Отменен"
    };
    return labels[status] || status;
  };

  if (loading || !invoice) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl w-[95vw] sm:w-full">
          <div className="text-center py-8">Загрузка...</div>
        </DialogContent>
      </Dialog>
    );
  }

  const calcRaw = invoice.invoice_calculations;
  const calc = normalizeCalculations(calcRaw);
  const isAgency30 = isAgencyScheme(invoice.scheme);
  const permissions = getVisibleFields(userRole, invoice.scheme);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto w-[95vw] sm:w-full">
          <DialogHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <DialogTitle>Счет № {invoice.invoice_number}</DialogTitle>
                <DialogDescription>Детальная информация по счету</DialogDescription>
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
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Информация о счете</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Клиент</p>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{invoice.clients?.name}</p>
                    {userRole === 'admin' && !moveOpen && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => { setMoveClientId(invoice.client_id || ''); setMoveOpen(true); }}
                        data-testid="button-move-invoice"
                      >
                        Перенести →
                      </Button>
                    )}
                  </div>
                  {userRole === 'admin' && moveOpen && (
                    <div className="mt-2 space-y-2 rounded-md border bg-muted/20 p-2">
                      <Label className="text-xs">Новый клиент</Label>
                      <ClientCombobox
                        value={moveClientId}
                        onChange={setMoveClientId}
                      />
                      <div className="flex justify-end gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setMoveOpen(false); setMoveClientId(''); }}
                          disabled={movingInvoice}
                        >
                          Отмена
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleMoveInvoice}
                          disabled={movingInvoice || !moveClientId || moveClientId === invoice.client_id}
                          data-testid="button-confirm-move"
                        >
                          {movingInvoice && <Loader2 className="h-3 w-3 mr-2 animate-spin" />}
                          Перенести
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Партнер</p>
                  <p className="font-medium">{invoice.partners?.name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Дата создания</p>
                  <p className="font-medium">{formatDate(invoice.created_at)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Статус</p>
                  <p className="font-medium">{getStatusLabel(invoice.status)}</p>
                </div>

                {/* Скрыть от ассистента - только для админа */}
                {userRole === 'admin' && (
                  <div className="col-span-2 pt-3 border-t">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="hide-from-assistant" className="text-sm font-medium">
                          Скрыть от ассистента
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Ассистент не увидит этот счёт в списке
                        </p>
                      </div>
                      <Switch
                        id="hide-from-assistant"
                        checked={hideFromAssistant}
                        onCheckedChange={handleToggleHideFromAssistant}
                        disabled={updatingHideFromAssistant}
                        data-testid="switch-hide-from-assistant"
                      />
                    </div>
                  </div>
                )}
                
                {/* Название для клиента — admin/assistant */}
                {(userRole === 'admin' || userRole === 'assistant') && (
                  <div className="col-span-2 pt-3 border-t">
                    <Label htmlFor="client-title" className="text-sm font-medium">
                      Название для клиента
                    </Label>
                    <p className="text-xs text-muted-foreground mb-2">
                      То, что увидит клиент в кабинете. Перебивает «Примечания» и внутреннее «Описание».
                    </p>
                    <div className="flex items-end gap-2">
                      <Input
                        id="client-title"
                        value={clientTitleEdit}
                        onChange={(e) => setClientTitleEdit(e.target.value)}
                        placeholder="Например: Цимерман А. — продление 6 мес"
                        className="h-9"
                        data-testid="input-client-title-edit"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleSaveClientTitle}
                        disabled={updatingClientTitle || clientTitleEdit === (invoice.client_title ?? "")}
                        data-testid="button-save-client-title"
                      >
                        {updatingClientTitle && <Loader2 className="h-3 w-3 mr-2 animate-spin" />}
                        Сохранить
                      </Button>
                    </div>
                  </div>
                )}

                {/* Превратить разовый счёт в подписку — только admin/assistant */}
                {invoice.service_type !== 'periodic' && (userRole === 'admin' || userRole === 'assistant') && (
                  <div className="col-span-2 pt-3 border-t">
                    {!convertOpen ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConvertOpen(true)}
                        className="gap-2"
                        data-testid="button-convert-to-subscription"
                      >
                        + Превратить в подписку
                      </Button>
                    ) : (
                      <div className="bg-indigo-50/40 dark:bg-indigo-950/20 p-3 rounded-lg space-y-3">
                        <p className="text-sm font-semibold">Превратить в подписку</p>
                        <p className="text-xs text-muted-foreground">
                          Сумма счёта пересчитается автоматически: цена × количество. «Использовано» будет считаться по записям расходов админа/ассистента.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">Единица</Label>
                            <div className="grid grid-cols-3 gap-1">
                              {(['month', 'day', 'hour'] as const).map(u => (
                                <button
                                  key={u}
                                  type="button"
                                  onClick={() => setConvertUnit(u)}
                                  className={`h-9 rounded-md border text-sm transition-colors ${
                                    convertUnit === u
                                      ? 'border-primary bg-primary/10 font-medium'
                                      : 'border-input hover:bg-accent'
                                  }`}
                                  data-testid={`convert-unit-${u}`}
                                >
                                  {u === 'month' ? 'Месяц' : u === 'day' ? 'День' : 'Час'}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Цена за {convertUnit === 'month' ? 'месяц' : convertUnit === 'day' ? 'день' : 'час'}</Label>
                            <Input
                              type="number"
                              min={0}
                              step={0.01}
                              value={convertPrice}
                              onChange={(e) => setConvertPrice(e.target.value)}
                              placeholder="270000"
                              className="h-9"
                              data-testid="input-convert-price"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Количество</Label>
                            <Input
                              type="number"
                              min={1}
                              step={1}
                              value={convertTotal}
                              onChange={(e) => setConvertTotal(e.target.value)}
                              placeholder="11"
                              className="h-9"
                              data-testid="input-convert-total"
                            />
                          </div>
                        </div>
                        {parseFloat(convertPrice) > 0 && parseInt(convertTotal, 10) > 0 && (
                          <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2 text-sm">
                            <span className="text-muted-foreground">Новая сумма счёта:</span>
                            <span className="font-semibold tabular-nums">
                              {formatCurrency(parseFloat(convertPrice) * parseInt(convertTotal, 10))}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-end gap-2 pt-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => { setConvertOpen(false); setConvertPrice(''); setConvertTotal(''); }}
                            disabled={converting}
                          >
                            Отмена
                          </Button>
                          <Button
                            size="sm"
                            onClick={handleConvertToSubscription}
                            disabled={converting || !(parseFloat(convertPrice) > 0) || !(parseInt(convertTotal, 10) > 0)}
                            data-testid="button-confirm-convert"
                          >
                            {converting && <Loader2 className="h-3 w-3 mr-2 animate-spin" />}
                            Превратить
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Периодическая услуга — для всех ролей, у админа/ассистента — с управлением */}
                {invoice.service_type === 'periodic' && (() => {
                  const total = Number(invoice.total_periods ?? 0);
                  const used  = Math.max(0, Math.min(Number(invoice.periods_used ?? 0), total));
                  const price = Number(invoice.price_per_period ?? 0);
                  const remaining = Math.max(0, total - used);
                  const unitLabel = invoice.period_unit === 'day' ? 'дн' : invoice.period_unit === 'hour' ? 'ч' : 'мес';
                  const canManage = userRole === 'admin' || userRole === 'assistant';
                  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
                  return (
                    <div className="col-span-2 pt-3 border-t">
                      <p className="text-sm font-semibold text-muted-foreground mb-2">Периодическая услуга</p>
                      <div className="bg-indigo-50/40 dark:bg-indigo-950/20 p-3 rounded-lg space-y-3">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">Цена за {unitLabel}</p>
                            <p className="font-semibold tabular-nums">{formatCurrency(price)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Всего</p>
                            <p className="font-semibold tabular-nums">{total} {unitLabel}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Использовано</p>
                            <p className="font-semibold tabular-nums">{used} {unitLabel}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Осталось</p>
                            <p className="font-semibold tabular-nums">{remaining} {unitLabel} · {formatCurrency(price * remaining)}</p>
                          </div>
                        </div>
                        <Progress value={pct} className="h-2" />
                        {canManage && (
                          <div className="flex flex-wrap items-end gap-3 pt-2">
                            <Button
                              size="sm"
                              variant="default"
                              onClick={handleClosePeriod}
                              disabled={closingPeriod || used >= total}
                              data-testid="button-close-period"
                            >
                              {closingPeriod && <Loader2 className="h-3 w-3 mr-2 animate-spin" />}
                              + Закрыть {invoice.period_unit === 'day' ? 'день' : invoice.period_unit === 'hour' ? 'час' : 'месяц'}
                            </Button>
                            <div className="flex items-end gap-2">
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Закрыто (ручная правка)</Label>
                                <Input
                                  type="number"
                                  min={0}
                                  max={total}
                                  step={1}
                                  value={periodsUsedEdit}
                                  onChange={(e) => setPeriodsUsedEdit(e.target.value === '' ? '' : Number(e.target.value))}
                                  className="w-24 h-9 text-sm"
                                  data-testid="input-periods-used"
                                />
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={handleSavePeriodsUsed}
                                disabled={updatingPeriodsUsed || periodsUsedEdit === '' || Number(periodsUsedEdit) === used}
                                data-testid="button-save-periods-used"
                              >
                                {updatingPeriodsUsed && <Loader2 className="h-3 w-3 mr-2 animate-spin" />}
                                Сохранить
                              </Button>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={handleRevertToOneTime}
                              disabled={converting}
                              className="ml-auto text-muted-foreground hover:text-foreground"
                              data-testid="button-revert-to-onetime"
                            >
                              Превратить обратно в разовый
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Условия сотрудничества - только для партнёра и админа */}
                {(userRole === 'partner' || userRole === 'admin') && (
                  <div className="col-span-2 pt-3 border-t">
                    <p className="text-sm font-semibold text-muted-foreground mb-2">Условия сотрудничества по счёту</p>
                    <div className="bg-muted/30 p-3 rounded-lg space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Схема:</span>
                        <span className="font-medium">{getSchemeLabel(invoice.scheme, userRole, invoice.partner_commission_rate)}</span>
                      </div>
                      {isAgency30 ? (
                        <div className="text-xs text-muted-foreground pt-1">
                          Условия распределения маржи закреплены в договоре и не раскрываются ассистенту.
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {userRole === 'admin' ? (
                            <div>
                              <Label className="text-sm text-muted-foreground">Процент партнёра</Label>
                              <div className="flex gap-2 items-center mt-1">
                                <Input
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="0.01"
                                  value={partnerRate}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    setPartnerRate(value === '' ? '' : Number(value));
                                  }}
                                  className="w-24 text-sm"
                                  disabled={updatingPartnerRate}
                                />
                                <span className="text-sm text-muted-foreground">%</span>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    if (partnerRate !== '' && !Number.isNaN(partnerRate)) {
                                      handleUpdateCommission(Number(partnerRate));
                                    }
                                  }}
                                  disabled={updatingPartnerRate || partnerRate === ''}
                                >
                                  {updatingPartnerRate ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    'Сохранить'
                                  )}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Процент партнёра:</span>
                              <span className="font-semibold text-primary">
                                {(() => {
                                  const rate = calc?.commission_rate ?? invoice.partner_commission_rate;
                                  return rate ? `${rate}%` : 'по договору';
                                })()}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}


                {permissions.canEditStatus && (
                  <>
                    <div className="col-span-2">
                      <Label>Статус счета</Label>
                      <Select 
                        value={invoice.status} 
                        onValueChange={handleStatusChangeRequest}
                        disabled={updatingStatus}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="draft">Черновик</SelectItem>
                          <SelectItem value="sent">Отправлен</SelectItem>
                          <SelectItem value="paid">Оплачен</SelectItem>
                          <SelectItem value="cancelled">Отменен</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
                {permissions.canEditPaymentDates && (
                  <>
                    <div className="col-span-2">
                      <Label>Планируемая дата оплаты</Label>
                      <div className="flex gap-2 mt-1">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn(
                                "flex-1 justify-start text-left font-normal",
                                !plannedPaymentDate && "text-muted-foreground"
                              )}
                              disabled={updatingPaymentDate}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {plannedPaymentDate ? format(plannedPaymentDate, "PPP", { locale: ru }) : <span>Дата не указана</span>}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={plannedPaymentDate}
                              onSelect={(date) => {
                                setPlannedPaymentDate(date);
                                if (date) handleUpdatePlannedDate(date);
                              }}
                              initialFocus
                              className="pointer-events-auto"
                            />
                          </PopoverContent>
                        </Popover>
                        {plannedPaymentDate && (
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => {
                              setPlannedPaymentDate(undefined);
                              handleUpdatePlannedDate(undefined);
                            }}
                            disabled={updatingPaymentDate}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="col-span-2">
                      <Label>Фактическая дата оплаты</Label>
                      <div className="flex gap-2 mt-1">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn(
                                "flex-1 justify-start text-left font-normal",
                                !actualPaymentDate && "text-muted-foreground"
                              )}
                              disabled={updatingPaymentDate}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {actualPaymentDate ? format(actualPaymentDate, "PPP", { locale: ru }) : <span>Дата не указана</span>}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={actualPaymentDate}
                              onSelect={(date) => {
                                setActualPaymentDate(date);
                                if (date) handleUpdateActualPaymentDate(date);
                              }}
                              initialFocus
                              className="pointer-events-auto"
                            />
                          </PopoverContent>
                        </Popover>
                        {actualPaymentDate && (
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => {
                              setActualPaymentDate(undefined);
                              handleUpdateActualPaymentDate(undefined);
                            }}
                            disabled={updatingPaymentDate}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </>
                )}
                {permissions.canEditNotes && (
                  <>
                    <div className="col-span-2">
                      <Label>Комментарий</Label>
                      <div className="flex gap-2 mt-1">
                        <Textarea
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="Добавьте комментарий к счёту..."
                          className="flex-1 min-h-[80px]"
                          disabled={updatingNotes}
                        />
                        <Button
                          onClick={handleUpdateNotes}
                          disabled={updatingNotes || notes === (invoice.notes || "")}
                          size="sm"
                        >
                          {updatingNotes ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              Сохранение...
                            </>
                          ) : (
                            "Сохранить"
                          )}
                        </Button>
                      </div>
                    </div>
                  </>
                )}
                {!permissions.canEditStatus && !permissions.canEditPaymentDates && !permissions.canEditNotes && (
                  <>
                    <div>
                      <p className="text-sm text-muted-foreground">Статус</p>
                      <p className="font-medium">{getStatusLabel(invoice.status)}</p>
                    </div>
                    {invoice.payment_date && (
                      <div>
                        <p className="text-sm text-muted-foreground">Дата оплаты</p>
                        <p className="font-medium">{formatDate(invoice.payment_date)}</p>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Расчеты водопад */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-lg">Расчеты</CardTitle>
                {userRole === 'admin' && calc?.cat_share_50 > 0 && (
                  <CatShareBadge 
                    catShare={calc.cat_share_50} 
                    adminShare={calc.admin_share_50} 
                  />
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Waterfall Visualization - only for admin, contains commission/profit data */}
                {userRole === 'admin' && (() => {
                  const expensesPaidByPartner = expenses
                    .filter((e: any) => e.paidByAdmin !== true)
                    .reduce((sum: number, e: any) => sum + parseFloat(e.amount || "0"), 0);
                  const expensesPaidByAdmin = expenses
                    .filter((e: any) => e.paidByAdmin === true)
                    .reduce((sum: number, e: any) => sum + parseFloat(e.amount || "0"), 0);
                  
                  return (
                    <InvoiceWaterfallChart
                      clientBill={calc?.client_bill || 0}
                      scheme={invoice.scheme}
                      commissionRate={calc?.commission_rate}
                      executorExpenses={calc?.executor_expenses_total || 0}
                      expensesPaidByPartner={expensesPaidByPartner}
                      expensesPaidByAdmin={expensesPaidByAdmin}
                      partnerShare={isAgency30 ? (calc?.partner_share_from_margin || 0) : (calc?.commission_amount || 0)}
                      adminShare={isAgency30 ? (calc?.admin_share_from_margin || 0) : (calc?.net_profit_admin || 0)}
                      netProfitAdmin={calc?.net_profit_admin || 0}
                      catShare={calc?.cat_share_50}
                      showCatShare={true}
                    />
                  );
                })()}

                <div className="flex justify-between text-lg font-bold">
                  <span>Счет клиенту:</span>
                  {userRole === 'admin' && canEdit ? (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={clientBillEdit}
                        onChange={(e) => {
                          const val = e.target.value;
                          setClientBillEdit(val === '' ? '' : Number(val));
                        }}
                        className="w-32 text-right"
                        data-testid="input-client-bill"
                      />
                      <Button
                        size="sm"
                        onClick={() => {
                          if (clientBillEdit !== '' && !Number.isNaN(clientBillEdit)) {
                            handleUpdateClientBill(Number(clientBillEdit));
                          }
                        }}
                        disabled={updatingClientBill || clientBillEdit === ''}
                        data-testid="button-save-client-bill"
                      >
                        {updatingClientBill ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          'Сохранить'
                        )}
                      </Button>
                    </div>
                  ) : (
                    <span>{formatCurrency(calc?.client_bill || 0)}</span>
                  )}
                </div>

                {isAgency30 ? (
                  <>
                    {permissions.showAgencyMargin && (
                      <div className="pl-4 space-y-2 border-l-2 border-primary/20">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Маржа агентства ({invoice.scheme === 'agency_40' ? '40%' : '30%'}):</span>
                          <span>{formatCurrency(calc?.agency_margin || 0)}</span>
                        </div>
                        {permissions.showPartnerShare && (
                          <div className="flex justify-between text-sm pl-4">
                            <span className="text-muted-foreground">→ Партнер:</span>
                            <span>{formatCurrency(calc?.partner_share_from_margin || 0)}</span>
                          </div>
                        )}
                        {permissions.showAdminShare && (
                          <div className="flex justify-between text-sm pl-4">
                            <span className="text-muted-foreground">→ Админ:</span>
                            <span className="text-primary font-medium">{formatCurrency(calc?.admin_share_from_margin || 0)}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {permissions.showClientBudget && (
                      <div className="pl-4 space-y-2 border-l-2 border-muted">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Бюджет клиента ({invoice.scheme === 'agency_40' ? '60%' : '70%'}):</span>
                          <span>{formatCurrency(calc?.client_base_after_margin || 0)}</span>
                        </div>
                        {permissions.showExpensesTotal && (
                          <div className="flex justify-between text-sm pl-4">
                            <span className="text-muted-foreground">→ Расходы:</span>
                            <span>{formatCurrency(calc?.executor_expenses_total || 0)}</span>
                          </div>
                        )}
                        {permissions.showClientRemaining && (
                          <div className="flex justify-between text-sm pl-4">
                            <span className="text-muted-foreground">→ Остаток:</span>
                            <span className={calc?.client_remaining < 0 ? "text-destructive font-medium" : ""}>
                              {formatCurrency(calc?.client_remaining || 0)}
                            </span>
                          </div>
                        )}
                        {calc?.client_base_after_margin > 0 && (
                          <Progress 
                            value={Math.min((calc?.executor_expenses_total / calc?.client_base_after_margin) * 100, 100)} 
                            className="h-2"
                          />
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {permissions.showCommissionDetails && (
                      <>
                        <div className="space-y-3 pl-4 border-l-2 border-primary/20">
                          {userRole === 'admin' ? (
                            <div className="space-y-2">
                              <Label>Процент партнера</Label>
                              <div className="flex gap-2 items-center">
                                <Input
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="0.1"
                                  defaultValue={calc?.commission_rate || 0}
                                  className="w-24"
                                  id="commission-rate-input"
                                />
                                <span>%</span>
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    const input = document.getElementById('commission-rate-input') as HTMLInputElement;
                                    const rate = parseFloat(input.value);
                                    if (rate >= 0 && rate <= 100) {
                                      handleUpdateCommission(rate);
                                    } else {
                                      toast({
                                        title: "Ошибка",
                                        description: "Процент должен быть от 0 до 100",
                                        variant: "destructive",
                                      });
                                    }
                                  }}
                                >
                                  Установить
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Процент партнера:</span>
                              <span className="font-medium">{calc?.commission_rate}%</span>
                            </div>
                          )}
                          
                          <div className="flex justify-between text-sm text-muted-foreground">
                            <span>Комиссия партнера:</span>
                            <span>{formatCurrency(calc?.commission_amount || 0)}</span>
                          </div>
                          
                          {permissions.showPartnerShare && (
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Доля партнера:</span>
                              <span className="font-medium">{formatCurrency(calc?.commission_amount || 0)}</span>
                            </div>
                          )}
                          
                          <div className="flex justify-between text-sm">
                            <span>Долг партнёра к переводу:</span>
                            <span className="text-primary font-medium">{formatCurrency(calc?.partner_transfer_due || 0)}</span>
                          </div>
                          
                          {permissions.showExpensesTotal && (
                            <div className="flex justify-between text-sm text-muted-foreground">
                              <span>Расходы на исполнителей:</span>
                              <span>{formatCurrency(calc?.executor_expenses_total || 0)}</span>
                            </div>
                          )}
                          
                          {userRole === 'admin' && (() => {
                            const reservedAmount = invoice?.planned_expenses ? parseFloat(invoice.planned_expenses) : 0;
                            // Only count expenses paid by partner (from client money) as spent from reserve
                            const spentFromReserve = expenses
                              .filter((e: any) => e.paidByAdmin !== true)
                              .reduce((sum: number, e: any) => sum + parseFloat(e.amount || "0"), 0);
                            const adminPaidExpenses = expenses
                              .filter((e: any) => e.paidByAdmin === true)
                              .reduce((sum: number, e: any) => sum + parseFloat(e.amount || "0"), 0);
                            const remainingReserve = reservedAmount - spentFromReserve;
                            const isOverspent = remainingReserve < 0 && reservedAmount > 0;
                            
                            return (
                              <div className="space-y-3 pt-3 border-t border-muted">
                                <Label className="text-sm font-medium">Планируемые расходы на проект</Label>
                                
                                {reservedAmount > 0 && (
                                  <div className="bg-muted/50 rounded-md p-3 space-y-2">
                                    <div className="flex justify-between text-sm">
                                      <span className="text-muted-foreground">Зарезервировано:</span>
                                      <span className="font-medium">{formatCurrency(reservedAmount)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                      <span className="text-muted-foreground">Потрачено (из денег клиента):</span>
                                      <span className={isOverspent ? "font-medium text-destructive" : "font-medium"}>
                                        {formatCurrency(spentFromReserve)}
                                      </span>
                                    </div>
                                    {adminPaidExpenses > 0 && (
                                      <div className="flex justify-between text-sm text-muted-foreground">
                                        <span>Оплачено админом (не из резерва):</span>
                                        <span>{formatCurrency(adminPaidExpenses)}</span>
                                      </div>
                                    )}
                                    <div className="flex justify-between text-sm border-t pt-2">
                                      <span className="font-medium">Осталось резерва:</span>
                                      <span className={`font-bold ${isOverspent ? "text-destructive" : remainingReserve > 0 ? "text-primary" : "text-muted-foreground"}`}>
                                        {isOverspent ? `-${formatCurrency(Math.abs(remainingReserve))}` : formatCurrency(remainingReserve)}
                                      </span>
                                    </div>
                                    {isOverspent && (
                                      <p className="text-xs text-destructive">
                                        Расходы превысили зарезервированную сумму
                                      </p>
                                    )}
                                  </div>
                                )}
                                
                                <div className="flex gap-2 items-center">
                                  <Input
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={plannedExpensesEdit}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setPlannedExpensesEdit(val === '' ? '' : Number(val));
                                    }}
                                    className="w-32 text-right"
                                    data-testid="input-planned-expenses"
                                    placeholder="0"
                                  />
                                  <Button
                                    size="sm"
                                    onClick={() => {
                                      if (plannedExpensesEdit !== '' && !Number.isNaN(plannedExpensesEdit)) {
                                        handleUpdatePlannedExpenses(Number(plannedExpensesEdit));
                                      }
                                    }}
                                    disabled={updatingPlannedExpenses}
                                    data-testid="button-save-planned-expenses"
                                  >
                                    {updatingPlannedExpenses ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      'Сохранить'
                                    )}
                                  </Button>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  Сумма резервируется на расходы проекта (зарплаты, материалы)
                                </p>
                              </div>
                            );
                          })()}
                        </div>
                      </>
                    )}
                  </>
                )}

                {permissions.showNetProfitAdmin && (
                  <div className="border-t pt-3 space-y-2 bg-primary/5 -mx-6 px-6 py-3">
                    <div className="flex justify-between font-bold">
                      <span>Чистая прибыль админа:</span>
                      <span className="text-primary">{formatCurrency(calc?.net_profit_admin || 0)}</span>
                    </div>
                    {permissions.showAdminCatSplit && (
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Админ (50%):</span>
                          <span className="font-medium">{formatCurrency(calc?.admin_share_50 || 0)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Доля Кота (50%):</span>
                          <span className="font-medium">{formatCurrency(calc?.cat_share_50 || 0)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Расходы исполнителей */}
            {permissions.showExpensesList && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-lg">Расходы исполнителей</CardTitle>
                  {permissions.canAddExpenses && (
                    <Button size="sm" onClick={() => setAddExpenseOpen(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Добавить расход
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  {expenses.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      Нет расходов по данному счету
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Дата</TableHead>
                          <TableHead>Описание</TableHead>
                          {/* Клиенту по неагентским счетам суммы списаний не показываем. */}
                          {!(userRole === 'client' && invoice?.scheme !== 'agency_30' && invoice?.scheme !== 'agency_40') && (
                            <TableHead className="text-right">Сумма</TableHead>
                          )}
                          <TableHead className="w-24">Сообщения</TableHead>
                          {(permissions.canDeleteExpenses || canEdit) && <TableHead className="w-20">Действия</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {expenses.map((expense) => (
                          <TableRow key={expense.id}>
                            <TableCell>{formatDate(expense.date)}</TableCell>
                            <TableCell>{expense.description}</TableCell>
                            {!(userRole === 'client' && invoice?.scheme !== 'agency_30' && invoice?.scheme !== 'agency_40') && (
                              <TableCell className="text-right">{formatCurrency(expense.amount)}</TableCell>
                            )}
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setMessageExpense({ id: expense.id, description: expense.description, amount: Number(expense.amount) })}
                                data-testid={`button-message-expense-${expense.id}`}
                              >
                                <MessageSquare className="h-4 w-4" />
                              </Button>
                            </TableCell>
                            {(permissions.canDeleteExpenses || canEdit) && (
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  {canEdit && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setEditingExpense(expense);
                                        setEditExpenseOpen(true);
                                      }}
                                    >
                                      <FileText className="h-4 w-4" />
                                    </Button>
                                  )}
                                  {permissions.canDeleteExpenses && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      disabled={deletingExpenseId === expense.id}
                                      onClick={() => setDeleteExpense({ id: expense.id, description: expense.description })}
                                    >
                                      {deletingExpenseId === expense.id ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                      )}
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Signed Acts Section — клиенту не нужны: за документооборот
                и за траты отвечают разные люди со стороны клиента. */}
            {userRole !== 'client' && (
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

      <AlertDialog open={!!deleteExpense} onOpenChange={(open) => !open && setDeleteExpense(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить расход?</AlertDialogTitle>
            <AlertDialogDescription>
              Вы действительно хотите удалить расход "{deleteExpense?.description}"? 
              Это действие нельзя отменить, и пересчитаются все финансовые показатели счёта.
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

      <AlertDialog open={!!pendingStatusChange} onOpenChange={(open) => !open && setPendingStatusChange(null)}>
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
                    У вас остался неиспользованный резерв: <strong className="text-primary">{formatCurrency(pendingStatusChange.remainingReserve || 0)}</strong>
                  </p>
                  <p className="text-amber-600 dark:text-amber-500">
                    Это может означать, что работы по проекту ещё не завершены. 
                    Рекомендуется сначала добавить все расходы исполнителей или уменьшить сумму резерва.
                  </p>
                  <p>
                    Вы уверены, что хотите отметить счёт как "Оплачен"?
                  </p>
                </div>
              ) : (
                <>
                  Вы собираетесь изменить статус счёта на "{pendingStatusChange?.label}". 
                  {pendingStatusChange?.status === "paid" && (
                    " Это означает, что оплата получена от клиента."
                  )}
                  {pendingStatusChange?.status === "cancelled" && (
                    " Счёт будет помечен как отменённый и не будет учитываться в расчётах."
                  )}
                  {" "}Продолжить?
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmStatusChange}
              disabled={updatingStatus}
              className={pendingStatusChange?.hasUnspentReserve ? "bg-amber-600 hover:bg-amber-700" : ""}
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
          invoiceNumber={invoice?.invoice_number}
          currentRole={userRole as any}
        />
      )}
      {invoiceId && messageExpense && (
        <SendMessageDialog
          open={!!messageExpense}
          onOpenChange={(o) => { if (!o) setMessageExpense(null); }}
          invoiceId={invoiceId}
          invoiceNumber={invoice?.invoice_number}
          expenseId={messageExpense.id}
          expenseDescription={messageExpense.description}
          expenseAmount={messageExpense.amount}
          currentRole={userRole as any}
        />
      )}
    </>
  );
};
