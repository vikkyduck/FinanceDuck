import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { AdminInvoicesList } from "@/components/invoices/admin/AdminInvoicesList";
import { RecurringInvoicesManager } from "@/components/invoices/admin/RecurringInvoicesManager";
import { useAuth } from "@/hooks/useAuth";
import { AssistantDashboard } from "@/components/invoices/AssistantDashboard";
import { PartnerDashboard } from "@/components/invoices/PartnerDashboard";
import { ClientDashboard } from "@/components/invoices/ClientDashboard";
import { useViewMode } from "@/hooks/useViewMode";
import { useCollapsibleSections } from "@/hooks/useCollapsibleSections";
import { ViewModeToggle } from "@/components/shared/ViewModeToggle";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Maximize2, Minimize2, FileText } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";

const InvoicesListPage = () => {
  const { role, isLoading } = useAuth();
  const { viewMode, setViewMode } = useViewMode();
  const [searchParams] = useSearchParams();
  const showAlerts = searchParams.get('alerts') === 'true';

  const { isExpanded, toggleSection, expandAll, collapseAll } = useCollapsibleSections(
    "invoices-page-sections",
    {
      recurringInvoices: true,
      invoicesList: true,
    }
  );

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

      <div className="flex justify-end gap-1 mb-4">
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

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="space-y-6 pb-8"
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
    </DashboardLayout>
  );
};

export default InvoicesListPage;
