import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiGet } from "@/lib/api";
import { 
  TrendingUp, 
  Scale,
  Banknote,
  FileText,
  Percent,
  DollarSign,
  Users
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

const MONTH_NAMES = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
];

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

export const AdminDashboardMetrics = () => {
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());

  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/admin/dashboard-stats", selectedYear, selectedMonth],
    queryFn: () => apiGet<DashboardStats>(`/admin/dashboard-stats?year=${selectedYear}&month=${selectedMonth}`),
    refetchInterval: 30000,
    staleTime: 10000,
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

  if (!stats) return null;

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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-background/50 rounded-lg">
              <div className="flex items-center justify-center gap-1 mb-1">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Оборот</p>
              </div>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400" data-testid="text-yearly-revenue">
                {formatCurrency(stats.yearlySummary.totalRevenue)}
              </p>
            </div>
            <div className="text-center p-4 bg-background/50 rounded-lg">
              <div className="flex items-center justify-center gap-1 mb-1">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Чистая прибыль</p>
              </div>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400" data-testid="text-yearly-profit">
                {formatCurrency(stats.yearlySummary.totalProfit)}
              </p>
            </div>
            <div className="text-center p-4 bg-background/50 rounded-lg">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Percent className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Net Profit Margin</p>
              </div>
              <p className={`text-2xl font-bold ${stats.yearlySummary.netProfitMargin >= 20 ? 'text-green-600 dark:text-green-400' : stats.yearlySummary.netProfitMargin >= 10 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`} data-testid="text-yearly-margin">
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
        {/* Cash Flow Card */}
        <Card data-testid="card-cashflow">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Banknote className="h-4 w-4 text-green-600" />
              Cash Flow ({MONTH_NAMES[selectedMonth]})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Получено</span>
              <span className="font-semibold text-green-600" data-testid="text-cashflow-received">
                {formatCurrency(stats.monthlyCashFlow.received)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Ожидается</span>
              <span className="font-semibold text-amber-600" data-testid="text-cashflow-expected">
                {formatCurrency(stats.monthlyCashFlow.expected)}
              </span>
            </div>
            {(stats.monthlyCashFlow.recurring || 0) > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Recurring</span>
                <span className="font-semibold text-blue-600" data-testid="text-cashflow-recurring">
                  {formatCurrency(stats.monthlyCashFlow.recurring || 0)}
                </span>
              </div>
            )}
            <div className="pt-2 border-t">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Итого</span>
                <span className="font-bold" data-testid="text-cashflow-total">
                  {formatCurrency(stats.monthlyCashFlow.received + stats.monthlyCashFlow.expected + (stats.monthlyCashFlow.recurring || 0))}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sales (Drafts) Card */}
        <Card data-testid="card-sales">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-600" />
              Sales ({MONTH_NAMES[selectedMonth]})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Количество</span>
              <Badge variant="secondary" data-testid="badge-drafts-count">
                {stats.monthlySales.draftsCount} шт.
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Сумма</span>
              <span className="font-semibold" data-testid="text-drafts-total">
                {formatCurrency(stats.monthlySales.draftsTotal)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground pt-2 border-t">
              Счета в работе, ожидающие оплаты
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
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-center">
              <p className="text-3xl font-bold text-purple-600 dark:text-purple-400" data-testid="text-efficiency-ratio">
                {stats.leverage.ratio.toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Другие / Вика Уткина
              </p>
            </div>
            <div className="pt-2 border-t space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Другие партнёры</span>
                <span data-testid="text-efficiency-others">{formatCurrency(stats.leverage.othersProfit)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Вика Уткина</span>
                <span data-testid="text-efficiency-vika">{formatCurrency(stats.leverage.vikaProfit)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Owner Shares Card - Full Width */}
      <Card className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-amber-500/20" data-testid="card-owner-shares">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5 text-amber-600" />
            Доли (50/50)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Yearly Shares */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">
                За {selectedYear} год (чистая прибыль: {formatCurrency(stats.yearlySummary.totalProfit)})
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 bg-background/50 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Доля Кря</p>
                  <p className="text-2xl font-bold text-amber-600 dark:text-amber-400" data-testid="text-yearly-krya">
                    {formatCurrency(stats.ownerShares.yearlyKrya)}
                  </p>
                </div>
                <div className="text-center p-4 bg-background/50 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Доля Кота</p>
                  <p className="text-2xl font-bold text-orange-600 dark:text-orange-400" data-testid="text-yearly-kot">
                    {formatCurrency(stats.ownerShares.yearlyKot)}
                  </p>
                </div>
              </div>
            </div>
            
            {/* Monthly Shares */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">
                {MONTH_NAMES[selectedMonth]} {selectedYear} (чистая прибыль: {formatCurrency(stats.monthlyProfit)})
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 bg-background/50 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Доля Кря</p>
                  <p className="text-2xl font-bold text-amber-600 dark:text-amber-400" data-testid="text-monthly-krya">
                    {formatCurrency(stats.ownerShares.monthlyKrya)}
                  </p>
                </div>
                <div className="text-center p-4 bg-background/50 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Доля Кота</p>
                  <p className="text-2xl font-bold text-orange-600 dark:text-orange-400" data-testid="text-monthly-kot">
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
