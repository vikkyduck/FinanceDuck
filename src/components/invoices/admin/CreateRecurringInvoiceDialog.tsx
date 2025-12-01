import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/api";

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
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    clientId: "",
    partnerId: "",
    scheme: "agency_30" as "agency_30" | "commission_based" | "partner_10" | "partner_15",
    partnerCommissionRate: "",
    amount: "",
    defaultExpenses: "",
    description: "",
    frequency: "monthly",
    dayOfMonth: "1",
    startDate: new Date().toISOString().split('T')[0],
    endDate: "",
    notes: "",
    hideFromAssistant: false,
  });

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
    queryFn: () => apiGet("/clients"),
    enabled: open,
  });

  const { data: partners = [] } = useQuery<Partner[]>({
    queryKey: ["/api/partners"],
    queryFn: () => apiGet("/partners"),
    enabled: open,
  });

  const calculateNextInvoiceDate = () => {
    const startDate = new Date(formData.startDate);
    const dayOfMonth = parseInt(formData.dayOfMonth);
    const today = new Date();
    
    let nextDate = new Date(startDate.getFullYear(), startDate.getMonth(), dayOfMonth);
    
    if (nextDate < startDate) {
      nextDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, dayOfMonth);
    }
    
    while (nextDate < today) {
      switch (formData.frequency) {
        case 'monthly':
          nextDate.setMonth(nextDate.getMonth() + 1);
          break;
        case 'quarterly':
          nextDate.setMonth(nextDate.getMonth() + 3);
          break;
        case 'yearly':
          nextDate.setFullYear(nextDate.getFullYear() + 1);
          break;
      }
    }
    
    return nextDate.toISOString().split('T')[0];
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await apiPost("/recurring-invoices", {
        clientId: formData.clientId,
        partnerId: formData.partnerId,
        scheme: formData.scheme,
        partnerCommissionRate: formData.scheme === "commission_based" 
          ? parseFloat(formData.partnerCommissionRate) 
          : null,
        amount: parseFloat(formData.amount) || 0,
        defaultExpenses: formData.defaultExpenses ? parseFloat(formData.defaultExpenses) : 0,
        description: formData.description || null,
        frequency: formData.frequency,
        dayOfMonth: parseInt(formData.dayOfMonth),
        startDate: formData.startDate,
        endDate: formData.endDate || null,
        nextInvoiceDate: calculateNextInvoiceDate(),
        notes: formData.notes || null,
        hideFromAssistant: formData.hideFromAssistant,
      });

      toast.success("Расписание создано");
      onSuccess();
      onOpenChange(false);
      setFormData({
        clientId: "",
        partnerId: "",
        scheme: "agency_30",
        partnerCommissionRate: "",
        amount: "",
        defaultExpenses: "",
        description: "",
        frequency: "monthly",
        dayOfMonth: "1",
        startDate: new Date().toISOString().split('T')[0],
        endDate: "",
        notes: "",
        hideFromAssistant: false,
      });
    } catch (error: any) {
      toast.error("Ошибка", { description: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Новое расписание счетов</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Клиент</Label>
            <Select 
              value={formData.clientId} 
              onValueChange={(v) => setFormData({ ...formData, clientId: v })}
            >
              <SelectTrigger data-testid="select-client">
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
            <Select 
              value={formData.partnerId} 
              onValueChange={(v) => setFormData({ ...formData, partnerId: v })}
            >
              <SelectTrigger data-testid="select-partner">
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
            <Label>Сумма счёта</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="50000"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              required
              data-testid="input-amount"
            />
          </div>

          <div>
            <Label>Расходы по умолчанию</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="0"
              value={formData.defaultExpenses}
              onChange={(e) => setFormData({ ...formData, defaultExpenses: e.target.value })}
              data-testid="input-default-expenses"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Расходы автоматически вычитаются из чистой прибыли
            </p>
          </div>

          <div>
            <Label>Описание услуги</Label>
            <Input
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Ежемесячное обслуживание"
              data-testid="input-description"
            />
          </div>

          <div>
            <Label>Схема</Label>
            <Select 
              value={formData.scheme} 
              onValueChange={(v: any) => setFormData({ ...formData, scheme: v })}
            >
              <SelectTrigger data-testid="select-scheme">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="agency_30">Агентская 30%</SelectItem>
                <SelectItem value="partner_10">Партнёрская 10%</SelectItem>
                <SelectItem value="partner_15">Партнёрская 15%</SelectItem>
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
                value={formData.partnerCommissionRate}
                onChange={(e) => setFormData({ ...formData, partnerCommissionRate: e.target.value })}
                required
                data-testid="input-commission-rate"
              />
            </div>
          )}

          <div>
            <Label>Частота</Label>
            <Select 
              value={formData.frequency} 
              onValueChange={(v) => setFormData({ ...formData, frequency: v })}
            >
              <SelectTrigger data-testid="select-frequency">
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
              value={formData.dayOfMonth}
              onChange={(e) => setFormData({ ...formData, dayOfMonth: e.target.value })}
              required
              data-testid="input-day-of-month"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Начало</Label>
              <Input
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                required
                data-testid="input-start-date"
              />
            </div>
            <div>
              <Label>Окончание (опц.)</Label>
              <Input
                type="date"
                value={formData.endDate}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                data-testid="input-end-date"
              />
            </div>
          </div>

          <div>
            <Label>Примечание</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={2}
              data-testid="input-notes"
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="hideFromAssistant"
              checked={formData.hideFromAssistant}
              onCheckedChange={(checked) => 
                setFormData({ ...formData, hideFromAssistant: checked === true })
              }
              data-testid="checkbox-hide-from-assistant"
            />
            <Label htmlFor="hideFromAssistant" className="text-sm text-muted-foreground cursor-pointer">
              Скрыть от ассистента
            </Label>
          </div>

          <div className="flex gap-2 justify-end flex-wrap">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              data-testid="button-cancel"
            >
              Отмена
            </Button>
            <Button 
              type="submit" 
              disabled={loading || !formData.clientId || !formData.partnerId || !formData.amount}
              data-testid="button-create"
            >
              {loading ? "Создание..." : "Создать"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
