import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Loader2, Pencil, Trash2, Users, Phone, Send, Mail, X, Check } from "lucide-react";
import { useStaggerAnimation } from "@/hooks/useStaggerAnimation";
import { toast } from "sonner";
import { PartnersTableSkeleton } from "../InvoicesSkeleton";
import { handleValidationError, showSuccess } from "@/lib/errorHandler";
import { useRateLimit } from "@/hooks/useRateLimit";
import { invoiceService, PartnerListItem, ClientListItem, PartnerLeverageRole } from "@/lib/services/invoices";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";

interface ManagePartnersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface PartnerFormData {
  name: string;
  telegram: string;
  phone: string;
  email: string;
  leverageRole: PartnerLeverageRole;
  directToOwner: boolean;
}

const emptyForm: PartnerFormData = { name: "", telegram: "", phone: "", email: "", leverageRole: "external", directToOwner: false };

const DIRECT_TO_OWNER_LABEL = "Клиенты платят напрямую владельцу";

// Подписи ролей коэффициента эффективности (кто есть кто в метрике плеча).
const LEVERAGE_ROLE_LABELS: Record<PartnerLeverageRole, string> = {
  external: "Обычный партнёр",
  managed_asset: "Актив под управлением",
  owner: "Владелец лично",
};
// Короткий бейдж в списке — только для не-дефолтных ролей.
const LEVERAGE_ROLE_BADGES: Partial<Record<PartnerLeverageRole, string>> = {
  managed_asset: "актив",
  owner: "владелец",
};

