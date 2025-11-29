import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { PartnerInvoicesList } from "./partner/PartnerInvoicesList";
import { PartnerStats } from "./partner/PartnerStats";
import { PartnerTerms } from "./partner/PartnerTerms";
import { OverduePaymentsAlert } from "./shared/OverduePaymentsAlert";
import { PartnerClientStats } from "./partner/PartnerClientStats";
import { PartnerDocumentRiskLight } from "./partner/PartnerDocumentRiskLight";
import { Agency30ClientFundsTracker } from "./partner/Agency30ClientFundsTracker";
import { PartnerPaymentHistory } from "./partner/PartnerPaymentHistory";
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
        <PartnerDocumentRiskLight />
        
        <OverduePaymentsAlert role="partner" />
        
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-2xl">Статистика</CardTitle>
          </CardHeader>
          <CardContent>
            <PartnerStats />
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <PartnerClientStats />
          <Agency30ClientFundsTracker />
        </div>

        <PartnerPaymentHistory showTitle={true} />

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
