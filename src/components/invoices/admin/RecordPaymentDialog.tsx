import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { useUserRole } from "@/hooks/useUserRole";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { insertSupabaseNoReturn, querySupabaseWithFilter } from "@/lib/supabaseHelpers";
import { useRateLimit } from "@/hooks/useRateLimit";

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
  const { accessTokenId } = useUserRole();
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [invoiceOptions, setInvoiceOptions] = useState<Array<{ id: string; label: string }>>([]);
  const { checkLimit } = useRateLimit('form');

  useEffect(() => {
    const loadInvoices = async () => {
      if (!open) return;
      const data = await querySupabaseWithFilter<any>(
        "invoices",
        "id, invoice_number, scheme, invoice_calculations(amount_to_admin, admin_share_from_margin)",
        (q) => q.eq("partner_id", partnerId).order("created_at", { ascending: false })
      );
      
      if (!data) return;
      
      const options = data.map((inv: any) => {
        const calc = inv.invoice_calculations?.[0];
        const toTransfer = inv.scheme === 'agency_30'
          ? (Number(calc?.admin_share_from_margin) || 0)
          : (Number(calc?.amount_to_admin) || 0);
        return {
          id: inv.id,
          label: `№ ${inv.invoice_number} — к переводу ${formatCurrency(toTransfer)}`
        };
      });
      setInvoiceOptions(options);
    };
    loadInvoices();
  }, [open, partnerId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const limitCheck = checkLimit();
    if (!limitCheck.allowed) return;

    setLoading(true);

    try {
      // Validate inputs with zod
      const { paymentSchema } = await import('@/lib/validationSchemas');
      const validated = paymentSchema.parse({ 
        amount, 
        paymentDate: format(date, 'yyyy-MM-dd'),
        paymentMethod: '',
        notes,
        invoiceId: invoiceId || '',
        partnerId
      });

      if (!accessTokenId) {
        toast({
          title: "Ошибка",
          description: "Не удалось определить пользователя",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      if (validated.amount > remaining) {
        toast({
          title: "Ошибка",
          description: "Сумма платежа не может превышать остаток долга",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      const success = await insertSupabaseNoReturn(
        "partner_payments",
        {
          partner_id: validated.partnerId!,
          invoice_id: validated.invoiceId,
          amount: validated.amount,
          payment_date: validated.paymentDate,
          notes: validated.notes || null,
          created_by: accessTokenId,
        },
        { operation: "record_partner_payment" }
      );

      if (success) {
        toast({
          title: "Платеж записан",
          description: `Платеж партнёру ${partnerName} записан`,
        });
        setAmount("");
        setDate(new Date());
        setNotes("");
        setInvoiceId(null);
        onSuccess();
        onOpenChange(false);
      }
    } catch (error: any) {
      if (error.name === 'ZodError') {
        toast({
          title: "Ошибка валидации",
          description: error.errors[0]?.message || 'Ошибка валидации данных',
          variant: "destructive",
        });
      } else {
        toast({
          title: "Ошибка",
          description: "Не удалось записать платёж",
          variant: "destructive",
        });
      }
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
            <div className="text-sm text-muted-foreground mt-1">{partnerName}</div>
          </div>

          <div>
            <Label>Осталось оплатить</Label>
            <div className="text-lg font-semibold text-red-600 mt-1">
              {formatCurrency(remaining)}
            </div>
          </div>

          <div>
            <Label>Счёт *</Label>
            <Select value={invoiceId || ""} onValueChange={setInvoiceId}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите счёт" />
              </SelectTrigger>
              <SelectContent>
                {invoiceOptions.map((inv) => (
                  <SelectItem key={inv.id} value={inv.id}>
                    {inv.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Отмена
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Записываю..." : "Записать"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
