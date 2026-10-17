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
import { ru } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Download, Loader2, FileText, FileSpreadsheet } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { ClientStats } from "./client/ClientStats";
import { OverduePaymentsAlert } from "./shared/OverduePaymentsAlert";
import { useAuth } from "@/hooks/useAuth";
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

  const getPresetRange = (preset: string): { from: Date; to: Date } | null => {
    const now = new Date();
    switch (preset) {
      case "this-month":
        return { from: startOfMonth(now), to: endOfMonth(now) };
      case "last-month": {
        const last = subMonths(now, 1);
        return { from: startOfMonth(last), to: endOfMonth(last) };
      }
      case "this-quarter":
        return { from: startOfQuarter(now), to: endOfQuarter(now) };
      case "last-quarter": {
        const lastQ = subQuarters(now, 1);
        return { from: startOfQuarter(lastQ), to: endOfQuarter(lastQ) };
      }
      case "this-year":
        return { from: startOfYear(now), to: endOfYear(now) };
      case "last-year": {
        const lastY = subYears(now, 1);
        return { from: startOfYear(lastY), to: endOfYear(lastY) };
      }
      default:
        return null;
    }
  };

  const activePreset = (() => {
    if (!dateFrom || !dateTo) return null;
    const fromStr = format(dateFrom, "yyyy-MM-dd");
    const toStr = format(dateTo, "yyyy-MM-dd");
    const keys = ["this-month", "last-month", "this-quarter", "last-quarter", "this-year", "last-year"];
    for (const key of keys) {
      const range = getPresetRange(key);
      if (range && format(range.from, "yyyy-MM-dd") === fromStr && format(range.to, "yyyy-MM-dd") === toStr) {
        return key;
      }
    }
    return null;
  })();

  const applyPreset = (preset: string) => {
    const range = getPresetRange(preset);
    if (range) {
      setDateFrom(range.from);
      setDateTo(range.to);
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
    } catch (error: unknown) {
      toast({ title: "Ошибка", description: (error instanceof Error ? error.message : String(error)) || "Не удалось получить данные отчёта", variant: "destructive" });
    } finally {
      setPreviewing(false);
    }
  };

  // Открывает HTML-отчёт в новой вкладке. Из него юзер может «Сохранить PDF».
  const handleOpenHtmlReport = async () => {
    setPreviewOpen(false);
    setDownloading(true);
    const reportWindow = window.open("about:blank", "_blank");
    try {
      const csrfToken = localStorage.getItem("csrf_token");
      const response = await fetch("/api/admin/export/client-report-print", {
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
      const html = await response.text();
      if (reportWindow) {
        reportWindow.document.open();
        reportWindow.document.write(html);
        reportWindow.document.close();
        reportWindow.focus();
        showSuccess("Отчёт открыт", "В новой вкладке доступна кнопка «Распечатать / Сохранить PDF»");
      } else {
        const blob = new Blob([html], { type: "text/html;charset=utf-8" });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.target = "_blank"; a.rel = "noopener";
        document.body.appendChild(a); a.click();
        setTimeout(() => { window.URL.revokeObjectURL(url); document.body.removeChild(a); }, 100);
      }
    } catch (error: unknown) {
      reportWindow?.close();
      toast({ title: "Ошибка", description: (error instanceof Error ? error.message : String(error)) || "Не удалось сформировать отчёт", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  // Скачивает бинарный файл (PDF / XLSX) как Blob с правильным именем.
  const downloadBinary = async (url: string, mime: string, fallbackExt: string) => {
    setPreviewOpen(false);
    setDownloading(true);
    try {
      const csrfToken = localStorage.getItem("csrf_token");
      const response = await fetch(url, {
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
      // Парсим имя файла из Content-Disposition (RFC 5987 + ASCII fallback).
      const cd = response.headers.get("Content-Disposition") || "";
      let filename = `бюджетный_отчёт_${new Date().toISOString().split("T")[0]}.${fallbackExt}`;
      const utfMatch = cd.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
      const asciiMatch = cd.match(/filename\s*=\s*"?([^";]+)"?/i);
      if (utfMatch) try { filename = decodeURIComponent(utfMatch[1]); } catch { /* Malformed optional UI preference: keep its default. */ }
      else if (asciiMatch) filename = asciiMatch[1];
      const buffer = await response.arrayBuffer();
      const blob = new Blob([buffer], { type: mime });
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl; a.download = filename;
      document.body.appendChild(a); a.click();
      setTimeout(() => { window.URL.revokeObjectURL(blobUrl); document.body.removeChild(a); }, 100);
      showSuccess("Отчёт скачан", filename);
    } catch (error: unknown) {
      toast({ title: "Ошибка", description: (error instanceof Error ? error.message : String(error)) || "Не удалось скачать отчёт", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadPdf = () => downloadBinary(
    "/api/admin/export/client-report-pdf",
    "application/pdf",
    "pdf"
  );
  const handleDownloadXlsx = () => downloadBinary(
    "/api/admin/export/client-report",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "xlsx"
  );

  return (
    <DashboardLayout>
      <DashboardHeader
        title="Ваши финансы"
        subtitle="Счета, оплаты и остатки по вашим проектам"
      />

      <div className="space-y-4 sm:space-y-6">
        {/* Панель отчёта — стекло кабинета: слева смысл, справа управление */}
        <Card data-testid="card-budget-report">
          <CardContent className="pt-5 pb-5 sm:pt-6 sm:pb-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="lg:max-w-xs">
                <h3 className="text-base font-semibold">Бюджетный отчёт</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Выберите период — соберём счета, расходы и остатки. Страница, PDF или Excel.
                </p>
              </div>
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
                      variant={activePreset === key ? "secondary" : "ghost"}
                      size="sm"
                      className="h-7 text-xs px-2.5"
                      onClick={() => applyPreset(key)}
                      data-testid={`button-preset-${key}`}
                      aria-pressed={activePreset === key}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                {(dateFrom || dateTo) && (
                  <p className="text-xs text-muted-foreground sm:text-right" data-testid="text-date-range-summary">
                    {dateFrom && dateTo
                      ? `Показывается: ${format(dateFrom, "d MMM yyyy", { locale: ru })} — ${format(dateTo, "d MMM yyyy", { locale: ru })}`
                      : dateFrom
                      ? `С ${format(dateFrom, "d MMM yyyy", { locale: ru })}`
                      : `По ${format(dateTo!, "d MMM yyyy", { locale: ru })}`}
                  </p>
                )}
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
                      <FileText className="h-4 w-4 mr-2" />
                    )}
                    Открыть бюджетный отчёт
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

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
            <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-2">
              <Button variant="outline" onClick={() => setPreviewOpen(false)} disabled={downloading} data-testid="button-preview-cancel">
                Отмена
              </Button>
              <div className="flex flex-col sm:flex-row gap-2 sm:ml-auto">
                <Button variant="outline" onClick={handleDownloadXlsx} disabled={downloading} data-testid="button-preview-download-xlsx">
                  {downloading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-2" />}
                  Excel
                </Button>
                <Button variant="outline" onClick={handleDownloadPdf} disabled={downloading} data-testid="button-preview-download-pdf">
                  {downloading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                  PDF
                </Button>
                <Button onClick={handleOpenHtmlReport} disabled={downloading} data-testid="button-preview-open-html">
                  {downloading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
                  Открыть страницу
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <OverduePaymentsAlert role="client" />

        {/* Единый обзор. Бюджеты проектов / Agency30 / Мои счета —
            убраны как дублирующие представления тех же данных. */}
        <ClientStats dateFrom={dateFrom} dateTo={dateTo} />
      </div>
    </DashboardLayout>
  );
};
