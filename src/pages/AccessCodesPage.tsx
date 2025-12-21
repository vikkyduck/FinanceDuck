import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Key, Database, Settings } from "lucide-react";
import { AccessCodesManager } from "@/components/admin/AccessCodesManager";
import { BackupManager } from "@/components/admin/BackupManager";
import { useUserRole } from "@/hooks/useUserRole";

const AccessCodesPage = () => {
  const { role, loading } = useUserRole();

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

          <TabsContent value="access-codes">
            <AccessCodesManager />
          </TabsContent>

          <TabsContent value="backups">
            <BackupManager />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default AccessCodesPage;
