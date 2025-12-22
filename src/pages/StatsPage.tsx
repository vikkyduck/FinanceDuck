import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion, AnimatePresence } from "framer-motion";
import { AdminDashboardMetrics } from "@/components/invoices/admin/AdminDashboardMetrics";
import { RevenueForecastTable } from "@/components/invoices/admin/RevenueForecastTable";
import { MonthlyFinancialTable } from "@/components/invoices/admin/MonthlyFinancialTable";
import { OverduePaymentsAlert } from "@/components/invoices/admin/OverduePaymentsAlert";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import {
  LazyMonthlySalesChart,
  LazyRevenueForecastChart,
  LazySalesStatistics,
} from "./StatsPageLazy";
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
import { Maximize2, Minimize2, BarChart3, Receipt, ShoppingCart } from "lucide-react";
import { useSearchParams } from "react-router-dom";

const StatsPage = () => {
  const { role, isLoading } = useAuth();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const { viewMode, setViewMode } = useViewMode();
  const [searchParams] = useSearchParams();
  const showAlerts = searchParams.get('alerts') === 'true';
  
  // Get tab from URL params, default to 'overview'
  const urlTab = searchParams.get('tab');
  const defaultTab = urlTab === 'invoices' || urlTab === 'sales' ? urlTab : 'overview';

  const { isExpanded, toggleSection, expandAll, collapseAll } = useCollapsibleSections(
    "stats-page-sections",
    {
      recurringInvoices: true,
      invoicesList: true,
    }
  );


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
      <div className="relative -mx-4 sm:-mx-8 -mt-8 sm:-mt-12 mb-6 sm:mb-12 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-secondary/10" />
        <div className="absolute top-0 right-0 w-[200px] sm:w-[400px] h-[200px] sm:h-[400px] bg-primary/5 rounded-full blur-3xl" />
        
        <div className="relative px-4 sm:px-8 pt-8 sm:pt-16 pb-6 sm:pb-12">
          <div className="animate-fade-in space-y-2 sm:space-y-4">
            <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full glass border border-primary/20">
              <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              <span className="text-xs sm:text-sm font-medium text-primary">Обновляется в реальном времени</span>
            </div>
            
            <h1 className="text-3xl sm:text-4xl md:text-6xl font-bold tracking-tight">
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                Аналитика
              </span>
            </h1>
            
            <p className="text-sm sm:text-base md:text-xl text-muted-foreground max-w-2xl">
              Полный контроль над финансовыми показателями и прогнозами
            </p>
          </div>
        </div>
      </div>

      <Tabs defaultValue={defaultTab} className="space-y-4 sm:space-y-8 pb-8 sm:pb-12">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 animate-fade-in">
          <TabsList className="glass-strong border border-primary/10 shadow-lg p-1 sm:p-1.5 gap-1 h-auto w-full sm:w-auto grid grid-cols-3 sm:inline-flex">
            <TabsTrigger 
              value="overview"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-primary-deep data-[state=active]:text-primary-foreground data-[state=active]:shadow-md px-2 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm font-medium gap-1 sm:gap-2"
              data-testid="tab-overview"
            >
              <BarChart3 className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Сводка</span>
              <span className="sm:hidden">Сводка</span>
            </TabsTrigger>
            <TabsTrigger 
              value="invoices"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-primary-deep data-[state=active]:text-primary-foreground data-[state=active]:shadow-md px-2 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm font-medium gap-1 sm:gap-2"
              data-testid="tab-invoices"
            >
              <Receipt className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Счета</span>
              <span className="sm:hidden">Счета</span>
            </TabsTrigger>
            <TabsTrigger 
              value="sales"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-primary-deep data-[state=active]:text-primary-foreground data-[state=active]:shadow-md px-2 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm font-medium gap-1 sm:gap-2"
            >
              <ShoppingCart className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Продажи</span>
              <span className="sm:hidden">Продажи</span>
            </TabsTrigger>
          </TabsList>
          <div className="flex gap-1 shrink-0 self-end sm:self-auto">
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

      </Tabs>
    </DashboardLayout>
  );
};

export default StatsPage;
