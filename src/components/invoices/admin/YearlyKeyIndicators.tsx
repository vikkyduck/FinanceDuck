import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { StatsGrid, StatConfig } from "@/components/ui/stats-grid";
import { TrendingUp, Wallet, Trophy, DollarSign } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface YearlyKeyIndicatorsProps {
  year: number;
}

export const YearlyKeyIndicators = ({ year }: YearlyKeyIndicatorsProps) => {
  const [stats, setStats] = useState({
    totalSales: 0,
    totalProfit: 0,
    bestMonth: "",
    bestMonthProfit: 0,
    totalReceived: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchYearlyStats();
  }, [year]);

  const { accessTokenId } = useAuth();

  const fetchYearlyStats = async () => {
    if (!accessTokenId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_admin_monthly_data', {
        _token_id: accessTokenId,
        _year: year
      });

      if (error) throw error;

      let totalSales = 0;
      let totalProfit = 0;
      let bestMonthIndex = 0;
      let bestMonthProfit = 0;

      const monthNames = [
        "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
        "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
      ];

      (data || []).forEach((row: any) => {
        const sales = Number(row.total_sales || 0);
        const profit = Number(row.total_profit || 0);
        
        totalSales += sales;
        totalProfit += profit;

        if (profit > bestMonthProfit) {
          bestMonthProfit = profit;
          bestMonthIndex = row.month_number - 1;
        }
      });

      setStats({
        totalSales,
        totalProfit,
        bestMonth: monthNames[bestMonthIndex],
        bestMonthProfit,
        totalReceived: totalSales, // В RPC total_sales это уже фактические поступления
      });
    } catch (error) {
      console.error("Error fetching yearly stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const statsConfig: StatConfig[] = [
    {
      icon: DollarSign,
      title: "Продано за год",
      value: formatCurrency(stats.totalSales),
      description: "Общая сумма контрактов",
      valueClassName: "text-primary",
    },
    {
      icon: Wallet,
      title: "Чистая прибыль за год",
      value: formatCurrency(stats.totalProfit),
      description: "Итоговая прибыль",
      valueClassName: "text-chart-2",
    },
    {
      icon: Trophy,
      title: "Лучший месяц",
      value: stats.bestMonth || "—",
      description: stats.bestMonthProfit > 0 ? formatCurrency(stats.bestMonthProfit) : "Нет данных",
      valueClassName: "text-chart-3",
    },
    {
      icon: TrendingUp,
      title: "Поступило за год",
      value: formatCurrency(stats.totalReceived),
      description: "Фактические поступления",
    },
  ];

  return <StatsGrid stats={statsConfig} loading={loading} columns={4} />;
};
