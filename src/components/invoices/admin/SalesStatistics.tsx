import { useQuery } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { StatsGrid, StatConfig } from "@/components/ui/stats-grid";
import { TrendingUp, ShoppingCart, Calendar, Target } from "lucide-react";

interface MonthlyData {
  monthNumber: number;
  totalSales: number;
  totalProfit: number;
  invoiceCount: number;
  expenses: number;
}

interface SalesStatisticsProps {
  year: number;
}

export const SalesStatistics = ({ year }: SalesStatisticsProps) => {
  const { data, isLoading } = useQuery<MonthlyData[]>({
    queryKey: ['/api/admin/monthly-data', year],
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

  const avgDealSize = yearCount > 0 ? yearSales / yearCount : 0;

  const getMonthName = () => {
    const monthNames = [
      "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
      "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
    ];
    return monthNames[new Date().getMonth()];
  };

  const statsConfig: StatConfig[] = [
    {
      icon: ShoppingCart,
      title: `Продажи за ${getMonthName()}`,
      value: formatCurrency(currentMonthSales),
      description: `${currentMonthCount} ${currentMonthCount === 1 ? 'счет' : 'счетов'}`,
      valueClassName: "text-primary",
    },
    {
      icon: TrendingUp,
      title: "Продажи за год",
      value: formatCurrency(yearSales),
      description: `${yearCount} ${yearCount === 1 ? 'счет' : 'счетов'}`,
      valueClassName: "text-chart-2",
    },
    {
      icon: Target,
      title: "Средний чек",
      value: formatCurrency(avgDealSize),
      description: "в среднем за год",
    },
    {
      icon: Calendar,
      title: "Новых счетов в месяц",
      value: yearCount > 0 ? Math.round(yearCount / 12) : 0,
      description: "среднее значение",
    },
  ];

  return <StatsGrid stats={statsConfig} loading={isLoading} columns={4} />;
};
