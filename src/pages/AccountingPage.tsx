import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ClosingDocsDashboard } from "@/components/invoices/admin/ClosingDocsDashboard";
import { useUserRole } from "@/hooks/useUserRole";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Calculator, FileText, History } from "lucide-react";

interface ActionLog {
  id: string;
  actionType: string;
  description: string;
  createdAt: string;
  tokenCode?: string;
  tokenRole?: string;
  details?: string;
}

const ACTION_TYPE_LABELS: Record<string, string> = {
  create_invoice: "Создание счёта",
  update_invoice: "Обновление счёта",
  delete_invoice: "Удаление счёта",
  create_expense: "Создание расхода",
  update_expense: "Обновление расхода",
  delete_expense: "Удаление расхода",
  upload_act: "Загрузка акта",
  delete_act: "Удаление акта",
  other: "Другое",
};

const AccountingPage = () => {
  const { role, loading } = useUserRole();

  const { data: logs } = useQuery<{ logs: ActionLog[]; total: number }>({
    queryKey: ['/api/assistant-logs', { role: 'accountant' }],
    queryFn: () => apiGet('/assistant-logs?role=accountant&limit=30'),
    enabled: role === 'admin',
  });

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
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Calculator className="h-7 w-7 text-primary" />
            Бухгалтерия
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Аналитика по закрывающим документам и действиям бухгалтерии
          </p>
        </div>

        <ClosingDocsDashboard />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <History className="h-5 w-5 text-primary" />
              Последние действия бухгалтерии
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!logs || logs.logs.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">Нет записей</p>
            ) : (
              <div className="space-y-3">
                {logs.logs.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg border bg-card" data-testid={`accounting-log-${log.id}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs">
                          {ACTION_TYPE_LABELS[log.actionType] || log.actionType}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(log.createdAt), "dd MMM yyyy, HH:mm", { locale: ru })}
                        </span>
                      </div>
                      <p className="text-sm">{log.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default AccountingPage;
