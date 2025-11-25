import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Handshake } from "lucide-react";
import { ManagePartnersDialog } from "@/components/invoices/assistant/ManagePartnersDialog";
import { useUserRole } from "@/hooks/useUserRole";

const PartnersPage = () => {
  const { role, loading } = useUserRole();
  const [managePartnersOpen, setManagePartnersOpen] = useState(false);
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Партнеры</h1>
            <p className="text-muted-foreground">Управление партнерами</p>
          </div>
          <Button 
            onClick={() => {
              if (isOpening) return;
              setIsOpening(true);
              setManagePartnersOpen(true);
              setTimeout(() => setIsOpening(false), 500);
            }}
            disabled={isOpening}
          >
            <Plus className="mr-2 h-4 w-4" />
            Управление партнерами
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Handshake className="h-5 w-5" />
              База партнеров
            </CardTitle>
            <CardDescription>
              Просмотр и редактирование информации о партнерах
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Нажмите кнопку "Управление партнерами" для просмотра, добавления или редактирования партнеров.
            </p>
          </CardContent>
        </Card>

        <ManagePartnersDialog 
          open={managePartnersOpen} 
          onOpenChange={setManagePartnersOpen}
        />
      </div>
    </DashboardLayout>
  );
};

export default PartnersPage;
