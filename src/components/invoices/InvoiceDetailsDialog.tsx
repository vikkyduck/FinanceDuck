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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDate, getSchemeLabel, calculateInvoice } from "@/lib/invoiceCalculations";
import { CalendarIcon, Plus, Trash2, Download, FileText, Loader2, X } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { AddExpenseDialog } from "./assistant/AddExpenseDialog";
import { EditExpenseDialog } from "./assistant/EditExpenseDialog";
import { UploadDocumentDialog } from "./UploadDocumentDialog";
import { useToast } from "@/hooks/use-toast";
import { getVisibleFields, getDocumentTypeLabel, formatFileSize, UserRole } from "@/lib/invoicePermissions";
import { ensureSessionContext, callRPC, querySupabaseWithFilter } from "@/lib/supabaseHelpers";
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
  const [invoice, setInvoice] = useState<any>(null);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);
  const [editExpenseOpen, setEditExpenseOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<any>(null);
  const [uploadDocOpen, setUploadDocOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const [deleteExpense, setDeleteExpense] = useState<{id: string, description: string} | null>(null);
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);
  
  const [deleteDocument, setDeleteDocument] = useState<{id: string, name: string} | null>(null);
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null);
  
  const [pendingStatusChange, setPendingStatusChange] = useState<{
    status: "draft" | "sent" | "paid" | "cancelled",
    label: string
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

      // Step 1: Ensure session context
      console.log('[InvoiceDetailsDialog] Step 1: Setting session context...');
      const sessionContext = await ensureSessionContext();
      console.log('[InvoiceDetailsDialog] Session context set:', {
        accessTokenId: sessionContext?.accessTokenId,
        role: sessionContext?.role
      });

      // Step 2: Load invoice
      console.log('[InvoiceDetailsDialog] Step 2: Loading invoice...');
      const { data: invoiceRows, error: invoiceError } = await supabase
        .from("invoices")
        .select(`*, clients(name), partners(name), invoice_calculations(*)`)
        .eq("id", invoiceId)
        .limit(1);

      console.log('[InvoiceDetailsDialog] Invoice result:', {
        hasData: !!invoiceRows,
        count: invoiceRows?.length,
        error: invoiceError?.message
      });

      if (invoiceError) {
        console.error('[InvoiceDetailsDialog] Invoice query FAILED:', invoiceError);
        toast({
          title: "Ошибка загрузки счета",
          description: invoiceError.message,
          variant: "destructive"
        });
      }

      // Step 3: Load expenses - CRITICAL
      console.log('[InvoiceDetailsDialog] Step 3: Loading expenses for invoice:', invoiceId);
      const { data: expensesData, error: expensesError } = await supabase
        .from("executor_expenses")
        .select("*")
        .eq("invoice_id", invoiceId)
        .order("date", { ascending: false });

      console.log('[InvoiceDetailsDialog] Expenses result:', {
        hasData: !!expensesData,
        count: expensesData?.length || 0,
        error: expensesError?.message,
        data: expensesData
      });

      if (expensesError) {
        console.error('[InvoiceDetailsDialog] Expenses query FAILED:', expensesError);
        toast({
          title: "Ошибка загрузки расходов",
          description: expensesError.message,
          variant: "destructive"
        });
      }

      // Step 4: Load documents
      console.log('[InvoiceDetailsDialog] Step 4: Loading documents...');
      const { data: documentsData, error: documentsError } = await supabase
        .from("invoice_documents")
        .select("*")
        .eq("invoice_id", invoiceId)
        .order("uploaded_at", { ascending: false });

      console.log('[InvoiceDetailsDialog] Documents result:', {
        hasData: !!documentsData,
        count: documentsData?.length || 0,
        error: documentsError?.message
      });

      if (documentsError) {
        console.error('[InvoiceDetailsDialog] Documents query FAILED:', documentsError);
      }

      // Step 5: Set expenses and documents IMMEDIATELY
      console.log('[InvoiceDetailsDialog] Step 5: Setting state...');
      setExpenses(expensesData || []);
      setDocuments(documentsData || []);
      console.log('[InvoiceDetailsDialog] State set - expenses count:', expensesData?.length || 0);

      let invoiceData = invoiceRows && invoiceRows.length > 0 ? invoiceRows[0] : null;

      // If there are no calculations yet or client_bill is missing, try to fix this
      const calcRaw = invoiceData?.invoice_calculations;
      const calc = Array.isArray(calcRaw) ? calcRaw[0] : calcRaw;

      if (invoiceData && (!calc || calc.client_bill == null)) {
        console.warn("[InvoiceDetailsDialog] Missing calculations, triggering recalculate_all_invoices for", invoiceId);
        const { error: recalcError } = await supabase.rpc("recalculate_all_invoices", {
          _invoice_id: invoiceId,
        });

        if (recalcError) {
          console.error("Error recalculating invoice totals:", recalcError);
        } else {
          // Reload data after recalculation
          const { data: reloadedInvoiceRows } = await supabase
            .from("invoices")
            .select(`*, clients(name), partners(name), invoice_calculations(*)`)
            .eq("id", invoiceId)
            .limit(1);

          const { data: reloadedExpensesData } = await supabase
            .from("executor_expenses")
            .select("*")
            .eq("invoice_id", invoiceId)
            .order("date", { ascending: false });

          const { data: reloadedDocumentsData } = await supabase
            .from("invoice_documents")
            .select("*")
            .eq("invoice_id", invoiceId)
            .order("uploaded_at", { ascending: false });

          invoiceData = reloadedInvoiceRows && reloadedInvoiceRows.length > 0 ? reloadedInvoiceRows[0] : invoiceData;
          
          console.log('[InvoiceDetailsDialog] After recalc - updating expenses:', reloadedExpensesData?.length || 0);
          setExpenses(reloadedExpensesData || []);
          setDocuments(reloadedDocumentsData || []);
        }
      }

      // Final safety net: if calculations are still missing (e.g. из-за RLS),
      // восстанавливаем их из RPC get_invoices_for_user и пересчитываем на фронте
      const finalCalcRaw = invoiceData?.invoice_calculations;
      const finalCalc = Array.isArray(finalCalcRaw) ? finalCalcRaw[0] : finalCalcRaw;

      if (invoiceData && (!finalCalc || finalCalc.client_bill == null)) {
        try {
          const { data: summaryData, error: summaryError } = await supabase.rpc("get_invoices_for_user", {
            _token_id: sessionContext.accessTokenId,
            _partner_id: null,
            _client_id: null,
          });

          if (!summaryError && Array.isArray(summaryData)) {
            const summaryInvoice = summaryData.find((inv: any) => inv.id === invoiceId);

            if (summaryInvoice && summaryInvoice.client_bill != null) {
              const baseClientBill = summaryInvoice.client_bill;
              const expensesTotal = summaryInvoice.executor_expenses_total || 0;
              const scheme = invoiceData.scheme;
              const partnerRate = invoiceData.partner_commission_rate;

              const calculations = calculateInvoice(scheme, baseClientBill, partnerRate, expensesTotal);

              const calcObject = {
                client_bill: baseClientBill,
                executor_expenses_total: expensesTotal,
                client_spent: expensesTotal,
                client_base_after_margin: calculations.client_base_after_margin,
                client_remaining: calculations.client_remaining,
                agency_margin: calculations.agency_margin,
                partner_share_from_margin: calculations.partner_share_from_margin,
                admin_share_from_margin: calculations.admin_share_from_margin,
                commission_rate: calculations.commission_rate,
                commission_amount: calculations.commission_amount,
                amount_to_admin: calculations.amount_to_admin,
                net_profit_admin: calculations.net_profit_admin,
                admin_share_50: calculations.admin_share_50,
                cat_share_50: calculations.cat_share_50,
              };

              const existingCalc = Array.isArray(invoiceData.invoice_calculations)
                ? invoiceData.invoice_calculations[0] || {}
                : invoiceData.invoice_calculations || {};

              invoiceData = {
                ...invoiceData,
                invoice_calculations: [
                  {
                    ...existingCalc,
                    ...calcObject,
                  },
                ] as any,
              };
            }
          } else if (summaryError) {
            console.error("[InvoiceDetailsDialog] get_invoices_for_user error:", summaryError);
          }
        } catch (err) {
          console.error("[InvoiceDetailsDialog] Error loading summary invoice for calculations:", err);
        }
      }

      setInvoice(invoiceData);
      console.log('[InvoiceDetailsDialog] === FETCH COMPLETE ===', {
        hasInvoice: !!invoiceData,
        expensesCount: expenses.length,
        documentsCount: documents.length
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
    
    await ensureSessionContext();

    const { error } = await supabase
      .from("executor_expenses")
      .delete()
      .eq("id", deleteExpense.id);

    if (error) {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Успешно",
        description: "Расход удалён",
      });
      fetchInvoiceDetails();
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
      setPendingStatusChange({ status: newStatus, label: labels[newStatus] });
    } else {
      handleStatusChange(newStatus);
    }
  };

  const handleStatusChange = async (newStatus: "draft" | "sent" | "paid" | "cancelled") => {
    await ensureSessionContext();

    const { error } = await supabase
      .from("invoices")
      .update({ status: newStatus })
      .eq("id", invoiceId);

    if (error) {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Успешно",
        description: "Статус обновлен",
      });
      fetchInvoiceDetails();
    }
  };

  const confirmStatusChange = async () => {
    if (!pendingStatusChange) return;
    
    setUpdatingStatus(true);
    
    // Оптимистичное обновление UI
    const previousStatus = invoice.status;
    setInvoice(prev => ({ ...prev, status: pendingStatusChange.status }));
    
    await ensureSessionContext();

    const { error } = await supabase
      .from("invoices")
      .update({ status: pendingStatusChange.status })
      .eq("id", invoiceId);

    if (error) {
      // Откатить изменения
      setInvoice(prev => ({ ...prev, status: previousStatus }));
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Успешно",
        description: "Статус обновлён",
      });
      fetchInvoiceDetails();
    }
    
    setPendingStatusChange(null);
    setUpdatingStatus(false);
  };

  const handleUpdatePlannedDate = async (newDate: Date | undefined) => {
    if (!invoiceId) return;
    
    setUpdatingPaymentDate(true);
    const formattedDate = newDate ? format(newDate, 'yyyy-MM-dd') : null;
    
    await ensureSessionContext();

    const { error } = await supabase
      .from("invoices")
      .update({ payment_date: formattedDate })
      .eq("id", invoiceId);

    if (error) {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Успешно",
        description: newDate 
          ? "Планируемая дата оплаты установлена"
          : "Планируемая дата оплаты удалена",
      });
      fetchInvoiceDetails();
    }
    
    setUpdatingPaymentDate(false);
  };

  const handleUpdateActualPaymentDate = async (newDate: Date | undefined) => {
    if (!invoiceId) return;
    
    setUpdatingPaymentDate(true);
    
    const formattedDate = newDate ? format(newDate, 'yyyy-MM-dd') : null;
    const newStatus = newDate ? 'paid' : (invoice.status === 'paid' ? 'sent' : invoice.status);
    
    await ensureSessionContext();

    const { error } = await supabase
      .from("invoices")
      .update({ 
        actual_payment_date: formattedDate,
        status: newStatus
      })
      .eq("id", invoiceId);

    if (error) {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Успешно",
        description: newDate 
          ? "Фактическая дата оплаты установлена, статус обновлён на 'Оплачен'"
          : "Фактическая дата оплаты удалена",
      });
      fetchInvoiceDetails();
    }
    
    setUpdatingPaymentDate(false);
  };

  const handleUpdateNotes = async () => {
    if (!invoiceId) return;
    
    setUpdatingNotes(true);
    
    await ensureSessionContext();

    const { error } = await supabase
      .from("invoices")
      .update({ notes: notes.trim() || null })
      .eq("id", invoiceId);

    if (error) {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Успешно",
        description: "Комментарий обновлён",
      });
      fetchInvoiceDetails();
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
    
    await ensureSessionContext();

    const { error } = await supabase
      .from("invoices")
      .update({ invoice_number: trimmedNumber })
      .eq("id", invoiceId);

    if (error) {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Успешно",
        description: "Номер счета обновлён",
      });
      fetchInvoiceDetails();
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
      await ensureSessionContext();

      // 1. Обновляем процент партнёра в самом счёте
      const { error: invoiceError } = await supabase
        .from("invoices")
        .update({ partner_commission_rate: rate })
        .eq("id", invoiceId);

      if (invoiceError) {
        toast({
          title: "Ошибка обновления счёта",
          description: invoiceError.message,
          variant: "destructive",
        });
        return;
      }

      // Пересчёт теперь делает триггер в базе (on_invoice_commission_change)
      // поэтому дополнительный RPC-вызов здесь не нужен.

      toast({
        title: "Успешно",
        description: `Комиссия ${rate}% установлена, расчёты будут обновлены`,
      });

      // Обновляем данные счёта в интерфейсе
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

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      draft: "Черновик",
      sent: "Отправлен",
      paid: "Оплачен",
      cancelled: "Отменен"
    };
    return labels[status] || status;
  };

  const handleDownloadDocument = async (doc: any) => {
    try {
      const { data, error } = await supabase.storage
        .from('invoice-documents')
        .download(doc.file_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.file_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error: any) {
      toast({
        title: "Ошибка загрузки",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDeleteDocument = async () => {
    if (!deleteDocument) return;
    
    const doc = documents.find(d => d.id === deleteDocument.id);
    if (!doc) return;

    setDeletingDocumentId(deleteDocument.id);

    try {
      const { error: storageError } = await supabase.storage
        .from('invoice-documents')
        .remove([doc.file_path]);

      if (storageError) throw storageError;

      const { error: dbError } = await supabase
        .from('invoice_documents')
        .delete()
        .eq('id', deleteDocument.id);

      if (dbError) throw dbError;

      toast({
        title: "Успешно",
        description: "Документ удалён",
      });
      fetchInvoiceDetails();
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    }
    
    setDeleteDocument(null);
    setDeletingDocumentId(null);
  };

  if (loading || !invoice) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl">
          <div className="text-center py-8">Загрузка...</div>
        </DialogContent>
      </Dialog>
    );
  }

  const calcRaw = invoice.invoice_calculations;
  const calc = Array.isArray(calcRaw) ? calcRaw[0] : calcRaw || null;
  const isAgency30 = invoice.scheme === 'agency_30';
  const permissions = getVisibleFields(userRole, invoice.scheme);
  const actsCount = documents.filter(d => d.document_type === 'act').length;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
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
              <CardHeader>
                <CardTitle className="text-lg">Расчеты</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between text-lg font-bold">
                  <span>Счет клиенту:</span>
                  <span>{formatCurrency(calc?.client_bill || 0)}</span>
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
                            <span>К админу:</span>
                            <span className="text-primary font-medium">{formatCurrency(calc?.amount_to_admin || 0)}</span>
                          </div>
                          
                          {permissions.showExpensesTotal && (
                            <div className="flex justify-between text-sm text-muted-foreground">
                              <span>Расходы на исполнителей:</span>
                              <span>{formatCurrency(calc?.executor_expenses_total || 0)}</span>
                            </div>
                          )}
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

            {/* Документы и акты */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Документы и акты</CardTitle>
                {permissions.canUploadDocuments && (
                  <Button size="sm" onClick={() => setUploadDocOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Загрузить документ
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {documents.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    Нет загруженных документов
                  </p>
                ) : (
                  <div className="space-y-2">
                    {documents.map((doc) => (
                      <div key={doc.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{doc.file_name}</p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Badge variant="outline" className="text-xs">
                                {getDocumentTypeLabel(doc.document_type)}
                              </Badge>
                              <span>{formatFileSize(doc.file_size)}</span>
                              <span>•</span>
                              <span>{formatDate(doc.uploaded_at)}</span>
                            </div>
                            {doc.notes && (
                              <p className="text-xs text-muted-foreground mt-1">{doc.notes}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDownloadDocument(doc)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          {permissions.canUploadDocuments && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={deletingDocumentId === doc.id}
                              onClick={() => setDeleteDocument({ id: doc.id, name: doc.file_name })}
                            >
                              {deletingDocumentId === doc.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4 text-destructive" />
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
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

      {permissions.canUploadDocuments && (
        <UploadDocumentDialog
          open={uploadDocOpen}
          onOpenChange={setUploadDocOpen}
          invoiceId={invoiceId || ""}
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

      <AlertDialog open={!!deleteDocument} onOpenChange={(open) => !open && setDeleteDocument(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить документ?</AlertDialogTitle>
            <AlertDialogDescription>
              Вы действительно хотите удалить документ "{deleteDocument?.name}"? 
              Файл будет удалён из хранилища без возможности восстановления.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteDocument}
              disabled={!!deletingDocumentId}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deletingDocumentId ? (
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
            <AlertDialogTitle>Изменить статус счёта?</AlertDialogTitle>
            <AlertDialogDescription>
              Вы собираетесь изменить статус счёта на "{pendingStatusChange?.label}". 
              {pendingStatusChange?.status === "paid" && (
                " Это означает, что оплата получена от клиента."
              )}
              {pendingStatusChange?.status === "cancelled" && (
                " Счёт будет помечен как отменённый и не будет учитываться в расчётах."
              )}
              {" "}Продолжить?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmStatusChange}
              disabled={updatingStatus}
            >
              {updatingStatus ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Обновление...
                </>
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
