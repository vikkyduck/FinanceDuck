import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { CreateInvoiceDialog } from "./assistant/CreateInvoiceDialog";
import { ManagePartnersDialog } from "./assistant/ManagePartnersDialog";
import { ManageClientsDialog } from "./assistant/ManageClientsDialog";
import { ManageAccessCodesDialog } from "./admin/ManageAccessCodesDialog";
import { ExportFiltersDialog } from "./admin/ExportFiltersDialog";
import { CriticalAlertsSection } from "./admin/CriticalAlertsSection";
import { AdminActionBar } from "./admin/AdminActionBar";
import { AdminDashboardMetrics } from "./admin/AdminDashboardMetrics";
import { FloatingActionButton } from "@/components/FloatingActionButton";
import { useAuth } from "@/hooks/useAuth";
import { getTimeBasedGreeting } from "@/lib/greetingUtils";
import { useInvalidateAllDashboards, useAdminDashboardRefresh } from "@/hooks/useAdminDashboardRefresh";

export const AdminDashboard = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const invalidateAllDashboards = useInvalidateAllDashboards();
  useAdminDashboardRefresh();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [partnersDialogOpen, setPartnersDialogOpen] = useState(false);
  const [clientsDialogOpen, setClientsDialogOpen] = useState(false);
  const [accessCodesDialogOpen, setAccessCodesDialogOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  const greeting = getTimeBasedGreeting();

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold mb-1">
          {greeting}, Кот и Кря
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground">Обзор за текущий месяц</p>
      </div>

      {/* Sticky Action Bar */}
      <AdminActionBar
        onCreateInvoice={() => setCreateDialogOpen(true)}
        onExport={() => setExportDialogOpen(true)}
        onManagePartners={() => setPartnersDialogOpen(true)}
        onManageClients={() => setClientsDialogOpen(true)}
        onManageAccessCodes={() => setAccessCodesDialogOpen(true)}
      />

      {/* Dashboard Metrics - Cash Flow, Sales, Yearly Summary, Leverage */}
      <AdminDashboardMetrics />

      {/* Critical Alerts Section */}
      <div className="mb-6">
        <CriticalAlertsSection />
      </div>

      {/* Quick Stats Link */}
      <Card className="border-0 shadow-none bg-muted/30">
        <CardContent className="py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="font-medium">Аналитика</p>
              <p className="text-sm text-muted-foreground">
                Сводка, счета, прогнозы, продажи, план-факт
              </p>
            </div>
            <Button onClick={() => navigate('/stats')} variant="default">
              <BarChart3 className="h-4 w-4 mr-2" />
              Открыть аналитику
            </Button>
          </div>
        </CardContent>
      </Card>

      <CreateInvoiceDialog 
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={() => {
          invalidateAllDashboards();
        }}
      />
      <ManagePartnersDialog 
        open={partnersDialogOpen}
        onOpenChange={setPartnersDialogOpen}
      />
      <ManageClientsDialog 
        open={clientsDialogOpen} 
        onOpenChange={setClientsDialogOpen} 
      />
      <ManageAccessCodesDialog 
        open={accessCodesDialogOpen} 
        onOpenChange={setAccessCodesDialogOpen} 
      />
      <ExportFiltersDialog 
        open={exportDialogOpen} 
        onOpenChange={setExportDialogOpen} 
      />

      <FloatingActionButton
        onCreateInvoice={() => setCreateDialogOpen(true)}
        onManagePartners={() => setPartnersDialogOpen(true)}
        onManageClients={() => setClientsDialogOpen(true)}
      />
    </DashboardLayout>
  );
};
