import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useUserRole } from "@/hooks/useUserRole";
import { useVisibilityAwareInterval } from "@/hooks/useVisibilityAwareInterval";
import { Wallet, TrendingDown, AlertCircle, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";

interface ProjectBudget {
  invoiceId: string;
  invoiceNumber: string;
  partnerName: string;
  totalBudget: number;
  spent: number;
  remaining: number;
  expenses: Array<{
    description: string;
    amount: number;
    date: string;
  }>;
  serviceType?: 'one_time' | 'periodic';
  periodUnit?: 'month' | 'day';
  pricePerPeriod?: number;
  totalPeriods?: number;
  periodsUsed?: number;
}

export const ClientBudgetDashboard = () => {
  const { clientId, loading: authLoading } = useUserRole();
  const refetchInterval = useVisibilityAwareInterval();

  const { data: projects = [], isLoading } = useQuery<ProjectBudget[]>({
    queryKey: ["/api/client/budget"],
    queryFn: () => apiGet<ProjectBudget[]>("/client/budget"),
    enabled: !authLoading && !!clientId,
    refetchInterval,
  });

  if (isLoading || authLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (projects.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Бюджеты проектов
          </CardTitle>
          <CardDescription>
            Здесь будут отображаться ваши проекты и их бюджеты
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            У вас пока нет активных проектов
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          Бюджеты проектов
        </CardTitle>
        <CardDescription>
          Отслеживайте расходы и остатки по вашим проектам
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {projects.map((project, index) => {
          const spentPercent = project.totalBudget > 0
            ? Math.min(100, (project.spent / project.totalBudget) * 100)
            : 0;
          const isOverBudget = project.remaining < 0;
          const isLowBudget = project.remaining > 0 && project.remaining < project.totalBudget * 0.2;

          return (
            <motion.div
              key={project.invoiceId}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="p-4 rounded-md border bg-card"
              data-testid={`project-budget-${project.invoiceId}`}
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 sm:gap-4 mb-3">
                <div className="min-w-0">
                  <h3 className="font-medium flex items-center gap-2 text-sm sm:text-base">
                    Счёт № {project.invoiceNumber}
                    {isOverBudget && (
                      <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                    )}
                    {!isOverBudget && !isLowBudget && (
                      <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                    )}
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Партнёр: {project.partnerName}
                  </p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-xs sm:text-sm text-muted-foreground">Бюджет</p>
                  <p className="font-semibold text-sm sm:text-base break-words">{formatCurrency(project.totalBudget)}</p>
                </div>
              </div>

              <Progress
                value={spentPercent}
                className="h-2 mb-3"
                indicatorClassName={
                  isOverBudget
                    ? "bg-destructive"
                    : isLowBudget
                    ? "bg-warning"
                    : "bg-success"
                }
              />

              {project.serviceType === 'periodic' ? (
                <div className="space-y-1 text-xs sm:text-sm">
                  {(() => {
                    const unit = project.periodUnit === 'day' ? 'дн' : 'мес';
                    const price = project.pricePerPeriod ?? 0;
                    const total = project.totalPeriods ?? 0;
                    const used  = project.periodsUsed ?? 0;
                    const left  = Math.max(0, total - used);
                    return (
                      <>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Цена за {unit}</span>
                          <span className="font-medium">{formatCurrency(price)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Использовано</span>
                          <span className="font-medium">{used} из {total} {unit}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Осталось</span>
                          <span className="font-medium text-green-600">
                            {left} {unit} · {formatCurrency(project.remaining)}
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              ) : (
                <>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2 text-xs sm:text-sm">
                    <div className="flex items-center gap-1">
                      <TrendingDown className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground">Потрачено:</span>
                      <span className="font-medium break-words">{formatCurrency(project.spent)}</span>
                    </div>
                    <div className={`font-medium break-words ${isOverBudget ? "text-destructive" : "text-green-600"}`}>
                      Остаток: {formatCurrency(project.remaining)}
                    </div>
                  </div>

                  {project.expenses.length > 0 && (
                    <div className="mt-3 pt-3 border-t space-y-1">
                      <p className="text-xs text-muted-foreground mb-2">Последние расходы:</p>
                      {project.expenses.slice(0, 3).map((exp, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 text-xs">
                          <span className="truncate">{exp.description}</span>
                          <span className="font-medium text-muted-foreground whitespace-nowrap">
                            {formatCurrency(exp.amount)}
                          </span>
                        </div>
                      ))}
                      {project.expenses.length > 3 && (
                        <p className="text-xs text-muted-foreground">
                          ... и ещё {project.expenses.length - 3} расход(ов)
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </motion.div>
          );
        })}
      </CardContent>
    </Card>
  );
};
