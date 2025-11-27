import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ensureSessionContext } from "@/lib/supabaseHelpers";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, TrendingDown, FileText } from "lucide-react";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface DoNotSpendInvoice {
  id: string;
  invoice_number: string | null;
  client_name: string;
  partner_name: string;
  client_base: number;
  expenses: number;
  remaining: number;
}

interface DoNotSpendDashboardProps {
  showTitle?: boolean;
  className?: string;
}

export const DoNotSpendDashboard = ({
  showTitle = true,
  className,
}: DoNotSpendDashboardProps) => {
  const [invoices, setInvoices] = useState<DoNotSpendInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalRemaining, setTotalRemaining] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      await ensureSessionContext();

      const { data: invoicesData, error: invoicesError } = await supabase
        .from("invoices")
        .select(`
          id,
          invoice_number,
          scheme,
          status,
          clients(name),
          partners(name),
          invoice_calculations(
            client_bill,
            client_base_after_margin,
            executor_expenses_total
          )
        `)
        .eq("scheme", "agency_30")
        .in("status", ["paid", "sent"]);

      if (invoicesError) {
        console.error("Error fetching invoices:", invoicesError);
        setLoading(false);
        return;
      }

      const formattedInvoices: DoNotSpendInvoice[] = (invoicesData || [])
        .map((inv: any) => {
          const calc = inv.invoice_calculations?.[0];
          if (!calc) return null;

          const clientBill = Number(calc.client_bill) || 0;
          const clientBase = Number(calc.client_base_after_margin) || clientBill * 0.70;
          const expenses = Number(calc.executor_expenses_total) || 0;
          const remaining = Math.max(0, clientBase - expenses);

          return {
            id: inv.id,
            invoice_number: inv.invoice_number,
            client_name: inv.clients?.name || "Клиент",
            partner_name: inv.partners?.name || "Партнёр",
            client_base: clientBase,
            expenses,
            remaining,
          };
        })
        .filter((inv): inv is DoNotSpendInvoice => inv !== null && inv.remaining > 0)
        .sort((a, b) => b.remaining - a.remaining);

      setInvoices(formattedInvoices);
      setTotalRemaining(formattedInvoices.reduce((sum, inv) => sum + inv.remaining, 0));
    } catch (error) {
      console.error("Error fetching do-not-spend data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useRealtimeSubscription({
    channelName: "do_not_spend_invoices",
    table: "invoices",
    onUpdate: fetchData,
    enabled: true,
  });

  useRealtimeSubscription({
    channelName: "do_not_spend_expenses",
    table: "invoice_expenses",
    onUpdate: fetchData,
    enabled: true,
  });

  if (loading) {
    return (
      <div
        className={cn(
          "bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/30",
          "rounded-2xl p-6 shadow-standard",
          className
        )}
      >
        {showTitle && <Skeleton className="h-7 w-48 mb-6" />}
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (invoices.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/30",
        "rounded-2xl p-6 shadow-standard",
        className
      )}
      data-testid="do-not-spend-dashboard"
    >
      {showTitle && (
        <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h3
                className="text-[18px] font-semibold text-foreground"
                style={{ letterSpacing: "-0.2px" }}
              >
                Не тратить
              </h3>
              <p className="text-xs text-muted-foreground">
                Клиентские деньги по схеме Агентство 30%
              </p>
            </div>
          </div>
          <div className="text-right">
            <Badge 
              variant="outline" 
              className="text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700 bg-amber-100/50 dark:bg-amber-900/30"
            >
              {formatCurrency(totalRemaining)}
            </Badge>
          </div>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-amber-200/50 dark:border-amber-800/30">
            <TableHead className="text-xs">Счёт</TableHead>
            <TableHead className="text-xs">Клиент</TableHead>
            <TableHead className="text-xs text-right">База (70%)</TableHead>
            <TableHead className="text-xs text-right">Расходы</TableHead>
            <TableHead className="text-xs text-right">Остаток</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((invoice) => (
            <TableRow 
              key={invoice.id} 
              className="hover:bg-amber-100/50 dark:hover:bg-amber-900/20 border-amber-200/50 dark:border-amber-800/30"
            >
              <TableCell className="text-sm">
                <div className="flex items-center gap-2">
                  <FileText className="h-3 w-3 text-muted-foreground" />
                  {invoice.invoice_number || invoice.id.slice(0, 8)}
                </div>
              </TableCell>
              <TableCell className="text-sm">{invoice.client_name}</TableCell>
              <TableCell className="text-sm text-right text-muted-foreground">
                {formatCurrency(invoice.client_base)}
              </TableCell>
              <TableCell className="text-sm text-right">
                {invoice.expenses > 0 ? (
                  <span className="flex items-center justify-end gap-1 text-muted-foreground">
                    <TrendingDown className="h-3 w-3" />
                    {formatCurrency(invoice.expenses)}
                  </span>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </TableCell>
              <TableCell className="text-sm text-right">
                <span className="font-semibold text-amber-700 dark:text-amber-400">
                  {formatCurrency(invoice.remaining)}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="mt-4 pt-4 border-t border-amber-200/50 dark:border-amber-800/30">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Эта сумма уменьшается по мере добавления расходов
          </span>
          <span className="font-semibold text-amber-700 dark:text-amber-400">
            Итого: {formatCurrency(totalRemaining)}
          </span>
        </div>
      </div>
    </div>
  );
};
