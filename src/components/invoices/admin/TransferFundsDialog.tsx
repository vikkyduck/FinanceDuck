import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/api";
import { formatCurrency } from "@/lib/format";

interface TransferFundsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTransferred?: () => void;
}

interface InvoiceLite {
  id: string;
  clientId: string | null;
  clientTitle: string | null;
  invoiceNumber: string | null;
  scheme: string;
  clientBill: number;
  clientRemaining: number;
  clientName?: string | null;
}

export const TransferFundsDialog = ({ open, onOpenChange, onTransferred }: TransferFundsDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [invoices, setInvoices] = useState<InvoiceLite[]>([]);
  const [clientId, setClientId] = useState<string>("");
  const [fromId, setFromId] = useState<string>("");
  const [toId, setToId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    setClientId(""); setFromId(""); setToId(""); setAmount(""); setNotes("");
    setLoading(true);
    apiGet<any[]>("/invoices")
      .then((rows) => {
        const list: InvoiceLite[] = rows.map((r: any) => ({
          id: r.id,
          clientId: r.client_id ?? r.clientId ?? r.client?.id ?? null,
          clientTitle: r.clientTitle ?? r.client_title ?? null,
          invoiceNumber: r.invoiceNumber ?? r.invoice_number ?? null,
          scheme: r.scheme,
          clientBill: Number(r.client_bill ?? r.clientBill ?? r.calculations?.clientBill ?? 0),
          clientRemaining: Number(r.calculations?.clientRemaining ?? 0),
          clientName: r.clients?.name ?? r.client?.name ?? r.client_name ?? null,
        }));
        setInvoices(list);
      })
      .catch((e) => toast.error(e?.message || "Не удалось загрузить счета"))
      .finally(() => setLoading(false));
  }, [open]);

  // Список клиентов из счетов
  const clientOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of invoices) {
      if (!i.clientId) continue;
      if (!map.has(i.clientId)) map.set(i.clientId, i.clientName || "—");
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [invoices]);

  const clientInvoices = useMemo(
    () => invoices.filter((i) => i.clientId === clientId),
    [invoices, clientId],
  );

  const fromInvoice = clientInvoices.find((i) => i.id === fromId);
  const toInvoice   = clientInvoices.find((i) => i.id === toId);

  const amt = Number(amount);
  const valid = !!clientId
    && !!fromId && !!toId && fromId !== toId
    && Number.isFinite(amt) && amt > 0
    && (fromInvoice ? amt <= fromInvoice.clientRemaining + 1e-6 : false);

  const submit = async () => {
    if (!valid) return;
    setSubmitting(true);
    try {
      await apiPost("/invoices/transfer", {
        fromInvoiceId: fromId,
        toInvoiceId: toId,
        amount: amt,
        notes: notes.trim() || null,
      });
      toast.success("Перенос выполнен");
      onTransferred?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Не удалось перенести");
    } finally {
      setSubmitting(false);
    }
  };

  const invoiceLabel = (i: InvoiceLite) =>
    `${i.clientTitle || i.invoiceNumber || i.id.slice(0, 6)} — доступно ${formatCurrency(i.clientRemaining)}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Перенос средств между счетами</DialogTitle>
          <DialogDescription>
            Не создаёт расхода/дохода — только переносит «доступно к расходованию»
            между счетами одного клиента. Админская математика и комиссии не меняются.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Клиент</Label>
              <Select value={clientId} onValueChange={(v) => { setClientId(v); setFromId(""); setToId(""); }}>
                <SelectTrigger><SelectValue placeholder="Выберите клиента" /></SelectTrigger>
                <SelectContent>
                  {clientOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-end gap-2">
              <div className="space-y-1">
                <Label>Со счёта</Label>
                <Select value={fromId} onValueChange={setFromId} disabled={!clientId}>
                  <SelectTrigger><SelectValue placeholder="Источник" /></SelectTrigger>
                  <SelectContent>
                    {clientInvoices.map((i) => (
                      <SelectItem key={i.id} value={i.id} disabled={i.id === toId}>
                        {invoiceLabel(i)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <ArrowRight className="h-4 w-4 mb-2 mx-auto text-muted-foreground hidden sm:block" />
              <div className="space-y-1">
                <Label>На счёт</Label>
                <Select value={toId} onValueChange={setToId} disabled={!clientId}>
                  <SelectTrigger><SelectValue placeholder="Получатель" /></SelectTrigger>
                  <SelectContent>
                    {clientInvoices.map((i) => (
                      <SelectItem key={i.id} value={i.id} disabled={i.id === fromId}>
                        {invoiceLabel(i)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Сумма, ₽</Label>
              <Input
                type="number" min="0" step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
              />
              {fromInvoice && (
                <p className="text-xs text-muted-foreground">
                  Доступно на источнике: {formatCurrency(fromInvoice.clientRemaining)}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label>Комментарий (опц.)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Например: остаток бюджета за июнь переносим на июль"
                rows={2}
              />
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>Отмена</Button>
              <Button onClick={submit} disabled={!valid || submitting}>
                {submitting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                Перенести
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
