import { useState } from "react";
import { formatMoney } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { apiGet } from "@/lib/api";
import { useVisibilityAwareInterval } from "@/hooks/useVisibilityAwareInterval";
import { 
  TrendingUp, 
  Scale,
  Banknote,
  FileText,
  Percent,
  DollarSign,
  Users,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Info
} from "lucide-react";

interface DashboardStats {
  yearlySummary: {
    totalRevenue: number;
    totalProfit: number;
    netProfitMargin: number;
  };
  monthlyCashFlow: {
    received: number;
    expected: number;
    recurring?: number;
  };
  monthlyProfit: number;
  ownerShares: {
    yearlyKrya: number;
    yearlyKot: number;
    monthlyKrya: number;
    monthlyKot: number;
  };
  monthlySales: {
    draftsCount: number;
    draftsTotal: number;
  };
  leverage: {
    othersProfit: number;
    bvProfit: number;
    vikaProfit: number;
    ratio: number;
  };
  recurringExpected?: {
    monthlyAmount: number;
    yearlyTotal: number;
  };
  selectedYear: number;
  selectedMonth: number;
  availableYears: number[];
}

interface DashboardInvoiceDetail {
  id: string;
  invoiceNumber: string;
  clientName: string | null;
  netProfitAdmin: number;
  clientBill: number;
  status: string;
  paymentDate: string | null;
}

type DashboardCategory = 'received' | 'expected' | 'drafts' | 'overdue' | 'drafts_no_date';

interface InvoiceListProps {
  year: number;
  month: number;
  category: DashboardCategory;
  isOpen: boolean;
}

interface RecurringInvoiceForMonth {
  id: string;
  clientName: string | null;
  partnerName: string | null;
  amount: number;
  expectedProfit: number;
  frequency: string;
  dayOfMonth: number;
  scheme: string;
}

const InvoiceList = ({ year, month, category, isOpen }: InvoiceListProps) => {
  const { data: invoices, isLoading } = useQuery<DashboardInvoiceDetail[]>({
    queryKey: ["/api/admin/dashboard-invoices", year, month, category],
    queryFn: () => apiGet<DashboardInvoiceDetail[]>(`/admin/dashboard-invoices?year=${year}&month=${month}&category=${category}`),
    enabled: isOpen,
    staleTime: 30000,
  });

  if (!isOpen) return null;

  if (isLoading) {
    return (
      <div className="pt-2 space-y-1">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-6 w-full" />
        ))}
      </div>
    );
  }

  if (!invoices || invoices.length === 0) {
    return (
      <div className="pt-2 text-sm text-muted-foreground">
        Нет счетов
      </div>
    );
  }

  return (
    <div className="pt-2 space-y-1 max-h-48 overflow-y-auto">
      {invoices.map(inv => (
        <Link
          key={inv.id}
          to={`/invoices/${inv.id}`}
          className="flex items-center justify-between gap-2 p-1.5 rounded hover-elevate text-sm group"
          data-testid={`link-invoice-${inv.id}`}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <ExternalLink className="h-3 w-3 text-muted-foreground group-hover:text-primary shrink-0" />
            <span className="truncate font-medium">{inv.invoiceNumber}</span>
            {inv.clientName && (
              <span className="truncate text-muted-foreground text-xs hidden sm:inline">
                {inv.clientName}
              </span>
            )}
          </div>
          <span className="shrink-0 font-semibold text-xs">
            {formatCurrency(inv.netProfitAdmin)}
          </span>
        </Link>
      ))}
    </div>
  );
};

interface RecurringListProps {
  year: number;
  month: number;
  isOpen: boolean;
}

const getFrequencyLabel = (freq: string): string => {
  const labels: Record<string, string> = {
    'monthly': 'ежемесячно',
    'quarterly': 'ежеквартально',
    'yearly': 'ежегодно',
  };
  return labels[freq] || freq;
};

