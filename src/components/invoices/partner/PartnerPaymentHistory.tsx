import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { History, TrendingDown, Check, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useVisibilityAwareInterval } from "@/hooks/useVisibilityAwareInterval";

interface PaymentHistoryEntry {
  id: string;
  paymentDate: string;
  amount: number;
  notes: string | null;
  runningBalance: number;
}

interface PartnerPaymentHistoryProps {
  partnerId?: string;
  showTitle?: boolean;
  className?: string;
  compact?: boolean;
}

export function PartnerPaymentHistory({ 
  partnerId, 
  showTitle = true, 
  className,
  compact = false 
}: PartnerPaymentHistoryProps) {
  const refetchInterval = useVisibilityAwareInterval();
  const apiUrl = partnerId 
    ? `/api/partners/${partnerId}/payment-history` 
    : "/api/my-payment-history";

  const { data: history, isLoading, error } = useQuery<PaymentHistoryEntry[]>({
    queryKey: ["partner-payment-history", partnerId || "self"],
    queryFn: async () => {
      const response = await fetch(apiUrl, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch payment history");
      return response.json();
    },
    staleTime: 30000,
    refetchInterval,
  });

  if (isLoading) {
    return (
      <Card className={cn("shadow-standard", className)}>
        {showTitle && (
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <History className="h-4 w-4" />
              История платежей
            </CardTitle>
          </CardHeader>
        )}
        <CardContent className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={cn("shadow-standard", className)}>
        <CardContent className="py-6">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span>Ошибка загрузки истории платежей</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!history || history.length === 0) {
    return (
      <Card className={cn("shadow-standard", className)}>
        {showTitle && (
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <History className="h-4 w-4" />
              История платежей
            </CardTitle>
          </CardHeader>
        )}
        <CardContent>
          <p className="text-muted-foreground text-sm text-center py-4">
            Платежей пока нет
          </p>
        </CardContent>
      </Card>
    );
  }

  const totalPaid = history.reduce((sum, entry) => sum + entry.amount, 0);
  const currentBalance = history[0]?.runningBalance || 0;

  return (
    <Card className={cn("shadow-standard", className)} data-testid="partner-payment-history">
      {showTitle && (
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <History className="h-4 w-4" />
              История платежей
            </CardTitle>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground">
                Всего: <span className="font-medium text-foreground">{formatCurrency(totalPaid)}</span>
              </span>
              {currentBalance <= 0 ? (
                <Badge variant="outline" className="gap-1 bg-green-500/10 text-green-600 border-green-200">
                  <Check className="h-3 w-3" />
                  {currentBalance < 0 
                    ? `Переплата: ${formatCurrency(Math.abs(currentBalance))}`
                    : "Всё оплачено"
                  }
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 bg-amber-500/10 text-amber-600 border-amber-200">
                  Остаток: {formatCurrency(currentBalance)}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
      )}
      <CardContent className={cn(compact ? "pt-0" : "")}>
        <div className="space-y-2">
          {history.map((entry, index) => (
            <div
              key={entry.id}
              className={cn(
                "flex items-center justify-between gap-4 py-3",
                index !== history.length - 1 && "border-b border-border/50"
              )}
              data-testid={`payment-entry-${entry.id}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="shrink-0 w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center">
                  <TrendingDown className="h-4 w-4 text-green-600" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground">
                    {format(new Date(entry.paymentDate), "d MMMM yyyy", { locale: ru })}
                  </div>
                  {entry.notes && (
                    <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                      {entry.notes}
                    </div>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-semibold text-green-600">
                  -{formatCurrency(entry.amount)}
                </div>
                <div className={cn(
                  "text-xs",
                  entry.runningBalance < 0 ? "text-green-600" : "text-muted-foreground"
                )}>
                  {entry.runningBalance < 0 
                    ? `Переплата: ${formatCurrency(Math.abs(entry.runningBalance))}`
                    : `Остаток: ${formatCurrency(entry.runningBalance)}`
                  }
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
