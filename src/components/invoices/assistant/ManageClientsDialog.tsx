import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Loader2, Pencil, Trash2, Phone, Send, X, Check, User, ChevronsUpDown } from "lucide-react";
import { useStaggerAnimation } from "@/hooks/useStaggerAnimation";
import { toast } from "sonner";
import { ClientsTableSkeleton } from "../InvoicesSkeleton";
import { handleValidationError, showSuccess } from "@/lib/errorHandler";
import { useRateLimit } from "@/hooks/useRateLimit";
import { invoiceService, ClientWithPartners, PartnerListItem } from "@/lib/services/invoices";
import { useAuth } from "@/hooks/useAuth";

interface ManageClientsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ClientFormData {
  name: string;
  telegram: string;
  phone: string;
  partnerIds: string[];
}

const emptyForm: ClientFormData = { name: "", telegram: "", phone: "", partnerIds: [] };

export const ManageClientsDialog = ({ open, onOpenChange }: ManageClientsDialogProps) => {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  
  const [clients, setClients] = useState<ClientWithPartners[]>([]);
  const [partners, setPartners] = useState<PartnerListItem[]>([]);
  const [form, setForm] = useState<ClientFormData>(emptyForm);
  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(true);
  const { setRef } = useStaggerAnimation(clients.length, 40);
  const { checkLimit } = useRateLimit('form');
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ClientFormData>(emptyForm);
  
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<ClientWithPartners | null>(null);
  const [deleting, setDeleting] = useState(false);
  
  const [addPartnerPopoverOpen, setAddPartnerPopoverOpen] = useState(false);
  const [editPartnerPopoverOpen, setEditPartnerPopoverOpen] = useState(false);

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open]);

  const fetchData = async () => {
    setFetchingData(true);
    try {
      const partnersData = await invoiceService.fetchPartners();
      setPartners(partnersData);
      
      if (isAdmin) {
        const clientsData = await invoiceService.fetchClientsWithPartners();
        setClients(clientsData);
      } else {
        const basicClients = await invoiceService.fetchClients();
        setClients(basicClients.map(c => ({ ...c, partners: [] })));
      }
    } catch (error: any) {
      console.error("Error fetching data:", error);
      toast.error("Не удалось загрузить данные");
    } finally {
      setFetchingData(false);
    }
  };

  const togglePartner = (partnerIds: string[], partnerId: string): string[] => {
    if (partnerIds.includes(partnerId)) {
      return partnerIds.filter(id => id !== partnerId);
    }
    return [...partnerIds, partnerId];
  };

  const getPartnerNames = (partnerIds: string[]): string => {
    if (partnerIds.length === 0) return "Выберите партнёров";
    return partnerIds
      .map(id => partners.find(p => p.id === id)?.name)
      .filter(Boolean)
      .join(", ");
  };

  const handleAdd = async () => {
    const limitCheck = checkLimit();
    if (!limitCheck.allowed) return;

    if (!form.name.trim()) {
      handleValidationError("Форма", "Введите название клиента");
      return;
    }

    setLoading(true);
    try {
      const created = await invoiceService.createClient({
        name: form.name.trim(),
        telegram: form.telegram.trim() || undefined,
        phone: form.phone.trim() || undefined,
        partnerId: form.partnerIds.length === 1 ? form.partnerIds[0] : undefined,
      });
      
      if (isAdmin && form.partnerIds.length > 0) {
        await invoiceService.setClientPartners(created.id, form.partnerIds);
      }
      
      showSuccess("Успешно", "Клиент добавлен");
      setForm(emptyForm);
      setAddPartnerPopoverOpen(false);
      fetchData();
    } catch (error: any) {
      toast.error(error.message || "Не удалось добавить клиента");
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (client: ClientWithPartners) => {
    setEditingId(client.id);
    setEditForm({
      name: client.name,
      telegram: client.telegram || "",
      phone: client.phone || "",
      partnerIds: client.partners.map(p => p.id),
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(emptyForm);
    setEditPartnerPopoverOpen(false);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    
    if (!editForm.name.trim()) {
      handleValidationError("Форма", "Введите название клиента");
      return;
    }

    setLoading(true);
    try {
      await invoiceService.updateClient(editingId, {
        name: editForm.name.trim(),
        telegram: editForm.telegram.trim() || undefined,
        phone: editForm.phone.trim() || undefined,
        partnerId: editForm.partnerIds.length === 1 ? editForm.partnerIds[0] : undefined,
      });
      
      if (isAdmin) {
        await invoiceService.setClientPartners(editingId, editForm.partnerIds);
      }
      
      showSuccess("Успешно", "Клиент обновлён");
      setEditingId(null);
      setEditForm(emptyForm);
      setEditPartnerPopoverOpen(false);
      fetchData();
    } catch (error: any) {
      toast.error(error.message || "Не удалось обновить клиента");
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = (client: ClientWithPartners) => {
    setClientToDelete(client);
    setDeleteConfirmOpen(true);
  };

  const handleDelete = async () => {
    if (!clientToDelete) return;
    
    setDeleting(true);
    try {
      const result = await invoiceService.deleteClient(clientToDelete.id);
      if (result.success) {
        showSuccess("Успешно", "Клиент удалён");
        fetchData();
      } else {
        toast.error(result.error || "Не удалось удалить клиента");
      }
    } catch (error: any) {
      toast.error(error.message || "Не удалось удалить клиента");
    } finally {
      setDeleting(false);
      setDeleteConfirmOpen(false);
      setClientToDelete(null);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Управление клиентами</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Добавить клиента</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Название *</Label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="ООО Клиент"
                      data-testid="input-client-name"
                    />
                  </div>
                  {isAdmin && (
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        Партнёры
                      </Label>
                      <Popover open={addPartnerPopoverOpen} onOpenChange={setAddPartnerPopoverOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            className="w-full justify-between font-normal"
                            data-testid="select-client-partners"
                          >
                            <span className="truncate">
                              {form.partnerIds.length === 0 
                                ? "Выберите партнёров"
                                : `Выбрано: ${form.partnerIds.length}`}
                            </span>
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[280px] p-2">
                          <div className="space-y-1 max-h-[200px] overflow-y-auto">
                            {partners.map((partner) => (
                              <div
                                key={partner.id}
                                className="flex items-center space-x-2 p-2 hover-elevate rounded-md cursor-pointer"
                                onClick={() => setForm({ ...form, partnerIds: togglePartner(form.partnerIds, partner.id) })}
                              >
                                <Checkbox
                                  checked={form.partnerIds.includes(partner.id)}
                                  onCheckedChange={() => setForm({ ...form, partnerIds: togglePartner(form.partnerIds, partner.id) })}
                                />
                                <span className="text-sm">{partner.name}</span>
                              </div>
                            ))}
                            {partners.length === 0 && (
                              <div className="text-sm text-muted-foreground text-center py-2">
                                Нет партнёров
                              </div>
                            )}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">
                      <Send className="h-3 w-3" />
                      Telegram
                    </Label>
                    <Input
                      value={form.telegram}
                      onChange={(e) => setForm({ ...form, telegram: e.target.value })}
                      placeholder="@username"
                      data-testid="input-client-telegram"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      Телефон
                    </Label>
                    <Input
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      placeholder="+7 999 123-45-67"
                      data-testid="input-client-phone"
                    />
                  </div>
                </div>
                <Button onClick={handleAdd} disabled={loading} className="w-full" data-testid="button-add-client">
                  {loading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4 mr-2" />
                  )}
                  Добавить
                </Button>
              </CardContent>
            </Card>

            <div className="space-y-2">
              <h3 className="font-medium text-sm text-muted-foreground">Клиенты ({clients.length})</h3>
              {fetchingData ? (
                <ClientsTableSkeleton />
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Название</TableHead>
                        <TableHead>Партнёр</TableHead>
                        <TableHead>Контакты</TableHead>
                        <TableHead className="w-[100px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {clients.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                            Нет клиентов
                          </TableCell>
                        </TableRow>
                      ) : (
                        clients.map((client, index) => (
                          <TableRow 
                            key={client.id} 
                            ref={setRef(index)}
                            className="hover-elevate"
                            data-testid={`row-client-${client.id}`}
                          >
                            <TableCell>
                              {editingId === client.id ? (
                                <Input
                                  value={editForm.name}
                                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                  className="h-8"
                                  data-testid="input-edit-client-name"
                                />
                              ) : (
                                <span className="font-medium">{client.name}</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {editingId === client.id ? (
                                isAdmin ? (
                                  <Popover open={editPartnerPopoverOpen} onOpenChange={setEditPartnerPopoverOpen}>
                                    <PopoverTrigger asChild>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="w-full justify-between font-normal h-8"
                                      >
                                        <span className="truncate text-xs">
                                          {editForm.partnerIds.length === 0 
                                            ? "Выберите"
                                            : `Выбрано: ${editForm.partnerIds.length}`}
                                        </span>
                                        <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[220px] p-2">
                                      <div className="space-y-1 max-h-[200px] overflow-y-auto">
                                        {partners.map((partner) => (
                                          <div
                                            key={partner.id}
                                            className="flex items-center space-x-2 p-2 hover-elevate rounded-md cursor-pointer"
                                            onClick={() => setEditForm({ ...editForm, partnerIds: togglePartner(editForm.partnerIds, partner.id) })}
                                          >
                                            <Checkbox
                                              checked={editForm.partnerIds.includes(partner.id)}
                                              onCheckedChange={() => setEditForm({ ...editForm, partnerIds: togglePartner(editForm.partnerIds, partner.id) })}
                                            />
                                            <span className="text-sm">{partner.name}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                ) : (
                                  <span className="text-xs text-muted-foreground">Недоступно</span>
                                )
                              ) : (
                                isAdmin && client.partners.length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {client.partners.map(p => (
                                      <Badge key={p.id} variant="secondary" className="text-xs">
                                        {p.name}
                                      </Badge>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground">
                                    {isAdmin ? "Нет партнёров" : "—"}
                                  </span>
                                )
                              )}
                            </TableCell>
                            <TableCell>
                              {editingId === client.id ? (
                                <div className="space-y-1">
                                  <Input
                                    value={editForm.telegram}
                                    onChange={(e) => setEditForm({ ...editForm, telegram: e.target.value })}
                                    placeholder="Telegram"
                                    className="h-7 text-xs"
                                  />
                                  <Input
                                    value={editForm.phone}
                                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                                    placeholder="Телефон"
                                    className="h-7 text-xs"
                                  />
                                </div>
                              ) : (
                                <div className="flex flex-wrap gap-1">
                                  {client.telegram && (
                                    <Badge variant="outline" className="text-xs">
                                      <Send className="h-3 w-3 mr-1" />
                                      {client.telegram}
                                    </Badge>
                                  )}
                                  {client.phone && (
                                    <Badge variant="outline" className="text-xs">
                                      <Phone className="h-3 w-3 mr-1" />
                                      {client.phone}
                                    </Badge>
                                  )}
                                  {!client.telegram && !client.phone && (
                                    <span className="text-xs text-muted-foreground">Нет контактов</span>
                                  )}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                {editingId === client.id ? (
                                  <>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={saveEdit}
                                      disabled={loading}
                                      data-testid="button-save-client"
                                    >
                                      <Check className="h-4 w-4 text-green-600" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={cancelEdit}
                                      data-testid="button-cancel-edit-client"
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => startEdit(client)}
                                      data-testid={`button-edit-client-${client.id}`}
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    {isAdmin && (
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={() => confirmDelete(client)}
                                        data-testid={`button-delete-client-${client.id}`}
                                      >
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                      </Button>
                                    )}
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить клиента?</AlertDialogTitle>
            <AlertDialogDescription>
              Вы уверены, что хотите удалить клиента "{clientToDelete?.name}"?
              Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-client"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
