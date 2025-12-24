import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { AdminInvoicesList } from "@/components/invoices/admin/AdminInvoicesList";
import { RecurringInvoicesManager } from "@/components/invoices/admin/RecurringInvoicesManager";
import { useAuth } from "@/hooks/useAuth";
import { AssistantDashboard } from "@/components/invoices/AssistantDashboard";
import { PartnerDashboard } from "@/components/invoices/PartnerDashboard";
import { ClientDashboard } from "@/components/invoices/ClientDashboard";
import { useViewMode } from "@/hooks/useViewMode";
import { ViewModeToggle } from "@/components/shared/ViewModeToggle";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, RefreshCw, Receipt } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

const InvoicesListPage = () => {
  const { role, isLoading } = useAuth();
  const { viewMode, setViewMode } = useViewMode();
  const [searchParams] = useSearchParams();
  const showAlerts = searchParams.get('alerts') === 'true';
  const urlTab = searchParams.get('tab');
  const defaultTab = urlTab === 'recurring' ? 'recurring' : 'all';

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent" />
        </div>
      </DashboardLayout>
    );
  }

  if (role === 'assistant') {
    return <AssistantDashboard />;
  }

  if (role === 'partner') {
    return <PartnerDashboard />;
  }

  if (role === 'client') {
    return <ClientDashboard />;
  }

  return (
    <DashboardLayout>
      <div className="relative -mx-4 sm:-mx-8 -mt-8 sm:-mt-12 mb-6 sm:mb-8 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-secondary/10" />
        <div className="absolute top-0 right-0 w-[200px] sm:w-[400px] h-[200px] sm:h-[400px] bg-primary/5 rounded-full blur-3xl" />
        
        <div className="relative px-4 sm:px-8 pt-6 sm:pt-12 pb-4 sm:pb-8">
          <div className="animate-fade-in space-y-2 sm:space-y-3">
            <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full glass border border-primary/20">
              <FileText className="h-3 w-3 sm:h-4 sm:w-4 text-primary" />
              <span className="text-xs sm:text-sm font-medium text-primary">Управление счетами</span>
            </div>
            
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight">
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                Счета
              </span>
            </h1>
            
            <p className="text-sm sm:text-base text-muted-foreground max-w-2xl">
              Автоматические и обычные счета, фильтры, редактирование
            </p>
          </div>
        </div>
      </div>

      <Tabs defaultValue={defaultTab} className="space-y-4 sm:space-y-6 pb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <TabsList className="glass-strong border border-primary/10 shadow-lg p-1 sm:p-1.5 gap-1 h-auto w-full sm:w-auto grid grid-cols-2 sm:inline-flex">
            <TabsTrigger 
              value="all"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-primary-deep data-[state=active]:text-primary-foreground data-[state=active]:shadow-md px-3 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm font-medium gap-1.5 sm:gap-2"
              data-testid="tab-all-invoices"
            >
              <Receipt className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span>Все счета</span>
            </TabsTrigger>
            <TabsTrigger 
              value="recurring"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-primary-deep data-[state=active]:text-primary-foreground data-[state=active]:shadow-md px-3 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm font-medium gap-1.5 sm:gap-2"
              data-testid="tab-recurring-invoices"
            >
              <RefreshCw className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span>Автоматические</span>
            </TabsTrigger>
          </TabsList>
          
          <ViewModeToggle 
            value={viewMode}
            onValueChange={setViewMode}
            className="hidden sm:flex self-end sm:self-auto"
          />
        </div>

        <AnimatePresence mode="wait">
          <TabsContent value="all" className="mt-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <AdminInvoicesList 
                viewMode={viewMode}
                initialStatusFilter={showAlerts ? 'overdue' : undefined}
              />
            </motion.div>
          </TabsContent>
        </AnimatePresence>

        <AnimatePresence mode="wait">
          <TabsContent value="recurring" className="mt-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <RecurringInvoicesManager />
            </motion.div>
          </TabsContent>
        </AnimatePresence>
      </Tabs>
    </DashboardLayout>
  );
};

export default InvoicesListPage;
