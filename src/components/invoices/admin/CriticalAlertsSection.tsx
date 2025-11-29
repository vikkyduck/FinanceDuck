import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, ChevronDown, ChevronUp, Clock, FileText } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, apiPost } from "@/lib/api";
import { useVisibilityAwareInterval } from "@/hooks/useVisibilityAwareInterval";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LucideIcon } from "lucide-react";

interface CriticalAlertData {
  id: string;
  type: "overdue" | "draft" | "long_sent";
  severity: "critical" | "high" | "medium";
  title: string;
  description: string;
  amount?: number;
  daysCount?: number;
  invoiceNumber: string;
  clientName: string;
}

interface CriticalAlert extends CriticalAlertData {
  icon: LucideIcon;
  action: () => void;
  actionLabel: string;
}

export const CriticalAlertsSection = () => {
  const [expanded, setExpanded] = useState(true);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const refetchInterval = useVisibilityAwareInterval();

  const { data: alertsData = [], isLoading, isError } = useQuery<CriticalAlertData[]>({
    queryKey: ["/api/admin/critical-alerts"],
    queryFn: () => apiGet<CriticalAlertData[]>("/admin/critical-alerts"),
    refetchInterval,
    staleTime: 30000,
    retry: 2,
  });
  
  // Handle error gracefully - don't crash the dashboard
  if (isError) return null;

  const handleMarkAsPaid = useCallback(async (invoiceId: string) => {
    try {
      await apiPost(`/invoices/${invoiceId}/mark-paid`, {});
      toast.success("Счет отмечен как оплаченный");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/critical-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
    } catch (error) {
      toast.error("Ошибка при обновлении счета");
    }
  }, [queryClient]);

  const alerts: CriticalAlert[] = alertsData.map(alert => {
    let icon: LucideIcon;
    let action: () => void;
    let actionLabel: string;

    switch (alert.type) {
      case "overdue":
        icon = AlertCircle;
        action = () => handleMarkAsPaid(alert.id);
        actionLabel = "Отметить оплату";
        break;
      case "draft":
        icon = FileText;
        action = () => navigate(`/?open=${alert.id}`);
        actionLabel = "Заполнить";
        break;
      case "long_sent":
        icon = Clock;
        action = () => toast.success(`Напоминание отправлено для ${alert.invoiceNumber}`);
        actionLabel = "Напомнить";
        break;
      default:
        icon = AlertCircle;
        action = () => {};
        actionLabel = "";
    }

    return {
      ...alert,
      icon,
      action,
      actionLabel,
    };
  });

  if (isLoading) {
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
              data-testid="button-toggle-alerts"
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
                    data-testid={`alert-${alert.type}-${alert.id}`}
                  >
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className={`p-2 rounded-full ${
                        alert.severity === "critical" ? "bg-destructive/20" :
                        alert.severity === "high" ? "bg-orange-500/20" :
                        "bg-yellow-500/20"
                      }`}>
                        <Icon className={`w-4 h-4 ${
                          alert.severity === "critical" ? "text-destructive" :
                          alert.severity === "high" ? "text-orange-500" :
                          "text-yellow-600"
                        }`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{alert.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{alert.description}</p>
                        {alert.amount && alert.amount > 0 && (
                          <p className="text-xs font-medium mt-0.5">{formatCurrency(alert.amount)}</p>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={alert.action}
                      className="shrink-0 ml-2"
                      data-testid={`button-action-${alert.id}`}
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
