import { useDownloadReport } from "@/hooks/useDownloadReport";

export function useExportMyInvoices() {
  const { download, isDownloadingKey } = useDownloadReport();

  const handleExport = () =>
    download({
      url: "/api/my-invoices/export",
      body: {},
      filename: `export_${new Date().toISOString().slice(0, 10)}.xlsx`,
    });

  return { handleExport, isExporting: isDownloadingKey() };
}
