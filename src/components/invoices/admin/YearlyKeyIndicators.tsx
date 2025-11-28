import { useQuery } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { StatsGrid, StatConfig } from "@/components/ui/stats-grid";
import { TrendingUp, Wallet, Trophy, DollarSign } from "lucide-react";

interface MonthlyData {
  monthNumber: number;
  totalSales: number;
  totalProfit: number;
  invoiceCount: number;
  expenses: number;
}

interface YearlyKeyIndicatorsProps {
  year: number;
}

export const YearlyKeyIndicators = ({ year }: YearlyKeyIndicatorsProps) => {
  const { data, isLoading } = useQuery<MonthlyData[]>({
    queryKey: ['/api/admin/monthly-data', year],
  });

  const monthNames = [
    "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
    "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
  ];

  let totalSales = 0;
  let totalProfit = 0;
  let bestMonthIndex = 0;
  let bestMonthProfit = 0;

  (data || []).forEach((row) => {
    totalSales += row.totalSales;
    totalProfit += row.totalProfit;

    if (row.totalProfit > bestMonthProfit) {
      bestMonthProfit = row.totalProfit;
      bestMonthIndex = row.monthNumber - 1;
    }
  });

  const statsConfig: StatConfig[] = [
    {
      icon: DollarSign,
      title: "Продано за год",
      value: formatCurrency(totalSales),
      description: "Общая сумма контрактов",
      valueClassName: "text-primary",
    },
    {
      icon: Wallet,
      title: "Чистая прибыль за год",
      value: formatCurrency(totalProfit),
      description: "Итоговая прибыль",
      valueClassName: "text-chart-2",
    },
    {
      icon: Trophy,
      title: "Лучший месяц",
      value: bestMonthProfit > 0 ? monthNames[bestMonthIndex] : "—",
      description: bestMonthProfit > 0 ? formatCurrency(bestMonthProfit) : "Нет данных",
      valueClassName: "text-chart-3",
    },
    {
      icon: TrendingUp,
      title: "Поступило за год",
      value: formatCurrency(totalSales),
      description: "Фактические поступления",
    },
  ];

  return <StatsGrid stats={statsConfig} loading={isLoading} columns={4} />;
};
