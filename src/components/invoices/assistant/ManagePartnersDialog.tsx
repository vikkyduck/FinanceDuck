import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { ensureSessionContext } from "@/lib/supabaseHelpers";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { useStaggerAnimation } from "@/hooks/useStaggerAnimation";

import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PartnersTableSkeleton } from "../InvoicesSkeleton";
import { handleSupabaseError, handleValidationError, showSuccess } from "@/lib/errorHandler";
import { sanitizeText, sanitizeTelegram, sanitizePhone } from "@/lib/sanitize";
import { useRateLimit } from "@/hooks/useRateLimit";

interface ManagePartnersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ManagePartnersDialog = ({ open, onOpenChange }: ManagePartnersDialogProps) => {
  const [partners, setPartners] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [telegram, setTelegram] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [deletePartner, setDeletePartner] = useState<{id: string, name: string} | null>(null);
  const [deletingPartnerId, setDeletingPartnerId] = useState<string | null>(null);
  const [fetchingData, setFetchingData] = useState(true);
  const { setRef } = useStaggerAnimation(partners.length, 40);
  const { checkLimit } = useRateLimit('form');

  useEffect(() => {
    if (open) {
      fetchPartners();
    }
  }, [open]);

  const fetchPartners = async () => {
    setFetchingData(true);
    try {
      const { accessTokenId } = await ensureSessionContext();
      
      if (!accessTokenId) {
        handleValidationError("Сессия", "Сессия не найдена");
        return;
      }

      const { data, error } = await supabase.rpc('manage_partners_list', {
        _token_id: accessTokenId
      });
      
      if (error) {
        handleSupabaseError(error, { operation: "fetch_partners" });
      }
      
      setPartners(data || []);
    } catch (error: any) {
      if (error?.message?.includes('session')) {
        handleValidationError("Ошибка сессии", "Пожалуйста, войдите снова");
      }
    } finally {
      setFetchingData(false);
    }
  };

  const handleAdd = async () => {
    const limitCheck = checkLimit();
    if (!limitCheck.allowed) return;

    setLoading(true);
    try {
      const { accessTokenId } = await ensureSessionContext();
      
      // Validate input with zod
      const { partnerSchema } = await import('@/lib/validationSchemas');
      const validated = partnerSchema.parse({ name, telegram, phone });

      if (!accessTokenId) {
        handleValidationError("Сессия", "Сессия не найдена");
        return;
      }

      const { error } = await supabase.rpc('manage_partners_add', {
        _token_id: accessTokenId,
        _name: validated.name,
        _telegram: validated.telegram || null,
        _phone: validated.phone || null
      });

      if (error) {
        handleSupabaseError(error, { operation: "add_partner", details: { name: validated.name, telegram: validated.telegram } });
      } else {
        showSuccess("Успешно", "Партнер добавлен");
        setName("");
        setTelegram("");
        setPhone("");
        fetchPartners();
      }
    } catch (error: any) {
      if (error.name === 'ZodError') {
        handleValidationError("Форма", error.errors[0]?.message || 'Ошибка валидации данных');
      } else {
        throw error;
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deletePartner) return;
    setDeletingPartnerId(deletePartner.id);
    
    try {
      const { accessTokenId } = await ensureSessionContext();
      
      if (!accessTokenId) {
        handleValidationError("Сессия", "Сессия не найдена");
        setDeletePartner(null);
        setDeletingPartnerId(null);
        return;
      }

      const { data, error } = await supabase.rpc('manage_partners_delete', {
        _token_id: accessTokenId,
        _partner_id: deletePartner.id
      });

      if (error) {
        handleSupabaseError(error, { operation: "delete_partner", details: { id: deletePartner.id } });
        setDeletePartner(null);
        setDeletingPartnerId(null);
        return;
      }
      
      // Check if the response indicates failure
      if (data && typeof data === 'object') {
        const result = data as { success?: boolean; message?: string; error?: string };
        if (result.success === false) {
          toast.error("Ошибка удаления", {
            description: result.message || result.error || "Невозможно удалить партнёра",
          });
          setDeletePartner(null);
          setDeletingPartnerId(null);
          return;
        }
      }
      
      // Success
      showSuccess("Успешно", "Партнёр удалён");
      fetchPartners();
    } catch (error: any) {
      console.error('Delete partner error:', error);
      if (error?.message?.includes('session')) {
        handleValidationError("Ошибка сессии", "Пожалуйста, войдите снова");
      } else {
        toast.error("Ошибка", {
          description: error?.message || "Не удалось удалить партнёра",
        });
      }
    } finally {
      setDeletePartner(null);
      setDeletingPartnerId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Управление партнерами</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="border rounded-lg p-4 space-y-4">
            <h3 className="font-medium">Добавить партнера</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Название *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ООО Компания"
                />
              </div>
              <div className="space-y-2">
                <Label>Telegram</Label>
                <Input
                  value={telegram}
                  onChange={(e) => setTelegram(e.target.value)}
                  placeholder="@username"
                />
              </div>
              <div className="space-y-2">
                <Label>Телефон</Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+7 (999) 123-45-67"
                />
              </div>
            </div>
            <Button onClick={handleAdd} disabled={loading}>
              <Plus className="h-4 w-4 mr-2" />
              Добавить
            </Button>
          </div>

          <div className="space-y-4">
            <h3 className="font-medium">Существующие партнеры</h3>
            {fetchingData ? (
              <PartnersTableSkeleton />
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Название</TableHead>
                  <TableHead>Telegram</TableHead>
                  <TableHead>Телефон</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
                <TableBody>
                  {partners.map((partner, index) => (
                    <TableRow 
                      key={partner.id} 
                      ref={setRef(index)}
                      className="table-row-hover group"
                    >
                      <TableCell className="font-medium table-cell-highlight">{partner.name}</TableCell>
                      <TableCell className="table-cell-highlight">{partner.telegram || "—"}</TableCell>
                      <TableCell className="table-cell-highlight">{partner.phone || "—"}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={deletingPartnerId === partner.id}
                          onClick={() => setDeletePartner({ id: partner.id, name: partner.name })}
                          className="opacity-60 group-hover:opacity-100 transition-opacity duration-200"
                        >
                          {deletingPartnerId === partner.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4 text-destructive hover:scale-110 transition-transform" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            )}
          </div>
        </div>
      </DialogContent>

      <AlertDialog open={!!deletePartner} onOpenChange={(open) => !open && setDeletePartner(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить партнёра?</AlertDialogTitle>
            <AlertDialogDescription>
              Вы действительно хотите удалить партнёра «{deletePartner?.name}»? 
              Это может повлиять на связанные счета. Действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete} 
              disabled={!!deletingPartnerId}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deletingPartnerId ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Удаление...
                </>
              ) : (
                "Удалить"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
};
