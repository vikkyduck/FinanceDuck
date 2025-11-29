import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Calendar, Repeat, Pause, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/invoiceCalculations";
import { CreateRecurringInvoiceDialog } from "./CreateRecurringInvoiceDialog";
import { apiGet, apiPatch, apiDelete } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";

interface RecurringInvoice {
  id: string;
  clientId: string;
  partnerId: string;
  scheme: string;
  partnerCommissionRate: string | null;
  frequency: "monthly" | "quarterly" | "yearly";
  dayOfMonth: string;
  isActive: boolean;
  nextInvoiceDate: string;
  notes: string | null;
  clients: { name: string };
  partners: { name: string };
}

export function RecurringInvoicesManager() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: recurringInvoices = [], isLoading } = useQuery<RecurringInvoice[]>({
    queryKey: ["/api/recurring-invoices"],
    queryFn: () => apiGet("/recurring-invoices"),
    refetchInterval: 30000,
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return apiPatch(`/recurring-invoices/${id}`, { isActive: !isActive });
    },
    onSuccess: (_, { isActive }) => {
      toast.success(isActive ? "Автосоздание приостановлено" : "Автосоздание активировано");
      queryClient.invalidateQueries({ queryKey: ["/api/recurring-invoices"] });
    },
    onError: (error: Error) => {
      toast.error("Ошибка", { description: error.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiDelete(`/recurring-invoices/${id}`);
    },
    onSuccess: () => {
      toast.success("Расписание удалено");
      queryClient.invalidateQueries({ queryKey: ["/api/recurring-invoices"] });
    },
    onError: (error: Error) => {
      toast.error("Ошибка", { description: error.message });
    },
  });

  const getFrequencyLabel = (freq: string) => {
    const labels = { monthly: "Ежемесячно", quarterly: "Ежеквартально", yearly: "Ежегодно" };
    return labels[freq as keyof typeof labels] || freq;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Автоматическое выставление счетов</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle>Автоматическое выставление счетов</CardTitle>
          <Button onClick={() => setDialogOpen(true)} size="sm" data-testid="button-add-recurring">
            <Plus className="h-4 w-4 mr-2" />
            Добавить расписание
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {recurringInvoices.length === 0 ? (
          <p className="text-muted-foreground">Нет активных расписаний. Нажмите "Добавить расписание" для создания автоматического выставления счетов.</p>
        ) : (
          <div className="space-y-4">
            {recurringInvoices.map((recurring) => (
              <div
                key={recurring.id}
                className="border rounded-lg p-4 space-y-3"
                data-testid={`recurring-invoice-${recurring.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{recurring.clients?.name || "Клиент"}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="text-muted-foreground">{recurring.partners?.name || "Партнёр"}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Repeat className="h-4 w-4" />
                      {getFrequencyLabel(recurring.frequency)} ({recurring.dayOfMonth}-го числа)
                    </div>
                    {recurring.notes && (
                      <p className="text-sm text-muted-foreground">{recurring.notes}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant={recurring.isActive ? "outline" : "default"}
                      size="sm"
                      onClick={() => toggleMutation.mutate({ id: recurring.id, isActive: recurring.isActive })}
                      disabled={toggleMutation.isPending}
                      data-testid={`button-toggle-${recurring.id}`}
                    >
                      {recurring.isActive ? (
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
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteMutation.mutate(recurring.id)}
                      disabled={deleteMutation.isPending}
                      data-testid={`button-delete-${recurring.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                
                <div className="flex items-center gap-4 text-sm flex-wrap">
                  <Badge variant={recurring.isActive ? "default" : "secondary"}>
                    {recurring.isActive ? "Активно" : "Приостановлено"}
                  </Badge>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    Следующий: {formatDate(recurring.nextInvoiceDate)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <CreateRecurringInvoiceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/recurring-invoices"] });
        }}
      />
    </Card>
  );
}
