import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion, AnimatePresence } from "framer-motion";
import { AdminStats } from "@/components/invoices/admin/AdminStats";
import { AdminDashboardMetrics } from "@/components/invoices/admin/AdminDashboardMetrics";
import { RevenueForecastTable } from "@/components/invoices/admin/RevenueForecastTable";
import { MonthlyFinancialTable } from "@/components/invoices/admin/MonthlyFinancialTable";
import { YearlyKeyIndicators } from "@/components/invoices/admin/YearlyKeyIndicators";
import { PlanHistoryComparison } from "@/components/invoices/admin/PlanHistoryComparison";
import { OverduePaymentsAlert } from "@/components/invoices/admin/OverduePaymentsAlert";
import { CurrentMonthPlanFact } from "@/components/invoices/admin/CurrentMonthPlanFact";
import { CurrentPeriodMetrics } from "@/components/invoices/admin/CurrentPeriodMetrics";
import { KeyMetricsCards } from "@/components/invoices/admin/KeyMetricsCards";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  LazyMonthlySalesChart,
  LazyRevenueForecastChart,
  LazyFinancialPlanningChart,
  LazyProfitTrendChart,
  LazySalesStatistics,
} from "./StatsPageLazy";

const StatsPage = () => {
  const { role, isLoading } = useAuth();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-muted-foreground">Загрузка...</div>
        </div>
      </DashboardLayout>
    );
  }

  if (role !== 'admin') {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-muted-foreground">У вас нет доступа к этой странице</div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      {/* Hero Header with Gradient */}
      <div className="relative -mx-8 -mt-12 mb-12 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-secondary/10" />
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-primary/5 rounded-full blur-3xl" />
        
        <div className="relative px-8 pt-16 pb-12">
          <div className="flex items-end justify-between animate-fade-in">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass border border-primary/20">
                <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                <span className="text-sm font-medium text-primary">Обновляется в реальном времени</span>
              </div>
              
              <h1 className="text-6xl font-bold tracking-tight">
                <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                  Аналитика
                </span>
              </h1>
              
              <p className="text-xl text-muted-foreground max-w-2xl">
                Полный контроль над финансовыми показателями и прогнозами
              </p>
            </div>
            
            <Select value={selectedYear.toString()} onValueChange={(val) => setSelectedYear(parseInt(val))}>
              <SelectTrigger className="w-40 glass border-primary/20 shadow-lg">
                <SelectValue placeholder="Год" />
              </SelectTrigger>
              <SelectContent>
                {years.map((year) => (
                  <SelectItem key={year} value={year.toString()}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="space-y-10 pb-12">

        {/* Dashboard Metrics - Yearly Summary, Cash Flow, Sales, Efficiency */}
        <div className="animate-fade-in" style={{ animationDelay: '100ms' }}>
          <AdminDashboardMetrics />
        </div>

        {/* Critical Alerts - If any */}
        <div className="animate-fade-in" style={{ animationDelay: '200ms' }}>
          <OverduePaymentsAlert />
        </div>

        <Tabs defaultValue="overview" className="space-y-8 animate-fade-in" style={{ animationDelay: '300ms' }}>
          <TabsList className="glass-strong border border-primary/10 shadow-lg p-1.5 gap-1 h-auto">
            <TabsTrigger 
              value="overview"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-primary-deep data-[state=active]:text-primary-foreground data-[state=active]:shadow-md px-6 py-3 text-sm font-medium"
            >
              Текущий период
            </TabsTrigger>
            <TabsTrigger 
              value="forecast"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-primary-deep data-[state=active]:text-primary-foreground data-[state=active]:shadow-md px-6 py-3 text-sm font-medium"
            >
              Прогноз выручки
            </TabsTrigger>
            <TabsTrigger 
              value="sales"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-primary-deep data-[state=active]:text-primary-foreground data-[state=active]:shadow-md px-6 py-3 text-sm font-medium"
            >
              Продажи
            </TabsTrigger>
            <TabsTrigger 
              value="planning"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-primary-deep data-[state=active]:text-primary-foreground data-[state=active]:shadow-md px-6 py-3 text-sm font-medium"
            >
              Планирование
            </TabsTrigger>
            <TabsTrigger 
              value="history"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-primary-deep data-[state=active]:text-primary-foreground data-[state=active]:shadow-md px-6 py-3 text-sm font-medium"
            >
              История
            </TabsTrigger>
          </TabsList>

          <AnimatePresence mode="wait">
            <TabsContent value="overview" className="space-y-8 mt-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                <CurrentPeriodMetrics selectedYear={selectedYear} />
                <CurrentMonthPlanFact />
                <AdminStats />
              </motion.div>
            </TabsContent>
          </AnimatePresence>

          <AnimatePresence mode="wait">
            <TabsContent value="forecast" className="space-y-8 mt-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                <LazyRevenueForecastChart monthsAhead={6} />
                <RevenueForecastTable />
              </motion.div>
            </TabsContent>
          </AnimatePresence>

          <AnimatePresence mode="wait">
            <TabsContent value="sales" className="space-y-8 mt-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                <LazySalesStatistics year={selectedYear} />
                <LazyMonthlySalesChart year={selectedYear} />
              </motion.div>
            </TabsContent>
          </AnimatePresence>

          <AnimatePresence mode="wait">
            <TabsContent value="planning" className="space-y-8 mt-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                <YearlyKeyIndicators year={selectedYear} />

                <div className="grid gap-8 md:grid-cols-2">
                  <LazyFinancialPlanningChart year={selectedYear} />
                  <LazyProfitTrendChart year={selectedYear} />
                </div>

                <MonthlyFinancialTable year={selectedYear} />
              </motion.div>
            </TabsContent>
          </AnimatePresence>

          <AnimatePresence mode="wait">
            <TabsContent value="history" className="space-y-8 mt-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                <PlanHistoryComparison />
              </motion.div>
            </TabsContent>
          </AnimatePresence>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default StatsPage;
