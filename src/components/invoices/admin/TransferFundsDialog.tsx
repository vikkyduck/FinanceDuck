import type { InvoiceDto } from "@shared/contracts";
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
import { formatMoney } from "@/lib/format";

/**
 * Деньги переноса показываем ТОЧНО, с копейками, когда они есть.
 * Округление до рубля здесь врёт в опасную сторону: остаток 0,50 ₽
 * выглядел как «1 ₽», пользователь вводил 1 — и кнопка молча гасла,
 * потому что сервер сравнивает с точной суммой.
 */
const exactMoney = (v: number) => formatMoney(v, { decimals: !Number.isInteger(v) });

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
    apiGet<InvoiceDto[]>("/invoices")
      .then((rows) => {
        const list: InvoiceLite[] = rows.map((r) => ({
          id: r.id,
          clientId: r.clientId ?? r.client?.id ?? null,
          clientTitle: r.clientTitle ?? null,
          invoiceNumber: r.invoiceNumber ?? null,
          scheme: r.scheme,
          clientBill: Number(r.clientBill ?? r.calculations?.clientBill ?? 0),
          clientRemaining: Number(r.calculations?.clientRemaining ?? 0),
          clientName: r.client?.name ?? null,
        }));
        setInvoices(list);
      })
      .catch((e) => toast.error((e instanceof Error ? e.message : String(e)) || "Не удалось загрузить счета"))
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

  // Запятая как десятичный разделитель — привычный ввод, Number её не понимает
  const amt = Number(String(amount).replace(",", ".").trim());
  const available = fromInvoice ? fromInvoice.clientRemaining : 0;
  const valid = !!clientId
    && !!fromId && !!toId && fromId !== toId
    && Number.isFinite(amt) && amt > 0
    && (fromInvoice ? amt <= available + 1e-6 : false);

  /** Почему кнопка неактивна — молчаливый disabled читается как поломка. */
  const blockReason = (() => {
    if (valid || submitting) return null;
    if (!clientId) return "Выберите клиента";
    if (!fromId) return "Выберите счёт-источник";
    if (fromInvoice && available <= 0) {
      return available < 0
        ? `На источнике перерасход ${exactMoney(available)} — переносить нечего`
        : "На источнике нет доступных средств";
    }
    if (!toId) return "Выберите счёт-получатель";
    if (!amount.trim()) return "Укажите сумму";
    if (!Number.isFinite(amt) || amt <= 0) return "Сумма должна быть больше нуля";
    if (amt > available + 1e-6) return `Больше доступного — на источнике ${exactMoney(available)}`;
    return null;
  })();

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
    } catch (e: unknown) {
      toast.error((e instanceof Error ? e.message : String(e)) || "Не удалось перенести");
    } finally {
      setSubmitting(false);
    }
  };

  const invoiceLabel = (i: InvoiceLite) =>
    `${i.clientTitle || i.invoiceNumber || i.id.slice(0, 6)} — доступно ${exactMoney(i.clientRemaining)}`;

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
                    {/* Источник без денег выбрать нельзя — иначе выбор молча
                        ведёт в тупик с неактивной кнопкой. */}
                    {clientInvoices.map((i) => (
                      <SelectItem key={i.id} value={i.id} disabled={i.id === toId || i.clientRemaining <= 0}>
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
              <div className="flex gap-2">
                <Input
                  type="number" min="0" step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                />
                {/* «Всё» подставляет ТОЧНЫЙ остаток — вручную его не набрать,
                    если в нём копейки, а на экране рубли. */}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAmount(String(available))}
                  disabled={!fromInvoice || available <= 0}
                >
                  Всё
                </Button>
              </div>
              {fromInvoice && (
                <p className="text-xs text-muted-foreground">
                  Доступно на источнике: {exactMoney(available)}
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

            <div className="flex flex-wrap items-center gap-2 justify-end pt-2">
              {blockReason && (
                <p className="text-xs text-muted-foreground mr-auto" data-testid="text-transfer-block-reason">
                  {blockReason}
                </p>
              )}
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
