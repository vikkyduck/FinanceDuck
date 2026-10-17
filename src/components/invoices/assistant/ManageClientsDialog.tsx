import { useState, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandItem } from "@/components/ui/command";
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
import { apiPost } from "@/lib/api";
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
  tgChatId: string;
  tgBotToken: string;
  removeTgBotToken: boolean;
  contactPerson: string;
}

const emptyForm: ClientFormData = { name: "", telegram: "", phone: "", partnerIds: [], tgChatId: "", tgBotToken: "", removeTgBotToken: false, contactPerson: "" };

// Мультиселект партнёров на cmdk: встроенный поиск + CommandList корректно
// скроллится внутри Dialog (обычный overflow-div внутри Popover в
// scroll-lock-диалоге глотал колесо мыши — партнёров ниже было не достать).
interface PartnerMultiSelectProps {
  partners: PartnerListItem[];
  selected: string[];
  onToggle: (partnerId: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerClassName?: string;
  contentWidth?: string;
  compact?: boolean;
}

const PartnerMultiSelect = ({
  partners, selected, onToggle, open, onOpenChange,
  triggerClassName = "", contentWidth = "w-[280px]", compact = false,
}: PartnerMultiSelectProps) => {
  const label = selected.length === 0
    ? (compact ? "Выберите" : "Выберите партнёров")
    : `Выбрано: ${selected.length}`;
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          size={compact ? "sm" : "default"}
          className={`w-full justify-between font-normal ${triggerClassName}`}
          data-testid="select-client-partners"
        >
          <span className={`truncate ${compact ? "text-xs" : ""}`}>{label}</span>
          <ChevronsUpDown className={`${compact ? "ml-1 h-3 w-3" : "ml-2 h-4 w-4"} shrink-0 opacity-50`} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={`${contentWidth} p-0`} align="start">
        <Command>
          <CommandInput placeholder="Поиск партнёра…" />
          <CommandList className="max-h-[240px]">
            <CommandEmpty>Партнёр не найден</CommandEmpty>
            {partners.map((partner) => {
              const checked = selected.includes(partner.id);
              return (
                <CommandItem
                  key={partner.id}
                  value={partner.name}
                  onSelect={() => onToggle(partner.id)}
                  className="cursor-pointer"
                >
                  <Checkbox checked={checked} className="mr-2 pointer-events-none" />
                  <span className="text-sm">{partner.name}</span>
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

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



  const fetchData = useCallback(async () => {
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
    } catch (error: unknown) {
      console.error("Error fetching data:", error);
      toast.error("Не удалось загрузить данные");
    } finally {
      setFetchingData(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open, fetchData]);

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
      // Единый механизм: связь партнёров пишется через partnerIds (сервер сам
      // синхронит client_partners + основной partner_id). Отдельный вызов не нужен.
      await invoiceService.createClient({
        name: form.name.trim(),
        telegram: form.telegram.trim() || undefined,
        phone: form.phone.trim() || undefined,
        partnerIds: form.partnerIds,
        tgChatId: form.tgChatId.trim() || undefined,
        tgBotToken: form.tgBotToken.trim() || undefined,
        contactPerson: form.contactPerson.trim() || null,
      });

      showSuccess("Успешно", "Клиент добавлен");
      setForm(emptyForm);
      setAddPartnerPopoverOpen(false);
      fetchData();
    } catch (error: unknown) {
      toast.error((error instanceof Error ? error.message : String(error)) || "Не удалось добавить клиента");
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
      tgChatId: client.tgChatId || "",
      // Секрет никогда не приходит из read API. Пусто = оставить как есть.
      tgBotToken: "",
      removeTgBotToken: false,
      contactPerson: client.contactPerson || "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(emptyForm);
    setEditPartnerPopoverOpen(false);
  };

  const sendTgTest = async (clientId: string) => {
    if (!editForm.tgChatId.trim()) {
      toast.error("Сначала заполните TG Chat ID и сохраните");
      return;
    }
    try {
      // Save changes first so server has current settings.
      if (editingId === clientId) {
        const tokenUpdate = editForm.removeTgBotToken
          ? { tgBotToken: null }
          : (editForm.tgBotToken.trim()
            ? { tgBotToken: editForm.tgBotToken.trim() }
            : {});
        await invoiceService.updateClient(clientId, {
          tgChatId: editForm.tgChatId.trim() || null,
          ...tokenUpdate,
        });
      }
      await apiPost(`/clients/${clientId}/telegram-test`, {});
      showSuccess("Telegram", "Тестовое сообщение отправлено");
    } catch (e: unknown) {
      toast.error((e instanceof Error ? e.message : String(e)) || "Не удалось отправить тест");
    }
  };

  const saveEdit = async () => {
    if (!editingId) return;
    
    if (!editForm.name.trim()) {
      handleValidationError("Форма", "Введите название клиента");
      return;
    }

    setLoading(true);
    try {
      const tokenUpdate = editForm.removeTgBotToken
        ? { tgBotToken: null }
        : (editForm.tgBotToken.trim()
          ? { tgBotToken: editForm.tgBotToken.trim() }
          : {});
      // Единый механизм: partnerIds → сервер сам синхронит client_partners + partner_id.
      await invoiceService.updateClient(editingId, {
        name: editForm.name.trim(),
        telegram: editForm.telegram.trim() || undefined,
        phone: editForm.phone.trim() || undefined,
        partnerIds: editForm.partnerIds,
        tgChatId: editForm.tgChatId.trim() || null,
        ...tokenUpdate,
        contactPerson: editForm.contactPerson.trim() || null,
      });

      showSuccess("Успешно", "Клиент обновлён");
      setEditingId(null);
      setEditForm(emptyForm);
      setEditPartnerPopoverOpen(false);
      fetchData();
    } catch (error: unknown) {
      toast.error((error instanceof Error ? error.message : String(error)) || "Не удалось обновить клиента");
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
    } catch (error: unknown) {
      toast.error((error instanceof Error ? error.message : String(error)) || "Не удалось удалить клиента");
    } finally {
      setDeleting(false);
      setDeleteConfirmOpen(false);
      setClientToDelete(null);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto w-[95vw] sm:w-full">
          <DialogHeader>
            <DialogTitle className="text-lg sm:text-xl">Управление клиентами</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3 p-3 sm:p-6 sm:pb-3">
                <CardTitle className="text-sm sm:text-base">Добавить клиента</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 p-3 sm:p-6 pt-0 sm:pt-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Название *</Label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="ООО Клиент"
                      data-testid="input-client-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1 text-xs sm:text-sm">
                      <User className="h-3 w-3" />
                      Контактное лицо
                    </Label>
                    <Input
                      value={form.contactPerson}
                      onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
                      placeholder="Иван Петров"
                      data-testid="input-client-contact-person"
                    />
                  </div>
                  {isAdmin && (
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        Партнёры
                      </Label>
                      <PartnerMultiSelect
                        partners={partners}
                        selected={form.partnerIds}
                        onToggle={(id) => setForm({ ...form, partnerIds: togglePartner(form.partnerIds, id) })}
                        open={addPartnerPopoverOpen}
                        onOpenChange={setAddPartnerPopoverOpen}
                        contentWidth="w-[280px]"
                      />
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1 text-xs sm:text-sm">
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
                    <Label className="flex items-center gap-1 text-xs sm:text-sm">
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t mt-2">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1 text-xs sm:text-sm">
                      <Send className="h-3 w-3" />
                      TG Chat ID
                    </Label>
                    <Input
                      value={form.tgChatId}
                      onChange={(e) => setForm({ ...form, tgChatId: e.target.value })}
                      placeholder="-1001234567890"
                      data-testid="input-client-tg-chat-id"
                    />
                    <p className="text-[10px] text-muted-foreground leading-tight">
                      ID группы для уведомлений (с минусом для супергрупп)
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1 text-xs sm:text-sm">
                      <Send className="h-3 w-3" />
                      TG Bot Token
                    </Label>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      value={form.tgBotToken}
                      onChange={(e) => setForm({ ...form, tgBotToken: e.target.value })}
                      placeholder="опционально — иначе общий бот"
                      data-testid="input-client-tg-bot-token"
                    />
                    <p className="text-[10px] text-muted-foreground leading-tight">
                      Свой бот клиента. Пусто → используется общий бот сервиса.
                    </p>
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
              <h3 className="font-medium text-xs sm:text-sm text-muted-foreground">Клиенты ({clients.length})</h3>
              {fetchingData ? (
                <ClientsTableSkeleton />
              ) : (
                <div className="overflow-x-auto -mx-3 sm:mx-0">
                  <div className="min-w-[600px] px-3 sm:px-0">
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs sm:text-sm">Название</TableHead>
                            <TableHead className="text-xs sm:text-sm">Партнёр</TableHead>
                            <TableHead className="text-xs sm:text-sm">Контакты</TableHead>
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
                                <div className="space-y-1">
                                  <Input
                                    value={editForm.name}
                                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                    className="h-8"
                                    placeholder="Название"
                                    data-testid="input-edit-client-name"
                                  />
                                  <Input
                                    value={editForm.contactPerson}
                                    onChange={(e) => setEditForm({ ...editForm, contactPerson: e.target.value })}
                                    className="h-7 text-xs"
                                    placeholder="Контактное лицо"
                                    data-testid="input-edit-client-contact-person"
                                  />
                                </div>
                              ) : (
                                <div className="flex flex-col">
                                  <span className="font-medium">{client.name}</span>
                                  {client.contactPerson && (
                                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                                      <User className="h-3 w-3" />
                                      {client.contactPerson}
                                    </span>
                                  )}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              {editingId === client.id ? (
                                isAdmin ? (
                                  <PartnerMultiSelect
                                    partners={partners}
                                    selected={editForm.partnerIds}
                                    onToggle={(id) => setEditForm({ ...editForm, partnerIds: togglePartner(editForm.partnerIds, id) })}
                                    open={editPartnerPopoverOpen}
                                    onOpenChange={setEditPartnerPopoverOpen}
                                    triggerClassName="h-8"
                                    contentWidth="w-[220px]"
                                    compact
                                  />
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
                                  <Input
                                    value={editForm.tgChatId}
                                    onChange={(e) => setEditForm({ ...editForm, tgChatId: e.target.value })}
                                    placeholder="TG Chat ID (-1001234...)"
                                    className="h-7 text-xs"
                                    data-testid="input-edit-client-tg-chat-id"
                                  />
                                  <Input
                                    type="password"
                                    autoComplete="new-password"
                                    value={editForm.tgBotToken}
                                    onChange={(e) => setEditForm({ ...editForm, tgBotToken: e.target.value })}
                                    placeholder={client.hasTgBotToken ? "Новый токен (пусто — не менять)" : "TG Bot Token (опц.)"}
                                    className="h-7 text-xs"
                                    disabled={editForm.removeTgBotToken}
                                    data-testid="input-edit-client-tg-bot-token"
                                  />
                                  {client.hasTgBotToken && (
                                    <div className="flex items-center gap-2 px-1">
                                      <Checkbox
                                        checked={editForm.removeTgBotToken}
                                        onCheckedChange={(checked) => setEditForm({
                                          ...editForm,
                                          removeTgBotToken: checked === true,
                                          tgBotToken: checked === true ? "" : editForm.tgBotToken,
                                        })}
                                        data-testid="checkbox-remove-client-tg-bot-token"
                                      />
                                      <span className="text-[10px] text-muted-foreground">
                                        Токен сохранён; удалить и использовать общего бота
                                      </span>
                                    </div>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs w-full"
                                    onClick={() => sendTgTest(client.id)}
                                    disabled={loading || !editForm.tgChatId.trim()}
                                    data-testid="button-tg-test"
                                  >
                                    <Send className="h-3 w-3 mr-1" />
                                    Тест Telegram
                                  </Button>
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
                                  {client.tgChatId && (
                                    <Badge variant="secondary" className="text-xs">
                                      <Send className="h-3 w-3 mr-1" />
                                      TG: {client.tgChatId}
                                    </Badge>
                                  )}
                                  {!client.telegram && !client.phone && !client.tgChatId && (
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
                </div>
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
