import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

interface DownloadOptions {
  url: string;
  body: Record<string, unknown>;
  filename?: string;
  key?: string;
  successMessage?: string;
  errorMessage?: string;
}

export function useDownloadReport() {
  const { csrfToken } = useAuth();
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

  const download = async ({ url, body, filename, key = "__default__", successMessage = "Отчёт скачан", errorMessage }: DownloadOptions) => {
    setDownloadingKey(key);
    try {
      const response = await fetch(url, {
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

      const contentDisposition = response.headers.get("Content-Disposition") || "";
      const filenameMatch = contentDisposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i);
      const resolvedFilename = filenameMatch
        ? decodeURIComponent(filenameMatch[1].trim())
        : (filename || `отчёт_${new Date().toISOString().split("T")[0]}.xlsx`);

      const buffer = await response.arrayBuffer();
      const blob = new Blob([buffer], { type: XLSX_MIME });
      const objectUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = resolvedFilename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        window.URL.revokeObjectURL(objectUrl);
        document.body.removeChild(a);
      }, 100);

      toast.success(successMessage);
    } catch (error: unknown) {
      const message = errorMessage ?? (error instanceof Error ? error.message : "Не удалось сформировать отчёт");
      toast.error("Ошибка", { description: message });
    } finally {
      setDownloadingKey(null);
    }
  };

  const isDownloadingKey = (key = "__default__") => downloadingKey === key;

  return { download, downloadingKey, isDownloadingKey };
}
