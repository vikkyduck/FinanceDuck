import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRateLimit } from "@/hooks/useRateLimit";
import { handleValidationError, showSuccess } from "@/lib/errorHandler";
import { toast } from "sonner";
import { sanitizeText, sanitizeFileName, isValidUuid } from "@/lib/sanitize";
import { Loader2, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface UploadDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  onSuccess: () => void;
}

export const UploadDocumentDialog = ({ open, onOpenChange, invoiceId, onSuccess }: UploadDocumentDialogProps) => {
  const { checkLimit } = useRateLimit('form');
  const [file, setFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState<string>("client_act");
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    const limitCheck = checkLimit();
    if (!limitCheck.allowed) {
      return;
    }

    if (!file) {
      handleValidationError("Файл", "Пожалуйста, выберите файл");
      return;
    }

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      handleValidationError("Файл", "Размер файла не должен превышать 10MB");
      return;
    }

    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/png',
      'image/jpeg',
      'image/jpg'
    ];

    if (!allowedTypes.includes(file.type)) {
      handleValidationError("Файл", "Недопустимый тип файла. Разрешены: PDF, Word, Excel, PNG, JPG");
      return;
    }

    if (!isValidUuid(invoiceId)) {
      handleValidationError("Счет", "Некорректный идентификатор счета");
      return;
    }

    toast.error("Загрузка документов временно недоступна. Функция будет добавлена позже.");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:w-full">
        <DialogHeader>
          <DialogTitle>Загрузить документ</DialogTitle>
          <DialogDescription>
            Выберите файл и укажите тип документа
          </DialogDescription>
        </DialogHeader>

        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Загрузка документов временно недоступна. Функция будет добавлена позже.
          </AlertDescription>
        </Alert>

        <div className="space-y-4">
          <div>
            <Label htmlFor="file">Файл</Label>
            <Input
              id="file"
              type="file"
              onChange={handleFileChange}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
              disabled={uploading}
              data-testid="input-file"
            />
            {file && (
              <p className="text-sm text-muted-foreground mt-1">
                Выбран: {file.name} ({(file.size / 1024).toFixed(0)} KB)
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="documentType">Тип документа</Label>
            <Select value={documentType} onValueChange={setDocumentType} disabled={uploading}>
              <SelectTrigger id="documentType" data-testid="select-document-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="client_act">Акт от Заказчика (+2000)</SelectItem>
                <SelectItem value="executor_receipt">Акт/Чек от Исполнителя (+1000)</SelectItem>
                <SelectItem value="invoice">Счет</SelectItem>
                <SelectItem value="contract">Договор</SelectItem>
                <SelectItem value="other">Другое</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="notes">Примечания (опционально)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Дополнительная информация о документе"
              disabled={uploading}
              data-testid="input-document-notes"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={uploading} data-testid="button-cancel-upload">
              Отмена
            </Button>
            <Button onClick={handleUpload} disabled={true} data-testid="button-upload-document">
              {uploading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {uploading ? "Загрузка..." : "Загрузить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
