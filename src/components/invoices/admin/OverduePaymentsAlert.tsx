import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, Clock, CheckCircle, Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDate } from "@/lib/invoiceCalculations";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { ensureSessionContext } from "@/lib/supabaseHelpers";

interface OverdueInvoice {
  id: string;
  invoice_number: string;
  payment_date: string;
  client_name: string;
  partner_name: string;
  amount: number;
  days_overdue: number;
}

export const OverduePaymentsAlert = () => {
  const [overdueInvoices, setOverdueInvoices] = useState<OverdueInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchOverdueInvoices();
  }, []);

  const fetchOverdueInvoices = async () => {
    setLoading(true);
    try {
      await ensureSessionContext();
      const today = new Date().toISOString().split('T')[0];

      const { data: invoices, error } = await supabase
        .from("invoices")
        .select(`
          id,
          invoice_number,
          payment_date,
          actual_payment_date,
          status,
          clients:client_id (name),
          partners:partner_id (name),
          invoice_calculations (
            client_bill
          )
        `)
        .eq('status', 'sent')
        .is('actual_payment_date', null)
        .lt('payment_date', today)
        .not('payment_date', 'is', null)
        .order('payment_date', { ascending: true });

      if (error) throw error;

      const formatted = invoices?.map((invoice: any) => {
        const paymentDate = new Date(invoice.payment_date);
        const now = new Date();
        const daysOverdue = Math.floor((now.getTime() - paymentDate.getTime()) / (1000 * 60 * 60 * 24));

        return {
          id: invoice.id,
          invoice_number: invoice.invoice_number,
          payment_date: invoice.payment_date,
          client_name: invoice.clients?.name || 'Неизвестно',
          partner_name: invoice.partners?.name || 'Неизвестно',
          amount: Number(invoice.invoice_calculations?.[0]?.client_bill || 0),
          days_overdue: daysOverdue,
        };
      }) || [];

      setOverdueInvoices(formatted);
    } catch (error) {
      console.error("Error fetching overdue invoices:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
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

  const handleMarkAsPaid = async (invoiceId: string) => {
    try {
      await ensureSessionContext();
      const { error } = await supabase
        .from("invoices")
        .update({ actual_payment_date: new Date().toISOString().split('T')[0] })
        .eq('id', invoiceId);

      if (error) throw error;

      toast({
        title: "Успешно",
        description: "Счет отмечен как оплаченный",
      });
      
      fetchOverdueInvoices();
    } catch (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось обновить счет",
        variant: "destructive",
      });
    }
  };

  const handleRemind = (invoiceNumber: string) => {
    toast({
      title: "Напоминание отправлено",
      description: `Уведомление по счету ${invoiceNumber} отправлено`,
    });
  };

  if (overdueInvoices.length === 0) {
    return (
      <Alert className="border-green-200 bg-green-50/50 animate-fade-in">
        <CheckCircle className="h-4 w-4 text-green-600" />
        <AlertTitle className="text-green-900">Просроченных платежей нет</AlertTitle>
        <AlertDescription className="text-green-700">
          Все счета с запланированной датой оплаты либо оплачены, либо еще не просрочены.
        </AlertDescription>
      </Alert>
    );
  }

  const totalOverdue = overdueInvoices.reduce((sum, inv) => sum + inv.amount, 0);
  const criticalCount = overdueInvoices.filter(inv => inv.days_overdue > 7).length;

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
            const isCritical = invoice.days_overdue > 7;
            const isWarning = invoice.days_overdue > 3 && invoice.days_overdue <= 7;
            
            return (
              <div
                key={invoice.id}
                className={`p-4 rounded-lg border transition-all hover:shadow-md animate-fade-in ${
                  isCritical
                    ? 'bg-destructive/10 border-destructive/50'
                    : isWarning
                    ? 'bg-yellow-50 border-yellow-200'
                    : 'bg-muted/50 border-border'
                }`}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-lg">{invoice.invoice_number}</span>
                      <Badge 
                        variant={isCritical ? 'destructive' : isWarning ? 'default' : 'secondary'}
                        className={isWarning ? 'bg-yellow-500 hover:bg-yellow-600' : ''}
                      >
                        {invoice.days_overdue} {invoice.days_overdue === 1 ? 'день' : 'дней'}
                      </Badge>
                    </div>
                    <div className="text-sm space-y-1">
                      <div className="text-muted-foreground">
                        <span className="font-medium text-foreground">{invoice.client_name}</span>
                        {' • '}
                        <span className="text-foreground">{invoice.partner_name}</span>
                      </div>
                      <div className="text-muted-foreground">
                        Планировалось: {formatDate(new Date(invoice.payment_date))}
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
                    onClick={() => handleRemind(invoice.invoice_number)}
                    className="flex-1"
                  >
                    <Bell className="h-4 w-4 mr-2" />
                    Напомнить
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => handleMarkAsPaid(invoice.id)}
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
