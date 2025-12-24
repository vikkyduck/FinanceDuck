import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { AdminInvoicesList } from "@/components/invoices/admin/AdminInvoicesList";
import { useAuth } from "@/hooks/useAuth";
import { AssistantDashboard } from "@/components/invoices/AssistantDashboard";
import { PartnerDashboard } from "@/components/invoices/PartnerDashboard";
import { ClientDashboard } from "@/components/invoices/ClientDashboard";

const InvoicesListPage = () => {
  const { role, isLoading } = useAuth();

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent" />
        </div>
      </DashboardLayout>
    );
  }

  if (role === 'assistant') {
    return <AssistantDashboard />;
  }

  if (role === 'partner') {
    return <PartnerDashboard />;
  }

  if (role === 'client') {
    return <ClientDashboard />;
  }

  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold mb-2">Счета</h1>
        <p className="text-muted-foreground">Полный список всех счетов</p>
      </div>
      
      <AdminInvoicesList />
    </DashboardLayout>
  );
};

export default InvoicesListPage;
