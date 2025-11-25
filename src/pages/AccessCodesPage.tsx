import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Key } from "lucide-react";
import { ManageAccessCodesDialog } from "@/components/invoices/admin/ManageAccessCodesDialog";
import { useUserRole } from "@/hooks/useUserRole";

const AccessCodesPage = () => {
  const { role, loading } = useUserRole();
  const [manageCodesOpen, setManageCodesOpen] = useState(false);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-muted-foreground">Загрузка...</div>
        </div>
      </DashboardLayout>
    );
  }

  if (role !== 'admin') {
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
            <h1 className="text-3xl font-bold tracking-tight">Коды доступа</h1>
            <p className="text-muted-foreground">Управление кодами доступа к системе</p>
          </div>
          <Button onClick={() => setManageCodesOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Управление кодами
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Коды доступа
            </CardTitle>
            <CardDescription>
              Создание и управление кодами доступа для пользователей
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Нажмите кнопку "Управление кодами" для просмотра, создания или деактивации кодов доступа.
            </p>
          </CardContent>
        </Card>

        <ManageAccessCodesDialog 
          open={manageCodesOpen} 
          onOpenChange={setManageCodesOpen}
        />
      </div>
    </DashboardLayout>
  );
};

export default AccessCodesPage;
