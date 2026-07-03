import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle, Bell } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/invoiceCalculations";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, apiGet } from "@/lib/api";

interface OverdueInvoice {
  id: string;
  invoiceNumber: string;
  paymentDate: string;
  clientName: string;
  partnerName: string;
  amount: number;
  daysOverdue: number;
}

export const OverduePaymentsAlert = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: overdueInvoices, isLoading } = useQuery<OverdueInvoice[]>({
    queryKey: ['invoices-overdue'],
    queryFn: () => apiGet<OverdueInvoice[]>('/invoices/overdue'),
  });

  const markAsPaidMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      return apiRequest(`/api/invoices/${invoiceId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'paid', paidDate: new Date().toISOString().split('T')[0] }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices-overdue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
      toast({
        title: "Успешно",
        description: "Счет отмечен как оплаченный",
      });
    },
    onError: () => {
      toast({
        title: "Ошибка",
        description: "Не удалось обновить счет",
        variant: "destructive",
      });
    },
  });

  const handleRemind = (invoiceNumber: string) => {
    toast({
      title: "Напоминание отправлено",
      description: `Уведомление по счету ${invoiceNumber} отправлено`,
    });
  };

  if (isLoading) {
    return (
      <Card className="border-destructive/50 shadow-lg">
        <CardHeader className="bg-destructive/5">
          <CardTitle className="flex items-center gap-2">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
          </CardTitle>
          <div className="flex flex-wrap gap-4 mt-4">
            <Skeleton className="h-16 w-24 rounded-lg" />
            <Skeleton className="h-16 w-32 rounded-lg" />
            <Skeleton className="h-16 w-28 rounded-lg" />
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-4 rounded-lg border bg-muted/50">
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <Skeleton className="h-6 w-32" />
                    <Skeleton className="h-8 w-24" />
                  </div>
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <div className="flex gap-2 pt-2">
                    <Skeleton className="h-9 flex-1" />
                    <Skeleton className="h-9 flex-1" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!overdueInvoices || overdueInvoices.length === 0) {
    return (
      <Alert className="border-green-200 bg-green-50/50 dark:bg-green-950/20 animate-fade-in">
        <CheckCircle className="h-4 w-4 text-green-600" />
        <AlertTitle className="text-green-900 dark:text-green-100">Просроченных платежей нет</AlertTitle>
        <AlertDescription className="text-green-700 dark:text-green-300">
          Все счета с запланированной датой оплаты либо оплачены, либо еще не просрочены.
        </AlertDescription>
      </Alert>
    );
  }

  const totalOverdue = overdueInvoices.reduce((sum, inv) => sum + inv.amount, 0);
  const criticalCount = overdueInvoices.filter(inv => inv.daysOverdue > 7).length;

  return (
    <Card className="border-destructive/50 shadow-lg animate-fade-in">
      <CardHeader className="bg-destructive/5">
        <CardTitle className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-destructive/10">
            <AlertCircle className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <div className="text-lg font-bold">Требуют внимания</div>
            <p className="text-sm font-normal text-muted-foreground mt-1">
              Счета с просроченной датой оплаты
            </p>
          </div>
        </CardTitle>
        <div className="flex flex-wrap gap-4 mt-4">
          <div className="px-4 py-2 rounded-lg bg-background">
            <span className="text-xs text-muted-foreground block">Счетов</span>
            <span className="text-2xl font-bold">{overdueInvoices.length}</span>
          </div>
          <div className="px-4 py-2 rounded-lg bg-background">
            <span className="text-xs text-muted-foreground block">На сумму</span>
            <span className="text-2xl font-bold text-destructive">{formatCurrency(totalOverdue)}</span>
          </div>
          {criticalCount > 0 && (
            <div className="px-4 py-2 rounded-lg bg-destructive/10">
              <span className="text-xs text-destructive block">Критичных</span>
              <span className="text-2xl font-bold text-destructive">{criticalCount}</span>
              <span className="text-xs text-muted-foreground ml-1">({'>'}7 дней)</span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="space-y-3">
          {overdueInvoices.map((invoice, index) => {
            const isCritical = invoice.daysOverdue > 7;
            const isWarning = invoice.daysOverdue > 3 && invoice.daysOverdue <= 7;
            
            return (
              <div
                key={invoice.id}
                className={`p-4 rounded-lg border transition-all hover:shadow-md animate-fade-in ${
                  isCritical
                    ? 'bg-destructive/10 border-destructive/50'
                    : isWarning
                    ? 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800'
                    : 'bg-muted/50 border-border'
                }`}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-lg">{invoice.invoiceNumber}</span>
                      <Badge 
                        variant={isCritical ? 'destructive' : isWarning ? 'default' : 'secondary'}
                        className={isWarning ? 'bg-yellow-500 hover:bg-yellow-600' : ''}
                      >
                        {invoice.daysOverdue} {invoice.daysOverdue === 1 ? 'день' : 'дней'}
                      </Badge>
                    </div>
                    <div className="text-sm space-y-1">
                      <div className="text-muted-foreground">
                        <span className="font-medium text-foreground">{invoice.clientName}</span>
                        {' / '}
                        <span className="text-foreground">{invoice.partnerName}</span>
                      </div>
                      <div className="text-muted-foreground">
                        Планировалось: {formatDate(new Date(invoice.paymentDate))}
                      </div>
                    </div>
                  </div>
                  <div className="text-right space-y-2">
                    <div className="font-bold text-2xl">
                      {formatCurrency(invoice.amount)}
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-2 pt-3 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRemind(invoice.invoiceNumber)}
                    className="flex-1"
                  >
                    <Bell className="h-4 w-4 mr-2" />
                    Напомнить
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => markAsPaidMutation.mutate(invoice.id)}
                    disabled={markAsPaidMutation.isPending}
                    className="flex-1"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Отметить оплату
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
