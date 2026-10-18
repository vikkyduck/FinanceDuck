import { apiPatch } from '@/lib/api';
import { formatCurrency } from '@/lib/invoiceCalculations';
import { normalizeCalculations } from '@/lib/invoiceHelpers';
import { parseNum } from '@shared/financialEngine';
import { useEffect, useState } from 'react';
import type { InvoiceEditorContext } from './invoiceEditorContext';
import { useToast } from './use-toast';

/** Editable financial terms; canonical calculations stay on the server. */
export function useInvoiceFinancialTerms({ invoiceId, invoice, refresh: fetchInvoiceDetails }: InvoiceEditorContext) {
  const { toast } = useToast();
  const [partnerRate, setPartnerRate] = useState<number | "">("");
  const [updatingPartnerRate, setUpdatingPartnerRate] = useState(false);
  const [clientBillEdit, setClientBillEdit] = useState<number | "">("");
  const [updatingClientBill, setUpdatingClientBill] = useState(false);
  const [plannedExpensesEdit, setPlannedExpensesEdit] = useState<number | "">(
    "",
  );
  const [updatingPlannedExpenses, setUpdatingPlannedExpenses] = useState(false);
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
  useEffect(() => {
    const calc = normalizeCalculations(invoice?.invoice_calculations ?? null);
    setPartnerRate(invoice?.scheme === 'commission_based' ? calc?.commission_rate ?? invoice.partner_commission_rate ?? 10 : '');
    if (invoice) { setClientBillEdit(calc?.client_bill ?? invoice.client_bill ?? 0); setPlannedExpensesEdit(parseNum(invoice.planned_expenses)); }
  }, [invoice]);
  return {
    partnerRate, setPartnerRate, updatingPartnerRate, setUpdatingPartnerRate,
    clientBillEdit, setClientBillEdit, updatingClientBill, setUpdatingClientBill,
    plannedExpensesEdit, setPlannedExpensesEdit, updatingPlannedExpenses, setUpdatingPlannedExpenses,
    handleUpdateCommission, handleUpdateClientBill, handleUpdatePlannedExpenses,
  };
}
