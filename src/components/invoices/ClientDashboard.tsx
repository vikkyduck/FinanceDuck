import { useState } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Download, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { ClientInvoicesList } from "./client/ClientInvoicesList";
import { ClientStats } from "./client/ClientStats";
import { OverduePaymentsAlert } from "./shared/OverduePaymentsAlert";
import { ClientAgency30Report } from "./client/ClientAgency30Report";
import { ClientBudgetDashboard } from "./client/ClientBudgetDashboard";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { ViewModeToggle } from "@/components/shared/ViewModeToggle";
import { showSuccess } from "@/lib/errorHandler";
import { useToast } from "@/hooks/use-toast";

export const ClientDashboard = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { viewMode, setViewMode } = useViewMode();
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  const handleSignOut = async () => {
    await logout();
    showSuccess("Выход выполнен", "Вы успешно вышли из системы");
    navigate("/auth");
  };

  const handleDownloadReport = async () => {
    if (dateFrom && dateTo && dateFrom > dateTo) {
      toast({ title: "Ошибка", description: "Дата начала не может быть позже даты окончания", variant: "destructive" });
      return;
    }
    setDownloading(true);
    try {
      const csrfToken = localStorage.getItem("csrf_token");
      const body: Record<string, string> = {};
      if (dateFrom) body.dateFrom = format(dateFrom, "yyyy-MM-dd");
      if (dateTo) body.dateTo = format(dateTo, "yyyy-MM-dd");
      const response = await fetch("/api/admin/export/client-report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
        },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Ошибка сервера" }));
        throw new Error(err.error || `HTTP ${response.status}`);
      }
      const buffer = await response.arrayBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `бюджетный_отчёт_${new Date().toISOString().split("T")[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }, 100);
      showSuccess("Отчёт скачан", "Файл загружен на ваше устройство");
    } catch (error: any) {
      toast({ title: "Ошибка", description: error.message || "Не удалось сформировать отчёт", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <DashboardLayout>
      <DashboardHeader
        title="Здравствуйте, Клиент"
        subtitle="Ваши счета и платежи"
      />

      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:justify-end">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex flex-col gap-1" data-testid="input-date-from">
              <Label className="text-xs text-muted-foreground">С</Label>
              <DatePicker
                date={dateFrom}
                onDateChange={setDateFrom}
                placeholder="Начало периода"
              />
            </div>
            <div className="flex flex-col gap-1" data-testid="input-date-to">
              <Label className="text-xs text-muted-foreground">По</Label>
              <DatePicker
                date={dateTo}
                onDateChange={setDateTo}
                placeholder="Конец периода"
              />
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadReport}
            disabled={downloading}
            data-testid="button-download-budget-report"
          >
            {downloading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Скачать бюджетный отчёт
          </Button>
        </div>

        <OverduePaymentsAlert role="client" />
        
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-2xl">Обзор</CardTitle>
          </CardHeader>
          <CardContent>
            <ClientStats />
          </CardContent>
        </Card>

        <ClientBudgetDashboard />

        <ClientAgency30Report />

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-4 flex flex-row items-center justify-between">
            <CardTitle className="text-2xl">Мои счета</CardTitle>
            <ViewModeToggle 
              value={viewMode}
              onValueChange={setViewMode}
              className="hidden sm:flex"
            />
          </CardHeader>
          <CardContent className="px-0">
            <ClientInvoicesList viewMode={viewMode} />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};
