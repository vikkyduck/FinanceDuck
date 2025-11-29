import { useQuery } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { StatsGrid, StatConfig } from "@/components/ui/stats-grid";
import { TrendingUp, ShoppingCart, FileText, Repeat } from "lucide-react";
import { apiGet } from "@/lib/api";

interface MonthlyData {
  monthNumber: number;
  totalSales: number;
  totalProfit: number;
  invoiceCount: number;
  expenses: number;
}

interface DraftsStats {
  totalDrafts: number;
  totalDraftAmount: number;
  currentMonthDrafts: number;
  currentMonthAmount: number;
  fromRecurring: number;
  fromRecurringAmount: number;
}

interface SalesStatisticsProps {
  year: number;
}

export const SalesStatistics = ({ year }: SalesStatisticsProps) => {
  const { data, isLoading } = useQuery<MonthlyData[]>({
    queryKey: ['admin-monthly-data', year],
    queryFn: () => apiGet<MonthlyData[]>(`/admin/monthly-data?year=${year}`),
  });

  const { data: draftsStats, isLoading: draftsLoading } = useQuery<DraftsStats>({
    queryKey: ['admin-drafts-stats'],
    queryFn: () => apiGet<DraftsStats>('/admin/drafts-stats'),
    refetchInterval: 120000,
  });

  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();

  let yearSales = 0;
  let yearCount = 0;
  let currentMonthSales = 0;
  let currentMonthCount = 0;

  (data || []).forEach((row) => {
    yearSales += row.totalSales;
    yearCount += row.invoiceCount;

    if (year === currentYear && row.monthNumber === currentMonth) {
      currentMonthSales = row.totalSales;
      currentMonthCount = row.invoiceCount;
    }
  });

  const getMonthName = () => {
    const monthNames = [
      "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
      "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
    ];
    return monthNames[new Date().getMonth()];
  };

  const pluralize = (n: number) => {
    if (n === 1) return 'черновик';
    if (n >= 2 && n <= 4) return 'черновика';
    return 'черновиков';
  };

  const statsConfig: StatConfig[] = [
    {
      icon: FileText,
      title: "Черновики к отправке",
      value: draftsStats?.totalDrafts || 0,
      description: formatCurrency(draftsStats?.totalDraftAmount || 0),
      valueClassName: "text-amber-600 dark:text-amber-400",
    },
    {
      icon: Repeat,
      title: "Из recurring",
      value: draftsStats?.fromRecurring || 0,
      description: formatCurrency(draftsStats?.fromRecurringAmount || 0),
      valueClassName: "text-blue-600 dark:text-blue-400",
    },
    {
      icon: ShoppingCart,
      title: `Оплачено за ${getMonthName()}`,
      value: formatCurrency(currentMonthSales),
      description: `${currentMonthCount} счетов`,
      valueClassName: "text-green-600 dark:text-green-400",
    },
    {
      icon: TrendingUp,
      title: "Оплачено за год",
      value: formatCurrency(yearSales),
      description: `${yearCount} счетов`,
      valueClassName: "text-chart-2",
    },
  ];

  return <StatsGrid stats={statsConfig} loading={isLoading || draftsLoading} columns={4} />;
};
