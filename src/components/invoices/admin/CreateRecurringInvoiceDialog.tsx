import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ensureSessionContext } from "@/lib/supabaseHelpers";

interface CreateRecurringInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface Client {
  id: string;
  name: string;
}

interface Partner {
  id: string;
  name: string;
}

export function CreateRecurringInvoiceDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreateRecurringInvoiceDialogProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    client_id: "",
    partner_id: "",
    scheme: "agency_30" as "agency_30" | "commission_based",
    partner_commission_rate: "",
    frequency: "monthly",
    day_of_month: "1",
    notes: "",
  });

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open]);

  const loadData = async () => {
    const [clientsRes, partnersRes] = await Promise.all([
      supabase.from("clients").select("id, name").order("name"),
      supabase.from("partners").select("id, name").order("name"),
    ]);

    if (clientsRes.data) setClients(clientsRes.data);
    if (partnersRes.data) setPartners(partnersRes.data);
  };

  const calculateNextInvoiceDate = () => {
    const today = new Date();
    const dayOfMonth = parseInt(formData.day_of_month);
    let nextDate = new Date(today.getFullYear(), today.getMonth(), dayOfMonth);
    
    if (nextDate <= today) {
      nextDate = new Date(today.getFullYear(), today.getMonth() + 1, dayOfMonth);
    }
    
    return nextDate.toISOString().split('T')[0];
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { accessTokenId } = await ensureSessionContext();
      if (!accessTokenId) {
        throw new Error("Не авторизован");
      }

      const { error } = await supabase.from("recurring_invoices").insert({
        client_id: formData.client_id,
        partner_id: formData.partner_id,
        scheme: formData.scheme,
        partner_commission_rate: formData.scheme === "commission_based" 
          ? parseFloat(formData.partner_commission_rate) 
          : null,
        frequency: formData.frequency,
        day_of_month: parseInt(formData.day_of_month),
        next_invoice_date: calculateNextInvoiceDate(),
        notes: formData.notes || null,
        created_by: accessTokenId,
      });

      if (error) throw error;

      toast.success("Расписание создано");
      onSuccess();
      onOpenChange(false);
      setFormData({
        client_id: "",
        partner_id: "",
        scheme: "agency_30",
        partner_commission_rate: "",
        frequency: "monthly",
        day_of_month: "1",
        notes: "",
      });
    } catch (error: any) {
      toast.error("Ошибка", { description: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Новое расписание счетов</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Клиент</Label>
            <Select value={formData.client_id} onValueChange={(v) => setFormData({ ...formData, client_id: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите клиента" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Партнер</Label>
            <Select value={formData.partner_id} onValueChange={(v) => setFormData({ ...formData, partner_id: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите партнера" />
              </SelectTrigger>
              <SelectContent>
                {partners.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Схема</Label>
            <Select value={formData.scheme} onValueChange={(v: any) => setFormData({ ...formData, scheme: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="agency_30">Агентская 30%</SelectItem>
                <SelectItem value="commission_based">Комиссионная</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.scheme === "commission_based" && (
            <div>
              <Label>Комиссия партнера (%)</Label>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={formData.partner_commission_rate}
                onChange={(e) => setFormData({ ...formData, partner_commission_rate: e.target.value })}
                required
              />
            </div>
          )}

          <div>
            <Label>Частота</Label>
            <Select value={formData.frequency} onValueChange={(v) => setFormData({ ...formData, frequency: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Ежемесячно</SelectItem>
                <SelectItem value="quarterly">Ежеквартально</SelectItem>
                <SelectItem value="yearly">Ежегодно</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>День месяца (1-28)</Label>
            <Input
              type="number"
              min="1"
              max="28"
              value={formData.day_of_month}
              onChange={(e) => setFormData({ ...formData, day_of_month: e.target.value })}
              required
            />
          </div>

          <div>
            <Label>Примечание</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={2}
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Создание..." : "Создать"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}