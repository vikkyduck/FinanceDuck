import { formatCurrency } from "@/lib/invoiceCalculations";
import { StatsGrid, StatConfig } from "@/components/ui/stats-grid";
import { Wallet, TrendingUp, FileText, AlertTriangle, AlertCircle } from "lucide-react";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { Skeleton } from "@/components/ui/skeleton";

export const PartnerStats = () => {
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

  const partnerDebt = stats.partnerDebt || 0;
  const debtStatus = partnerDebt > 0 ? "destructive" : "success";

  const statsConfig: StatConfig[] = [
    {
      icon: FileText,
      title: "Всего счетов",
      value: stats.totalInvoices.toString(),
      description: `${stats.paidInvoices} оплачено, ${stats.pendingInvoices} ожидают`,
    },
    {
      icon: TrendingUp,
      title: "Сумма счетов",
      value: formatCurrency(stats.totalClientBill),
      description: `Оплачено: ${formatCurrency(stats.paidClientBill)}`,
    },
    {
      icon: Wallet,
      title: "Моя комиссия",
      value: formatCurrency(stats.totalPartnerCommission || 0),
      valueClassName: "text-primary",
      description: "от оплаченных счетов",
    },
    {
      icon: partnerDebt > 0 ? AlertTriangle : Wallet,
      title: "Долг админу",
      value: formatCurrency(Math.abs(partnerDebt)),
      valueClassName: partnerDebt > 0 ? "text-destructive" : "text-green-600",
      description: partnerDebt > 0 ? "требуется оплата" : "всё оплачено",
    },
  ];

  return <StatsGrid stats={statsConfig} />;
};
