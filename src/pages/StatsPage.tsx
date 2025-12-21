import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion, AnimatePresence } from "framer-motion";
import { AdminDashboardMetrics } from "@/components/invoices/admin/AdminDashboardMetrics";
import { RevenueForecastTable } from "@/components/invoices/admin/RevenueForecastTable";
import { MonthlyFinancialTable } from "@/components/invoices/admin/MonthlyFinancialTable";
import { OverduePaymentsAlert } from "@/components/invoices/admin/OverduePaymentsAlert";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  LazyMonthlySalesChart,
  LazyRevenueForecastChart,
  LazySalesStatistics,
} from "./StatsPageLazy";
import { BackupManager } from "@/components/admin/BackupManager";
import { DoNotSpendDashboard } from "@/components/invoices/admin/DoNotSpendDashboard";
import { ExpectedAdminProfitDashboard } from "@/components/invoices/admin/ExpectedAdminProfitDashboard";
import { RecurringInvoicesManager } from "@/components/invoices/admin/RecurringInvoicesManager";
import { AdminInvoicesList } from "@/components/invoices/admin/AdminInvoicesList";
import { useViewMode } from "@/hooks/useViewMode";
import { useCollapsibleSections } from "@/hooks/useCollapsibleSections";
import { ViewModeToggle } from "@/components/shared/ViewModeToggle";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Maximize2, Minimize2, BarChart3, Receipt, ShoppingCart, Database } from "lucide-react";
import { useSearchParams } from "react-router-dom";

const StatsPage = () => {
  const { role, isLoading } = useAuth();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const { viewMode, setViewMode } = useViewMode();
  const [searchParams] = useSearchParams();
  const showAlerts = searchParams.get('alerts') === 'true';

  const { isExpanded, toggleSection, expandAll, collapseAll } = useCollapsibleSections(
    "stats-page-sections",
    {
      recurringInvoices: true,
      invoicesList: true,
    }
  );

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
                  Статистика
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
          <div className="flex items-center justify-between gap-4">
            <TabsList className="glass-strong border border-primary/10 shadow-lg p-1.5 gap-1 h-auto flex-wrap">
              <TabsTrigger 
                value="overview"
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-primary-deep data-[state=active]:text-primary-foreground data-[state=active]:shadow-md px-6 py-3 text-sm font-medium gap-2"
                data-testid="tab-overview"
              >
                <BarChart3 className="h-4 w-4" />
                Сводка
              </TabsTrigger>
              <TabsTrigger 
                value="invoices"
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-primary-deep data-[state=active]:text-primary-foreground data-[state=active]:shadow-md px-6 py-3 text-sm font-medium gap-2"
                data-testid="tab-invoices"
              >
                <Receipt className="h-4 w-4" />
                Счета
              </TabsTrigger>
              <TabsTrigger 
                value="sales"
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-primary-deep data-[state=active]:text-primary-foreground data-[state=active]:shadow-md px-6 py-3 text-sm font-medium gap-2"
              >
                <ShoppingCart className="h-4 w-4" />
                Продажи
              </TabsTrigger>
              <TabsTrigger 
                value="backups"
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-primary-deep data-[state=active]:text-primary-foreground data-[state=active]:shadow-md px-6 py-3 text-sm font-medium gap-2"
                data-testid="tab-backups"
              >
                <Database className="h-4 w-4" />
                Бэкапы
              </TabsTrigger>
            </TabsList>
            <div className="flex gap-1 shrink-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={expandAll} data-testid="button-expand-all">
                    <Maximize2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Развернуть все</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={collapseAll} data-testid="button-collapse-all">
                    <Minimize2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Свернуть все</TooltipContent>
              </Tooltip>
            </div>
          </div>

          <AnimatePresence mode="wait">
            <TabsContent value="overview" className="space-y-6 mt-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                <DoNotSpendDashboard />
                <ExpectedAdminProfitDashboard />
              </motion.div>
            </TabsContent>
          </AnimatePresence>


          <AnimatePresence mode="wait">
            <TabsContent value="invoices" className="space-y-6 mt-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                <CollapsibleSection
                  id="recurringInvoices"
                  title="Автоматические счета"
                  isExpanded={isExpanded("recurringInvoices")}
                  onToggle={() => toggleSection("recurringInvoices")}
                >
                  <RecurringInvoicesManager />
                </CollapsibleSection>

                <CollapsibleSection
                  id="invoicesList"
                  title="Все счета"
                  isExpanded={isExpanded("invoicesList")}
                  onToggle={() => toggleSection("invoicesList")}
                  headerActions={
                    <ViewModeToggle 
                      value={viewMode}
                      onValueChange={setViewMode}
                      className="hidden sm:flex"
                    />
                  }
                >
                  <div className="px-0 -mx-6">
                    <AdminInvoicesList 
                      viewMode={viewMode}
                      initialStatusFilter={showAlerts ? 'overdue' : undefined}
                    />
                  </div>
                </CollapsibleSection>
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
                className="space-y-8"
              >
                <LazyRevenueForecastChart monthsAhead={6} />
                <RevenueForecastTable />
                <LazySalesStatistics year={selectedYear} />
                <LazyMonthlySalesChart year={selectedYear} />
                <MonthlyFinancialTable year={selectedYear} />
              </motion.div>
            </TabsContent>
          </AnimatePresence>

          <AnimatePresence mode="wait">
            <TabsContent value="backups" className="space-y-8 mt-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                <BackupManager />
              </motion.div>
            </TabsContent>
          </AnimatePresence>

        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default StatsPage;
