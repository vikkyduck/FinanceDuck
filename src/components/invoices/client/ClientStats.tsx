import { formatCurrency } from "@/lib/invoiceCalculations";
import { StatsGrid, StatConfig } from "@/components/ui/stats-grid";
import { FileText, DollarSign, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { Skeleton } from "@/components/ui/skeleton";

export const ClientStats = () => {
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

  const paidPercentage = stats.totalClientBill > 0 
    ? (stats.paidClientBill / stats.totalClientBill) * 100 
    : 0;

  const statsConfig: StatConfig[] = [
    {
      icon: FileText,
      title: "Всего счетов",
      value: stats.totalInvoices.toString(),
      description: `Оплачено: ${stats.paidInvoices} из ${stats.totalInvoices}`,
    },
    {
      icon: DollarSign,
      title: "Общая сумма",
      value: formatCurrency(stats.totalClientBill),
      description: `на ${stats.totalInvoices} счетов`,
    },
    {
      icon: CheckCircle2,
      title: "Оплачено",
      value: formatCurrency(stats.paidClientBill),
      valueClassName: "text-green-600",
      description: `${stats.paidInvoices} счетов`,
      progress: paidPercentage,
    },
    {
      icon: Clock,
      title: "К оплате",
      value: formatCurrency(stats.pendingClientBill),
      valueClassName: stats.pendingClientBill > 0 ? "text-orange-600" : "text-muted-foreground",
      description: `${stats.pendingInvoices} счетов`,
    },
  ];

  return <StatsGrid stats={statsConfig} />;
};
