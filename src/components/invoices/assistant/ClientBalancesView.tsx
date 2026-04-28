import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Search, Users, TrendingUp, Wallet, CircleDollarSign, Download, Loader2 } from "lucide-react";
import { apiGet } from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

// Raw shape coming from /api/invoices (array of invoices, snake_case from DB)
interface RawInvoice {
  id: string;
  invoiceNumber?: string;
  status: string;
  scheme: string;
  clientBill?: string | number;
  clientId?: string | null;
  // joined client object
  client?: { id: string; name: string } | null;
  calculations?: {
    clientRemaining?: string | number | null;
    clientBaseAfterMargin?: string | number | null;
    executorExpensesTotal?: string | number | null;
  } | null;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Черновик",
  sent: "Отправлен",
  paid: "Оплачен",
  cancelled: "Отменён",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  sent: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  paid: "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  cancelled: "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300",
};

const SCHEME_LABELS: Record<string, string> = {
  agency_30: "Агентство 30%",
  agency_40: "Агентство 40%",
  partner_10: "Партнёр 10%",
  partner_15: "Партнёр 15%",
  commission_based: "Соглашение",
};

function n(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const parsed = typeof v === "string" ? parseFloat(v) : v;
  return isNaN(parsed) ? 0 : parsed;
}

function formatRub(amount: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(amount);
}

function isAgency(scheme: string) {
  return scheme === "agency_30" || scheme === "agency_40";
}

function getWorkingBudget(inv: RawInvoice): number {
  if (isAgency(inv.scheme)) {
    const base = n(inv.calculations?.clientBaseAfterMargin);
    return base > 0 ? base : n(inv.clientBill);
  }
  return n(inv.clientBill);
}

function getSpent(inv: RawInvoice): number {
  return n(inv.calculations?.executorExpensesTotal);
}

function getRemaining(inv: RawInvoice): number {
  const rem = n(inv.calculations?.clientRemaining);
  if (rem !== 0) return rem;
  return getWorkingBudget(inv) - getSpent(inv);
}

interface ClientGroup {
  clientId: string;
  clientName: string;
  invoices: RawInvoice[];
  totalBudget: number;
  totalSpent: number;
  totalRemaining: number;
  activeCount: number;
}

function buildClientGroups(invoices: RawInvoice[]): ClientGroup[] {
  const map = new Map<string, ClientGroup>();

  for (const inv of invoices) {
    if (inv.status === "cancelled") continue;
    const key = inv.clientId ?? "__no_client__";
    const name = inv.client?.name ?? "Без клиента";

    if (!map.has(key)) {
      map.set(key, {
        clientId: key,
        clientName: name,
        invoices: [],
        totalBudget: 0,
        totalSpent: 0,
        totalRemaining: 0,
        activeCount: 0,
      });
    }

    const group = map.get(key)!;
    group.invoices.push(inv);
    group.totalBudget += getWorkingBudget(inv);
    group.totalSpent += getSpent(inv);
    group.totalRemaining += getRemaining(inv);
    if (inv.status === "sent" || inv.status === "draft") group.activeCount++;
  }

  return Array.from(map.values()).sort((a, b) =>
    a.clientName.localeCompare(b.clientName, "ru")
  );
}

