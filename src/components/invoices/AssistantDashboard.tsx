import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Users, Building, Download, Loader2, LayoutList, UserCheck } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { CreateInvoiceDialog } from "./assistant/CreateInvoiceDialog";
import { InvoicesList } from "./assistant/InvoicesList";
import { ManagePartnersDialog } from "./assistant/ManagePartnersDialog";
import { ManageClientsDialog } from "./assistant/ManageClientsDialog";
import { AssistantBonusCard } from "./assistant/AssistantBonusCard";
import { DoNotSpendDashboard } from "./admin/DoNotSpendDashboard";
import { ClientBalancesView } from "./assistant/ClientBalancesView";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { ViewModeToggle } from "@/components/shared/ViewModeToggle";
import { showSuccess } from "@/lib/errorHandler";
import { useQueryClient } from "@tanstack/react-query";
import { useExportMyInvoices } from "@/hooks/useExportMyInvoices";

type MainTab = "invoices" | "clients";

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
  const [mainTab, setMainTab] = useState<MainTab>("invoices");
  const { handleExport, isExporting } = useExportMyInvoices();

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
        <div className="flex flex-wrap gap-3">
          <Button size="lg" onClick={() => setCreateDialogOpen(true)} data-testid="button-create-invoice">
            <Plus className="h-5 w-5 mr-2" />
            Создать счёт
          </Button>
          <Button variant="ghost" onClick={() => setPartnersDialogOpen(true)} data-testid="button-manage-partners">
            <Building className="h-5 w-5 mr-2" />
            Партнёры
          </Button>
          <Button variant="ghost" onClick={() => setClientsDialogOpen(true)} data-testid="button-manage-clients">
            <Users className="h-5 w-5 mr-2" />
            Клиенты
          </Button>
          <Button 
            variant="outline" 
            onClick={handleExport} 
            disabled={isExporting}
            data-testid="button-export-excel"
          >
            {isExporting ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <Download className="h-5 w-5 mr-2" />}
            <span className="hidden sm:inline">Выгрузить в Excel</span>
            <span className="sm:hidden">Excel</span>
          </Button>
        </div>

        <AssistantBonusCard />

        <DoNotSpendDashboard />

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 w-fit">
                <button
                  onClick={() => setMainTab("invoices")}
                  data-testid="tab-invoices"
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    mainTab === "invoices"
                      ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  }`}
                >
                  <LayoutList className="h-3.5 w-3.5" />
                  Счета
                </button>
                <button
                  onClick={() => setMainTab("clients")}
                  data-testid="tab-clients"
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    mainTab === "clients"
                      ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  }`}
                >
                  <UserCheck className="h-3.5 w-3.5" />
                  По клиентам
                </button>
              </div>

              {mainTab === "invoices" && (
                <ViewModeToggle 
                  value={viewMode}
                  onValueChange={setViewMode}
                  className="hidden sm:flex"
                />
              )}
            </div>
          </CardHeader>
          <CardContent className={mainTab === "invoices" ? "px-0" : "px-4 pb-4"}>
            {mainTab === "invoices" ? (
              <InvoicesList 
                viewMode={viewMode}
                initialStatusFilter={showAlerts ? 'overdue' : undefined}
                key={createDialogOpen ? 'dialog-open' : 'dialog-closed'} 
              />
            ) : (
              <ClientBalancesView />
            )}
          </CardContent>
        </Card>
      </div>

      <CreateInvoiceDialog 
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['invoices'] });
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
