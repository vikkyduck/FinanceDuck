import { formatCurrency } from "@/lib/invoiceCalculations";
import { StatsGrid, StatConfig } from "@/components/ui/stats-grid";
import { TrendingUp, Wallet, FileText, PiggyBank, AlertCircle } from "lucide-react";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { Skeleton } from "@/components/ui/skeleton";

export const AdminStats = () => {
  const { data: stats, isLoading, error } = useDashboardStats();

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="flex items-center gap-2 text-destructive">
        <AlertCircle className="h-4 w-4" />
        <span>Ошибка загрузки статистики</span>
      </div>
    );
  }

  const statsConfig: StatConfig[] = [
    {
      icon: FileText,
      title: "Всего выставлено",
      value: formatCurrency(stats.totalClientBill),
      description: `${stats.totalInvoices} счетов`,
    },
    {
      icon: Wallet,
      title: "Доля админа",
      value: formatCurrency(stats.totalAdminShare || 0),
      valueClassName: "text-primary",
      description: `${stats.totalClientBill > 0 ? (((stats.totalAdminShare || 0) / stats.totalClientBill) * 100).toFixed(0) : 0}% от общей суммы`,
    },
    {
      icon: PiggyBank,
      title: "Чистая прибыль",
      value: formatCurrency(stats.totalNetProfit || 0),
      valueClassName: "text-primary",
      description: "после всех расходов",
    },
    {
      icon: TrendingUp,
      title: "Расходы исполнителей",
      value: formatCurrency(stats.totalExpenses),
      description: `${stats.paidInvoices} оплачено, ${stats.pendingInvoices} ожидают`,
    },
  ];

  return <StatsGrid stats={statsConfig} />;
};
