import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Users, Building } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { CreateInvoiceDialog } from "./assistant/CreateInvoiceDialog";
import { InvoicesList } from "./assistant/InvoicesList";
import { ManagePartnersDialog } from "./assistant/ManagePartnersDialog";
import { ManageClientsDialog } from "./assistant/ManageClientsDialog";
import { AssistantBonusCard } from "./assistant/AssistantBonusCard";
import { OverduePaymentsAlert } from "./shared/OverduePaymentsAlert";
import { RecurringInvoicesManager } from "./admin/RecurringInvoicesManager";
import { PriorityActionsCard } from "./shared/PriorityActionsCard";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { ViewModeToggle } from "@/components/shared/ViewModeToggle";
import { showSuccess } from "@/lib/errorHandler";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { useCollapsibleSections } from "@/hooks/useCollapsibleSections";
import { AssistantYearlyOverview } from "./assistant/AssistantYearlyOverview";
import { PartnerPerformanceTable } from "./assistant/PartnerPerformanceTable";
import { AssistantMonthlyChart } from "./assistant/AssistantMonthlyChart";
import { AssistantInsights } from "./assistant/AssistantInsights";
import { BarChart3 } from "lucide-react";
import { useYearFilter } from "@/hooks/useYearFilter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";

export const AssistantDashboard = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const queryClient = useQueryClient();
  const { viewMode, setViewMode } = useViewMode({ defaultMode: 'table' });
  const [searchParams] = useSearchParams();
  const showAlerts = searchParams.get('alerts') === 'true';
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [partnersDialogOpen, setPartnersDialogOpen] = useState(false);
  const [clientsDialogOpen, setClientsDialogOpen] = useState(false);

  const { isExpanded, toggleSection } = useCollapsibleSections('assistant-dashboard-sections', {
    stats: true,
    alerts: true,
    bonus: true,
    recurring: true,
  });

  const { selectedYear, setSelectedYear, availableYears } = useYearFilter();

  const handleSignOut = async () => {
    await logout();
    showSuccess("Выход выполнен", "Вы успешно вышли из системы");
    navigate("/auth");
  };

  return (
    <DashboardLayout>
      <DashboardHeader
        title="Здравствуйте, Даша"
        subtitle="Управляйте счетами и документами"
      />

      <div className="space-y-8">
        <div className="flex gap-3">
          <Button size="lg" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-5 w-5 mr-2" />
            Создать счёт
          </Button>
          <Button variant="ghost" onClick={() => setPartnersDialogOpen(true)}>
            <Building className="h-5 w-5 mr-2" />
            Партнёры
          </Button>
          <Button variant="ghost" onClick={() => setClientsDialogOpen(true)}>
            <Users className="h-5 w-5 mr-2" />
            Клиенты
          </Button>
        </div>

        <CollapsibleSection
          id="stats"
          title={
            <div className="flex items-center gap-3">
              <span>Статистика {selectedYear}</span>
              <Select value={selectedYear.toString()} onValueChange={(value) => setSelectedYear(parseInt(value, 10))}>
                <SelectTrigger className="w-[120px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableYears.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          }
          isExpanded={isExpanded('stats')}
          onToggle={() => toggleSection('stats')}
          badge={<BarChart3 className="h-4 w-4" />}
        >
          <div className="space-y-6">
            <AssistantYearlyOverview selectedYear={selectedYear} />
            <AssistantInsights selectedYear={selectedYear} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <PartnerPerformanceTable selectedYear={selectedYear} />
              <AssistantMonthlyChart selectedYear={selectedYear} />
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          id="alerts"
          title="Приоритетные действия"
          isExpanded={isExpanded('alerts')}
          onToggle={() => toggleSection('alerts')}
        >
          <div className="space-y-4">
            <PriorityActionsCard />
            <OverduePaymentsAlert role="assistant" />
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          id="bonus"
          title="Мой бонус"
          isExpanded={isExpanded('bonus')}
          onToggle={() => toggleSection('bonus')}
        >
          <AssistantBonusCard />
        </CollapsibleSection>

        <CollapsibleSection
          id="recurring"
          title="Регулярные счета"
          isExpanded={isExpanded('recurring')}
          onToggle={() => toggleSection('recurring')}
        >
          <RecurringInvoicesManager />
        </CollapsibleSection>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-4 flex flex-row items-center justify-between">
            <CardTitle className="text-2xl">Счета</CardTitle>
            <ViewModeToggle 
              value={viewMode}
              onValueChange={setViewMode}
              className="hidden sm:flex"
            />
          </CardHeader>
          <CardContent className="px-0">
            <InvoicesList 
              viewMode={viewMode}
              initialStatusFilter={showAlerts ? 'overdue' : undefined}
              key={createDialogOpen ? 'dialog-open' : 'dialog-closed'} 
            />
          </CardContent>
        </Card>
      </div>

      <CreateInvoiceDialog 
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['invoices'] });
          queryClient.invalidateQueries({ queryKey: ['assistant-yearly-stats'] });
          queryClient.invalidateQueries({ queryKey: ['assistant-insights'] });
          queryClient.invalidateQueries({ queryKey: ['assistant-partner-stats'] });
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
    </DashboardLayout>
  );
};
