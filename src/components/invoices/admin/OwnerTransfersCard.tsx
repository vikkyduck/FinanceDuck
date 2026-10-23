import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, History, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import { invalidateFinancialQueries } from "@/lib/financialQueries";
import { formatDate, formatMoney, todayIsoDate } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { useVisibilityAwareInterval } from "@/hooks/useVisibilityAwareInterval";

type Owner = "krya" | "kot";

interface OwnerBalance {
  since: string | null;
  opening: number;
  accrued: number;
  paidOut: number;
  balance: number;
}

interface OwnerTransfer {
  id: string;
  owner: Owner;
  kind: "opening" | "payout";
  amount: string;
  transferDate: string;
  notes: string | null;
}

interface OwnerLedger {
  kot: OwnerBalance;
  krya: OwnerBalance;
  pendingFromPartners: number;
  transfers: OwnerTransfer[];
}

const OWNER_NAMES: Record<Owner, string> = { kot: "Коту", krya: "себе" };

// minus: вычитаемая строка, ноль без знака ("-0 ₽" у Intl).
const Line = ({ label, value, minus = false }: { label: string; value: number; minus?: boolean }) => (
  <div className="flex justify-between gap-2 text-xs text-muted-foreground">
    <span>{label}</span>
    <span className="whitespace-nowrap">{formatMoney(minus && value !== 0 ? -value : value)}</span>
  </div>
);

