import { useInvoicePage } from '@/hooks/useInvoicePage';
import { InvoicePicker } from '../InvoicePicker';
import type { InvoiceDto } from "@shared/contracts";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { apiPost } from "@/lib/api";
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

export const TransferFundsDialog = ({ open, onOpenChange, onTransferred }: TransferFundsDialogProps) => {
  const [submitting, setSubmitting] = useState(false);
  const [clientId, setClientId] = useState<string>("");
  const [fromInvoice, setFromInvoice] = useState<InvoiceDto | null>(null);
  const [toInvoice, setToInvoice] = useState<InvoiceDto | null>(null);
  const fromId = fromInvoice?.id;
  const toId = toInvoice?.id;
  const directory = useInvoicePage({ page: 1, limit: 1 }, open);
  const clientOptions = directory.data?.clients ?? [];
  const loading = directory.isLoading;
  const [amount, setAmount] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    setClientId(""); setFromInvoice(null); setToInvoice(null); setAmount(""); setNotes("");
  }, [open]);

  // Запятая как десятичный разделитель — привычный ввод, Number её не понимает
  const amt = Number(String(amount).replace(",", ".").trim());
  const available = fromInvoice ? Number(fromInvoice.calculations?.clientRemaining ?? 0) : 0;
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

        {directory.error ? <p role="alert">Не удалось загрузить клиентов. <Button onClick={() => directory.refetch()}>Повторить</Button></p> : loading ? (
          <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Клиент</Label>
              <Select value={clientId} onValueChange={(v) => { setClientId(v); setFromInvoice(null); setToInvoice(null); }}>
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
                <InvoicePicker key={`from-${clientId}`} selected={fromInvoice} onSelect={setFromInvoice} clientId={clientId}
                  positiveBalance excludeId={toId} disabled={!clientId || !open} label="Источник" />
              </div>
              <ArrowRight className="h-4 w-4 mb-2 mx-auto text-muted-foreground hidden sm:block" />
              <div className="space-y-1">
                <Label>На счёт</Label>
                <InvoicePicker key={`to-${clientId}`} selected={toInvoice} onSelect={setToInvoice} clientId={clientId}
                  excludeId={fromId} disabled={!clientId || !open} label="Получатель" />
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
