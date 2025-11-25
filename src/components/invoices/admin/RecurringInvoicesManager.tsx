import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Calendar, Repeat, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/invoiceCalculations";
import { CreateRecurringInvoiceDialog } from "./CreateRecurringInvoiceDialog";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";

interface RecurringInvoice {
  id: string;
  client_id: string;
  partner_id: string;
  scheme: "agency_30" | "commission_based";
  partner_commission_rate: number | null;
  frequency: "monthly" | "quarterly" | "yearly";
  day_of_month: number;
  is_active: boolean;
  next_invoice_date: string;
  last_generated_at: string | null;
  notes: string | null;
  clients: { name: string };
  partners: { name: string };
}

export function RecurringInvoicesManager() {
  const [recurringInvoices, setRecurringInvoices] = useState<RecurringInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchRecurringInvoices = async () => {
    try {
      const { data, error } = await supabase
        .from("recurring_invoices")
        .select(`
          *,
          clients (name),
          partners (name)
        `)
        .order("next_invoice_date", { ascending: true });

      if (error) throw error;
      setRecurringInvoices((data as any) || []);
    } catch (error: any) {
      toast.error("Ошибка загрузки recurring invoices", {
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecurringInvoices();
  }, []);

  useRealtimeSubscription({
    channelName: "recurring-invoices-channel",
    table: "recurring_invoices",
    onUpdate: fetchRecurringInvoices,
  });

  const toggleActive = async (id: string, currentActive: boolean) => {
    try {
      const { error } = await supabase
        .from("recurring_invoices")
        .update({ is_active: !currentActive })
        .eq("id", id);

      if (error) throw error;
      toast.success(currentActive ? "Автосоздание приостановлено" : "Автосоздание активировано");
    } catch (error: any) {
      toast.error("Ошибка", { description: error.message });
    }
  };

  const getFrequencyLabel = (freq: string) => {
    const labels = { monthly: "Ежемесячно", quarterly: "Ежеквартально", yearly: "Ежегодно" };
    return labels[freq as keyof typeof labels] || freq;
  };

  if (loading) {
    return <div className="text-muted-foreground">Загрузка...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Автоматическое выставление счетов</CardTitle>
          <Button onClick={() => setDialogOpen(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Добавить расписание
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {recurringInvoices.length === 0 ? (
          <p className="text-muted-foreground">Нет активных расписаний</p>
        ) : (
          <div className="space-y-4">
            {recurringInvoices.map((recurring) => (
              <div
                key={recurring.id}
                className="border rounded-lg p-4 space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{recurring.clients.name}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="text-muted-foreground">{recurring.partners.name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Repeat className="h-4 w-4" />
                      {getFrequencyLabel(recurring.frequency)} ({recurring.day_of_month}-го числа)
                    </div>
                    {recurring.notes && (
                      <p className="text-sm text-muted-foreground">{recurring.notes}</p>
                    )}
                  </div>
                  <Button
                    variant={recurring.is_active ? "outline" : "default"}
                    size="sm"
                    onClick={() => toggleActive(recurring.id, recurring.is_active)}
                  >
                    {recurring.is_active ? (
                      <>
                        <Pause className="h-4 w-4 mr-2" />
                        Приостановить
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        Активировать
                      </>
                    )}
                  </Button>
                </div>
                
                <div className="flex items-center gap-4 text-sm">
                  <Badge variant={recurring.is_active ? "default" : "secondary"}>
                    {recurring.is_active ? "Активно" : "Приостановлено"}
                  </Badge>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    Следующий: {formatDate(recurring.next_invoice_date)}
                  </div>
                  {recurring.last_generated_at && (
                    <span className="text-muted-foreground">
                      Последний: {formatDate(recurring.last_generated_at)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <CreateRecurringInvoiceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={fetchRecurringInvoices}
      />
    </Card>
  );
}