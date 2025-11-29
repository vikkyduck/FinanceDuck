import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Eye } from "lucide-react";
import { Link } from "wouter";
import { formatCurrency, formatDate } from "@/lib/invoiceCalculations";
import { useVisibilityAwareInterval } from "@/hooks/useVisibilityAwareInterval";

interface OverdueInvoice {
  id: string;
  invoice_number: string;
  payment_date: string;
  overdue_days: number;
  priority_level: string;
  client_name: string;
  partner_name: string;
  client_bill: number;
}

interface OverduePaymentsAlertProps {
  role: "admin" | "assistant" | "partner" | "client";
}

export function OverduePaymentsAlert({ role }: OverduePaymentsAlertProps) {
  const [expanded, setExpanded] = useState(false);
  const refetchInterval = useVisibilityAwareInterval();

  const { data: overdueInvoices = [] } = useQuery<OverdueInvoice[]>({
    queryKey: ["/api/overdue-invoices"],
    queryFn: () => apiGet<OverdueInvoice[]>("/overdue-invoices"),
    enabled: role === "admin" || role === "assistant",
    refetchInterval,
  });

  if (overdueInvoices.length === 0) return null;

  const criticalCount = overdueInvoices.filter(i => i.overdue_days > 30).length;
  const highCount = overdueInvoices.filter(i => i.overdue_days > 14 && i.overdue_days <= 30).length;

  return (
    <Alert variant="destructive" className="mb-6" data-testid="alert-overdue-payments">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle className="flex items-center justify-between gap-2 flex-wrap">
        <span>
          Просроченные платежи ({overdueInvoices.length})
        </span>
        <div className="flex items-center gap-2 flex-wrap">
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
            data-testid="btn-toggle-overdue"
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
              data-testid={`overdue-invoice-${invoice.id}`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/invoices?id=${invoice.id}`}
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
                  {invoice.client_name} {invoice.partner_name ? `→ ${invoice.partner_name}` : ''}
                </div>
              </div>
              <div className="text-right space-y-1">
                <div className="font-medium">
                  {formatCurrency(invoice.client_bill)}
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
