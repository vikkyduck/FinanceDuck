import { formatCurrency } from "@/lib/invoiceCalculations";
import { StatsGrid, StatConfig } from "@/components/ui/stats-grid";
import { TrendingUp, Wallet, FileText, PiggyBank, AlertCircle, HelpCircle } from "lucide-react";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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
      tooltip: "Сумма clientBill по ВСЕМ счетам за всё время, независимо от статуса оплаты. Включает оплаченные и ожидающие.",
    },
    {
      icon: Wallet,
      title: "Доля админа",
      value: formatCurrency(stats.totalAdminShare || 0),
      valueClassName: "text-primary",
      description: `${stats.totalClientBill > 0 ? (((stats.totalAdminShare || 0) / stats.totalClientBill) * 100).toFixed(0) : 0}% от общей суммы`,
      tooltip: "Сумма amountToAdmin по всем счетам. Это доля админа ДО вычета расходов. Формула зависит от схемы: partner_10 = 90%, partner_15 = 85%, agency_30 = 15%, commission_based = (100% - rate%).",
    },
    {
      icon: PiggyBank,
      title: "Чистая прибыль",
      value: formatCurrency(stats.totalNetProfit || 0),
      valueClassName: "text-primary",
      description: "после всех расходов",
      tooltip: "Сумма netProfitAdmin по всем счетам. Формула: amountToAdmin - expensesPaidByAdmin. Расходы партнёра НЕ вычитаются. Для agency_30: фиксированные 15%.",
    },
    {
      icon: TrendingUp,
      title: "Расходы исполнителей",
      value: formatCurrency(stats.totalExpenses),
      description: `${stats.paidInvoices} оплачено, ${stats.pendingInvoices} ожидают`,
      tooltip: "Сумма executorExpensesTotal по всем счетам. Это ВСЕ расходы (и админа, и партнёра). Расходы админа влияют на чистую прибыль, расходы партнёра - нет.",
    },
  ];

  return <StatsGrid stats={statsConfig} />;
};
