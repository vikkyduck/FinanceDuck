import { useState, useMemo } from "react";
import { format, startOfMonth, endOfMonth, subMonths, startOfQuarter, endOfQuarter, subQuarters, startOfYear, endOfYear, subYears } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Search, Users, TrendingUp, Wallet, CircleDollarSign, Download, Loader2, X } from "lucide-react";
import { apiGet } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useDownloadReport } from "@/hooks/useDownloadReport";
import { useReportPreview } from "@/hooks/useReportPreview";
import { ReportPreviewDialog } from "@/components/shared/ReportPreviewDialog";

// Raw shape coming from /api/invoices (array of invoices, snake_case from DB)
interface RawInvoice {
  id: string;
  invoiceNumber?: string;
  status: string;
  scheme: string;
  clientBill?: string | number;
  clientId?: string | null;
  paymentDate?: string | null;
  // joined client object
  client?: { id: string; name: string } | null;
  calculations?: {
    clientBill?: string | number | null;
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
    return base > 0 ? base : n(inv.calculations?.clientBill ?? inv.clientBill);
  }
  // For closed commission: client pays clientBill (from calculations, since invoices.clientBill is null in DB)
  return n(inv.calculations?.clientBill ?? inv.clientBill);
}

function getSpent(inv: RawInvoice): number {
  return n(inv.calculations?.executorExpensesTotal);
}

