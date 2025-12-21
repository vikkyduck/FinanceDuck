import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, FileText, Send, Clock, TrendingDown } from "lucide-react";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch } from "@/lib/api";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "wouter";

interface PriorityAction {
  id: string;
  type: string;
  priority: number;
  title: string;
  description: string;
  amount: number | null;
  actionType: string;
}

const iconMap: Record<string, any> = {
  overdue: AlertCircle,
  draft: FileText,
  long_sent: Clock,
  inactive_partner: TrendingDown,
};

export const PriorityActionsCard = () => {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const { data: actions = [], isLoading } = useQuery<PriorityAction[]>({
    queryKey: ["/api/priority-actions"],
    queryFn: () => apiGet<PriorityAction[]>("/priority-actions"),
  });

  const markPaidMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      return apiPatch(`/invoices/${invoiceId}`, {
        status: "paid",
        actualPaymentDate: new Date().toISOString().split('T')[0],
      });
    },
    onSuccess: () => {
      toast.success("Счет отмечен как оплаченный");
      queryClient.invalidateQueries({ queryKey: ["/api/priority-actions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
    },
    onError: () => {
      toast.error("Ошибка при обновлении счета");
    },
  });

  const handleAction = (action: PriorityAction) => {
    switch (action.actionType) {
      case "mark_paid":
        markPaidMutation.mutate(action.id);
        break;
      case "edit":
        navigate(`/invoices?open=${action.id}`);
        break;
      case "remind":
        toast.success(`Напоминание отправлено`);
        break;
    }
  };

  const getActionLabel = (actionType: string) => {
    switch (actionType) {
      case "mark_paid":
        return "Отметить оплату";
      case "edit":
        return "Заполнить";
      case "remind":
        return "Напомнить";
      default:
        return "Действие";
    }
  };

  if (isLoading) {
    return (
      <Card>
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
      <Card className="border-destructive/50">
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
              const Icon = iconMap[action.type] || AlertCircle;
              return (
                <motion.div
                  key={action.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                  data-testid={`priority-action-${action.id}`}
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="p-2 rounded-full bg-destructive/10 shrink-0">
                      <Icon className="w-4 h-4 text-destructive" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{action.title}</p>
                      <p className="text-xs text-muted-foreground break-words">
                        {action.description}
                      </p>
                      {action.amount && action.amount > 0 && (
                        <p className="text-sm font-semibold mt-1">
                          {action.amount.toLocaleString("ru-RU")} rub
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAction(action)}
                    className="shrink-0 self-end sm:self-auto"
                    disabled={markPaidMutation.isPending}
                    data-testid={`btn-action-${action.id}`}
                  >
                    {getActionLabel(action.actionType)}
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
