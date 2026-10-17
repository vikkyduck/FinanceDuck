import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { InvoicePicker } from '../InvoicePicker';
import type { InvoiceDto } from '@shared/contracts';
import { useRateLimit } from "@/hooks/useRateLimit";
import { invoiceService } from "@/lib/services/invoices";
import { Loader2, AlertTriangle } from "lucide-react";

interface RecordPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partnerId: string;
  partnerName: string;
  remaining: number;
  onSuccess: () => void;
}

export const RecordPaymentDialog = ({
  open,
  onOpenChange,
  partnerId,
  partnerName,
  remaining,
  onSuccess,
}: RecordPaymentDialogProps) => {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState<Date>(new Date());
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceDto | null>(null);
  const invoiceId = selectedInvoice?.id;
  useEffect(() => setSelectedInvoice(null), [partnerId, open]);
  const { checkLimit } = useRateLimit('form');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const limitCheck = checkLimit();
    if (!limitCheck.allowed) return;

    if (!amount || parseFloat(amount) === 0) {
      toast({
        title: "Ошибка",
        description: "Введите сумму платежа (отрицательная = возврат партнёру)",
        variant: "destructive",
      });
      return;
    }

    const amountNum = parseFloat(amount);

    setLoading(true);

    try {
      await invoiceService.createPartnerPayment({
        partnerId,
        invoiceId: invoiceId || undefined,
        amount: amountNum,
        paymentDate: format(date, 'yyyy-MM-dd'),
        notes: notes || undefined,
      });

      const isRefund = amountNum < 0;
      toast({
        title: isRefund ? "Возврат записан" : "Приход записан",
        description: isRefund 
          ? `Возврат ${formatCurrency(Math.abs(amountNum))} партнёру ${partnerName}`
          : `Приход от ${partnerName} записан`,
      });
      setAmount("");
      setDate(new Date());
      setNotes("");
      setSelectedInvoice(null);
      onSuccess();
      onOpenChange(false);
    } catch (error: unknown) {
      console.error("Error recording payment:", error);
      toast({
        title: "Ошибка",
        description: (error instanceof Error ? error.message : String(error)) || "Не удалось записать приход",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:w-full">
        <DialogHeader>
          <DialogTitle>Записать приход от партнёра</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Партнёр</Label>
            <div className="text-sm text-muted-foreground mt-1" data-testid="text-partner-name">
              {partnerName}
            </div>
          </div>

          <div>
            <Label>Осталось оплатить</Label>
            <div className="text-lg font-semibold text-red-600 mt-1" data-testid="text-remaining-amount">
              {formatCurrency(remaining)}
            </div>
          </div>

          <div>
            <Label>Счёт</Label>
            <InvoicePicker key={partnerId} selected={selectedInvoice} onSelect={setSelectedInvoice} partnerId={partnerId} paidOnly disabled={!open} label="Выберите счёт (опционально)" />
          </div>

          <div>
            <Label htmlFor="amount">Сумма платежа *</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              required
              data-testid="input-payment-amount"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Отрицательная сумма = возврат денег партнёру
            </p>
            {amount && parseFloat(amount) > 0 && parseFloat(amount) > remaining && remaining > 0 && (
              <div className="flex items-center gap-2 mt-2 p-2 rounded-md bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 text-sm">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                <span>Сумма превышает остаток долга на {formatCurrency(parseFloat(amount) - remaining)}</span>
              </div>
            )}
            {amount && parseFloat(amount) < 0 && (
              <div className="flex items-center gap-2 mt-2 p-2 rounded-md bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 text-sm">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                <span>Возврат партнёру: {formatCurrency(Math.abs(parseFloat(amount)))}</span>
              </div>
            )}
          </div>

          <div>
            <Label>Дата платежа *</Label>
            <DatePicker
              date={date}
              onDateChange={(newDate) => newDate && setDate(newDate)}
              placeholder="Выберите дату"
            />
          </div>

          <div>
            <Label htmlFor="notes">Примечание</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Необязательно"
              rows={3}
              data-testid="input-payment-notes"
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              data-testid="button-cancel-payment"
            >
              Отмена
            </Button>
            <Button type="submit" disabled={loading} data-testid="button-submit-payment">
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {loading ? "Записываю..." : "Записать"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
