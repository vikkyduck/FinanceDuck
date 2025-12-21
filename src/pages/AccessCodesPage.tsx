import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Key, Database, Settings, History } from "lucide-react";
import { AccessCodesManager } from "@/components/admin/AccessCodesManager";
import { BackupManager } from "@/components/admin/BackupManager";
import { ActionLogsManager } from "@/components/admin/ActionLogsManager";
import { useUserRole } from "@/hooks/useUserRole";
import { useSearchParams } from "react-router-dom";

const AccessCodesPage = () => {
  const { role, loading } = useUserRole();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || 'access-codes';

  const handleTabChange = (value: string) => {
    if (value === 'access-codes') {
      setSearchParams({});
    } else {
      setSearchParams({ tab: value });
    }
  };

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
      <div className="space-y-4 sm:space-y-6">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Settings className="h-5 w-5 sm:h-6 sm:w-6 md:h-8 md:w-8" />
            Система
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">Управление доступом и резервными копиями</p>
        </div>

        <Tabs value={currentTab} onValueChange={handleTabChange} className="space-y-4 sm:space-y-6">
          <TabsList className="w-full sm:w-auto flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="access-codes" className="gap-1 sm:gap-2 text-xs sm:text-sm flex-1 sm:flex-none" data-testid="tab-access-codes">
              <Key className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span>Коды</span>
            </TabsTrigger>
            <TabsTrigger value="backups" className="gap-1 sm:gap-2 text-xs sm:text-sm flex-1 sm:flex-none" data-testid="tab-backups">
              <Database className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span>Бэкапы</span>
            </TabsTrigger>
            <TabsTrigger value="logs" className="gap-1 sm:gap-2 text-xs sm:text-sm flex-1 sm:flex-none" data-testid="tab-logs">
              <History className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span>Журнал</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="access-codes">
            <AccessCodesManager />
          </TabsContent>

          <TabsContent value="backups">
            <BackupManager />
          </TabsContent>

          <TabsContent value="logs">
            <ActionLogsManager />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default AccessCodesPage;
