import { useState } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
  subMonths,
  subQuarters,
  subYears,
} from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Download, Loader2, FileText } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/invoiceCalculations";

interface ReportPreview {
  count: number;
  totalBudget: number;
  totalExpenses: number;
  totalRemaining: number;
}

export const ClientDashboard = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { viewMode, setViewMode } = useViewMode();
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState<ReportPreview | null>(null);

  const parseDateFromStorage = (key: string): Date | undefined => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return undefined;
      const d = new Date(raw);
      return isNaN(d.getTime()) ? undefined : d;
    } catch {
      return undefined;
    }
  };

  const [dateFrom, setDateFromState] = useState<Date | undefined>(() =>
    parseDateFromStorage("clientReport_dateFrom")
  );
  const [dateTo, setDateToState] = useState<Date | undefined>(() =>
    parseDateFromStorage("clientReport_dateTo")
  );

  const setDateFrom = (date: Date | undefined) => {
    setDateFromState(date);
    if (date) {
      localStorage.setItem("clientReport_dateFrom", date.toISOString());
    } else {
      localStorage.removeItem("clientReport_dateFrom");
    }
  };

  const setDateTo = (date: Date | undefined) => {
    setDateToState(date);
    if (date) {
      localStorage.setItem("clientReport_dateTo", date.toISOString());
    } else {
      localStorage.removeItem("clientReport_dateTo");
    }
  };

  const applyPreset = (preset: string) => {
    const now = new Date();
    switch (preset) {
      case "this-month":
        setDateFrom(startOfMonth(now));
        setDateTo(endOfMonth(now));
        break;
      case "last-month": {
        const last = subMonths(now, 1);
        setDateFrom(startOfMonth(last));
        setDateTo(endOfMonth(last));
        break;
      }
      case "this-quarter":
        setDateFrom(startOfQuarter(now));
        setDateTo(endOfQuarter(now));
        break;
      case "last-quarter": {
        const lastQ = subQuarters(now, 1);
        setDateFrom(startOfQuarter(lastQ));
        setDateTo(endOfQuarter(lastQ));
        break;
      }
      case "this-year":
        setDateFrom(startOfYear(now));
        setDateTo(endOfYear(now));
        break;
      case "last-year": {
        const lastY = subYears(now, 1);
        setDateFrom(startOfYear(lastY));
        setDateTo(endOfYear(lastY));
        break;
      }
    }
  };

  const handleSignOut = async () => {
    await logout();
    showSuccess("Выход выполнен", "Вы успешно вышли из системы");
    navigate("/auth");
  };

  const buildRequestBody = () => {
    const body: Record<string, string> = {};
    if (dateFrom) body.dateFrom = format(dateFrom, "yyyy-MM-dd");
    if (dateTo) body.dateTo = format(dateTo, "yyyy-MM-dd");
    return body;
  };

  const handlePreviewReport = async () => {
    if (dateFrom && dateTo && dateFrom > dateTo) {
      toast({ title: "Ошибка", description: "Дата начала не может быть позже даты окончания", variant: "destructive" });
      return;
    }
    setPreviewing(true);
    try {
      const csrfToken = localStorage.getItem("csrf_token");
      const response = await fetch("/api/admin/export/client-report/preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
        },
        credentials: "include",
        body: JSON.stringify(buildRequestBody()),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Ошибка сервера" }));
        throw new Error(err.error || `HTTP ${response.status}`);
      }
      const data: ReportPreview = await response.json();
      setPreview(data);
      setPreviewOpen(true);
    } catch (error: any) {
      toast({ title: "Ошибка", description: error.message || "Не удалось получить данные отчёта", variant: "destructive" });
    } finally {
      setPreviewing(false);
    }
  };

  const handleDownloadReport = async () => {
    setPreviewOpen(false);
    setDownloading(true);
    try {
      const csrfToken = localStorage.getItem("csrf_token");
      const response = await fetch("/api/admin/export/client-report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
        },
        credentials: "include",
        body: JSON.stringify(buildRequestBody()),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Ошибка сервера" }));
        throw new Error(err.error || `HTTP ${response.status}`);
      }
      const contentDisposition = response.headers.get("Content-Disposition") || "";
      const filenameMatch = contentDisposition.match(/filename=([^;]+)/);
      const filename = filenameMatch ? filenameMatch[1].trim() : `бюджетный_отчёт_${new Date().toISOString().split("T")[0]}.xlsx`;
      const buffer = await response.arrayBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
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
        <div className="flex flex-col gap-3 sm:items-end">
          <div className="flex flex-wrap gap-1.5 sm:justify-end">
            {[
              { key: "this-month", label: "Этот месяц" },
              { key: "last-month", label: "Прошлый месяц" },
              { key: "this-quarter", label: "Этот квартал" },
              { key: "last-quarter", label: "Прошлый квартал" },
              { key: "this-year", label: "Этот год" },
              { key: "last-year", label: "Прошлый год" },
            ].map(({ key, label }) => (
              <Button
                key={key}
                variant="ghost"
                size="sm"
                className="h-7 text-xs px-2.5"
                onClick={() => applyPreset(key)}
                data-testid={`button-preset-${key}`}
              >
                {label}
              </Button>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
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
              onClick={handlePreviewReport}
              disabled={previewing || downloading}
              data-testid="button-download-budget-report"
            >
              {previewing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Скачать бюджетный отчёт
            </Button>
          </div>
        </div>

        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent data-testid="dialog-report-preview">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Содержимое отчёта
              </DialogTitle>
              <DialogDescription>
                Отчёт будет содержать следующие данные. Нажмите «Скачать», чтобы сохранить файл.
              </DialogDescription>
            </DialogHeader>
            {preview && (
              <div className="grid grid-cols-2 gap-4 py-2">
                <div className="flex flex-col gap-1 rounded-lg border p-3">
                  <span className="text-xs text-muted-foreground">Счетов в отчёте</span>
                  <span className="text-2xl font-semibold" data-testid="text-preview-count">{preview.count}</span>
                </div>
                <div className="flex flex-col gap-1 rounded-lg border p-3">
                  <span className="text-xs text-muted-foreground">Общий бюджет</span>
                  <span className="text-2xl font-semibold" data-testid="text-preview-total-budget">{formatCurrency(preview.totalBudget)}</span>
                </div>
                <div className="flex flex-col gap-1 rounded-lg border p-3">
                  <span className="text-xs text-muted-foreground">Расходы</span>
                  <span className="text-xl font-medium text-muted-foreground" data-testid="text-preview-expenses">{formatCurrency(preview.totalExpenses)}</span>
                </div>
                <div className="flex flex-col gap-1 rounded-lg border p-3">
                  <span className="text-xs text-muted-foreground">Остаток</span>
                  <span className="text-xl font-medium" data-testid="text-preview-remaining">{formatCurrency(preview.totalRemaining)}</span>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setPreviewOpen(false)} data-testid="button-preview-cancel">
                Отмена
              </Button>
              <Button onClick={handleDownloadReport} disabled={downloading} data-testid="button-preview-confirm-download">
                {downloading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                Скачать
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
