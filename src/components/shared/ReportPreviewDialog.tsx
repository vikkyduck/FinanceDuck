import { FileText, Download, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/invoiceCalculations";

export interface ReportPreviewData {
  count: number;
  totalBudget: number;
  totalExpenses: number;
  totalRemaining: number;
}

interface ReportPreviewDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  preview: ReportPreviewData | null;
  downloading: boolean;
}

export function ReportPreviewDialog({
  open,
  onClose,
  onConfirm,
  preview,
  downloading,
}: ReportPreviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
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
              <span className="text-2xl font-semibold" data-testid="text-preview-count">
                {preview.count}
              </span>
            </div>
            <div className="flex flex-col gap-1 rounded-lg border p-3">
              <span className="text-xs text-muted-foreground">Общий бюджет</span>
              <span className="text-2xl font-semibold" data-testid="text-preview-total-budget">
                {formatCurrency(preview.totalBudget)}
              </span>
            </div>
            <div className="flex flex-col gap-1 rounded-lg border p-3">
              <span className="text-xs text-muted-foreground">Расходы</span>
              <span className="text-xl font-medium text-muted-foreground" data-testid="text-preview-expenses">
                {formatCurrency(preview.totalExpenses)}
              </span>
            </div>
            <div className="flex flex-col gap-1 rounded-lg border p-3">
              <span className="text-xs text-muted-foreground">Остаток</span>
              <span className="text-xl font-medium" data-testid="text-preview-remaining">
                {formatCurrency(preview.totalRemaining)}
              </span>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-preview-cancel">
            Отмена
          </Button>
          <Button onClick={onConfirm} disabled={downloading} data-testid="button-preview-confirm-download">
            {downloading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Скачать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
