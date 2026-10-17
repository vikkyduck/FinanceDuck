import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import type { ReportPreviewData } from "@/components/shared/ReportPreviewDialog";

export function useReportPreview() {
  const { toast } = useToast();
  const [previewing, setPreviewing] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState<ReportPreviewData | null>(null);
  const [pendingDownload, setPendingDownload] = useState<(() => void) | null>(null);

  const fetchPreview = async (body: Record<string, string>, onConfirm: () => void) => {
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
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Ошибка сервера" }));
        throw new Error(err.error || `HTTP ${response.status}`);
      }
      const data: ReportPreviewData = await response.json();
      setPreview(data);
      setPendingDownload(() => onConfirm);
      setPreviewOpen(true);
    } catch (error: unknown) {
      toast({
        title: "Ошибка",
        description: (error instanceof Error ? error.message : String(error)) || "Не удалось получить данные отчёта",
        variant: "destructive",
      });
    } finally {
      setPreviewing(false);
    }
  };

  const closePreview = () => {
    setPreviewOpen(false);
    setPendingDownload(null);
  };

  const confirmDownload = () => {
    if (pendingDownload) {
      pendingDownload();
    }
    setPreviewOpen(false);
    setPendingDownload(null);
  };

  return {
    previewing,
    previewOpen,
    preview,
    fetchPreview,
    closePreview,
    confirmDownload,
  };
}
