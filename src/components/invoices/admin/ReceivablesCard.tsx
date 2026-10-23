import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { HandCoins } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { useVisibilityAwareInterval } from "@/hooks/useVisibilityAwareInterval";

interface Receivables {
  clients: { total: number; count: number; overdueTotal: number; overdueCount: number };
  partners: { total: number; count: number };
}

const plural = (n: number, one: string, few: string, many: string) => {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};

/** "Нам должны": клиенты партнеров-владельцев платят напрямую, остальные партнеры переводят полученное. */
export const ReceivablesCard = () => {
  const refetchInterval = useVisibilityAwareInterval();
  const { data, isLoading, isError } = useQuery<Receivables>({
    queryKey: ["/api/admin/receivables"],
    queryFn: () => apiGet<Receivables>("/admin/receivables"),
    refetchInterval,
    staleTime: 10000,
  });

  return (
    <Card data-testid="card-receivables">
      <CardHeader className="pb-2">
        <CardTitle className="text-base sm:text-lg flex items-center gap-2">
          <HandCoins className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600" />
          Нам должны{data ? `: ${formatMoney(data.clients.total + data.partners.total)}` : ""}
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
                <p className="text-sm text-muted-foreground">Клиенты, которые платят напрямую</p>
                <p className="text-xl sm:text-2xl font-bold" data-testid="text-receivables-clients">{formatMoney(data.clients.total)}</p>
                <p className="text-xs text-muted-foreground">
                  {data.clients.count} {plural(data.clients.count, "счет", "счета", "счетов")}
                  {data.clients.overdueCount > 0 && (
                    <span className="text-red-600 dark:text-red-400">, просрочено {formatMoney(data.clients.overdueTotal)}</span>
                  )}
                </p>
              </div>
              <div className="p-3 sm:p-4 bg-background/50 rounded-lg space-y-1">
                <p className="text-sm text-muted-foreground">Партнеры, которые должны перевести</p>
                <p className="text-xl sm:text-2xl font-bold" data-testid="text-receivables-partners">{formatMoney(data.partners.total)}</p>
                <p className="text-xs text-muted-foreground">
                  <Link to="/partners" className="underline underline-offset-2">
                    {data.partners.count} {plural(data.partners.count, "партнер", "партнера", "партнеров")}
                  </Link>
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Неоплаченные счета внешних партнеров сюда не входят: клиент платит партнеру, и долг появляется у партнера после оплаты.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
};
