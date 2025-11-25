import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, FileText, Send, Clock, TrendingDown } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { format, differenceInDays } from "date-fns";
import { ru } from "date-fns/locale";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";

interface PriorityAction {
  id: string;
  type: "overdue" | "draft" | "long_sent" | "inactive_partner";
  priority: number;
  title: string;
  description: string;
  amount?: number;
  icon: any;
  action: () => void;
  actionLabel: string;
}

export const PriorityActionsCard = () => {
  const [actions, setActions] = useState<PriorityAction[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchPriorityActions();
  }, []);

  const fetchPriorityActions = async () => {
    try {
      const today = new Date().toISOString().split("T")[0];
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];
      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];

      const priorityActions: PriorityAction[] = [];

      // Просроченные платежи
      const { data: overdueInvoices } = await supabase
        .from("invoices")
        .select(
          `
          id,
          invoice_number,
          payment_date,
          clients(name),
          invoice_calculations(client_bill)
        `
        )
        .eq("status", "sent")
        .is("actual_payment_date", null)
        .lt("payment_date", today);

      overdueInvoices?.forEach((invoice: any) => {
        const daysOverdue = differenceInDays(
          new Date(),
          new Date(invoice.payment_date)
        );
        priorityActions.push({
          id: invoice.id,
          type: "overdue",
          priority: daysOverdue * (invoice.invoice_calculations?.[0]?.client_bill || 0),
          title: `Просрочен на ${daysOverdue} дн.`,
          description: `Счет ${invoice.invoice_number} • ${invoice.clients?.name}`,
          amount: invoice.invoice_calculations?.[0]?.client_bill,
          icon: AlertCircle,
          action: () => handleMarkAsPaid(invoice.id),
          actionLabel: "Отметить оплату",
        });
      });

      // Черновики без даты
      const { data: draftInvoices } = await supabase
        .from("invoices")
        .select(
          `
          id,
          invoice_number,
          clients(name),
          invoice_calculations(client_bill)
        `
        )
        .eq("status", "draft")
        .is("payment_date", null);

      draftInvoices?.forEach((invoice: any) => {
        priorityActions.push({
          id: invoice.id,
          type: "draft",
          priority: 50,
          title: "Заполните дату оплаты",
          description: `Счет ${invoice.invoice_number} • ${invoice.clients?.name}`,
          amount: invoice.invoice_calculations?.[0]?.client_bill,
          icon: FileText,
          action: () => navigate(`/invoices?open=${invoice.id}`),
          actionLabel: "Заполнить",
        });
      });

      // Долго отправленные
      const { data: longSentInvoices } = await supabase
        .from("invoices")
        .select(
          `
          id,
          invoice_number,
          created_at,
          clients(name),
          invoice_calculations(client_bill)
        `
        )
        .eq("status", "sent")
        .is("actual_payment_date", null)
        .lt("created_at", thirtyDaysAgo);

      longSentInvoices?.forEach((invoice: any) => {
        const daysWaiting = differenceInDays(
          new Date(),
          new Date(invoice.created_at)
        );
        priorityActions.push({
          id: invoice.id,
          type: "long_sent",
          priority: daysWaiting,
          title: `Ожидает ${daysWaiting} дней`,
          description: `Счет ${invoice.invoice_number} • ${invoice.clients?.name}`,
          amount: invoice.invoice_calculations?.[0]?.client_bill,
          icon: Clock,
          action: () =>
            toast.success(`Напоминание отправлено для счета ${invoice.invoice_number}`),
          actionLabel: "Напомнить",
        });
      });

      // Сортировка по приоритету
      priorityActions.sort((a, b) => b.priority - a.priority);
      setActions(priorityActions.slice(0, 5)); // Топ-5
    } catch (error) {
      console.error("Error fetching priority actions:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsPaid = async (invoiceId: string) => {
    try {
      const { error } = await supabase
        .from("invoices")
        .update({ actual_payment_date: new Date().toISOString(), status: "paid" })
        .eq("id", invoiceId);

      if (error) throw error;
      toast.success("Счет отмечен как оплаченный");
      fetchPriorityActions();
    } catch (error) {
      toast.error("Ошибка при обновлении счета");
    }
  };

  if (loading) {
    return (
      <Card className="hover-scale">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (actions.length === 0) {
    return (
      <Card className="border-success/50 bg-success/5">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 text-success">
            <div className="p-2 rounded-full bg-success/10">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold">Все отлично!</p>
              <p className="text-sm text-muted-foreground">
                Нет задач, требующих внимания
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="border-destructive/50 hover-scale">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <div className="relative p-1.5 rounded-full bg-destructive/10">
              <AlertCircle className="w-5 h-5" />
              <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 bg-destructive rounded-full pulse-dot" />
            </div>
            Требует внимания ({actions.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {actions.map((action, index) => {
              const Icon = action.icon;
              return (
                <motion.div
                  key={action.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start gap-3 flex-1">
                    <div className="p-2 rounded-full bg-destructive/10">
                      <Icon className="w-4 h-4 text-destructive" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{action.title}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {action.description}
                      </p>
                      {action.amount && (
                        <p className="text-sm font-semibold mt-1">
                          {action.amount.toLocaleString("ru-RU")} ₽
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={action.action}
                    className="ml-2"
                  >
                    {action.actionLabel}
                  </Button>
                </motion.div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};
