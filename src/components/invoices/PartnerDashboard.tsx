import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { PartnerInvoicesList } from "./partner/PartnerInvoicesList";
import { PartnerTerms } from "./partner/PartnerTerms";
import { PartnerHeroMetrics } from "./partner/PartnerHeroMetrics";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { ViewModeToggle } from "@/components/shared/ViewModeToggle";
import { showSuccess } from "@/lib/errorHandler";

export const PartnerDashboard = () => {
  const navigate = useNavigate();
  const { logout, partnerId, role, isLoading } = useAuth();
  const { viewMode, setViewMode } = useViewMode();

  const handleSignOut = async () => {
    await logout();
    showSuccess("Выход выполнен", "Вы успешно вышли из системы");
    navigate("/auth");
  };

  return (
    <DashboardLayout>
      <DashboardHeader
        title="Здравствуйте, Партнёр"
        subtitle="Ваша статистика и счета"
      />

      <div className="space-y-8">
        <PartnerHeroMetrics />

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-2xl">Условия работы</CardTitle>
          </CardHeader>
          <CardContent>
            <PartnerTerms />
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-4 flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-2xl">Мои счета</CardTitle>
            <ViewModeToggle 
              value={viewMode}
              onValueChange={setViewMode}
              className="hidden sm:flex"
            />
          </CardHeader>
          <CardContent className="px-0">
            <PartnerInvoicesList viewMode={viewMode} />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};
