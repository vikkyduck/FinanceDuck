import { useState, useEffect } from "react";
import { AppleTransactionCard } from "./AppleTransactionCard";
import { InvoiceDetailsDialog } from "../InvoiceDetailsDialog";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

interface AdminTransactionsListProps {
  limit?: number;
  showTitle?: boolean;
  className?: string;
}

export const AdminTransactionsList = ({ 
  limit = 10, 
  showTitle = true,
  className 
}: AdminTransactionsListProps) => {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const fetchInvoices = async () => {
    try {
      const { data, error } = await supabase
        .from("invoices")
        .select(`
          *,
          partners (id, name),
          clients (id, name)
        `)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      setInvoices(data || []);
    } catch (error) {
      console.error("Error fetching invoices:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, [limit]);

  useRealtimeSubscription({
    channelName: "admin_transactions_list",
    table: "invoices",
    event: "*",
    onUpdate: fetchInvoices,
    enabled: true,
  });

  const handleViewDetails = (id: string) => {
    setSelectedInvoiceId(id);
    setDetailsOpen(true);
  };

  const handleCloseDetails = () => {
    setDetailsOpen(false);
    setTimeout(() => setSelectedInvoiceId(null), 200);
  };

  if (loading) {
    return (
      <div 
        className={cn(
          "bg-white dark:bg-card border border-black/[0.06] dark:border-white/[0.06]",
          "rounded-2xl p-6 shadow-standard",
          className
        )}
      >
        {showTitle && (
          <Skeleton className="h-7 w-48 mb-6" />
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div 
              key={i}
              className="bg-muted/30 border border-black/[0.06] dark:border-white/[0.06] rounded-xl p-5"
            >
              <div className="flex justify-between mb-4">
                <div className="space-y-2">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-20" />
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-black/[0.06]">
                <Skeleton className="h-4 w-32" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div 
        className={cn(
          "bg-white dark:bg-card border border-black/[0.06] dark:border-white/[0.06]",
          "rounded-2xl p-6 shadow-standard",
          className
        )}
      >
        {showTitle && (
          <h3 
            className="mb-6 text-[22px] font-semibold text-foreground"
            style={{ letterSpacing: "-0.2px" }}
          >
            Все транзакции
          </h3>
        )}
        <EmptyState
          icon={FileText}
          title="Транзакции отсутствуют"
          description="Создайте первый счёт, чтобы начать работу"
        />
      </div>
    );
  }

  return (
    <>
      <div 
        className={cn(
          "bg-white dark:bg-card border border-black/[0.06] dark:border-white/[0.06]",
          "rounded-2xl p-6 shadow-standard",
          className
        )}
        data-testid="admin-transactions-list"
      >
        {showTitle && (
          <h3 
            className="mb-6 text-[22px] font-semibold text-foreground"
            style={{ letterSpacing: "-0.2px" }}
          >
            Все транзакции
          </h3>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {invoices.map((invoice) => (
            <AppleTransactionCard
              key={invoice.id}
              invoice={invoice}
              onViewDetails={handleViewDetails}
            />
          ))}
        </div>
      </div>

      <InvoiceDetailsDialog
        invoiceId={selectedInvoiceId}
        open={detailsOpen}
        onOpenChange={handleCloseDetails}
        canEdit={true}
        userRole="admin"
      />
    </>
  );
};
