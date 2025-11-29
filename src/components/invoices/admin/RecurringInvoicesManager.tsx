import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Calendar, Repeat, Pause, Play, Trash2, FileText, History, RefreshCcw, AlertCircle, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { formatDate, formatCurrency } from "@/lib/invoiceCalculations";
import { CreateRecurringInvoiceDialog } from "./CreateRecurringInvoiceDialog";
import { apiGet, apiPatch, apiDelete, apiPost } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface RecurringInvoice {
  id: string;
  clientId: string;
  partnerId: string;
  scheme: string;
  partnerCommissionRate: string | null;
  amount: string;
  description: string | null;
  frequency: "monthly" | "quarterly" | "yearly";
  dayOfMonth: string;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  nextInvoiceDate: string;
  notes: string | null;
  hideFromAssistant: boolean;
  clients: { name: string };
  partners: { name: string };
}

export function RecurringInvoicesManager() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [backdateDialogOpen, setBackdateDialogOpen] = useState(false);
  const [selectedRecurring, setSelectedRecurring] = useState<RecurringInvoice | null>(null);
  const [backdateFrom, setBackdateFrom] = useState("");
  const queryClient = useQueryClient();

  const { data: recurringInvoices = [], isLoading } = useQuery<RecurringInvoice[]>({
    queryKey: ["/api/recurring-invoices"],
    queryFn: () => apiGet("/recurring-invoices"),
    refetchInterval: 120000,
  });

  const { data: dueInvoices = [] } = useQuery<RecurringInvoice[]>({
    queryKey: ["/api/recurring-invoices/due"],
    queryFn: () => apiGet("/recurring-invoices/due"),
    refetchInterval: 120000,
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

  const createDraftMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiPost(`/recurring-invoices/${id}/create-draft`, {});
    },
    onSuccess: () => {
      toast.success("Черновик счёта создан");
      queryClient.invalidateQueries({ queryKey: ["/api/recurring-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
    },
    onError: (error: Error) => {
      toast.error("Ошибка", { description: error.message });
    },
  });

  const processAllMutation = useMutation({
    mutationFn: async () => {
      return apiPost("/recurring-invoices/process", {});
    },
    onSuccess: (data: { created: number; errors: string[] }) => {
      if (data.created > 0) {
        toast.success(`Создано ${data.created} черновиков`);
      } else {
        toast.info("Нет счетов для создания");
      }
      if (data.errors.length > 0) {
        toast.error(`Ошибки: ${data.errors.length}`);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/recurring-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
    },
    onError: (error: Error) => {
      toast.error("Ошибка", { description: error.message });
    },
  });

  const backdateMutation = useMutation({
    mutationFn: async ({ id, fromDate }: { id: string; fromDate: string }) => {
      return apiPost(`/recurring-invoices/${id}/backdate`, { fromDate });
    },
    onSuccess: (data: { created: number }) => {
      toast.success(`Создано ${data.created} черновиков задним числом`);
      setBackdateDialogOpen(false);
      setSelectedRecurring(null);
      setBackdateFrom("");
      queryClient.invalidateQueries({ queryKey: ["/api/recurring-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
    },
    onError: (error: Error) => {
      toast.error("Ошибка", { description: error.message });
    },
  });

  const getFrequencyLabel = (freq: string) => {
    const labels = { monthly: "Ежемесячно", quarterly: "Ежеквартально", yearly: "Ежегодно" };
    return labels[freq as keyof typeof labels] || freq;
  };

  const getSchemeLabel = (scheme: string) => {
    const labels: Record<string, string> = { 
      agency_30: "Агентская 30%", 
      partner_10: "10%", 
      partner_15: "15%", 
      commission_based: "Комиссия" 
    };
    return labels[scheme] || scheme;
  };

  const handleBackdateClick = (recurring: RecurringInvoice) => {
    setSelectedRecurring(recurring);
    setBackdateFrom(recurring.startDate);
    setBackdateDialogOpen(true);
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
          <div className="space-y-1">
            <CardTitle>Автоматическое выставление счетов</CardTitle>
            {dueInvoices.length > 0 && (
              <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                <AlertCircle className="h-4 w-4" />
                {dueInvoices.length} счёт(а) готовы к созданию
              </div>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            {dueInvoices.length > 0 && (
              <Button 
                variant="default" 
                size="sm" 
                onClick={() => processAllMutation.mutate()}
                disabled={processAllMutation.isPending}
                data-testid="button-process-all"
              >
                <RefreshCcw className="h-4 w-4 mr-2" />
                Создать все ({dueInvoices.length})
              </Button>
            )}
            <Button onClick={() => setDialogOpen(true)} size="sm" data-testid="button-add-recurring">
              <Plus className="h-4 w-4 mr-2" />
              Добавить расписание
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {recurringInvoices.length === 0 ? (
          <p className="text-muted-foreground">Нет активных расписаний. Нажмите "Добавить расписание" для создания автоматического выставления счетов.</p>
        ) : (
          <div className="space-y-4">
            {recurringInvoices.map((recurring) => {
              const isDue = new Date(recurring.nextInvoiceDate) <= new Date();
              
              return (
                <div
                  key={recurring.id}
                  className={`border rounded-lg p-4 space-y-3 ${isDue && recurring.isActive ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/20' : ''}`}
                  data-testid={`recurring-invoice-${recurring.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{recurring.clients?.name || "Клиент"}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="text-muted-foreground">{recurring.partners?.name || "Партнёр"}</span>
                        <Badge variant="outline" className="ml-2">
                          {getSchemeLabel(recurring.scheme)}
                        </Badge>
                        {recurring.hideFromAssistant && (
                          <Badge variant="secondary" className="ml-1">
                            <EyeOff className="h-3 w-3 mr-1" />
                            Скрыто от ассистента
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm flex-wrap">
                        <span className="font-medium text-lg">
                          {formatCurrency(parseFloat(recurring.amount || "0"))}
                        </span>
                        {recurring.description && (
                          <span className="text-muted-foreground">{recurring.description}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Repeat className="h-4 w-4" />
                        {getFrequencyLabel(recurring.frequency)} ({recurring.dayOfMonth}-го числа)
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                        <span>Начало: {formatDate(recurring.startDate)}</span>
                        {recurring.endDate && (
                          <span>Окончание: {formatDate(recurring.endDate)}</span>
                        )}
                      </div>
                      {recurring.notes && (
                        <p className="text-sm text-muted-foreground">{recurring.notes}</p>
                      )}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {recurring.isActive && isDue && (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => createDraftMutation.mutate(recurring.id)}
                          disabled={createDraftMutation.isPending}
                          data-testid={`button-create-draft-${recurring.id}`}
                        >
                          <FileText className="h-4 w-4 mr-2" />
                          Создать счёт
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleBackdateClick(recurring)}
                        data-testid={`button-backdate-${recurring.id}`}
                      >
                        <History className="h-4 w-4 mr-2" />
                        Задним числом
                      </Button>
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
                    <Badge variant={recurring.isActive ? (isDue ? "default" : "secondary") : "outline"}>
                      {recurring.isActive ? (isDue ? "Готов к созданию" : "Активно") : "Приостановлено"}
                    </Badge>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      Следующий: {formatDate(recurring.nextInvoiceDate)}
                    </div>
                  </div>
                </div>
              );
            })}
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

      <AlertDialog open={backdateDialogOpen} onOpenChange={setBackdateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Создать счета задним числом</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Будут созданы черновики счетов от указанной даты до сегодняшнего дня с интервалом {selectedRecurring ? getFrequencyLabel(selectedRecurring.frequency).toLowerCase() : ""}.</p>
              <div className="pt-2">
                <Label>Начиная с даты</Label>
                <Input
                  type="date"
                  value={backdateFrom}
                  onChange={(e) => setBackdateFrom(e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                  data-testid="input-backdate-from"
                />
              </div>
              {selectedRecurring && (
                <p className="text-sm text-muted-foreground pt-2">
                  Клиент: {selectedRecurring.clients?.name}, Сумма: {formatCurrency(parseFloat(selectedRecurring.amount || "0"))}
                </p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-backdate-cancel">Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selectedRecurring && backdateFrom) {
                  backdateMutation.mutate({ id: selectedRecurring.id, fromDate: backdateFrom });
                }
              }}
              disabled={!backdateFrom || backdateMutation.isPending}
              data-testid="button-backdate-confirm"
            >
              {backdateMutation.isPending ? "Создание..." : "Создать счета"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
