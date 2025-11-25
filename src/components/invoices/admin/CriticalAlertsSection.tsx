import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, ChevronDown, ChevronUp, Clock, FileText } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { differenceInDays } from "date-fns";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { formatCurrency, formatDate } from "@/lib/invoiceCalculations";
import { Skeleton } from "@/components/ui/skeleton";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";

interface CriticalAlert {
  id: string;
  type: "overdue" | "draft" | "long_sent";
  severity: "critical" | "high" | "medium";
  title: string;
  description: string;
  amount?: number;
  daysCount?: number;
  icon: any;
  action: () => void;
  actionLabel: string;
}

export const CriticalAlertsSection = () => {
  const [alerts, setAlerts] = useState<CriticalAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const navigate = useNavigate();

  const fetchAlerts = async () => {
    try {
      const today = new Date().toISOString().split("T")[0];
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];

      const criticalAlerts: CriticalAlert[] = [];

      // Просроченные платежи
      const { data: overdueInvoices } = await supabase
        .from("invoices")
        .select(`
          id,
          invoice_number,
          payment_date,
          clients(name),
          partners(name),
          invoice_calculations(client_bill)
        `)
        .eq("status", "sent")
        .is("actual_payment_date", null)
        .lt("payment_date", today);

      overdueInvoices?.forEach((invoice: any) => {
        const daysOverdue = differenceInDays(new Date(), new Date(invoice.payment_date));
        const severity = daysOverdue > 30 ? "critical" : daysOverdue > 14 ? "high" : "medium";
        
        criticalAlerts.push({
          id: invoice.id,
          type: "overdue",
          severity,
          title: `Просрочка ${daysOverdue} ${daysOverdue === 1 ? "день" : "дней"}`,
          description: `${invoice.invoice_number} • ${invoice.clients?.name} → ${invoice.partners?.name}`,
          amount: invoice.invoice_calculations?.[0]?.client_bill,
          daysCount: daysOverdue,
          icon: AlertCircle,
          action: () => handleMarkAsPaid(invoice.id),
          actionLabel: "Отметить оплату",
        });
      });

      // Черновики без даты
      const { data: draftInvoices } = await supabase
        .from("invoices")
        .select(`
          id,
          invoice_number,
          clients(name),
          invoice_calculations(client_bill)
        `)
        .eq("status", "draft")
        .is("payment_date", null);

      draftInvoices?.forEach((invoice: any) => {
        criticalAlerts.push({
          id: invoice.id,
          type: "draft",
          severity: "medium",
          title: "Нет даты оплаты",
          description: `${invoice.invoice_number} • ${invoice.clients?.name}`,
          amount: invoice.invoice_calculations?.[0]?.client_bill,
          icon: FileText,
          action: () => navigate(`/?open=${invoice.id}`),
          actionLabel: "Заполнить",
        });
      });

      // Долго отправленные (>30 дней)
      const { data: longSentInvoices } = await supabase
        .from("invoices")
        .select(`
          id,
          invoice_number,
          created_at,
          clients(name),
          invoice_calculations(client_bill)
        `)
        .eq("status", "sent")
        .is("actual_payment_date", null)
        .lt("created_at", thirtyDaysAgo);

      longSentInvoices?.forEach((invoice: any) => {
        const daysWaiting = differenceInDays(new Date(), new Date(invoice.created_at));
        criticalAlerts.push({
          id: invoice.id,
          type: "long_sent",
          severity: "medium",
          title: `В ожидании ${daysWaiting} дней`,
          description: `${invoice.invoice_number} • ${invoice.clients?.name}`,
          amount: invoice.invoice_calculations?.[0]?.client_bill,
          daysCount: daysWaiting,
          icon: Clock,
          action: () => toast.success(`Напоминание отправлено для ${invoice.invoice_number}`),
          actionLabel: "Напомнить",
        });
      });

      // Сортировка: critical -> high -> medium, внутри по дням
      criticalAlerts.sort((a, b) => {
        const severityOrder = { critical: 0, high: 1, medium: 2 };
        if (severityOrder[a.severity] !== severityOrder[b.severity]) {
          return severityOrder[a.severity] - severityOrder[b.severity];
        }
        return (b.daysCount || 0) - (a.daysCount || 0);
      });

      setAlerts(criticalAlerts);
    } catch (error) {
      console.error("Error fetching alerts:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, []);

  useRealtimeSubscription({
    channelName: "critical-alerts-channel",
    table: "invoices",
    onUpdate: fetchAlerts,
  });

  const handleMarkAsPaid = async (invoiceId: string) => {
    try {
      const { error } = await supabase
        .from("invoices")
        .update({ actual_payment_date: new Date().toISOString(), status: "paid" })
        .eq("id", invoiceId);

      if (error) throw error;
      toast.success("Счет отмечен как оплаченный");
      fetchAlerts();
    } catch (error) {
      toast.error("Ошибка при обновлении счета");
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const criticalCount = alerts.filter((a) => a.severity === "critical").length;
  const highCount = alerts.filter((a) => a.severity === "high").length;

  if (alerts.length === 0) {
    return (
      <Card className="border-success/50 bg-success/5">
        <CardContent className="pt-6 pb-6">
          <div className="flex items-center gap-3 text-success">
            <div className="p-2 rounded-full bg-success/10">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold">Все под контролем</p>
              <p className="text-sm text-muted-foreground">Нет критичных задач</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-destructive/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-destructive">
            <div className="relative p-1.5 rounded-full bg-destructive/10">
              <AlertCircle className="w-5 h-5" />
              {criticalCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 bg-destructive rounded-full animate-pulse" />
              )}
            </div>
            Требует внимания
          </CardTitle>
          <div className="flex items-center gap-2">
            {criticalCount > 0 && (
              <Badge variant="destructive" className="font-semibold">
                Критичных: {criticalCount}
              </Badge>
            )}
            {highCount > 0 && (
              <Badge variant="secondary">Важных: {highCount}</Badge>
            )}
            <Badge variant="outline">{alerts.length}</Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="h-8 w-8 p-0"
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <CardContent className="space-y-2 pt-0">
              {alerts.map((alert, index) => {
                const Icon = alert.icon;
                const severityColors = {
                  critical: "border-destructive bg-destructive/5",
                  high: "border-orange-500/50 bg-orange-500/5",
                  medium: "border-yellow-500/50 bg-yellow-500/5",
                };

                return (
                  <motion.div
                    key={alert.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={`flex items-center justify-between p-3 rounded-lg border ${severityColors[alert.severity]} hover:shadow-sm transition-all`}
                  >
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className={`p-2 rounded-full ${
                        alert.severity === "critical" ? "bg-destructive/20" :
                        alert.severity === "high" ? "bg-orange-500/20" :
                        "bg-yellow-500/20"
                      }`}>
                        <Icon className={`w-4 h-4 ${
                          alert.severity === "critical" ? "text-destructive" :
                          alert.severity === "high" ? "text-orange-600" :
                          "text-yellow-600"
                        }`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{alert.title}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {alert.description}
                        </p>
                        {alert.amount && (
                          <p className="text-sm font-semibold mt-1">
                            {formatCurrency(alert.amount)}
                          </p>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={alert.severity === "critical" ? "destructive" : "outline"}
                      onClick={alert.action}
                      className="ml-2 shrink-0"
                    >
                      {alert.actionLabel}
                    </Button>
                  </motion.div>
                );
              })}
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
};
