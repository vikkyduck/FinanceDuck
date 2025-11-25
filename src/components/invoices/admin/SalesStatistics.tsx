import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { StatsGrid, StatConfig } from "@/components/ui/stats-grid";
import { TrendingUp, ShoppingCart, Calendar, Target } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface SalesStatisticsProps {
  year: number;
}

export const SalesStatistics = ({ year }: SalesStatisticsProps) => {
  const [stats, setStats] = useState({
    currentMonthSales: 0,
    yearSales: 0,
    currentMonthCount: 0,
    yearCount: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSalesStats();
  }, [year]);

  const { accessTokenId } = useAuth();

  const fetchSalesStats = async () => {
    if (!accessTokenId) return;
    
    setLoading(true);
    try {
      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
      const currentMonth = currentDate.getMonth() + 1;

      const { data, error } = await supabase.rpc('get_admin_monthly_data', {
        _token_id: accessTokenId,
        _year: year
      });

      if (error) throw error;

      let yearSales = 0;
      let yearCount = 0;
      let currentMonthSales = 0;
      let currentMonthCount = 0;

      (data || []).forEach((row: any) => {
        const sales = Number(row.total_sales || 0);
        const count = Number(row.invoice_count || 0);
        
        yearSales += sales;
        yearCount += count;

        if (year === currentYear && row.month_number === currentMonth) {
          currentMonthSales = sales;
          currentMonthCount = count;
        }
      });

      setStats({
        currentMonthSales,
        yearSales,
        currentMonthCount,
        yearCount,
      });
    } catch (error) {
      console.error("Error fetching sales stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const getMonthName = () => {
    const monthNames = [
      "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
      "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
    ];
    return monthNames[new Date().getMonth()];
  };

  const avgDealSize = stats.yearCount > 0 ? stats.yearSales / stats.yearCount : 0;

  const statsConfig: StatConfig[] = [
    {
      icon: ShoppingCart,
      title: `Продажи за ${getMonthName()}`,
      value: formatCurrency(stats.currentMonthSales),
      description: `${stats.currentMonthCount} ${stats.currentMonthCount === 1 ? 'счет' : 'счетов'}`,
      valueClassName: "text-primary",
    },
    {
      icon: TrendingUp,
      title: "Продажи за год",
      value: formatCurrency(stats.yearSales),
      description: `${stats.yearCount} ${stats.yearCount === 1 ? 'счет' : 'счетов'}`,
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
      value: stats.yearCount > 0 ? Math.round(stats.yearCount / 12) : 0,
      description: "среднее значение",
    },
  ];

  return <StatsGrid stats={statsConfig} loading={loading} columns={4} />;
};
