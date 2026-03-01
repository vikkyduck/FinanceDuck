import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export function useExportMyInvoices() {
  const [isExporting, setIsExporting] = useState(false);
  const { csrfToken } = useAuth();

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const response = await fetch("/api/my-invoices/export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken || "",
        },
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Export failed");
      }

      const buffer = await response.arrayBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const disposition = response.headers.get("Content-Disposition");
      let filename = `export_${new Date().toISOString().slice(0, 10)}.xlsx`;
      if (disposition) {
        const match = disposition.match(/filename=(.+)/);
        if (match) filename = match[1];
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success("Файл Excel успешно скачан");
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Не удалось выгрузить данные");
    } finally {
      setIsExporting(false);
    }
  };

  return { handleExport, isExporting };
}