/** Переводы Коту и себе со счета ИП: сколько должны Коту и сколько своей доли можно забрать. */
export const OwnerTransfersCard = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const refetchInterval = useVisibilityAwareInterval();
  const [payoutOwner, setPayoutOwner] = useState<Owner | null>(null);
  const [payout, setPayout] = useState({ amount: "", transferDate: todayIsoDate(), notes: "" });
  const [startOpen, setStartOpen] = useState(false);
  const [start, setStart] = useState({ since: todayIsoDate(), kot: "0", krya: "0" });
  const [historyOpen, setHistoryOpen] = useState(false);

  const { data, isLoading, isError } = useQuery<OwnerLedger>({
    queryKey: ["/api/admin/owner-ledger"],
    queryFn: () => apiGet<OwnerLedger>("/admin/owner-ledger"),
    refetchInterval,
    staleTime: 10000,
  });
  const onError = (error: Error) => toast({ title: "Ошибка", description: error.message, variant: "destructive" });
  const createPayout = useMutation({
    mutationFn: (owner: Owner) => apiPost("/admin/owner-transfers", { owner, ...payout, notes: payout.notes.trim() || null }),
    onSuccess: async () => {
      await invalidateFinancialQueries(queryClient);
      setPayoutOwner(null);
      setPayout({ amount: "", transferDate: todayIsoDate(), notes: "" });
    },
    onError,
  });
  const saveStart = useMutation({
    mutationFn: () => apiPut("/admin/owner-ledger/start", start),
    onSuccess: async () => {
      await invalidateFinancialQueries(queryClient);
      setStartOpen(false);
    },
    onError,
  });
  const deletePayout = useMutation({
    mutationFn: (id: string) => apiDelete(`/admin/owner-transfers/${id}`),
    onSuccess: () => invalidateFinancialQueries(queryClient),
    onError,
  });

  const openStart = () => {
    if (data?.kot.since) setStart({ since: data.kot.since, kot: String(data.kot.opening), krya: String(data.krya.opening) });
    setStartOpen(true);
  };
  const started = !!data?.kot.since && !!data?.krya.since;

  return (
    <Card data-testid="card-owner-transfers">
      <CardHeader className="pb-2">
        <CardTitle className="text-base sm:text-lg flex items-center gap-2">
          <ArrowRightLeft className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600" />
          Переводы Коту и себе
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : isError || !data ? (
          <p className="text-sm text-muted-foreground">Не удалось загрузить данные</p>
        ) : !started ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Укажите дату, с которой считать переводы, и остатки на эту дату. Если на эту дату вы с Котом в расчете и свою долю уже забрали, оставьте нули.
            </p>
            <Button onClick={openStart} data-testid="button-owner-ledger-start">Начать учет</Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3 sm:p-4 bg-background/50 rounded-lg space-y-1">
                <p className="text-sm text-muted-foreground">{data.kot.balance < 0 ? "Кот получил вперед" : "Должны Коту"}</p>
                <p className="text-xl sm:text-2xl font-bold text-orange-600 dark:text-orange-400" data-testid="text-owner-kot-balance">
                  {formatMoney(Math.abs(data.kot.balance))}
                </p>
                {data.kot.opening !== 0 && <Line label={`Остаток на ${formatDate(data.kot.since)}`} value={data.kot.opening} />}
                <Line label={`Доля Кота с ${formatDate(data.kot.since)}`} value={data.kot.accrued} />
                <Line label="Переведено Коту" value={data.kot.paidOut} minus />
                <Button size="sm" variant="outline" className="w-full mt-2" onClick={() => setPayoutOwner("kot")} data-testid="button-payout-kot">
                  Записать перевод Коту
                </Button>
              </div>
              <div className="p-3 sm:p-4 bg-background/50 rounded-lg space-y-1">
                <p className="text-sm text-muted-foreground">{data.krya.balance < 0 ? "Забрано больше доли" : "Можно забрать себе"}</p>
                <p className="text-xl sm:text-2xl font-bold text-amber-600 dark:text-amber-400" data-testid="text-owner-krya-balance">
                  {formatMoney(Math.abs(data.krya.balance))}
                </p>
                {data.krya.opening !== 0 && <Line label={`Остаток на ${formatDate(data.krya.since)}`} value={data.krya.opening} />}
                <Line label={`Доля Кря с ${formatDate(data.krya.since)}`} value={data.krya.accrued} />
                <Line label="Переведено себе" value={data.krya.paidOut} minus />
                <Button size="sm" variant="outline" className="w-full mt-2" onClick={() => setPayoutOwner("krya")} data-testid="button-payout-krya">
                  Записать перевод себе
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              <Button size="sm" variant="ghost" onClick={() => setHistoryOpen(true)} data-testid="button-owner-history">
                <History className="h-4 w-4 mr-1" />
                История переводов
              </Button>
              <Button size="sm" variant="ghost" onClick={openStart} data-testid="button-owner-ledger-restart">
                Изменить дату начала
              </Button>
            </div>
            {data.pendingFromPartners > 0 && (
              <p className="text-sm mt-2" data-testid="text-owner-pending">
                Ждет перевода от партнеров: прибыль {formatMoney(data.pendingFromPartners)}, по {formatMoney(data.pendingFromPartners / 2)} Коту и вам.
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              Доля начисляется, когда деньги пришли на счет ИП: по клиентам, которые платят вам напрямую, в день оплаты, по остальным партнерам после их перевода.
            </p>
          </>
        )}
      </CardContent>

      <Dialog open={payoutOwner !== null} onOpenChange={open => !open && setPayoutOwner(null)}>
        <DialogContent className="w-[95vw] sm:w-full">
          <DialogHeader>
            <DialogTitle>Перевод {payoutOwner ? OWNER_NAMES[payoutOwner] : ""}</DialogTitle>
            <DialogDescription>Сумма, которую вы перевели со счета ИП.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="owner-payout-amount">Сумма *</Label>
              <Input id="owner-payout-amount" type="number" min="0" step="0.01" value={payout.amount}
                onChange={e => setPayout({ ...payout, amount: e.target.value })} data-testid="input-owner-payout-amount" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="owner-payout-date">Дата *</Label>
              <Input id="owner-payout-date" type="date" value={payout.transferDate}
                onChange={e => setPayout({ ...payout, transferDate: e.target.value })} data-testid="input-owner-payout-date" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="owner-payout-notes">Комментарий</Label>
            <Input id="owner-payout-notes" value={payout.notes}
              onChange={e => setPayout({ ...payout, notes: e.target.value })} data-testid="input-owner-payout-notes" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPayoutOwner(null)}>Отмена</Button>
            <Button
              disabled={createPayout.isPending || !(Number(payout.amount) > 0) || !payout.transferDate}
              onClick={() => payoutOwner && createPayout.mutate(payoutOwner)}
              data-testid="button-save-owner-payout"
            >
              {createPayout.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Записать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={startOpen} onOpenChange={setStartOpen}>
        <DialogContent className="w-[95vw] sm:w-full">
          <DialogHeader>
            <DialogTitle>Дата начала учета</DialogTitle>
            <DialogDescription>
              Доли и переводы считаются с этой даты. В остатках учитывайте только деньги, которые уже пришли на счет ИП. Остаток со знаком минус значит, что получено больше положенного.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="owner-ledger-since">Считать с *</Label>
              <Input id="owner-ledger-since" type="date" value={start.since}
                onChange={e => setStart({ ...start, since: e.target.value })} data-testid="input-owner-ledger-since" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="owner-ledger-kot">Должны Коту на эту дату</Label>
                <Input id="owner-ledger-kot" type="number" step="0.01" value={start.kot}
                  onChange={e => setStart({ ...start, kot: e.target.value })} data-testid="input-owner-ledger-kot" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="owner-ledger-krya">Вашей доли на счете ИП</Label>
                <Input id="owner-ledger-krya" type="number" step="0.01" value={start.krya}
                  onChange={e => setStart({ ...start, krya: e.target.value })} data-testid="input-owner-ledger-krya" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setStartOpen(false)}>Отмена</Button>
            <Button
              disabled={saveStart.isPending || !start.since || start.kot.trim() === "" || start.krya.trim() === ""}
              onClick={() => saveStart.mutate()}
              data-testid="button-save-owner-ledger-start"
            >
              {saveStart.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-lg w-[95vw] sm:w-full">
          <DialogHeader>
            <DialogTitle>История переводов</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {data?.transfers.length ? data.transfers.map(transfer => {
              const since = data[transfer.owner].since;
              const ignored = transfer.kind === "payout" && !!since && transfer.transferDate < since;
              return (
                <div key={transfer.id} className={`flex items-center justify-between gap-2 p-2 rounded-md bg-muted/30 ${ignored ? "opacity-60" : ""}`}>
                  <div className="min-w-0">
                    <p className="text-sm">
                      {transfer.kind === "opening"
                        ? `Начало учета: остаток ${transfer.owner === "kot" ? "Кота" : "Кря"}`
                        : `Перевод ${OWNER_NAMES[transfer.owner]}`}
                      {" "}{formatMoney(Number(transfer.amount))}
                    </p>
                    <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      {formatDate(transfer.transferDate)}
                      {transfer.notes ? `, ${transfer.notes}` : ""}
                      {ignored ? ", до начала учета, не учитывается" : ""}
                    </p>
                  </div>
                  {transfer.kind === "payout" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={deletePayout.isPending}
                      onClick={() => { if (confirm("Удалить запись о переводе?")) deletePayout.mutate(transfer.id); }}
                      data-testid={`button-delete-owner-transfer-${transfer.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              );
            }) : (
              <p className="text-center text-muted-foreground py-8">Переводов еще не было</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
