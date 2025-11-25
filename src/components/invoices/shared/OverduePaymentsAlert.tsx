import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Eye } from "lucide-react";
import { Link } from "react-router-dom";
import { formatCurrency, formatDate } from "@/lib/invoiceCalculations";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";

interface OverdueInvoice {
  id: string;
  invoice_number: string;
  payment_date: string;
  overdue_days: number;
  priority_level: string;
  clients: { name: string };
  partners: { name: string };
  invoice_calculations: { client_bill: number } | null;
}

interface OverduePaymentsAlertProps {
  role: "admin" | "assistant" | "partner" | "client";
}

export function OverduePaymentsAlert({ role }: OverduePaymentsAlertProps) {
  const [overdueInvoices, setOverdueInvoices] = useState<OverdueInvoice[]>([]);
  const [expanded, setExpanded] = useState(false);

  const fetchOverdueInvoices = async () => {
    try {
      const { data, error } = await supabase
        .from("invoices")
        .select(`
          id,
          invoice_number,
          payment_date,
          priority_level,
          clients (name),
          partners (name),
          invoice_calculations (client_bill)
        `)
        .eq("status", "sent")
        .lt("payment_date", new Date().toISOString().split('T')[0])
        .order("payment_date", { ascending: true });

      if (error) throw error;
      
      // Calculate overdue days
      const today = new Date();
      const withOverdueDays = (data || []).map(invoice => {
        const paymentDate = new Date(invoice.payment_date);
        const diffTime = Math.abs(today.getTime() - paymentDate.getTime());
        const overdue_days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return { ...invoice, overdue_days };
      });
      
      setOverdueInvoices(withOverdueDays as OverdueInvoice[]);
    } catch (error: any) {
      console.error("Error fetching overdue invoices:", error);
    }
  };

  useEffect(() => {
    fetchOverdueInvoices();
  }, []);

  useRealtimeSubscription({
    channelName: "overdue-invoices-channel",
    table: "invoices",
    onUpdate: fetchOverdueInvoices,
  });

  if (overdueInvoices.length === 0) return null;

  const criticalCount = overdueInvoices.filter(i => i.overdue_days > 30).length;
  const highCount = overdueInvoices.filter(i => i.overdue_days > 14 && i.overdue_days <= 30).length;

  return (
    <Alert variant="destructive" className="mb-6">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle className="flex items-center justify-between">
        <span>
          Просроченные платежи ({overdueInvoices.length})
        </span>
        <div className="flex items-center gap-2">
          {criticalCount > 0 && (
            <Badge variant="destructive">&gt;30 дней: {criticalCount}</Badge>
          )}
          {highCount > 0 && (
            <Badge variant="secondary">&gt;14 дней: {highCount}</Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
          >
            <Eye className="h-4 w-4 mr-2" />
            {expanded ? "Скрыть" : "Показать"}
          </Button>
        </div>
      </AlertTitle>
      
      {expanded && (
        <AlertDescription className="mt-4 space-y-2">
          {overdueInvoices.map((invoice) => (
            <div
              key={invoice.id}
              className="flex items-center justify-between p-3 bg-background/50 rounded border"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Link
                    to={`/invoices?id=${invoice.id}`}
                    className="font-medium hover:underline"
                  >
                    {invoice.invoice_number}
                  </Link>
                  <Badge
                    variant={
                      invoice.overdue_days > 30
                        ? "destructive"
                        : invoice.overdue_days > 14
                        ? "secondary"
                        : "outline"
                    }
                  >
                    {invoice.overdue_days} {invoice.overdue_days === 1 ? "день" : "дней"}
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  {invoice.clients.name} → {invoice.partners.name}
                </div>
              </div>
              <div className="text-right space-y-1">
                <div className="font-medium">
                  {invoice.invoice_calculations && formatCurrency(invoice.invoice_calculations.client_bill)}
                </div>
                <div className="text-sm text-muted-foreground">
                  Оплата до: {formatDate(invoice.payment_date)}
                </div>
              </div>
            </div>
          ))}
        </AlertDescription>
      )}
    </Alert>
  );
}