const RecurringList = ({ year, month, isOpen }: RecurringListProps) => {
  const { data: recurring, isLoading } = useQuery<RecurringInvoiceForMonth[]>({
    queryKey: ["/api/admin/dashboard-recurring", year, month],
    queryFn: () => apiGet<RecurringInvoiceForMonth[]>(`/admin/dashboard-recurring?year=${year}&month=${month}`),
    enabled: isOpen,
    staleTime: 30000,
  });

  if (!isOpen) return null;

  if (isLoading) {
    return (
      <div className="pt-2 space-y-1">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-6 w-full" />
        ))}
      </div>
    );
  }

  if (!recurring || recurring.length === 0) {
    return (
      <div className="pt-2 text-sm text-muted-foreground">
        Нет регулярных счетов
      </div>
    );
  }

  return (
    <div className="pt-2 space-y-1 max-h-48 overflow-y-auto">
      {recurring.map(rec => (
        <Link
          key={rec.id}
          to="/recurring-invoices"
          className="flex items-center justify-between gap-2 p-1.5 rounded hover-elevate text-sm group"
          data-testid={`link-recurring-${rec.id}`}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <ExternalLink className="h-3 w-3 text-muted-foreground group-hover:text-primary shrink-0" />
            <span className="truncate font-medium">{rec.clientName || 'Без клиента'}</span>
            <span className="truncate text-muted-foreground text-xs hidden sm:inline">
              {getFrequencyLabel(rec.frequency)}
            </span>
          </div>
          <span className="shrink-0 font-semibold text-xs">
            {formatCurrency(rec.expectedProfit)}
          </span>
        </Link>
      ))}
    </div>
  );
};

const MONTH_NAMES = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
];

const formatCurrency = (amount: number) => formatMoney(amount);

const wordScheta = (n: number) => n === 1 ? 'счёт' : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? 'счёта' : 'счетов';

/**
 * Карточка «провал в список» для долгов/висяков. Сама тянет список по категории
 * (не привязано к месяцу — «как сейчас»), показывает заголовком либо сумму
 * чистой прибыли (долги), либо число счетов; разворачивается в кликабельный
 * список (каждый счёт → /invoices/:id). Пустая — приглушённое «всё чисто».
 */