export const ManagePartnersDialog = ({ open, onOpenChange }: ManagePartnersDialogProps) => {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  
  const [partners, setPartners] = useState<PartnerListItem[]>([]);
  const [form, setForm] = useState<PartnerFormData>(emptyForm);
  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(true);
  const { setRef } = useStaggerAnimation(partners.length, 40);
  const { checkLimit } = useRateLimit('form');
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<PartnerFormData>(emptyForm);
  
  const [selectedPartner, setSelectedPartner] = useState<PartnerListItem | null>(null);
  const [partnerClients, setPartnerClients] = useState<ClientListItem[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [partnerToDelete, setPartnerToDelete] = useState<PartnerListItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (open) {
      fetchPartners();
      setSelectedPartner(null);
      setPartnerClients([]);
    }
  }, [open]);

  const fetchPartners = async () => {
    setFetchingData(true);
    try {
      const data = await invoiceService.fetchPartners();
      setPartners(data);
    } catch (error: unknown) {
      console.error("[ManagePartnersDialog] Error fetching partners:", error);
      toast.error("Не удалось загрузить партнёров");
    } finally {
      setFetchingData(false);
    }
  };

  const fetchPartnerClients = async (partner: PartnerListItem) => {
    if (!isAdmin) {
      setSelectedPartner(partner);
      return;
    }
    
    setSelectedPartner(partner);
    setLoadingClients(true);
    try {
      const clients = await invoiceService.fetchPartnerClients(partner.id);
      setPartnerClients(clients);
    } catch (error: unknown) {
      console.error("[ManagePartnersDialog] Error fetching partner clients:", error);
      toast.error("Не удалось загрузить клиентов партнёра");
    } finally {
      setLoadingClients(false);
    }
  };

  const handleAdd = async () => {
    const limitCheck = checkLimit();
    if (!limitCheck.allowed) return;

    if (!form.name.trim()) {
      handleValidationError("Форма", "Введите название партнёра");
      return;
    }

    setLoading(true);
    try {
      await invoiceService.createPartner({
        name: form.name.trim(),
        telegram: form.telegram.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        // Роль метрики и отметку "напрямую владельцу" задает только админ (сервер иначе вырежет).
        ...(isAdmin ? { leverageRole: form.leverageRole, directToOwner: form.directToOwner } : {}),
      });
      showSuccess("Успешно", "Партнер добавлен");
      setForm(emptyForm);
      fetchPartners();
    } catch (error: unknown) {
      toast.error((error instanceof Error ? error.message : String(error)) || "Не удалось добавить партнёра");
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (partner: PartnerListItem) => {
    setEditingId(partner.id);
    setEditForm({
      name: partner.name,
      telegram: partner.telegram || "",
      phone: partner.phone || "",
      email: partner.email || "",
      leverageRole: partner.leverageRole || "external",
      directToOwner: partner.directToOwner,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(emptyForm);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    
    if (!editForm.name.trim()) {
      handleValidationError("Форма", "Введите название партнёра");
      return;
    }

    setLoading(true);
    try {
      await invoiceService.updatePartner(editingId, {
        name: editForm.name.trim(),
        telegram: editForm.telegram.trim() || undefined,
        phone: editForm.phone.trim() || undefined,
        email: editForm.email.trim() || undefined,
        ...(isAdmin ? { leverageRole: editForm.leverageRole, directToOwner: editForm.directToOwner } : {}),
      });
      showSuccess("Успешно", "Партнер обновлён");
      setEditingId(null);
      setEditForm(emptyForm);
      fetchPartners();
      
      if (selectedPartner?.id === editingId) {
        const updated = partners.find(p => p.id === editingId);
        if (updated) {
          setSelectedPartner({
            ...updated,
            name: editForm.name.trim(),
            telegram: editForm.telegram.trim() || null,
            phone: editForm.phone.trim() || null,
            email: editForm.email.trim() || null,
          });
        }
      }
    } catch (error: unknown) {
      toast.error((error instanceof Error ? error.message : String(error)) || "Не удалось обновить партнёра");
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = (partner: PartnerListItem) => {
    setPartnerToDelete(partner);
    setDeleteConfirmOpen(true);
  };

  const handleDelete = async () => {
    if (!partnerToDelete) return;
    
    setDeleting(true);
    try {
      const result = await invoiceService.deletePartner(partnerToDelete.id);
      if (result.success) {
        showSuccess("Успешно", "Партнер удалён");
        fetchPartners();
        if (selectedPartner?.id === partnerToDelete.id) {
          setSelectedPartner(null);
          setPartnerClients([]);
        }
      } else {
        toast.error(result.error || "Не удалось удалить партнёра");
      }
    } catch (error: unknown) {
      toast.error((error instanceof Error ? error.message : String(error)) || "Не удалось удалить партнёра");
    } finally {
      setDeleting(false);
      setDeleteConfirmOpen(false);
      setPartnerToDelete(null);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto w-[95vw] sm:w-full">
          <DialogHeader>
            <DialogTitle>Управление партнерами</DialogTitle>
          </DialogHeader>
          
          <div className={`grid gap-4 ${isAdmin ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Добавить партнера</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <Label>Название *</Label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="ООО Компания"
                      data-testid="input-partner-name"
                    />
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
                        data-testid="input-partner-telegram"
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
                        data-testid="input-partner-phone"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      Email
                    </Label>
                    <Input
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="partner@company.com"
                      type="email"
                      data-testid="input-partner-email"
                    />
                  </div>
                  {isAdmin && (
                    <div className="space-y-2">
                      <Label>Роль в коэффициенте эффективности</Label>
                      <Select
                        value={form.leverageRole}
                        onValueChange={(v) => setForm({ ...form, leverageRole: v as PartnerLeverageRole })}
                      >
                        <SelectTrigger data-testid="select-partner-leverage-role">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(LEVERAGE_ROLE_LABELS) as PartnerLeverageRole[]).map((r) => (
                            <SelectItem key={r} value={r}>{LEVERAGE_ROLE_LABELS[r]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        «Актив под управлением» и «Владелец лично» — для виртуальных партнёров владельца; метрика делит прибыль на эти котлы.
                      </p>
                      <label className="flex items-center gap-2 text-sm pt-1">
                        <Checkbox
                          checked={form.directToOwner}
                          onCheckedChange={(checked) => setForm({ ...form, directToOwner: checked === true })}
                          data-testid="checkbox-partner-direct-to-owner"
                        />
                        {DIRECT_TO_OWNER_LABEL}
                      </label>
                      <p className="text-xs text-muted-foreground">
                        Деньги по счетам такого партнера приходят сразу на счет владельца, поэтому в расчетах с партнерами долга у него нет.
                      </p>
                    </div>
                  )}
                  <Button onClick={handleAdd} disabled={loading} className="w-full" data-testid="button-add-partner">
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
                <h3 className="font-medium text-sm text-muted-foreground">Партнеры ({partners.length})</h3>
                {fetchingData ? (
                  <PartnersTableSkeleton />
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Название</TableHead>
                          <TableHead>Контакты</TableHead>
                          <TableHead className="w-[100px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {partners.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                              Нет партнёров
                            </TableCell>
                          </TableRow>
                        ) : (
                          partners.map((partner, index) => (
                            <TableRow 
                              key={partner.id} 
                              ref={setRef(index)}
                              className={`hover-elevate cursor-pointer ${selectedPartner?.id === partner.id ? 'bg-accent' : ''}`}
                              onClick={() => fetchPartnerClients(partner)}
                              data-testid={`row-partner-${partner.id}`}
                            >
                              <TableCell>
                                {editingId === partner.id ? (
                                  <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
                                    <Input
                                      value={editForm.name}
                                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                      className="h-8"
                                      data-testid="input-edit-partner-name"
                                    />
                                    {isAdmin && (
                                      <>
                                        <Select
                                          value={editForm.leverageRole}
                                          onValueChange={(v) => setEditForm({ ...editForm, leverageRole: v as PartnerLeverageRole })}
                                        >
                                          <SelectTrigger className="h-7 text-xs" data-testid="select-edit-partner-leverage-role">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {(Object.keys(LEVERAGE_ROLE_LABELS) as PartnerLeverageRole[]).map((r) => (
                                              <SelectItem key={r} value={r}>{LEVERAGE_ROLE_LABELS[r]}</SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                        <label className="flex items-center gap-1.5 text-xs">
                                          <Checkbox
                                            checked={editForm.directToOwner}
                                            onCheckedChange={(checked) => setEditForm({ ...editForm, directToOwner: checked === true })}
                                            data-testid="checkbox-edit-partner-direct-to-owner"
                                          />
                                          {DIRECT_TO_OWNER_LABEL}
                                        </label>
                                      </>
                                    )}
                                  </div>
                                ) : (
                                  <span className="font-medium inline-flex items-center gap-1.5">
                                    {partner.name}
                                    {isAdmin && LEVERAGE_ROLE_BADGES[partner.leverageRole] && (
                                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0" title={LEVERAGE_ROLE_LABELS[partner.leverageRole]}>
                                        {LEVERAGE_ROLE_BADGES[partner.leverageRole]}
                                      </Badge>
                                    )}
                                    {isAdmin && partner.directToOwner && (
                                      <Badge variant="outline" className="text-[10px] px-1.5 py-0" title={DIRECT_TO_OWNER_LABEL}>
                                        напрямую
                                      </Badge>
                                    )}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>
                                {editingId === partner.id ? (
                                  <div className="space-y-1">
                                    <Input
                                      value={editForm.telegram}
                                      onChange={(e) => setEditForm({ ...editForm, telegram: e.target.value })}
                                      placeholder="Telegram"
                                      className="h-7 text-xs"
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                    <Input
                                      value={editForm.phone}
                                      onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                                      placeholder="Телефон"
                                      className="h-7 text-xs"
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                    <Input
                                      value={editForm.email}
                                      onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                                      placeholder="Email"
                                      className="h-7 text-xs"
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                  </div>
                                ) : (
                                  <div className="flex flex-wrap gap-1">
                                    {partner.telegram && (
                                      <Badge variant="outline" className="text-xs">
                                        <Send className="h-3 w-3 mr-1" />
                                        {partner.telegram}
                                      </Badge>
                                    )}
                                    {partner.phone && (
                                      <Badge variant="outline" className="text-xs">
                                        <Phone className="h-3 w-3 mr-1" />
                                        {partner.phone}
                                      </Badge>
                                    )}
                                    {partner.email && (
                                      <Badge variant="outline" className="text-xs">
                                        <Mail className="h-3 w-3 mr-1" />
                                        {partner.email}
                                      </Badge>
                                    )}
                                    {!partner.telegram && !partner.phone && !partner.email && (
                                      <span className="text-xs text-muted-foreground">Нет контактов</span>
                                    )}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                  {editingId === partner.id ? (
                                    <>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={saveEdit}
                                        disabled={loading}
                                        data-testid="button-save-partner"
                                      >
                                        <Check className="h-4 w-4 text-green-600" />
                                      </Button>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={cancelEdit}
                                        data-testid="button-cancel-edit-partner"
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                    </>
                                  ) : (
                                    <>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={() => startEdit(partner)}
                                        data-testid={`button-edit-partner-${partner.id}`}
                                      >
                                        <Pencil className="h-4 w-4" />
                                      </Button>
                                      {isAdmin && (
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          onClick={() => confirmDelete(partner)}
                                          data-testid={`button-delete-partner-${partner.id}`}
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

            {isAdmin && (
              <div className="space-y-2">
                <h3 className="font-medium text-sm text-muted-foreground flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  {selectedPartner ? `Клиенты: ${selectedPartner.name}` : "Выберите партнёра"}
                </h3>
                
                {selectedPartner ? (
                  <Card>
                    <CardContent className="pt-4">
                      {loadingClients ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : partnerClients.length === 0 ? (
                        <div className="text-center text-muted-foreground py-8">
                          Нет клиентов у этого партнёра
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {partnerClients.map((client) => (
                            <div 
                              key={client.id} 
                              className="p-3 rounded-md border bg-muted/30"
                              data-testid={`client-of-partner-${client.id}`}
                            >
                              <div className="font-medium">{client.name}</div>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {client.telegram && (
                                  <Badge variant="secondary" className="text-xs">
                                    <Send className="h-3 w-3 mr-1" />
                                    {client.telegram}
                                  </Badge>
                                )}
                                {client.phone && (
                                  <Badge variant="secondary" className="text-xs">
                                    <Phone className="h-3 w-3 mr-1" />
                                    {client.phone}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-center text-muted-foreground py-8">
                      Нажмите на партнёра в таблице чтобы увидеть его клиентов
                    </div>
                  </CardContent>
                </Card>
              )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить партнёра?</AlertDialogTitle>
            <AlertDialogDescription>
              Вы уверены, что хотите удалить партнёра "{partnerToDelete?.name}"?
              Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-partner"
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
