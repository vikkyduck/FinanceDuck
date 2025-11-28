import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRateLimit } from "@/hooks/useRateLimit";
import { invoiceService, type InvoiceListItem } from "@/lib/services/invoices";
import { Loader2 } from "lucide-react";

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
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [invoiceOptions, setInvoiceOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const { checkLimit } = useRateLimit('form');

  useEffect(() => {
    const loadInvoices = async () => {
      if (!open) return;
      setLoadingInvoices(true);
      setInvoiceError(null);
      try {
        const invoices = await invoiceService.fetchInvoices(partnerId);
        
        const options = invoices.map((inv: InvoiceListItem) => {
          const isMarginScheme = ['agency_30', 'partner_10', 'partner_15'].includes(inv.scheme);
          const toTransfer = isMarginScheme
            ? (Number(inv.admin_share_from_margin) || 0)
            : (Number(inv.commission_amount) || 0);
          return {
            id: inv.id,
            label: `${inv.invoice_number} - ${formatCurrency(toTransfer)}`
          };
        });
        setInvoiceOptions(options);
      } catch (error) {
        console.error("Error loading invoices:", error);
        setInvoiceError("Не удалось загрузить список счетов");
      } finally {
        setLoadingInvoices(false);
      }
    };
    loadInvoices();
  }, [open, partnerId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const limitCheck = checkLimit();
    if (!limitCheck.allowed) return;

    if (!amount || parseFloat(amount) <= 0) {
      toast({
        title: "Ошибка",
        description: "Введите сумму платежа",
        variant: "destructive",
      });
      return;
    }

    const amountNum = parseFloat(amount);
    if (amountNum > remaining) {
      toast({
        title: "Ошибка",
        description: "Сумма платежа не может превышать остаток долга",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      await invoiceService.createPartnerPayment({
        partnerId,
        invoiceId: invoiceId || undefined,
        amount: amountNum,
        paymentDate: format(date, 'yyyy-MM-dd'),
        notes: notes || undefined,
      });

      toast({
        title: "Приход записан",
        description: `Приход от ${partnerName} записан`,
      });
      setAmount("");
      setDate(new Date());
      setNotes("");
      setInvoiceId(null);
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error recording payment:", error);
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось записать приход",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
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
            <Select value={invoiceId || ""} onValueChange={setInvoiceId} disabled={loadingInvoices}>
              <SelectTrigger data-testid="select-invoice">
                <SelectValue placeholder={loadingInvoices ? "Загрузка..." : "Выберите счёт (опционально)"} />
              </SelectTrigger>
              <SelectContent>
                {invoiceOptions.map((inv) => (
                  <SelectItem key={inv.id} value={inv.id}>
                    {inv.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {invoiceError && (
              <p className="text-sm text-destructive mt-1">{invoiceError}</p>
            )}
          </div>

          <div>
            <Label htmlFor="amount">Сумма платежа *</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0"
              max={remaining}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              required
              data-testid="input-payment-amount"
            />
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
