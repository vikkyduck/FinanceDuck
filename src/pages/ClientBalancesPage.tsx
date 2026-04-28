import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { ClientBalancesView } from "@/components/invoices/assistant/ClientBalancesView";

export default function ClientBalancesPage() {
  return (
    <DashboardLayout>
      <DashboardHeader
        title="Остатки по клиентам"
        subtitle="Бюджет, расходы и остатки по каждому клиенту"
      />
      <ClientBalancesView />
    </DashboardLayout>
  );
}
