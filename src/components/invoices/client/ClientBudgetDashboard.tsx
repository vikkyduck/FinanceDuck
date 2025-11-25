import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useUserRole } from "@/hooks/useUserRole";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
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
}

export const ClientBudgetDashboard = () => {
  const [projects, setProjects] = useState<ProjectBudget[]>([]);
  const [loading, setLoading] = useState(true);
  const { clientId } = useUserRole();

  const fetchBudgets = async () => {
    if (!clientId) return;

    try {
      const { data: invoices } = await supabase
        .from("invoices")
        .select(`
          id,
          invoice_number,
          partners(name),
          invoice_calculations(
            client_base_after_margin,
            executor_expenses_total,
            client_remaining
          ),
          executor_expenses(
            description,
            amount,
            date
          )
        `)
        .eq("client_id", clientId)
        .in("status", ["sent", "paid"])
        .order("created_at", { ascending: false });

      if (invoices) {
        const getCalc = (inv: any) => {
          const calcRaw = inv.invoice_calculations;
          return Array.isArray(calcRaw) ? calcRaw[0] : calcRaw;
        };

        const projectBudgets: ProjectBudget[] = invoices
          .filter((inv: any) => !!getCalc(inv)?.client_base_after_margin)
          .map((inv: any) => {
            const calc = getCalc(inv);
            const expenses = inv.executor_expenses || [];

            return {
              invoiceId: inv.id,
              invoiceNumber: inv.invoice_number,
              partnerName: inv.partners?.name || "—",
              totalBudget: Number(calc?.client_base_after_margin) || 0,
              spent: Number(calc?.executor_expenses_total) || 0,
              remaining: Number(calc?.client_remaining) || 0,
              expenses: expenses.map((exp: any) => ({
                description: exp.description,
                amount: Number(exp.amount),
                date: exp.date,
              })),
            };
          });

        setProjects(projectBudgets);
      }
    } catch (error) {
      console.error("Error fetching budgets:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBudgets();
  }, [clientId]);

  useRealtimeSubscription({
    channelName: "client_budget_realtime",
    table: "executor_expenses",
    onUpdate: fetchBudgets,
    enabled: !!clientId,
  });

  useRealtimeSubscription({
    channelName: "client_budget_calculations",
    table: "invoice_calculations",
    onUpdate: fetchBudgets,
    enabled: !!clientId,
  });

  if (loading) {
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
            Бюджет проектов
          </CardTitle>
          <CardDescription>Real-time отслеживание расходов</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            У вас пока нет активных проектов с бюджетом
          </p>
        </CardContent>
      </Card>
    );
  }

  const totalBudget = projects.reduce((sum, p) => sum + p.totalBudget, 0);
  const totalSpent = projects.reduce((sum, p) => sum + p.spent, 0);
  const totalRemaining = projects.reduce((sum, p) => sum + p.remaining, 0);
  const overallProgress = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Бюджет проектов
          </CardTitle>
          <CardDescription>
            Real-time отслеживание расходов • {projects.length} проект(ов)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Общая статистика */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
              <p className="text-sm text-muted-foreground">Общий бюджет</p>
              <p className="text-2xl font-bold text-primary">
                {formatCurrency(totalBudget)}
              </p>
            </div>
            <div className="p-4 rounded-lg bg-orange-50 border border-orange-200">
              <p className="text-sm text-muted-foreground">Потрачено</p>
              <p className="text-2xl font-bold text-orange-600">
                {formatCurrency(totalSpent)}
              </p>
              <Progress value={overallProgress} className="mt-2 h-2" />
            </div>
            <div className="p-4 rounded-lg bg-green-50 border border-green-200">
              <p className="text-sm text-muted-foreground">Остаток</p>
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(totalRemaining)}
              </p>
            </div>
          </div>

          {/* Проекты */}
          <div className="space-y-4">
            {projects.map((project, index) => {
              const progress =
                project.totalBudget > 0
                  ? (project.spent / project.totalBudget) * 100
                  : 0;
              const isLowBudget = project.remaining < project.totalBudget * 0.2;

              return (
                <motion.div
                  key={project.invoiceId}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className={`p-4 rounded-lg border ${
                    isLowBudget
                      ? "border-orange-300 bg-orange-50/50"
                      : "border-border bg-muted/30"
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{project.invoiceNumber}</h3>
                        {isLowBudget && (
                          <AlertCircle className="h-4 w-4 text-orange-600" />
                        )}
                        {!isLowBudget && project.remaining > 0 && (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Партнер: {project.partnerName}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Остаток</p>
                      <p
                        className={`text-lg font-bold ${
                          isLowBudget ? "text-orange-600" : "text-green-600"
                        }`}
                      >
                        {formatCurrency(project.remaining)}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Потрачено: {formatCurrency(project.spent)}</span>
                      <span>Бюджет: {formatCurrency(project.totalBudget)}</span>
                    </div>
                    <Progress
                      value={progress}
                      className={`h-2 ${
                        isLowBudget ? "[&>div]:bg-orange-600" : ""
                      }`}
                    />
                    <p className="text-xs text-muted-foreground">
                      {progress.toFixed(0)}% использовано
                    </p>
                  </div>

                  {/* Recent expenses */}
                  {project.expenses.length > 0 && (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs font-medium text-muted-foreground mb-2">
                        Последние расходы:
                      </p>
                      <div className="space-y-1">
                        {project.expenses.slice(0, 3).map((exp, i) => (
                          <div
                            key={i}
                            className="flex justify-between text-xs py-1"
                          >
                            <span className="truncate flex-1 mr-2">
                              {exp.description}
                            </span>
                            <span className="font-medium flex items-center gap-1">
                              <TrendingDown className="h-3 w-3 text-orange-600" />
                              {formatCurrency(exp.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};
