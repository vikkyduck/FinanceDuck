import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Plus, Wallet, Table, Users } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ManagePartnersDialog } from "@/components/invoices/assistant/ManagePartnersDialog";
import { PartnerDebtDashboard } from "@/components/invoices/admin/PartnerDebtDashboard";
import { PartnerPaymentsManager } from "@/components/invoices/admin/PartnerPaymentsManager";
import { useUserRole } from "@/hooks/useUserRole";

const PartnersPage = () => {
  const { role, loading } = useUserRole();
  const [managePartnersOpen, setManagePartnersOpen] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [activeTab, setActiveTab] = useState("debts");

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-muted-foreground">Загрузка...</div>
        </div>
      </DashboardLayout>
    );
  }

  if (role !== 'admin' && role !== 'assistant') {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-muted-foreground">У вас нет доступа к этой странице</div>
        </div>
      </DashboardLayout>
    );
  }

  const isAdmin = role === 'admin';

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Партнёры</h1>
            <p className="text-muted-foreground">Управление партнёрами и расчётами</p>
          </div>
          <Button 
            onClick={() => {
              if (isOpening) return;
              setIsOpening(true);
              setManagePartnersOpen(true);
              setTimeout(() => setIsOpening(false), 500);
            }}
            disabled={isOpening}
            data-testid="button-manage-partners"
          >
            <Plus className="mr-2 h-4 w-4" />
            Управление партнёрами
          </Button>
        </div>

        {isAdmin ? (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="debts" className="gap-2" data-testid="tab-debts">
                <Wallet className="h-4 w-4" />
                Расчёты (карточки)
              </TabsTrigger>
              <TabsTrigger value="table" className="gap-2" data-testid="tab-table">
                <Table className="h-4 w-4" />
                Расчёты (таблица)
              </TabsTrigger>
            </TabsList>

            <TabsContent value="debts" className="mt-4">
              <PartnerDebtDashboard />
            </TabsContent>

            <TabsContent value="table" className="mt-4">
              <PartnerPaymentsManager />
            </TabsContent>
          </Tabs>
        ) : (
          <div className="text-center text-muted-foreground py-8">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Нажмите кнопку "Управление партнёрами" для просмотра и редактирования партнёров.</p>
          </div>
        )}

        <ManagePartnersDialog 
          open={managePartnersOpen} 
          onOpenChange={setManagePartnersOpen}
        />
      </div>
    </DashboardLayout>
  );
};

export default PartnersPage;
