import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ensureSessionContext } from "@/lib/supabaseHelpers";
import { PartnerDebtCard } from "./PartnerDebtCard";
import { PartnerInvoicesDetail } from "./PartnerInvoicesDetail";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { Skeleton } from "@/components/ui/skeleton";
import { Users } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { cn } from "@/lib/utils";

interface PartnerDebtSummary {
  partner_id: string;
  partner_name: string;
  total_to_transfer: number;
  total_paid: number;
  remaining: number;
  invoice_count: number;
}

interface PartnerDebtDashboardProps {
  showTitle?: boolean;
  className?: string;
}

export const PartnerDebtDashboard = ({ 
  showTitle = true,
  className 
}: PartnerDebtDashboardProps) => {
  const [summaries, setSummaries] = useState<PartnerDebtSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPartnerId, setExpandedPartnerId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      await ensureSessionContext();

      const { data: invoices, error: invoicesError } = await supabase
        .from("invoices")
        .select(`
          partner_id,
          scheme,
          status,
          partners(name),
          invoice_calculations(
            client_bill,
            partner_share_from_margin,
            commission_amount
          )
        `)
        .eq("status", "paid");

      if (invoicesError) {
        console.error("Error fetching invoices:", invoicesError);
        setLoading(false);
        return;
      }

      const { data: payments, error: paymentsError } = await supabase
        .from("partner_payments")
        .select("partner_id, amount");

      if (paymentsError) {
        console.error("Error fetching payments:", paymentsError);
        setLoading(false);
        return;
      }

      const partnerMap = new Map<string, PartnerDebtSummary>();

      invoices?.forEach((invoice: any) => {
        const partnerId = invoice.partner_id;
        const partnerName = invoice.partners?.name || "Unknown";
        const calc = invoice.invoice_calculations?.[0];
        const scheme = invoice.scheme;

        if (!calc) return;

        const clientBill = Number(calc.client_bill) || 0;
        let partnerCommission = 0;
        
        if (scheme === 'agency_30') {
          partnerCommission = Number(calc.partner_share_from_margin) || 0;
        } else if (scheme === 'commission_based') {
          partnerCommission = Number(calc.commission_amount) || 0;
        }
        
        const debtToAdmin = clientBill - partnerCommission;

        if (!partnerMap.has(partnerId)) {
          partnerMap.set(partnerId, {
            partner_id: partnerId,
            partner_name: partnerName,
            total_to_transfer: 0,
            total_paid: 0,
            remaining: 0,
            invoice_count: 0,
          });
        }

        const summary = partnerMap.get(partnerId)!;
        summary.total_to_transfer += debtToAdmin;
        summary.invoice_count += 1;
      });

      payments?.forEach((payment: any) => {
        if (partnerMap.has(payment.partner_id)) {
          const summary = partnerMap.get(payment.partner_id)!;
          summary.total_paid += Number(payment.amount);
        }
      });

      const summariesArray = Array.from(partnerMap.values())
        .map((summary) => ({
          ...summary,
          remaining: Math.max(0, summary.total_to_transfer - summary.total_paid),
        }))
        .filter((summary) => summary.total_to_transfer > 0)
        .sort((a, b) => b.remaining - a.remaining);

      setSummaries(summariesArray);
    } catch (error) {
      console.error("Error fetching partner debt data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useRealtimeSubscription({
    channelName: 'partner_debt_dashboard_payments',
    table: 'partner_payments',
    onUpdate: fetchData,
    enabled: true,
  });

  useRealtimeSubscription({
    channelName: 'partner_debt_dashboard_invoices',
    table: 'invoices',
    onUpdate: fetchData,
    enabled: true,
  });

  const handleExpand = (partnerId: string) => {
    setExpandedPartnerId(expandedPartnerId === partnerId ? null : partnerId);
  };

  const totalRemaining = summaries.reduce((sum, s) => sum + s.remaining, 0);
  const totalPaid = summaries.reduce((sum, s) => sum + s.total_paid, 0);

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
              key={summary.partner_id}
              summary={summary}
              onExpand={() => handleExpand(summary.partner_id)}
              isExpanded={expandedPartnerId === summary.partner_id}
            >
              <PartnerInvoicesDetail
                partnerId={summary.partner_id}
                partnerName={summary.partner_name}
                onPaymentRecorded={fetchData}
              />
            </PartnerDebtCard>
          ))}
        </div>
      </div>
    </>
  );
};
