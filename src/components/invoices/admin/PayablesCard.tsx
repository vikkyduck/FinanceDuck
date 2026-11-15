import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Check, ChevronDown, ChevronUp, Loader2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, apiPatch } from "@/lib/api";
import { invalidateFinancialQueries } from "@/lib/financialQueries";
import { formatDate, formatMoney, pluralizeRu, todayIsoDate } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { useVisibilityAwareInterval } from "@/hooks/useVisibilityAwareInterval";

interface UnpaidExpense {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  clientName: string | null;
  description: string;
  amount: number;
  date: string;
}

interface Payables {
  executors: { total: number; count: number; items: UnpaidExpense[] };
  assistant: { since: string; unpaid: number };
}

/** "Мы должны" - долги Кота и Кря вместе перед другими: неоплаченные исполнителям расходы,
 *  которые платит владелец, и отдельно бонус ассистенту, который Кря платит с личного счета.
 *  Долг Коту - расчет между владельцами, он в карточке "Переводы Коту и себе". */
export const PayablesCard = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const refetchInterval = useVisibilityAwareInterval();
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError } = useQuery<Payables>({
    queryKey: ["/api/admin/payables"],
    queryFn: () => apiGet<Payables>("/admin/payables"),
    refetchInterval,
    staleTime: 10000,
  });
  const markPaid = useMutation({
    mutationFn: (id: string) => apiPatch(`/expenses/${id}`, { paidAt: todayIsoDate() }),
    onSuccess: () => invalidateFinancialQueries(queryClient),
    onError: (error: Error) => toast({ title: "Ошибка", description: error.message, variant: "destructive" }),
  });

  return (
    <Card data-testid="card-payables">
      <CardHeader className="pb-2">
        <CardTitle className="text-base sm:text-lg flex items-center gap-2">
          <Wallet className="h-4 w-4 sm:h-5 sm:w-5 text-rose-600" />
          Мы должны{data ? `: ${formatMoney(data.executors.total)}` : ""}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : isError || !data ? (
          <p className="text-sm text-muted-foreground">Не удалось загрузить данные</p>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3 sm:p-4 bg-background/50 rounded-lg space-y-1">
                <p className="text-sm text-muted-foreground">Исполнителям</p>
                <p className="text-xl sm:text-2xl font-bold" data-testid="text-payables-executors">{formatMoney(data.executors.total)}</p>
                <p className="text-xs text-muted-foreground">
                  {data.executors.count} {pluralizeRu(data.executors.count, ["расход не оплачен", "расхода не оплачены", "расходов не оплачено"])}
                </p>
              </div>
              <div className="p-3 sm:p-4 bg-background/50 rounded-lg space-y-1">
                <p className="text-sm text-muted-foreground">Ассистенту, с личного счета</p>
                <p className="text-xl sm:text-2xl font-bold" data-testid="text-payables-assistant">{formatMoney(data.assistant.unpaid)}</p>
                <p className="text-xs text-muted-foreground">
                  Бонус за принятые пакеты с {formatDate(data.assistant.since)}, в итог не входит
                </p>
              </div>
            </div>
            {data.executors.count > 0 && (
              <Collapsible open={open} onOpenChange={setOpen} className="mt-3">
                <CollapsibleTrigger className="w-full" data-testid="trigger-payables">
                  <div className="flex items-center justify-center gap-1 hover-elevate p-1 rounded cursor-pointer text-sm text-muted-foreground">
                    <span>{open ? "Скрыть расходы" : "Показать расходы"}</span>
                    {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="space-y-2 mt-2">
                    {data.executors.items.map(item => (
                      <div key={item.id} className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/30">
                        <div className="min-w-0">
                          <p className="text-sm [overflow-wrap:anywhere]">{item.description}</p>
                          <p className="text-xs text-muted-foreground">
                            <Link to={`/invoices/${item.invoiceId}`} className="underline underline-offset-2">{item.invoiceNumber}</Link>
                            {item.clientName ? `, ${item.clientName}` : ""}, {formatDate(item.date)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-sm font-medium whitespace-nowrap">{formatMoney(item.amount)}</span>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={markPaid.isPending}
                            onClick={() => markPaid.mutate(item.id)}
                            data-testid={`button-mark-paid-${item.id}`}
                          >
                            {markPaid.isPending && markPaid.variables === item.id
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <Check className="h-4 w-4" />}
                            <span className="ml-1">Оплачено</span>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
            <p className="text-xs text-muted-foreground mt-3">
              "Мы" - это Кот и Кря вместе. Сюда входят расходы, которые платите вы: с отметкой "Администратор" или по партнерам с оплатой напрямую владельцу. Бонус ассистенту вы платите с личного счета, поэтому он показан отдельно и в сумму в заголовке не входит. Расчет с Котом - в карточке "Переводы Коту и себе".
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
};
