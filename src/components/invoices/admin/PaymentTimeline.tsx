import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { querySupabase, ensureSessionContext } from "@/lib/supabaseHelpers";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { Calendar, TrendingDown, TrendingUp, AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

interface TimelineEvent {
  date: Date;
  type: 'income' | 'expense';
  amount: number;
  description: string;
  client_name?: string;
  partner_name?: string;
}

export const PaymentTimeline = () => {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [cashFlowWarning, setCashFlowWarning] = useState(false);
  const [workingCapital, setWorkingCapital] = useState(0);

  const fetchTimelineData = async () => {
    try {
      setLoading(true);
      await ensureSessionContext();

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      const startDate = startOfMonth.toISOString().split('T')[0];
      const endDate = endOfMonth.toISOString().split('T')[0];

      // Получаем working capital
      const wcData = await querySupabase<any>(
        'working_capital_balance',
        '*'
      );
      const currentWC = wcData?.[0]?.amount || 0;
      setWorkingCapital(currentWC);

      // Получаем ожидаемые поступления от клиентов (отправленные счета)
      const sentInvoices = await querySupabase<any>(
        'invoices',
        `*, clients!inner(name), invoice_calculations!inner(client_bill)?status=eq.sent&payment_date=gte.${startDate}&payment_date=lte.${endDate}`
      );

      const incomeEvents: TimelineEvent[] = (sentInvoices || []).map(inv => ({
        date: new Date(inv.payment_date),
        type: 'income' as const,
        amount: inv.invoice_calculations?.[0]?.client_bill || 0,
        description: `Ожидаемая оплата от клиента`,
        client_name: inv.clients?.name,
      }));

      // Получаем предстоящие выплаты партнерам (paid счета с датой оплаты в будущем)
      const partnerInvoices = await querySupabase<any>(
        'invoices',
        `*, partners!inner(name), invoice_calculations!inner(amount_to_admin)?status=eq.paid&payment_date=gte.${startDate}&payment_date=lte.${endDate}`
      );

      const expenseEvents: TimelineEvent[] = (partnerInvoices || []).map(inv => ({
        date: new Date(inv.payment_date),
        type: 'expense' as const,
        amount: inv.invoice_calculations?.[0]?.amount_to_admin || 0,
        description: `Выплата партнеру`,
        partner_name: inv.partners?.name,
      }));

      const allEvents = [...incomeEvents, ...expenseEvents].sort(
        (a, b) => a.date.getTime() - b.date.getTime()
      );

      // Проверяем кассовые разрывы
      let runningBalance = currentWC;
      let hasWarning = false;

      for (const event of allEvents) {
        if (event.type === 'expense') {
          runningBalance -= event.amount;
          if (runningBalance < 0) {
            hasWarning = true;
            break;
          }
        } else {
          runningBalance += event.amount;
        }
      }

      setCashFlowWarning(hasWarning);
      setEvents(allEvents);
    } catch (error) {
      console.error('Error fetching timeline:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTimelineData();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Платежный календарь</CardTitle>
          <CardDescription>Загрузка...</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Платежный календарь
        </CardTitle>
        <CardDescription>
          График предстоящих поступлений и платежей на текущий месяц
        </CardDescription>
      </CardHeader>

      <CardContent>
        {cashFlowWarning && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Кассовый разрыв!</strong> Недостаточно средств для покрытия предстоящих расходов.
            </AlertDescription>
          </Alert>
        )}

        <div className="mb-4 p-3 bg-muted/50 rounded-lg">
          <div className="text-sm text-muted-foreground">Текущий баланс</div>
          <div className="text-2xl font-bold">{formatCurrency(workingCapital)}</div>
        </div>

        <div className="space-y-3">
          {events.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              Нет запланированных платежей на этот месяц
            </div>
          ) : (
            events.map((event, index) => (
              <div
                key={index}
                className={`flex items-center gap-4 p-3 rounded-lg border ${
                  event.type === 'income'
                    ? 'bg-green-50 border-green-200'
                    : 'bg-red-50 border-red-200'
                }`}
              >
                <div className={`p-2 rounded-full ${
                  event.type === 'income' ? 'bg-green-500' : 'bg-red-500'
                }`}>
                  {event.type === 'income' ? (
                    <TrendingUp className="h-4 w-4 text-white" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-white" />
                  )}
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {event.date.toLocaleDateString('ru-RU', { 
                        day: 'numeric', 
                        month: 'short' 
                      })}
                    </span>
                    <Badge variant={event.type === 'income' ? 'default' : 'destructive'}>
                      {event.type === 'income' ? 'Приход' : 'Расход'}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {event.description}
                    {event.client_name && ` • ${event.client_name}`}
                    {event.partner_name && ` • ${event.partner_name}`}
                  </div>
                </div>

                <div className={`text-lg font-bold ${
                  event.type === 'income' ? 'text-green-600' : 'text-red-600'
                }`}>
                  {event.type === 'income' ? '+' : '-'}
                  {formatCurrency(event.amount)}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};
