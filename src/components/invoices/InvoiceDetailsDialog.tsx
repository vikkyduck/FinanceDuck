import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { CalendarIcon, Plus, Trash2, FileText, Loader2, X } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { AddExpenseDialog } from "./assistant/AddExpenseDialog";
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
      const calc = Array.isArray(calcRaw) ? calcRaw[0] : calcRaw || null;
      const rate = calc?.commission_rate ?? invoice.partner_commission_rate ?? 10;
      setPartnerRate(rate);
    } else {
      setPartnerRate('');
    }
    
    // Устанавливаем значение client_bill для редактирования
    if (invoice) {
      const calcRaw = invoice.invoice_calculations;
      const calc = Array.isArray(calcRaw) ? calcRaw[0] : calcRaw || null;
      const bill = calc?.client_bill ?? invoice.client_bill ?? 0;
      setClientBillEdit(bill);
      setHideFromAssistant(invoice.hidden_from_assistant || false);
      
      // Устанавливаем значение planned_expenses для партнёрских схем
      const plannedExp = invoice.planned_expenses ? parseFloat(invoice.planned_expenses) : 0;
      setPlannedExpensesEdit(plannedExp);
    }
  }, [invoice]);

  const fetchInvoiceDetails = async () => {
    console.log('[InvoiceDetailsDialog] === START FETCH ===', { invoiceId, userRole });
    setLoading(true);

    try {
      if (!invoiceId) {
        console.log('[InvoiceDetailsDialog] No invoiceId, aborting');
        setLoading(false);
        return;
      }

      const [invoiceData, expensesData] = await Promise.all([
        apiGet<any>(`/invoices/${invoiceId}`),
        apiGet<any[]>(`/invoices/${invoiceId}/expenses`).catch(() => [])
      ]);
      console.log('[InvoiceDetailsDialog] Invoice loaded:', invoiceData);
      console.log('[InvoiceDetailsDialog] Expenses loaded:', expensesData);

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

      console.log('[InvoiceDetailsDialog] === FETCH COMPLETE ===', {
        hasInvoice: !!mappedInvoice,
        expensesCount: mappedExpenses.length
      });
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
    const calc = Array.isArray(calcRaw) ? calcRaw[0] : calcRaw;
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
  const calc = Array.isArray(calcRaw) ? calcRaw[0] : calcRaw || null;
  const isAgency30 = invoice.scheme === 'agency_30';
  const permissions = getVisibleFields(userRole, invoice.scheme);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto w-[95vw] sm:w-full">
          <DialogHeader>
            <DialogTitle>Счет № {invoice.invoice_number}</DialogTitle>
            <DialogDescription>
              Детальная информация по счету
            </DialogDescription>
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
                  <p className="font-medium">{invoice.clients?.name}</p>
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
                          <span className="text-muted-foreground">Маржа агентства (30%):</span>
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
                          <span className="text-muted-foreground">Бюджет клиента (70%):</span>
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
                          <TableHead className="text-right">Сумма</TableHead>
                          {(permissions.canDeleteExpenses || canEdit) && <TableHead className="w-20">Действия</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {expenses.map((expense) => (
                          <TableRow key={expense.id}>
                            <TableCell>{formatDate(expense.date)}</TableCell>
                            <TableCell>{expense.description}</TableCell>
                            <TableCell className="text-right">{formatCurrency(expense.amount)}</TableCell>
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

            {/* Signed Acts Section */}
            <SignedActsSection
              invoiceId={invoiceId || ""}
              userRole={userRole}
              canEdit={canEdit}
            />
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
    </>
  );
};
