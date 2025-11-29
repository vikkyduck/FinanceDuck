import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowDownRight, ArrowUpRight, Calendar, FileText, TrendingDown, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency, formatDate } from "@/lib/invoiceCalculations";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { startOfMonth, endOfMonth, subMonths, format } from "date-fns";
import { ru } from "date-fns/locale";

interface StatementEntry {
  id: string;
  date: string;
  type: "invoice" | "payment";
  description: string;
  amount: number;
  balance: number;
  invoiceId?: string;
  status?: string;
}

export function PartnerVirtualStatement() {
  const { partnerId } = useAuth();
  const [period, setPeriod] = useState<string>("current");

  const getPeriodDates = (periodKey: string) => {
    const now = new Date();
    switch (periodKey) {
      case "current":
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case "last":
        const lastMonth = subMonths(now, 1);
        return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
      case "3months":
        return { start: startOfMonth(subMonths(now, 2)), end: endOfMonth(now) };
      case "all":
      default:
        return { start: null, end: null };
    }
  };

  const { data: invoices, isLoading: invoicesLoading } = useQuery({
    queryKey: ["partner-statement-invoices", partnerId, period],
    queryFn: async () => {
      if (!partnerId) return [];
      
      const dates = getPeriodDates(period);
      let query = supabase
        .from("invoices")
        .select(`
          id, 
          invoice_number, 
          status, 
          created_at, 
          scheme,
          clients(name),
          invoice_calculations(
            client_bill,
            commission_amount,
            partner_share_from_margin,
            executor_expenses_total,
            partner_transfer_due
          )
        `)
        .eq("partner_id", partnerId)
        .order("created_at", { ascending: true });

      if (dates.start) {
        query = query.gte("created_at", dates.start.toISOString());
      }
      if (dates.end) {
        query = query.lte("created_at", dates.end.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!partnerId,
  });

  const { data: payments, isLoading: paymentsLoading } = useQuery({
    queryKey: ["partner-statement-payments", partnerId, period],
    queryFn: async () => {
      if (!partnerId) return [];
      
      const dates = getPeriodDates(period);
      let query = supabase
        .from("partner_payments")
        .select("id, amount, payment_date, notes, invoice_id")
        .eq("partner_id", partnerId)
        .order("payment_date", { ascending: true });

      if (dates.start) {
        query = query.gte("payment_date", dates.start.toISOString());
      }
      if (dates.end) {
        query = query.lte("payment_date", dates.end.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!partnerId,
  });

  const statement = useMemo(() => {
    if (!invoices || !payments) return [];

    const entries: StatementEntry[] = [];
    let runningBalance = 0;

    invoices.forEach((inv: any) => {
      const calc = Array.isArray(inv.invoice_calculations) 
        ? inv.invoice_calculations[0] 
        : inv.invoice_calculations;
      
      if (!calc) return;
      
      // Use stored partnerTransferDue as single source of truth
      const storedDebt = Number(calc.partner_transfer_due) || 0;
      const debtToAdmin = Math.max(0, storedDebt);
      
      runningBalance += debtToAdmin;
      
      entries.push({
        id: `inv-${inv.id}`,
        date: inv.created_at,
        type: "invoice",
        description: `${inv.invoice_number || "Счёт"} - ${inv.clients?.name || "Клиент"}`,
        amount: debtToAdmin,
        balance: runningBalance,
        invoiceId: inv.id,
        status: inv.status,
      });
    });

    payments.forEach((pmt: any) => {
      runningBalance -= pmt.amount;
      
      entries.push({
        id: `pmt-${pmt.id}`,
        date: pmt.payment_date,
        type: "payment",
        description: pmt.notes || "Приход от партнёра",
        amount: -pmt.amount,
        balance: runningBalance,
        invoiceId: pmt.invoice_id,
      });
    });

    entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let balance = 0;
    return entries.map((entry) => {
      balance += entry.amount;
      return { ...entry, balance };
    });
  }, [invoices, payments]);

  const totals = useMemo(() => {
    const invoiceTotal = statement
      .filter((e) => e.type === "invoice")
      .reduce((sum, e) => sum + e.amount, 0);
    const paymentTotal = statement
      .filter((e) => e.type === "payment")
      .reduce((sum, e) => sum + Math.abs(e.amount), 0);
    const currentBalance = statement.length > 0 ? statement[statement.length - 1].balance : 0;

    return { invoiceTotal, paymentTotal, currentBalance };
  }, [statement]);

  const isLoading = invoicesLoading || paymentsLoading;

  if (isLoading) {
    return (
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-sm" data-testid="card-partner-statement">
      <CardHeader className="flex flex-row items-center justify-between gap-4 pb-4">
        <CardTitle className="text-xl">Виртуальная выписка</CardTitle>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[180px]" data-testid="select-statement-period">
            <SelectValue placeholder="Период" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="current">Текущий месяц</SelectItem>
            <SelectItem value="last">Прошлый месяц</SelectItem>
            <SelectItem value="3months">3 месяца</SelectItem>
            <SelectItem value="all">Всё время</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      
      <CardContent>
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="text-center p-3 bg-muted/30 rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">Начислено</p>
            <p className="text-lg font-semibold text-amber-600">
              {formatCurrency(totals.invoiceTotal)}
            </p>
          </div>
          <div className="text-center p-3 bg-muted/30 rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">Оплачено</p>
            <p className="text-lg font-semibold text-green-600">
              {formatCurrency(totals.paymentTotal)}
            </p>
          </div>
          <div className="text-center p-3 bg-muted/30 rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">Баланс</p>
            <p className={`text-lg font-semibold ${totals.currentBalance > 0 ? "text-red-600" : "text-green-600"}`}>
              {formatCurrency(Math.abs(totals.currentBalance))}
              {totals.currentBalance > 0 ? " долг" : ""}
            </p>
          </div>
        </div>

        <Separator className="mb-4" />

        {statement.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Нет операций за выбранный период</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-2">
              {statement.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-muted/20 hover-elevate"
                  data-testid={`statement-entry-${entry.id}`}
                >
                  <div className={`p-2 rounded-full ${
                    entry.type === "invoice" 
                      ? "bg-amber-100 text-amber-600 dark:bg-amber-900 dark:text-amber-300" 
                      : "bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-300"
                  }`}>
                    {entry.type === "invoice" ? (
                      <ArrowUpRight className="h-4 w-4" />
                    ) : (
                      <ArrowDownRight className="h-4 w-4" />
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{entry.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(entry.date)}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className={`text-sm font-semibold ${
                      entry.type === "invoice" ? "text-amber-600" : "text-green-600"
                    }`}>
                      {entry.type === "invoice" ? "+" : "-"}{formatCurrency(Math.abs(entry.amount))}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      = {formatCurrency(entry.balance)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
