import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { ClientInvoicesList } from "./client/ClientInvoicesList";
import { ClientStats } from "./client/ClientStats";
import { OverduePaymentsAlert } from "./shared/OverduePaymentsAlert";
import { ClientAgency30Report } from "./client/ClientAgency30Report";
import { ClientBudgetDashboard } from "./client/ClientBudgetDashboard";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { ViewModeToggle } from "@/components/shared/ViewModeToggle";
import { showSuccess } from "@/lib/errorHandler";

export const ClientDashboard = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { viewMode, setViewMode } = useViewMode();

  const handleSignOut = async () => {
    await logout();
    showSuccess("Выход выполнен", "Вы успешно вышли из системы");
    navigate("/auth");
  };

  return (
    <DashboardLayout>
      <DashboardHeader
        title="Здравствуйте, Клиент"
        subtitle="Ваши счета и платежи"
      />

      <div className="space-y-8">
        <OverduePaymentsAlert role="client" />
        
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-2xl">Статистика</CardTitle>
          </CardHeader>
          <CardContent>
            <ClientStats />
          </CardContent>
        </Card>

        <ClientBudgetDashboard />

        <ClientAgency30Report />

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-4 flex flex-row items-center justify-between">
            <CardTitle className="text-2xl">Мои счета</CardTitle>
            <ViewModeToggle 
              value={viewMode}
              onValueChange={setViewMode}
              className="hidden sm:flex"
            />
          </CardHeader>
          <CardContent className="px-0">
            <ClientInvoicesList viewMode={viewMode} />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};