const DrillDownCard = ({
  icon: Icon, title, subtitle, category, accentClass, showProfitSum,
}: {
  icon: typeof FileText;
  title: string;
  subtitle: string;
  category: 'overdue' | 'drafts_no_date';
  accentClass: string;
  showProfitSum: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const { data: invoices = [], isLoading } = useQuery<DashboardInvoiceDetail[]>({
    // year/month игнорируются бэком для этих категорий, но передаём для единого ключа
    queryKey: ["/api/admin/dashboard-invoices", 0, 0, category],
    queryFn: () => apiGet<DashboardInvoiceDetail[]>(`/admin/dashboard-invoices?year=0&month=0&category=${category}`),
    staleTime: 30000,
  });
  const count = invoices.length;
  const totalProfit = invoices.reduce((s, i) => s + i.netProfitAdmin, 0);
  const empty = !isLoading && count === 0;

  return (
    <Card data-testid={`card-${category}`} className={empty ? "border-success/40" : "border-destructive/40"}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Icon className={`h-4 w-4 ${empty ? "text-success" : accentClass}`} />
          {title}
        </CardTitle>
        <p className="text-xs text-muted-foreground flex items-start gap-1 mt-0.5">
          <Info className="h-3 w-3 shrink-0 mt-0.5" />
          {subtitle}
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="text-center">
          <p className={`text-2xl sm:text-3xl font-bold ${empty ? "text-success" : accentClass}`} data-testid={`text-${category}-headline`}>
            {isLoading ? "…" : showProfitSum ? formatCurrency(totalProfit) : count}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {empty ? "всё чисто" : `${count} ${wordScheta(count)}${showProfitSum ? " к сбору" : ""}`}
          </p>
        </div>
        {count > 0 && (
          <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger className="w-full" data-testid={`trigger-${category}`}>
              <div className="flex items-center justify-center gap-1 hover-elevate p-1 rounded cursor-pointer text-sm text-muted-foreground">
                <span>{open ? "Скрыть счета" : "Показать счета"}</span>
                {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <InvoiceList year={0} month={0} category={category} isOpen={open} />
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
};

export const AdminDashboardMetrics = () => {
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [openReceivedList, setOpenReceivedList] = useState(false);
  const [openExpectedList, setOpenExpectedList] = useState(false);
  const [openDraftsList, setOpenDraftsList] = useState(false);
  const [openRecurringList, setOpenRecurringList] = useState(false);
  const refetchInterval = useVisibilityAwareInterval();

  const { data: stats, isLoading, isError } = useQuery<DashboardStats>({
    queryKey: ["/api/admin/dashboard-stats", selectedYear, selectedMonth],
    queryFn: () => apiGet<DashboardStats>(`/admin/dashboard-stats?year=${selectedYear}&month=${selectedMonth}`),
    refetchInterval,
    staleTime: 10000,
    retry: 2,
  });

  if (isLoading) {
    return (
      <div className="space-y-6 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="text-center p-4 bg-background/50 rounded-lg">
                  <Skeleton className="h-4 w-20 mx-auto mb-2" />
                  <Skeleton className="h-8 w-32 mx-auto" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-32 mb-2" />
                <Skeleton className="h-4 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Handle error or no data gracefully - don't crash the whole page
  if (isError || !stats) return null;

  const availableYears = stats.availableYears.length > 0 ? stats.availableYears : [new Date().getFullYear()];

  return (
    <div className="space-y-6 mb-6">
      {/* Yearly Summary - Top Row */}
      <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Годовая сводка
            </CardTitle>
            <Select
              value={selectedYear.toString()}
              onValueChange={(val) => setSelectedYear(parseInt(val))}
            >
              <SelectTrigger className="w-[120px]" data-testid="select-year">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableYears.map((year) => (
                  <SelectItem key={year} value={year.toString()}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="text-center p-3 sm:p-4 bg-background/50 rounded-lg">
              <div className="flex items-center justify-center gap-1 mb-1">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Оборот</p>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-blue-600 dark:text-blue-400 break-words" data-testid="text-yearly-revenue">
                {formatCurrency(stats.yearlySummary.totalRevenue)}
              </p>
            </div>
            <div className="text-center p-3 sm:p-4 bg-background/50 rounded-lg">
              <div className="flex items-center justify-center gap-1 mb-1">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Чистая прибыль</p>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-green-600 dark:text-green-400 break-words" data-testid="text-yearly-profit">
                {formatCurrency(stats.yearlySummary.totalProfit)}
              </p>
            </div>
            <div className="text-center p-3 sm:p-4 bg-background/50 rounded-lg">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Percent className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Рентабельность</p>
              </div>
              <p className={`text-xl sm:text-2xl font-bold ${stats.yearlySummary.netProfitMargin >= 20 ? 'text-green-600 dark:text-green-400' : stats.yearlySummary.netProfitMargin >= 10 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`} data-testid="text-yearly-margin">
                {stats.yearlySummary.netProfitMargin.toFixed(1)}%
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Month Selector */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Месяц:</span>
        <Select
          value={selectedMonth.toString()}
          onValueChange={(val) => setSelectedMonth(parseInt(val))}
        >
          <SelectTrigger className="w-[160px]" data-testid="select-month">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONTH_NAMES.map((name, index) => (
              <SelectItem key={index} value={index.toString()}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Bottom Row - 3 Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Net Profit Card */}
        <Card data-testid="card-cashflow">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Banknote className="h-4 w-4 text-green-600" />
              Чистая прибыль ({MONTH_NAMES[selectedMonth]})
            </CardTitle>
            <p className="text-xs text-muted-foreground flex items-start gap-1 mt-0.5">
              <Info className="h-3 w-3 shrink-0 mt-0.5" />
              Деньги, поступившие или ожидаемые к получению именно в этом месяце
            </p>
          </CardHeader>
          <CardContent className="space-y-2 sm:space-y-3">
            {/* Received - expandable */}
            <Collapsible open={openReceivedList} onOpenChange={setOpenReceivedList}>
              <CollapsibleTrigger className="w-full" data-testid="trigger-received-list">
                <div className="flex items-center justify-between gap-2 hover-elevate p-1 -m-1 rounded cursor-pointer">
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-muted-foreground">Получено</span>
                    {openReceivedList ? (
                      <ChevronUp className="h-3 w-3 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    )}
                  </div>
                  <span className="font-semibold text-green-600 text-sm sm:text-base" data-testid="text-cashflow-received">
                    {formatCurrency(stats.monthlyCashFlow.received)}
                  </span>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <InvoiceList year={selectedYear} month={selectedMonth} category="received" isOpen={openReceivedList} />
              </CollapsibleContent>
            </Collapsible>

            {/* Expected - expandable */}
            <Collapsible open={openExpectedList} onOpenChange={setOpenExpectedList}>
              <CollapsibleTrigger className="w-full" data-testid="trigger-expected-list">
                <div className="flex items-center justify-between gap-2 hover-elevate p-1 -m-1 rounded cursor-pointer">
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-muted-foreground">Ожидается</span>
                    {openExpectedList ? (
                      <ChevronUp className="h-3 w-3 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    )}
                  </div>
                  <span className="font-semibold text-amber-600 text-sm sm:text-base" data-testid="text-cashflow-expected">
                    {formatCurrency(stats.monthlyCashFlow.expected)}
                  </span>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <InvoiceList year={selectedYear} month={selectedMonth} category="expected" isOpen={openExpectedList} />
              </CollapsibleContent>
            </Collapsible>

            {(stats.monthlyCashFlow.recurring || 0) > 0 && (
              <Collapsible open={openRecurringList} onOpenChange={setOpenRecurringList}>
                <CollapsibleTrigger className="w-full" data-testid="trigger-recurring-list">
                  <div className="flex items-center justify-between gap-2 hover-elevate p-1 -m-1 rounded cursor-pointer">
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-muted-foreground">Регулярные</span>
                      {openRecurringList ? (
                        <ChevronUp className="h-3 w-3 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                      )}
                    </div>
                    <span className="font-semibold text-blue-600 text-sm sm:text-base" data-testid="text-cashflow-recurring">
                      {formatCurrency(stats.monthlyCashFlow.recurring || 0)}
                    </span>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <RecurringList year={selectedYear} month={selectedMonth} isOpen={openRecurringList} />
                </CollapsibleContent>
              </Collapsible>
            )}
            <div className="pt-2 border-t">
              <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm font-medium">Итого</span>
                <span className="font-bold text-sm sm:text-base" data-testid="text-cashflow-total">
                  {formatCurrency(stats.monthlyCashFlow.received + stats.monthlyCashFlow.expected + (stats.monthlyCashFlow.recurring || 0))}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sales (Drafts) Card - expandable */}
        <Card data-testid="card-sales">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-600" />
              Продажи ({MONTH_NAMES[selectedMonth]})
            </CardTitle>
            <p className="text-xs text-muted-foreground flex items-start gap-1 mt-0.5">
              <Info className="h-3 w-3 shrink-0 mt-0.5" />
              Новые проекты, заключённые в этом месяце. Регулярные платежи сюда не включаются
            </p>
          </CardHeader>
          <CardContent className="space-y-2 sm:space-y-3">
            <Collapsible open={openDraftsList} onOpenChange={setOpenDraftsList}>
              <CollapsibleTrigger className="w-full" data-testid="trigger-drafts-list">
                <div className="flex items-center justify-between gap-2 hover-elevate p-1 -m-1 rounded cursor-pointer">
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-muted-foreground">Количество</span>
                    {openDraftsList ? (
                      <ChevronUp className="h-3 w-3 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    )}
                  </div>
                  <Badge variant="secondary" data-testid="badge-drafts-count">
                    {stats.monthlySales.draftsCount} шт.
                  </Badge>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <InvoiceList year={selectedYear} month={selectedMonth} category="drafts" isOpen={openDraftsList} />
              </CollapsibleContent>
            </Collapsible>
            <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm text-muted-foreground">Прибыль (итого)</span>
              <span className="font-semibold text-sm sm:text-base" data-testid="text-drafts-total">
                {formatCurrency(stats.monthlySales.draftsTotal)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground pt-2 border-t">
              Может пересекаться с «Доходами», если проект продан и оплачен в одном месяце
            </p>
          </CardContent>
        </Card>

        {/* Efficiency Coefficient Card */}
        <Card data-testid="card-efficiency">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Scale className="h-4 w-4 text-purple-600" />
              Коэффициент эффективности
            </CardTitle>
            <p className="text-xs text-muted-foreground flex items-start gap-1 mt-0.5">
              <Info className="h-3 w-3 shrink-0 mt-0.5" />
              (Другие партнёры + актив БВ) / Вика Уткина лично за {MONTH_NAMES[selectedMonth]}
            </p>
          </CardHeader>
          <CardContent className="space-y-2 sm:space-y-3">
            <div className="text-center">
              <p className="text-2xl sm:text-3xl font-bold text-purple-600 dark:text-purple-400" data-testid="text-efficiency-ratio">
                {stats.leverage.vikaProfit > 0
                  ? ((stats.leverage.othersProfit + stats.leverage.bvProfit) / stats.leverage.vikaProfit).toFixed(2)
                  : (stats.leverage.othersProfit + stats.leverage.bvProfit) > 0 ? '∞' : '—'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {MONTH_NAMES[selectedMonth]} · (Другие + БВ) / Вика лично
              </p>
            </div>
            <div className="pt-2 border-t space-y-1 text-sm">
              <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
                <span className="text-muted-foreground">Другие партнёры</span>
                <span className="text-sm sm:text-base" data-testid="text-efficiency-others">{formatCurrency(stats.leverage.othersProfit)}</span>
              </div>
              <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
                <span className="text-muted-foreground">Актив БВ (управление)</span>
                <span className="text-sm sm:text-base" data-testid="text-efficiency-bv">{formatCurrency(stats.leverage.bvProfit)}</span>
              </div>
              <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
                <span className="text-muted-foreground">Вика Уткина лично</span>
                <span className="text-sm sm:text-base" data-testid="text-efficiency-vika">{formatCurrency(stats.leverage.vikaProfit)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Долги к сбору + Черновики без даты оплаты (заменили «Требует внимания») */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <DrillDownCard
          icon={DollarSign}
          title="Долги к сбору"
          subtitle="Просроченные счета (срок оплаты прошёл, не оплачены) — сумма чистой прибыли"
          category="overdue"
          accentClass="text-red-600 dark:text-red-400"
          showProfitSum
        />
        <DrillDownCard
          icon={FileText}
          title="Черновики без даты оплаты"
          subtitle="Заведены, но не проставлена плановая дата оплаты — требуют действия"
          category="drafts_no_date"
          accentClass="text-amber-600 dark:text-amber-400"
          showProfitSum={false}
        />
      </div>

      {/* Owner Shares Card - Full Width */}
      <Card className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-amber-500/20" data-testid="card-owner-shares">
        <CardHeader className="pb-2">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <Users className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600" />
            Доли (50/50)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            {/* Yearly Shares */}
            <div className="space-y-2 sm:space-y-3">
              <h4 className="text-xs sm:text-sm font-medium text-muted-foreground">
                За {selectedYear} год (прибыль: {formatCurrency(stats.yearlySummary.totalProfit)})
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
                <div className="flex items-center justify-between sm:flex-col sm:text-center p-2 sm:p-4 bg-background/50 rounded-lg">
                  <p className="text-xs sm:text-sm text-muted-foreground">Доля Кря</p>
                  <p className="text-base sm:text-2xl font-bold text-amber-600 dark:text-amber-400" data-testid="text-yearly-krya">
                    {formatCurrency(stats.ownerShares.yearlyKrya)}
                  </p>
                </div>
                <div className="flex items-center justify-between sm:flex-col sm:text-center p-2 sm:p-4 bg-background/50 rounded-lg">
                  <p className="text-xs sm:text-sm text-muted-foreground">Доля Кота</p>
                  <p className="text-base sm:text-2xl font-bold text-orange-600 dark:text-orange-400" data-testid="text-yearly-kot">
                    {formatCurrency(stats.ownerShares.yearlyKot)}
                  </p>
                </div>
              </div>
            </div>
            
            {/* Monthly Shares */}
            <div className="space-y-2 sm:space-y-3">
              <h4 className="text-xs sm:text-sm font-medium text-muted-foreground">
                {MONTH_NAMES[selectedMonth]} (прибыль: {formatCurrency(stats.monthlyProfit)})
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
                <div className="flex items-center justify-between sm:flex-col sm:text-center p-2 sm:p-4 bg-background/50 rounded-lg">
                  <p className="text-xs sm:text-sm text-muted-foreground">Доля Кря</p>
                  <p className="text-base sm:text-2xl font-bold text-amber-600 dark:text-amber-400" data-testid="text-monthly-krya">
                    {formatCurrency(stats.ownerShares.monthlyKrya)}
                  </p>
                </div>
                <div className="flex items-center justify-between sm:flex-col sm:text-center p-2 sm:p-4 bg-background/50 rounded-lg">
                  <p className="text-xs sm:text-sm text-muted-foreground">Доля Кота</p>
                  <p className="text-base sm:text-2xl font-bold text-orange-600 dark:text-orange-400" data-testid="text-monthly-kot">
                    {formatCurrency(stats.ownerShares.monthlyKot)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
