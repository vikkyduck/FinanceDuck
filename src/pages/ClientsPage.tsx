import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Users } from "lucide-react";
import { ManageClientsDialog } from "@/components/invoices/assistant/ManageClientsDialog";
import { ClientLTVReport } from "@/components/invoices/admin/ClientLTVReport";
import { useUserRole } from "@/hooks/useUserRole";

const ClientsPage = () => {
  const { role, loading } = useUserRole();
  const [manageClientsOpen, setManageClientsOpen] = useState(false);
  const [isOpening, setIsOpening] = useState(false);

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
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Клиенты</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">Управление базой клиентов</p>
          </div>
          <Button 
            onClick={() => {
              if (isOpening) return;
              setIsOpening(true);
              setManageClientsOpen(true);
              setTimeout(() => setIsOpening(false), 500);
            }}
            disabled={isOpening}
            data-testid="button-manage-clients"
          >
            <Plus className="mr-2 h-4 w-4" />
            Управление клиентами
          </Button>
        </div>

        {isAdmin && (
          <ClientLTVReport />
        )}

        {!isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                База клиентов
              </CardTitle>
              <CardDescription>
                Просмотр и редактирование информации о клиентах
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Нажмите кнопку "Управление клиентами" для просмотра, добавления или редактирования клиентов.
              </p>
            </CardContent>
          </Card>
        )}

        <ManageClientsDialog 
          open={manageClientsOpen} 
          onOpenChange={setManageClientsOpen}
        />
      </div>
    </DashboardLayout>
  );
};

export default ClientsPage;
