import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, BarChart3, Receipt, Users as UsersIcon, Building2, Maximize2, Minimize2 } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { AdminInvoicesList } from "./admin/AdminInvoicesList";
import { AdminStats } from "./admin/AdminStats";
import { AdminHeroMetrics } from "./admin/AdminHeroMetrics";
import { WorkingCapitalManager } from "./admin/WorkingCapitalManager";
import { ClientLTVReport } from "./admin/ClientLTVReport";
import { CreateInvoiceDialog } from "./assistant/CreateInvoiceDialog";
import { ManagePartnersDialog } from "./assistant/ManagePartnersDialog";
import { ManageClientsDialog } from "./assistant/ManageClientsDialog";
import { ManageAccessCodesDialog } from "./admin/ManageAccessCodesDialog";
import { AssistantBonusManager } from "./admin/AssistantBonusManager";
import { PartnerPaymentsManager } from "./admin/PartnerPaymentsManager";
import { AdminCashFlowForecast } from "./admin/AdminCashFlowForecast";
import { ExportFiltersDialog } from "./admin/ExportFiltersDialog";
import { RecurringInvoicesManager } from "./admin/RecurringInvoicesManager";
import { CriticalAlertsSection } from "./admin/CriticalAlertsSection";
import { AdminActionBar } from "./admin/AdminActionBar";
import { AdminTransactionsList } from "./admin/AdminTransactionsList";
import { PartnerDebtDashboard } from "./admin/PartnerDebtDashboard";
import { DoNotSpendDashboard } from "./admin/DoNotSpendDashboard";
import { FloatingActionButton } from "@/components/FloatingActionButton";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { useCollapsibleSections } from "@/hooks/useCollapsibleSections";
import { ViewModeToggle } from "@/components/shared/ViewModeToggle";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { showSuccess } from "@/lib/errorHandler";
import { getTimeBasedGreeting } from "@/lib/greetingUtils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useQueryClient } from "@tanstack/react-query";

export const AdminDashboard = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const queryClient = useQueryClient();
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
      stats: true,
      workingCapital: true,
      cashFlow: true,
      recurringInvoices: true,
      invoicesList: true,
      bonuses: true,
      partnerPayments: true,
      clientLTV: true,
    }
  );

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-1">
          {greeting}
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

      {/* Hero Metrics - Always Visible */}
      <div className="mb-6">
        <AdminHeroMetrics period="month" />
      </div>

      {/* Critical Alerts Section */}
      <div className="mb-6">
        <CriticalAlertsSection />
      </div>

      {/* Quick Stats Link */}
      <Card className="border-0 shadow-sm bg-gradient-to-r from-primary/10 to-primary/5 mb-6">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold">Детальная аналитика и прогнозы</p>
              <p className="text-sm text-muted-foreground">
                Графики, план-факт, прогнозы продаж
              </p>
            </div>
            <Button onClick={() => navigate('/stats')} variant="outline">
              <BarChart3 className="h-4 w-4 mr-2" />
              Открыть аналитику
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
            <TabsTrigger value="clients" className="gap-2">
              <FileText className="h-4 w-4" />
              Клиенты
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

        <AnimatePresence mode="wait">
          <TabsContent value="overview" className="space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              <CollapsibleSection
                id="stats"
                title="Статистика"
                isExpanded={isExpanded("stats")}
                onToggle={() => toggleSection("stats")}
              >
                <AdminStats />
              </CollapsibleSection>

              <PartnerDebtDashboard />

              <DoNotSpendDashboard />

              <AdminTransactionsList limit={10} />
            </motion.div>
          </TabsContent>

          <TabsContent value="finances" className="space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              <CollapsibleSection
                id="workingCapital"
                title="Оборотный капитал"
                isExpanded={isExpanded("workingCapital")}
                onToggle={() => toggleSection("workingCapital")}
              >
                <WorkingCapitalManager />
              </CollapsibleSection>

              <CollapsibleSection
                id="cashFlow"
                title="Прогноз денежных потоков"
                isExpanded={isExpanded("cashFlow")}
                onToggle={() => toggleSection("cashFlow")}
              >
                <AdminCashFlowForecast />
              </CollapsibleSection>
            </motion.div>
          </TabsContent>

          <TabsContent value="invoices" className="space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
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
            </motion.div>
          </TabsContent>

          <TabsContent value="team" className="space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              <CollapsibleSection
                id="bonuses"
                title="Бонусы ассистенту"
                isExpanded={isExpanded("bonuses")}
                onToggle={() => toggleSection("bonuses")}
              >
                <AssistantBonusManager />
              </CollapsibleSection>

              <CollapsibleSection
                id="partnerPayments"
                title="Расчёты с партнёрами"
                isExpanded={isExpanded("partnerPayments")}
                onToggle={() => toggleSection("partnerPayments")}
              >
                <PartnerPaymentsManager />
              </CollapsibleSection>
            </motion.div>
          </TabsContent>

          <TabsContent value="clients" className="space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <CollapsibleSection
                id="clientLTV"
                title="LTV клиентов"
                isExpanded={isExpanded("clientLTV")}
                onToggle={() => toggleSection("clientLTV")}
              >
                <ClientLTVReport />
              </CollapsibleSection>
            </motion.div>
          </TabsContent>
        </AnimatePresence>
      </Tabs>

      <CreateInvoiceDialog 
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['invoices'] });
          queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
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
