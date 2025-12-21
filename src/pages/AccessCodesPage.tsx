import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Key, Database, Settings } from "lucide-react";
import { ManageAccessCodesDialog } from "@/components/invoices/admin/ManageAccessCodesDialog";
import { BackupManager } from "@/components/admin/BackupManager";
import { useUserRole } from "@/hooks/useUserRole";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

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
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Settings className="h-8 w-8" />
            Система
          </h1>
          <p className="text-muted-foreground">Управление доступом и резервными копиями</p>
        </div>

        <Tabs defaultValue="access-codes" className="space-y-6">
          <TabsList>
            <TabsTrigger value="access-codes" className="gap-2" data-testid="tab-access-codes">
              <Key className="h-4 w-4" />
              Коды доступа
            </TabsTrigger>
            <TabsTrigger value="backups" className="gap-2" data-testid="tab-backups">
              <Database className="h-4 w-4" />
              Бэкапы
            </TabsTrigger>
          </TabsList>

          <TabsContent value="access-codes" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Key className="h-5 w-5" />
                    Коды доступа
                  </CardTitle>
                  <CardDescription>
                    Создание и управление кодами доступа для пользователей
                  </CardDescription>
                </div>
                <Button onClick={() => setManageCodesOpen(true)} data-testid="button-manage-codes">
                  <Plus className="mr-2 h-4 w-4" />
                  Управление кодами
                </Button>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Нажмите кнопку "Управление кодами" для просмотра, создания или деактивации кодов доступа.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="backups" className="space-y-4">
            <BackupManager />
          </TabsContent>
        </Tabs>

        <ManageAccessCodesDialog 
          open={manageCodesOpen} 
          onOpenChange={setManageCodesOpen}
        />
      </div>
    </DashboardLayout>
  );
};

export default AccessCodesPage;