function InvoiceRow({ inv }: { inv: RawInvoice }) {
  const budget = getWorkingBudget(inv);
  const spent = getSpent(inv);
  const remaining = getRemaining(inv);
  const pct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;

  return (
    <div
      className="flex flex-col sm:flex-row sm:items-center gap-2 py-3 border-b last:border-0 border-slate-100 dark:border-slate-800"
      data-testid={`row-invoice-${inv.id}`}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="font-mono text-sm text-slate-500 dark:text-slate-400 shrink-0">
          {inv.invoiceNumber ?? "—"}
        </span>
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_COLORS[inv.status] ?? STATUS_COLORS.draft}`}
        >
          {STATUS_LABELS[inv.status] ?? inv.status}
        </span>
        <span className="text-xs text-slate-400 dark:text-slate-500 truncate">
          {SCHEME_LABELS[inv.scheme] ?? inv.scheme}
        </span>
      </div>

      <div className="flex items-center gap-4 sm:gap-6">
        <div className="flex flex-col items-end">
          <span className="text-xs text-slate-400">Бюджет</span>
          <span className="text-sm font-medium tabular-nums">{formatRub(budget)}</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-xs text-slate-400">Потрачено</span>
          <span className="text-sm tabular-nums text-slate-600 dark:text-slate-300">{formatRub(spent)}</span>
        </div>
        <div className="flex flex-col items-end min-w-[90px]">
          <span className="text-xs text-slate-400">Остаток</span>
          <span
            className={`text-sm font-semibold tabular-nums ${
              remaining <= 0
                ? "text-red-500 dark:text-red-400"
                : remaining < budget * 0.15
                ? "text-orange-500 dark:text-orange-400"
                : "text-green-600 dark:text-green-400"
            }`}
          >
            {formatRub(remaining)}
          </span>
        </div>
      </div>

      <div className="sm:w-24 hidden sm:block">
        <Progress value={pct} className="h-1.5" />
        <span className="text-[10px] text-slate-400 mt-0.5 block text-right">{pct}%</span>
      </div>
    </div>
  );
}

async function downloadClientReport(clientId: string, clientName: string, dateFrom?: string, dateTo?: string) {
  const csrfToken = localStorage.getItem("csrf_token");
  const response = await fetch('/api/admin/export/client-report', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    },
    credentials: 'include',
    body: JSON.stringify({ clientId, ...(dateFrom ? { dateFrom } : {}), ...(dateTo ? { dateTo } : {}) }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Ошибка сервера' }));
    throw new Error(err.error || `HTTP ${response.status}`);
  }
  const buffer = await response.arrayBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeName = clientName.replace(/[^a-zA-Zа-яА-Я0-9_\- ]/g, "").trim().replace(/\s+/g, "_");
  a.download = `отчёт_${safeName}_${new Date().toISOString().split('T')[0]}.xlsx`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { window.URL.revokeObjectURL(url); document.body.removeChild(a); }, 100);
}

function ClientCard({ group, isAdmin }: { group: ClientGroup; isAdmin: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setDownloading(true);
    try {
      await downloadClientReport(group.clientId, group.clientName, dateFrom || undefined, dateTo || undefined);
      toast.success("Отчёт скачан");
    } catch (err: any) {
      toast.error("Ошибка при скачивании", { description: err.message });
    } finally {
      setDownloading(false);
    }
  };
  const usedPct =
    group.totalBudget > 0
      ? Math.min(100, Math.round((group.totalSpent / group.totalBudget) * 100))
      : 0;

  const remainingColor =
    group.totalRemaining <= 0
      ? "text-red-500 dark:text-red-400"
      : group.totalRemaining < group.totalBudget * 0.15
      ? "text-orange-500 dark:text-orange-400"
      : "text-green-600 dark:text-green-400";

  return (
    <Card
      className="border border-slate-200 dark:border-slate-700 shadow-none hover:shadow-sm transition-shadow"
      data-testid={`card-client-${group.clientId}`}
    >
      <CardContent className="p-4">
        <button
          className="w-full text-left"
          onClick={() => setExpanded((v) => !v)}
          data-testid={`button-expand-client-${group.clientId}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              {expanded ? (
                <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
              )}
              <div className="min-w-0">
                <p className="font-semibold text-base leading-tight truncate" data-testid={`text-client-name-${group.clientId}`}>
                  {group.clientName}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {group.invoices.length}{" "}
                  {group.invoices.length === 1 ? "счёт" : group.invoices.length < 5 ? "счёта" : "счетов"}
                  {group.activeCount > 0 && (
                    <span className="ml-1 text-blue-500">· {group.activeCount} активных</span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex gap-4 sm:gap-6 shrink-0">
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-slate-400 uppercase tracking-wide">Бюджет</span>
                <span className="text-sm font-medium tabular-nums" data-testid={`text-budget-${group.clientId}`}>
                  {formatRub(group.totalBudget)}
                </span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-slate-400 uppercase tracking-wide">Потрачено</span>
                <span className="text-sm tabular-nums text-slate-500" data-testid={`text-spent-${group.clientId}`}>
                  {formatRub(group.totalSpent)}
                </span>
              </div>
              <div className="flex flex-col items-end min-w-[80px]">
                <span className="text-[10px] text-slate-400 uppercase tracking-wide">Остаток</span>
                <span className={`text-sm font-bold tabular-nums ${remainingColor}`} data-testid={`text-remaining-${group.clientId}`}>
                  {formatRub(group.totalRemaining)}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-3">
            <Progress value={usedPct} className="h-2" />
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-slate-400">использовано {usedPct}%</span>
              <span className="text-[10px] text-slate-400">свободно {100 - usedPct}%</span>
            </div>
          </div>
        </button>

        {isAdmin && (
          <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              className="h-7 px-2 text-xs border border-slate-200 dark:border-slate-700 rounded bg-transparent text-slate-600 dark:text-slate-300"
              data-testid={`input-date-from-${group.clientId}`}
              title="Начало периода"
            />
            <span className="text-xs text-slate-400">—</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              className="h-7 px-2 text-xs border border-slate-200 dark:border-slate-700 rounded bg-transparent text-slate-600 dark:text-slate-300"
              data-testid={`input-date-to-${group.clientId}`}
              title="Конец периода"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDownload}
              disabled={downloading}
              className="h-7 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              data-testid={`button-download-client-report-${group.clientId}`}
            >
              {downloading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Download className="h-3 w-3 mr-1" />}
              Отчёт для клиента
            </Button>
          </div>
        )}

        {expanded && (
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
            {group.invoices.map((inv) => (
              <InvoiceRow key={inv.id} inv={inv} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryBar({ groups }: { groups: ClientGroup[] }) {
  const totalBudget = groups.reduce((s, g) => s + g.totalBudget, 0);
  const totalSpent = groups.reduce((s, g) => s + g.totalSpent, 0);
  const totalRemaining = groups.reduce((s, g) => s + g.totalRemaining, 0);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 flex items-center gap-2">
        <Users className="h-4 w-4 text-slate-400 shrink-0" />
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wide">Клиентов</p>
          <p className="text-lg font-bold" data-testid="text-total-clients">{groups.length}</p>
        </div>
      </div>
      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 flex items-center gap-2">
        <CircleDollarSign className="h-4 w-4 text-slate-400 shrink-0" />
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wide">Бюджет</p>
          <p className="text-base font-bold tabular-nums" data-testid="text-total-budget">{formatRub(totalBudget)}</p>
        </div>
      </div>
      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-slate-400 shrink-0" />
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wide">Потрачено</p>
          <p className="text-base font-bold tabular-nums" data-testid="text-total-spent">{formatRub(totalSpent)}</p>
        </div>
      </div>
      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 flex items-center gap-2">
        <Wallet className="h-4 w-4 text-green-500 shrink-0" />
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wide">Суммарный остаток</p>
          <p className="text-base font-bold tabular-nums text-green-600 dark:text-green-400" data-testid="text-total-remaining">
            {formatRub(totalRemaining)}
          </p>
        </div>
      </div>
    </div>
  );
}

export function ClientBalancesView() {
  const { role } = useAuth();
  const isAdmin = role === "admin";

  const { data, isLoading } = useQuery<RawInvoice[]>({
    queryKey: ['/api/invoices'],
    queryFn: () => apiGet<RawInvoice[]>('/invoices'),
    staleTime: 30000,
  });

  const [search, setSearch] = useState("");

  const invoices = Array.isArray(data) ? data : [];

  const groups = useMemo(() => buildClientGroups(invoices), [invoices]);

  const filtered = useMemo(() => {
    if (!search.trim()) return groups;
    const q = search.toLowerCase();
    return groups.filter((g) => g.clientName.toLowerCase().includes(q));
  }, [groups, search]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
        <p>Нет счетов с привязанными клиентами</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SummaryBar groups={groups} />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Поиск клиента…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          data-testid="input-search-clients"
        />
      </div>

      {filtered.length === 0 && (
        <p className="text-center py-6 text-slate-400 text-sm">Ничего не найдено</p>
      )}

      <div className="space-y-3">
        {filtered.map((group) => (
          <ClientCard key={group.clientId} group={group} isAdmin={isAdmin} />
        ))}
      </div>

      <p className="text-[11px] text-slate-400 text-center pt-1">
        Бюджет указан с учётом агентской комиссии · отменённые счета не отображаются
      </p>
    </div>
  );
}
