import { useState } from 'react';
import { parseNum } from '@shared/financialEngine';
import { apiPatch, apiPost } from '@/lib/api';
import { useToast } from './use-toast';
import type { useInvoice } from './useInvoice';

export function useInvoicePeriodCommands({ invoiceId, invoice, refresh: fetchInvoiceDetails }: {
  invoiceId: string | null; invoice: ReturnType<typeof useInvoice>['invoice']; refresh: () => Promise<unknown>;
}) {
  const { toast } = useToast();
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertUnit, setConvertUnit] = useState<"month" | "day" | "hour">(
    "month",
  );
  const [convertPrice, setConvertPrice] = useState<string>("");
  const [convertTotal, setConvertTotal] = useState<string>("");
  const [converting, setConverting] = useState(false);
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
  return { convertOpen, setConvertOpen, convertUnit, setConvertUnit, convertPrice, setConvertPrice, convertTotal, setConvertTotal, converting, setConverting, handleConvertToSubscription, handleRevertToOneTime, handleSetPeriod };
}
