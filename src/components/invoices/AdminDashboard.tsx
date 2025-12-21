import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BarChart3, Receipt, Users as UsersIcon, Building2, Maximize2, Minimize2 } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { AdminInvoicesList } from "./admin/AdminInvoicesList";
import { CreateInvoiceDialog } from "./assistant/CreateInvoiceDialog";
import { ManagePartnersDialog } from "./assistant/ManagePartnersDialog";
import { ManageClientsDialog } from "./assistant/ManageClientsDialog";
import { ManageAccessCodesDialog } from "./admin/ManageAccessCodesDialog";
import { PartnerPaymentsManager } from "./admin/PartnerPaymentsManager";
import { PartnerDebtDashboard } from "./admin/PartnerDebtDashboard";
import { AdminCashFlowForecast } from "./admin/AdminCashFlowForecast";
import { ExportFiltersDialog } from "./admin/ExportFiltersDialog";
import { RecurringInvoicesManager } from "./admin/RecurringInvoicesManager";
import { CriticalAlertsSection } from "./admin/CriticalAlertsSection";
import { AdminActionBar } from "./admin/AdminActionBar";
import { DoNotSpendDashboard } from "./admin/DoNotSpendDashboard";
import { ExpectedAdminProfitDashboard } from "./admin/ExpectedAdminProfitDashboard";
import { AdminDashboardMetrics } from "./admin/AdminDashboardMetrics";
import { FloatingActionButton } from "@/components/FloatingActionButton";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { useCollapsibleSections } from "@/hooks/useCollapsibleSections";
import { ViewModeToggle } from "@/components/shared/ViewModeToggle";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { getTimeBasedGreeting } from "@/lib/greetingUtils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useInvalidateAllDashboards, useAdminDashboardRefresh } from "@/hooks/useAdminDashboardRefresh";

export const AdminDashboard = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const invalidateAllDashboards = useInvalidateAllDashboards();
  useAdminDashboardRefresh();
  const { viewMode, setViewMode } = useViewMode();
  const [searchParams] = useSearchParams();
  const showAlerts = searchParams.get('alerts') === 'true';
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [partnersDialogOpen, setPartnersDialogOpen] = useState(false);
  const [clientsDialogOpen, setClientsDialogOpen] = useState(false);
  const [accessCodesDialogOpen, setAccessCodesDialogOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  const greeting = getTimeBasedGreeting();

  const { isExpanded, toggleSection, expandAll, collapseAll } = useCollapsibleSections(
    "admin-dashboard-sections",
    {
      workingCapital: true,
      cashFlow: true,
      recurringInvoices: true,
      invoicesList: true,
      partnerPayments: true,
      partnerPaymentsTable: false,
    }
  );

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-1">
          {greeting}, Кот и Кря
        </h1>
        <p className="text-muted-foreground">Обзор за текущий месяц</p>
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
      <Card className="border-0 shadow-none bg-muted/30 mb-6">
        <CardContent className="py-3">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              Графики, план-факт, прогнозы
            </p>
            <Button onClick={() => navigate('/stats')} variant="outline" size="sm">
              <BarChart3 className="h-4 w-4 mr-2" />
              Аналитика
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tab Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <TabsList className="w-full justify-start h-auto flex-wrap">
            <TabsTrigger value="overview" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Сводка
            </TabsTrigger>
            <TabsTrigger value="finances" className="gap-2">
              <Building2 className="h-4 w-4" />
              Деньги
            </TabsTrigger>
            <TabsTrigger value="invoices" className="gap-2">
              <Receipt className="h-4 w-4" />
              Счета
            </TabsTrigger>
            <TabsTrigger value="team" className="gap-2">
              <UsersIcon className="h-4 w-4" />
              Команда
            </TabsTrigger>
          </TabsList>
          <div className="flex gap-1 shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={expandAll} data-testid="button-expand-all">
                  <Maximize2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Развернуть все</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={collapseAll} data-testid="button-collapse-all">
                  <Minimize2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Свернуть все</TooltipContent>
            </Tooltip>
          </div>
        </div>

        <TabsContent value="overview" className="space-y-6">
          <div className="space-y-6">
            <DoNotSpendDashboard />
            <ExpectedAdminProfitDashboard />
          </div>
        </TabsContent>

        <TabsContent value="finances" className="space-y-6">
          <div className="space-y-6">
            <CollapsibleSection
              id="cashFlow"
              title="Прогноз денежных потоков"
              isExpanded={isExpanded("cashFlow")}
              onToggle={() => toggleSection("cashFlow")}
            >
              <AdminCashFlowForecast />
            </CollapsibleSection>
          </div>
        </TabsContent>

        <TabsContent value="invoices" className="space-y-6">
          <div className="space-y-6">
            <CollapsibleSection
              id="recurringInvoices"
              title="Автоматические счета"
              isExpanded={isExpanded("recurringInvoices")}
              onToggle={() => toggleSection("recurringInvoices")}
            >
              <RecurringInvoicesManager />
            </CollapsibleSection>

            <CollapsibleSection
              id="invoicesList"
              title="Все счета"
              isExpanded={isExpanded("invoicesList")}
              onToggle={() => toggleSection("invoicesList")}
              headerActions={
                <ViewModeToggle 
                  value={viewMode}
                  onValueChange={setViewMode}
                  className="hidden sm:flex"
                />
              }
            >
              <div className="px-0 -mx-6">
                <AdminInvoicesList 
                  viewMode={viewMode}
                  initialStatusFilter={showAlerts ? 'overdue' : undefined}
                />
              </div>
            </CollapsibleSection>
          </div>
        </TabsContent>

        <TabsContent value="team" className="space-y-6">
          <div className="space-y-6">
            <CollapsibleSection
              id="partnerPayments"
              title="Расчёты с партнёрами (карточки)"
              isExpanded={isExpanded("partnerPayments")}
              onToggle={() => toggleSection("partnerPayments")}
            >
              <PartnerDebtDashboard />
            </CollapsibleSection>

            <CollapsibleSection
              id="partnerPaymentsTable"
              title="Расчёты с партнёрами (таблица)"
              isExpanded={isExpanded("partnerPaymentsTable")}
              onToggle={() => toggleSection("partnerPaymentsTable")}
            >
              <PartnerPaymentsManager />
            </CollapsibleSection>
          </div>
        </TabsContent>

      </Tabs>

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
