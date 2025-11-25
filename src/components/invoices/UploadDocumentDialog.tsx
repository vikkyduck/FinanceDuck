import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useRateLimit } from "@/hooks/useRateLimit";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/hooks/useAuth";
import { handleSupabaseError, handleValidationError, showSuccess } from "@/lib/errorHandler";
import { sanitizeText, sanitizeFileName, isValidUuid } from "@/lib/sanitize";
import { Upload, Loader2 } from "lucide-react";

interface UploadDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  onSuccess: () => void;
}

export const UploadDocumentDialog = ({ open, onOpenChange, invoiceId, onSuccess }: UploadDocumentDialogProps) => {
  const { checkLimit } = useRateLimit('form');
  const { getSession } = useUserRole();
  const { accessTokenId: authAccessTokenId } = useAuth();
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
    // Check rate limit
    const limitCheck = checkLimit();
    if (!limitCheck.allowed) {
      return;
    }

    if (!file) {
      handleValidationError("Файл", "Пожалуйста, выберите файл");
      return;
    }

    // Валидация размера файла (макс 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      handleValidationError("Файл", "Размер файла не должен превышать 10MB");
      return;
    }

    // Валидация типа файла
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

    const sanitizedNotes = sanitizeText(notes);

    setUploading(true);

    try {
      // Get uploaded_by from either auth system (email login) or access token system (code login)
      const session = getSession();
      const uploadedByTokenId = authAccessTokenId || session?.accessTokenId;

      if (!uploadedByTokenId) {
        handleValidationError("Сессия", "Сессия не найдена");
        setUploading(false);
        return;
      }

      // Санитизация имени файла
      const sanitizedFileName = sanitizeFileName(file.name);
      
      // Upload file to storage
      const fileExt = sanitizedFileName.split('.').pop();
      const fileName = `${invoiceId}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('invoice-documents')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Save metadata to database
      const { error: dbError } = await supabase
        .from('invoice_documents')
        .insert({
          invoice_id: invoiceId,
          file_name: sanitizedFileName,
          file_path: fileName,
          file_size: file.size,
          mime_type: file.type,
          uploaded_by_token_id: uploadedByTokenId,
          document_type: documentType,
          notes: sanitizedNotes || null,
        });

      if (dbError) throw dbError;

      showSuccess("Успешно", `Документ "${sanitizedFileName}" загружен`);

      setFile(null);
      setNotes("");
      setDocumentType("client_act");
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      console.error('Error uploading document:', error);
      handleSupabaseError(error, {
        operation: "upload_document",
        details: { fileName: file.name, documentType }
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Загрузить документ</DialogTitle>
          <DialogDescription>
            Выберите файл и укажите тип документа
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="file">Файл</Label>
            <Input
              id="file"
              type="file"
              onChange={handleFileChange}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
              disabled={uploading}
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
              <SelectTrigger id="documentType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="client_act">Акт от Заказчика (+2000₽)</SelectItem>
                <SelectItem value="executor_receipt">Акт/Чек от Исполнителя (+1000₽)</SelectItem>
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
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={uploading}>
              Отмена
            </Button>
            <Button onClick={handleUpload} disabled={!file || uploading}>
              {uploading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {uploading ? "Загрузка..." : "Загрузить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
