import { useEffect, useState, useCallback } from "react";
import { PartnerDebtCard } from "./PartnerDebtCard";
import { PartnerInvoicesDetail } from "./PartnerInvoicesDetail";
import { PartnerPaymentHistory } from "../partner/PartnerPaymentHistory";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, FileText, History } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

interface PartnerDebtSummary {
  partnerId: string;
  partnerName: string;
  totalToTransfer: number;
  totalPaid: number;
  remaining: number;
  invoiceCount: number;
}

interface PartnerDebtDashboardProps {
  showTitle?: boolean;
  className?: string;
}

export const PartnerDebtDashboard = ({ 
  showTitle = true,
  className 
}: PartnerDebtDashboardProps) => {
  const { isAuthenticated } = useAuth();
  const [summaries, setSummaries] = useState<PartnerDebtSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPartnerId, setExpandedPartnerId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    
    try {
      const response = await fetch('/api/partner-debt', {
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        setSummaries(data);
      } else if (response.status !== 401 && response.status !== 403) {
        console.error("Error fetching partner debt data:", await response.text());
      }
    } catch (error) {
      console.error("Error fetching partner debt data:", error);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleExpand = (partnerId: string) => {
    setExpandedPartnerId(expandedPartnerId === partnerId ? null : partnerId);
  };

  const totalRemaining = summaries.reduce((sum, s) => sum + s.remaining, 0);
  const totalPaid = summaries.reduce((sum, s) => sum + s.totalPaid, 0);

  if (loading) {
    return (
      <div 
        className={cn(
          "bg-white dark:bg-card border border-black/[0.06] dark:border-white/[0.06]",
          "rounded-2xl p-6 shadow-standard",
          className
        )}
      >
        {showTitle && <Skeleton className="h-7 w-48 mb-6" />}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div 
              key={i}
              className="bg-muted/30 border border-black/[0.06] dark:border-white/[0.06] rounded-xl p-5"
            >
              <div className="flex items-center gap-3 mb-4">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-20" />
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-28" />
                </div>
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-black/[0.06]">
                <Skeleton className="h-9 w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (summaries.length === 0) {
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
            Оплаты от партнёров
          </h3>
        )}
        <EmptyState
          icon={Users}
          title="Нет партнёров с долгами"
          description="Когда клиенты оплатят счета, здесь появятся долги партнёров"
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
        data-testid="partner-debt-dashboard"
      >
        {showTitle && (
          <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
            <h3 
              className="text-[22px] font-semibold text-foreground"
              style={{ letterSpacing: "-0.2px" }}
            >
              Оплаты от партнёров
            </h3>
            <div className="flex gap-4 text-[14px]">
              <div>
                <span className="text-muted-foreground">Оплачено: </span>
                <span className="font-semibold" style={{ color: "#34C759" }}>
                  {formatCurrency(totalPaid)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">К получению: </span>
                <span className="font-semibold" style={{ color: "#FF3B30" }}>
                  {formatCurrency(totalRemaining)}
                </span>
              </div>
            </div>
          </div>
        )}
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {summaries.map((summary) => (
            <PartnerDebtCard
              key={summary.partnerId}
              summary={{
                partner_id: summary.partnerId,
                partner_name: summary.partnerName,
                total_to_transfer: summary.totalToTransfer,
                total_paid: summary.totalPaid,
                remaining: summary.remaining,
                invoice_count: summary.invoiceCount,
              }}
              onExpand={() => handleExpand(summary.partnerId)}
              isExpanded={expandedPartnerId === summary.partnerId}
            >
              <Tabs defaultValue="payments" className="mt-4">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="payments" className="flex items-center gap-2">
                    <History className="h-4 w-4" />
                    История платежей
                  </TabsTrigger>
                  <TabsTrigger value="invoices" className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Счета
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="payments" className="mt-4">
                  <PartnerPaymentHistory 
                    partnerId={summary.partnerId} 
                    showTitle={false}
                    compact={true}
                  />
                </TabsContent>
                <TabsContent value="invoices" className="mt-4">
                  <PartnerInvoicesDetail
                    partnerId={summary.partnerId}
                    partnerName={summary.partnerName}
                    onPaymentRecorded={fetchData}
                  />
                </TabsContent>
              </Tabs>
            </PartnerDebtCard>
          ))}
        </div>
      </div>
    </>
  );
};
