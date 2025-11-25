import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { ensureSessionContext } from "@/lib/supabaseHelpers";
import { Plus, Trash2, Loader2, Pencil, X } from "lucide-react";
import { useStaggerAnimation } from "@/hooks/useStaggerAnimation";

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
import { ClientsTableSkeleton } from "../InvoicesSkeleton";
import { handleSupabaseError, handleValidationError, showSuccess } from "@/lib/errorHandler";
import { sanitizeText, sanitizeTelegram, sanitizePhone, isValidUuid } from "@/lib/sanitize";
import { useRateLimit } from "@/hooks/useRateLimit";

interface ManageClientsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ManageClientsDialog = ({ open, onOpenChange }: ManageClientsDialogProps) => {
  const [clients, setClients] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [telegram, setTelegram] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedPartnerIds, setSelectedPartnerIds] = useState<string[]>([]);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleteClient, setDeleteClient] = useState<{id: string, name: string} | null>(null);
  const [deletingClientId, setDeletingClientId] = useState<string | null>(null);
  const [fetchingData, setFetchingData] = useState(true);
  const { setRef } = useStaggerAnimation(clients.length, 40);
  const { checkLimit } = useRateLimit('form');

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open]);

  const fetchData = async () => {
    setFetchingData(true);
    try {
      const { accessTokenId } = await ensureSessionContext();
      
      if (!accessTokenId) {
        handleValidationError("Сессия", "Сессия не найдена");
        return;
      }

      // Clean up deleted partners
      await supabase.rpc('cleanup_deleted_partners');

      const { data: clientsData, error: clientsError } = await supabase.rpc('manage_clients_list', {
        _token_id: accessTokenId
      });
      
      if (clientsError) {
        handleSupabaseError(clientsError, { operation: "fetch_clients" });
      }
      
      const { data: partnersData, error: partnersError } = await supabase.rpc('manage_partners_list', {
        _token_id: accessTokenId
      });
      
      if (partnersError) {
        handleSupabaseError(partnersError, { operation: "fetch_partners" });
      }
      
      setClients(clientsData || []);
      setPartners(partnersData || []);
    } catch (error: any) {
      if (error?.message?.includes('session')) {
        handleValidationError("Ошибка сессии", "Пожалуйста, войдите снова");
      }
    } finally {
      setFetchingData(false);
    }
  };

  const handleEdit = (client: any) => {
    setEditingClientId(client.id);
    setName(client.name);
    setTelegram(client.telegram || "");
    setPhone(client.phone || "");
    setSelectedPartnerIds(client.partner_ids || []);
  };

  const handleCancelEdit = () => {
    setEditingClientId(null);
    setName("");
    setTelegram("");
    setPhone("");
    setSelectedPartnerIds([]);
  };

  const handleAdd = async () => {
    const limitCheck = checkLimit();
    if (!limitCheck.allowed) return;

    setLoading(true);
    try {
      const { accessTokenId } = await ensureSessionContext();
      
      // Validate input with zod
      const { clientSchema } = await import('@/lib/validationSchemas');
      const validated = clientSchema.parse({ 
        name, 
        telegram, 
        phone, 
        partnerIds: selectedPartnerIds 
      });

      if (!accessTokenId) {
        handleValidationError("Сессия", "Сессия не найдена");
        return;
      }

      if (editingClientId) {
        // Update existing client partners
        const { error } = await supabase.rpc('manage_clients_update_partners', {
          _token_id: accessTokenId,
          _client_id: editingClientId,
          _partner_ids: validated.partnerIds.length > 0 ? validated.partnerIds : []
        });

        if (error) {
          handleSupabaseError(error, { operation: "update_client", details: { id: editingClientId } });
        } else {
          showSuccess("Успешно", "Связи клиента обновлены");
          handleCancelEdit();
          fetchData();
        }
      } else {
        // Add new client
        const { error } = await supabase.rpc('manage_clients_add', {
          _token_id: accessTokenId,
          _name: validated.name,
          _telegram: validated.telegram || null,
          _phone: validated.phone || null,
          _partner_ids: validated.partnerIds.length > 0 ? validated.partnerIds : null
        });

        if (error) {
          handleSupabaseError(error, { operation: "add_client", details: { name: validated.name } });
        } else {
          showSuccess("Успешно", "Клиент добавлен");
          setName("");
          setTelegram("");
          setPhone("");
          setSelectedPartnerIds([]);
          fetchData();
        }
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
    if (!deleteClient) return;
    setDeletingClientId(deleteClient.id);
    
    try {
      const { accessTokenId } = await ensureSessionContext();
      
      if (!accessTokenId) {
        handleValidationError("Сессия", "Сессия не найдена");
        return;
      }

      const { data, error } = await supabase.rpc('manage_clients_delete', {
        _token_id: accessTokenId,
        _client_id: deleteClient.id
      });

      if (error) {
        handleSupabaseError(error, { operation: "delete_client", details: { id: deleteClient.id } });
      } else if (data && typeof data === 'object' && 'success' in data && !data.success) {
        handleValidationError("Удаление", (data as any).message || "Невозможно удалить клиента");
      } else {
        showSuccess("Успешно", "Клиент удалён");
        fetchData();
      }
    } catch (error: any) {
      if (error?.message?.includes('session')) {
        handleValidationError("Ошибка сессии", "Пожалуйста, войдите снова");
      }
    } finally {
      setDeleteClient(null);
      setDeletingClientId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Управление клиентами</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="border rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">
                {editingClientId ? "Редактировать партнеров клиента" : "Добавить клиента"}
              </h3>
              {editingClientId && (
                <Button variant="ghost" size="sm" onClick={handleCancelEdit}>
                  <X className="h-4 w-4 mr-2" />
                  Отмена
                </Button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Название *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ООО Клиент"
                  disabled={!!editingClientId}
                />
              </div>
              <div className="space-y-2">
                <Label>Telegram</Label>
                <Input
                  value={telegram}
                  onChange={(e) => setTelegram(e.target.value)}
                  placeholder="@username"
                  disabled={!!editingClientId}
                />
              </div>
              <div className="space-y-2">
                <Label>Телефон</Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+7 (999) 123-45-67"
                  disabled={!!editingClientId}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Партнеры (можно выбрать несколько)</Label>
              <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto border rounded-lg p-3">
                {partners.map((partner) => (
                  <div key={partner.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`partner-${partner.id}`}
                      checked={selectedPartnerIds.includes(partner.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedPartnerIds([...selectedPartnerIds, partner.id]);
                        } else {
                          setSelectedPartnerIds(selectedPartnerIds.filter(id => id !== partner.id));
                        }
                      }}
                    />
                    <Label
                      htmlFor={`partner-${partner.id}`}
                      className="text-sm font-normal cursor-pointer"
                    >
                      {partner.name}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
            <Button onClick={handleAdd} disabled={loading}>
              {editingClientId ? (
                <>
                  <Pencil className="h-4 w-4 mr-2" />
                  Сохранить партнеров
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Добавить
                </>
              )}
            </Button>
          </div>

          <div className="space-y-4">
            <h3 className="font-medium">Существующие клиенты</h3>
            {fetchingData ? (
              <ClientsTableSkeleton />
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Название</TableHead>
                  <TableHead>Telegram</TableHead>
                  <TableHead>Телефон</TableHead>
                  <TableHead>Партнеры</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
                <TableBody>
                  {clients.map((client, index) => (
                    <TableRow 
                      key={client.id} 
                      ref={setRef(index)}
                      className="table-row-hover group"
                    >
                      <TableCell className="font-medium table-cell-highlight">{client.name}</TableCell>
                      <TableCell className="table-cell-highlight">{client.telegram || "—"}</TableCell>
                      <TableCell className="table-cell-highlight">{client.phone || "—"}</TableCell>
                      <TableCell className="table-cell-highlight">
                        {client.partner_names && client.partner_names.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {client.partner_names.map((name: string, idx: number) => (
                              <Badge key={idx} variant="secondary" className="text-xs">
                                {name}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={!!editingClientId || !!deletingClientId}
                            onClick={() => handleEdit(client)}
                            className="opacity-60 group-hover:opacity-100 transition-opacity duration-200"
                          >
                            <Pencil className="h-4 w-4 hover:scale-110 transition-transform" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={!!editingClientId || deletingClientId === client.id}
                            onClick={() => setDeleteClient({ id: client.id, name: client.name })}
                            className="opacity-60 group-hover:opacity-100 transition-opacity duration-200"
                          >
                            {deletingClientId === client.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4 text-destructive hover:scale-110 transition-transform" />
                            )}
                          </Button>
                        </div>
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

      <AlertDialog open={!!deleteClient} onOpenChange={(open) => !open && setDeleteClient(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить клиента?</AlertDialogTitle>
            <AlertDialogDescription>
              Вы действительно хотите удалить клиента «{deleteClient?.name}»? 
              Это может повлиять на связанные счета. Действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete} 
              disabled={!!deletingClientId}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deletingClientId ? (
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