function getRemaining(inv: RawInvoice): number {
  // For agency schemes: clientRemaining = clientBaseAfterMargin - expenses (correct client remaining)
  // For closed commission: the full clientBill is the service price; the difference vs executor expenses
  // is the agency's hidden margin (profit), NOT the client's remaining budget. Always 0 for the client.
  if (isAgency(inv.scheme)) {
    const rem = n(inv.calculations?.clientRemaining);
    if (rem !== 0) return rem;
    return getWorkingBudget(inv) - getSpent(inv);
  }
  return 0;
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
  // Use (budget - remaining)/budget so closed-commission invoices (remaining=0) show 100%
  const consumed = budget - remaining;
  const pct = budget > 0 ? Math.min(100, Math.round((consumed / budget) * 100)) : 0;

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

const DATE_PRESETS = [
  { key: "this-month", label: "Этот месяц" },
  { key: "last-month", label: "Прошлый месяц" },
  { key: "this-quarter", label: "Этот квартал" },
  { key: "last-quarter", label: "Прошлый квартал" },
  { key: "this-year", label: "Этот год" },
  { key: "last-year", label: "Прошлый год" },
];

function computePresetRange(preset: string): { from: string; to: string } | null {
  const now = new Date();
  let from: Date;
  let to: Date;
  switch (preset) {
    case "this-month":
      from = startOfMonth(now);
      to = endOfMonth(now);
      break;
    case "last-month": {
      const last = subMonths(now, 1);
      from = startOfMonth(last);
      to = endOfMonth(last);
      break;
    }
    case "this-quarter":
      from = startOfQuarter(now);
      to = endOfQuarter(now);
      break;
    case "last-quarter": {
      const lastQ = subQuarters(now, 1);
      from = startOfQuarter(lastQ);
      to = endOfQuarter(lastQ);
      break;
    }
    case "this-year":
      from = startOfYear(now);
      to = endOfYear(now);
      break;
    case "last-year": {
      const lastY = subYears(now, 1);
      from = startOfYear(lastY);
      to = endOfYear(lastY);
      break;
    }
    default:
      return null;
  }
  return { from: format(from, "yyyy-MM-dd"), to: format(to, "yyyy-MM-dd") };
}

function ClientCard({ group, isAdmin }: { group: ClientGroup; isAdmin: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const { download: downloadReport, isDownloadingKey } = useDownloadReport();
  const downloading = isDownloadingKey();
  const { previewing, previewOpen, preview, fetchPreview, closePreview, confirmDownload } = useReportPreview();

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    const safeName = group.clientName.replace(/[^a-zA-Zа-яА-Я0-9_\- ]/g, "").trim().replace(/\s+/g, "_");
    const safeDate = (d: string) => d.replace(/[^0-9\-]/g, "").slice(0, 10);
    const dateSuffix = dateFrom && dateTo
      ? `_${safeDate(dateFrom)}_${safeDate(dateTo)}`
      : dateFrom
      ? `_${safeDate(dateFrom)}`
      : dateTo
      ? `_${safeDate(dateTo)}`
      : `_${new Date().toISOString().split('T')[0]}`;
    const filename = `client_report_${safeName}${dateSuffix}.xlsx`;
    const body: Record<string, string> = { clientId: group.clientId };
    if (dateFrom) body.dateFrom = dateFrom;
    if (dateTo) body.dateTo = dateTo;
    fetchPreview(body, () => {
      downloadReport({
        url: '/api/admin/export/client-report',
        body: {
          clientId: group.clientId,
          ...(dateFrom ? { dateFrom } : {}),
          ...(dateTo ? { dateTo } : {}),
        },
        filename,
      });
    });
  };
  // Use (totalBudget - totalRemaining)/totalBudget so closed-commission invoices
  // (where remaining=0) count as fully consumed in the group progress bar
  const usedPct =
    group.totalBudget > 0
      ? Math.min(100, Math.round(((group.totalBudget - group.totalRemaining) / group.totalBudget) * 100))
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
          <div className="mt-2 space-y-1.5" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-wrap gap-1 justify-end">
              {DATE_PRESETS.map(({ key, label }) => (
                <Button
                  key={key}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[11px] px-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                  onClick={(e) => {
                    e.stopPropagation();
                    const range = computePresetRange(key);
                    if (range) { setDateFrom(range.from); setDateTo(range.to); }
                  }}
                  data-testid={`button-report-preset-${key}-${group.clientId}`}
                >
                  {label}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
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
                disabled={downloading || previewing}
                className="h-7 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                data-testid={`button-download-client-report-${group.clientId}`}
              >
                {downloading || previewing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Download className="h-3 w-3 mr-1" />}
                Отчёт для клиента
              </Button>
            </div>
          </div>
        )}

        <ReportPreviewDialog
          open={previewOpen}
          onClose={closePreview}
          onConfirm={confirmDownload}
          preview={preview}
          downloading={downloading}
        />

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

  const [search, setSearch] = useState<string>(
    () => (isAdmin ? localStorage.getItem("adminBalancesSearch") ?? "" : "")
  );
  const [filterFrom, setFilterFrom] = useState<string>(
    () => (isAdmin ? localStorage.getItem("adminBalancesFilterFrom") ?? "" : "")
  );
  const [filterTo, setFilterTo] = useState<string>(
    () => (isAdmin ? localStorage.getItem("adminBalancesFilterTo") ?? "" : "")
  );
  const [includeUndated, setIncludeUndated] = useState<boolean>(
    () => (isAdmin ? localStorage.getItem("adminBalancesIncludeUndated") === "true" : false)
  );

  const handleSetIncludeUndated = (value: boolean) => {
    setIncludeUndated(value);
    if (!isAdmin) return;
    if (value) {
      localStorage.setItem("adminBalancesIncludeUndated", "true");
    } else {
      localStorage.removeItem("adminBalancesIncludeUndated");
    }
  };

  const handleSetSearch = (value: string) => {
    setSearch(value);
    if (!isAdmin) return;
    if (value) {
      localStorage.setItem("adminBalancesSearch", value);
    } else {
      localStorage.removeItem("adminBalancesSearch");
    }
  };

  const handleSetFilterFrom = (value: string) => {
    setFilterFrom(value);
    if (!isAdmin) return;
    if (value) {
      localStorage.setItem("adminBalancesFilterFrom", value);
    } else {
      localStorage.removeItem("adminBalancesFilterFrom");
    }
  };

  const handleSetFilterTo = (value: string) => {
    setFilterTo(value);
    if (!isAdmin) return;
    if (value) {
      localStorage.setItem("adminBalancesFilterTo", value);
    } else {
      localStorage.removeItem("adminBalancesFilterTo");
    }
  };

  const invoices = Array.isArray(data) ? data : [];

  const dateFilteredInvoices = useMemo(() => {
    if (!filterFrom && !filterTo) return invoices;
    return invoices.filter((inv) => {
      if (!inv.paymentDate) return includeUndated;
      const d = inv.paymentDate.slice(0, 10);
      if (filterFrom && d < filterFrom) return false;
      if (filterTo && d > filterTo) return false;
      return true;
    });
  }, [invoices, filterFrom, filterTo, includeUndated]);

  const groups = useMemo(() => buildClientGroups(dateFilteredInvoices), [dateFilteredInvoices]);
  const allGroups = useMemo(() => buildClientGroups(invoices), [invoices]);

  const filtered = useMemo(() => {
    if (!search.trim()) return groups;
    const q = search.toLowerCase();
    return groups.filter((g) => g.clientName.toLowerCase().includes(q));
  }, [groups, search]);

  const hasDateFilter = !!(filterFrom || filterTo);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (allGroups.length === 0) {
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

      {isAdmin && (
        <div className="flex flex-wrap gap-1">
          {DATE_PRESETS.map(({ key, label }) => (
            <Button
              key={key}
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs px-2.5"
              onClick={() => {
                const range = computePresetRange(key);
                if (range) { handleSetFilterFrom(range.from); handleSetFilterTo(range.to); }
              }}
              data-testid={`button-filter-preset-${key}`}
            >
              {label}
            </Button>
          ))}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Поиск клиента…"
            value={search}
            onChange={(e) => handleSetSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-clients"
          />
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2 shrink-0">
            <input
              type="date"
              value={filterFrom}
              onChange={(e) => handleSetFilterFrom(e.target.value)}
              className="h-9 px-2 text-sm border border-slate-200 dark:border-slate-700 rounded-md bg-transparent text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-400"
              data-testid="input-filter-date-from"
              title="Начало периода"
            />
            <span className="text-xs text-slate-400">—</span>
            <input
              type="date"
              value={filterTo}
              onChange={(e) => handleSetFilterTo(e.target.value)}
              className="h-9 px-2 text-sm border border-slate-200 dark:border-slate-700 rounded-md bg-transparent text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-400"
              data-testid="input-filter-date-to"
              title="Конец периода"
            />
            {hasDateFilter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { handleSetFilterFrom(""); handleSetFilterTo(""); handleSetIncludeUndated(false); }}
                className="h-9 w-9 p-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                data-testid="button-clear-date-filter"
                title="Сбросить фильтр"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
        {isAdmin && hasDateFilter && (
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 cursor-pointer shrink-0" data-testid="label-include-undated">
            <input
              type="checkbox"
              checked={includeUndated}
              onChange={(e) => handleSetIncludeUndated(e.target.checked)}
              className="h-4 w-4 accent-blue-600 cursor-pointer"
              data-testid="checkbox-include-undated"
            />
            Без даты оплаты
          </label>
        )}
      </div>

      {hasDateFilter && (
        <p className="text-xs text-blue-600 dark:text-blue-400" data-testid="text-date-filter-active">
          Показано {dateFilteredInvoices.length} из {invoices.length} счетов
          {" · "}счета с датой оплаты
          {filterFrom && ` с ${filterFrom}`}
          {filterTo && ` по ${filterTo}`}
          {includeUndated && " · включая счета без даты оплаты"}
        </p>
      )}

      {filtered.length === 0 && (
        <p className="text-center py-6 text-slate-400 text-sm">
          {hasDateFilter ? "Нет счетов в выбранном периоде" : "Ничего не найдено"}
        </p>
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
