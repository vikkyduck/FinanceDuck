import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Users, Building, Download, Loader2 } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { CreateInvoiceDialog } from "./assistant/CreateInvoiceDialog";
import { InvoicesList } from "./assistant/InvoicesList";
import { ManagePartnersDialog } from "./assistant/ManagePartnersDialog";
import { ManageClientsDialog } from "./assistant/ManageClientsDialog";
import { AssistantBonusCard } from "./assistant/AssistantBonusCard";
import { DoNotSpendDashboard } from "./admin/DoNotSpendDashboard";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { ViewModeToggle } from "@/components/shared/ViewModeToggle";
import { showSuccess } from "@/lib/errorHandler";
import { useQueryClient } from "@tanstack/react-query";
import { useExportMyInvoices } from "@/hooks/useExportMyInvoices";

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
        <div className="flex gap-3">
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
          <CardHeader className="pb-4 flex flex-row items-center justify-between gap-4">
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
