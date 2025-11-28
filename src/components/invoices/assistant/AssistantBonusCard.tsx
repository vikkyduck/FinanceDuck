import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { DollarSign, FileText, Receipt, User, Building2 } from "lucide-react";
import { apiGet } from "@/lib/api";

interface AssistantStats {
  paidInvoicesCount: number;
  executorActsCount: number;
  companyActsCount: number;
  totalPaidInvoices: number;
  assistantBonus: number;
}

export const AssistantBonusCard = () => {
  const { data: stats, isLoading } = useQuery<AssistantStats>({
    queryKey: ['/api/assistant/stats'],
    queryFn: () => apiGet('/assistant/stats'),
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-2 w-full" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!stats) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground">
            Не удалось загрузить данные о бонусах
          </div>
        </CardContent>
      </Card>
    );
  }

  const companyActsAmount = stats.companyActsCount * 2000;
  const executorActsAmount = stats.executorActsCount * 1000;
  const progressPercent = Math.min((stats.assistantBonus / 50000) * 100, 100);

  const executorProgress = stats.totalPaidInvoices > 0 
    ? (stats.executorActsCount / stats.totalPaidInvoices) * 100 
    : 0;
  const companyProgress = stats.totalPaidInvoices > 0 
    ? (stats.companyActsCount / stats.totalPaidInvoices) * 100 
    : 0;

  return (
    <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-primary" />
          Ваши бонусы
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <div className="text-3xl font-bold text-primary" data-testid="text-assistant-bonus">
            {formatCurrency(stats.assistantBonus)}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Накоплено за загруженные акты
          </p>
        </div>

        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-muted-foreground">Прогресс до 50 000</span>
            <span className="font-medium">{progressPercent.toFixed(0)}%</span>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </div>

        <div className="space-y-4 pt-2">
          <div className="p-3 rounded-md bg-background/50 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <Building2 className="h-4 w-4 text-purple-500" />
                <span>Акты компаний</span>
              </div>
              <span className="text-sm font-medium" data-testid="text-company-acts-count">
                {stats.companyActsCount} / {stats.totalPaidInvoices}
              </span>
            </div>
            <Progress value={companyProgress} className="h-1.5" />
            <div className="text-sm font-semibold text-right">
              {stats.companyActsCount} x 2 000 = {formatCurrency(companyActsAmount)}
            </div>
          </div>

          <div className="p-3 rounded-md bg-background/50 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-blue-500" />
                <span>Акты исполнителей</span>
              </div>
              <span className="text-sm font-medium" data-testid="text-executor-acts-count">
                {stats.executorActsCount} / {stats.totalPaidInvoices}
              </span>
            </div>
            <Progress value={executorProgress} className="h-1.5" />
            <div className="text-sm font-semibold text-right">
              {stats.executorActsCount} x 1 000 = {formatCurrency(executorActsAmount)}
            </div>
          </div>
        </div>

        <div className="pt-2 border-t">
          <div className="flex items-center justify-between p-2 rounded-md bg-primary/10">
            <span className="font-medium">Итого бонус:</span>
            <span className="font-bold text-primary">{formatCurrency(stats.assistantBonus)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
