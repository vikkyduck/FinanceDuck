import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { PartnerDebtCard } from "./PartnerDebtCard";
import { PartnerInvoicesDetail } from "./PartnerInvoicesDetail";
import { RecordPaymentDialog } from "./RecordPaymentDialog";
import { Button } from "@/components/ui/button";
import { RefreshCw, Plus, Loader2, FileText } from "lucide-react";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { useStaggerAnimation } from "@/hooks/useStaggerAnimation";

interface PartnerDebtSummary {
  partnerId: string;
  partnerName: string;
  totalToTransfer: number;
  totalPaid: number;
  remaining: number;
  invoiceCount: number;
  paidCommission: number;
  totalInvoiceCount: number;
  email: string | null;
  phone: string | null;
}

export const PartnerDebtDashboard = () => {
  const navigate = useNavigate();
  const [expandedPartnerId, setExpandedPartnerId] = useState<string | null>(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState<PartnerDebtSummary | null>(null);
  const queryClient = useQueryClient();
  
  const openPartnerInvoices = (partnerId: string) => {
    navigate(`/stats?tab=invoices&partnerId=${partnerId}`);
  };

  const { data: summaries = [], isLoading, refetch, isFetching } = useQuery<PartnerDebtSummary[]>({
    queryKey: ["/api/partner-debt"],
    queryFn: () => apiGet<PartnerDebtSummary[]>("/partner-debt"),
    refetchInterval: 120000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    let isVisible = document.visibilityState === 'visible';
    
    const handleVisibilityChange = () => {
      isVisible = document.visibilityState === 'visible';
      if (isVisible) refetch();
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refetch]);

  const { setRef } = useStaggerAnimation(summaries.length, 80);

  const handleRecordPayment = useCallback((partner: PartnerDebtSummary) => {
    setSelectedPartner(partner);
    setPaymentDialogOpen(true);
  }, []);

  const handlePaymentSuccess = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/partner-debt"] });
    queryClient.invalidateQueries({ queryKey: ["/api/partner-payments"] });
    refetch();
  }, [queryClient, refetch]);

  const partnersWithDebt = summaries.filter(s => s.totalToTransfer > 0);
  const totalRemaining = summaries.reduce((sum, s) => sum + s.remaining, 0);
  const totalDebt = summaries.reduce((sum, s) => sum + s.totalToTransfer, 0);
  const totalPaid = summaries.reduce((sum, s) => sum + s.totalPaid, 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (summaries.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Нет партнёров в системе
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg sm:text-xl font-semibold">Расчёты с партнёрами</h2>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {partnersWithDebt.length} из {summaries.length} партнёров с активным долгом
          </p>
        </div>
        
        <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center sm:gap-4 w-full sm:w-auto">
          <div className="text-left sm:text-right">
            <div className="text-xs sm:text-sm text-muted-foreground">Общий долг</div>
            <div className="text-sm sm:text-lg font-semibold break-words">{formatCurrency(totalDebt)}</div>
          </div>
          <div className="text-left sm:text-right">
            <div className="text-xs sm:text-sm text-muted-foreground">Оплачено</div>
            <div className="text-sm sm:text-lg font-semibold text-green-600 break-words">{formatCurrency(totalPaid)}</div>
          </div>
          <div className="text-left sm:text-right">
            <div className="text-xs sm:text-sm text-muted-foreground">Остаток</div>
            <div className="text-sm sm:text-lg font-semibold text-red-600 break-words">{formatCurrency(totalRemaining)}</div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid="button-refresh-partner-debt"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            Обновить
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        {summaries.map((summary, index) => (
          <div 
            key={summary.partnerId} 
            ref={setRef(index)}
            className="opacity-0 animate-in fade-in slide-in-from-bottom-4 duration-300"
            style={{ animationDelay: `${index * 80}ms`, animationFillMode: 'forwards' }}
          >
            <PartnerDebtCard
              summary={{
                partner_id: summary.partnerId,
                partner_name: summary.partnerName,
                total_to_transfer: summary.totalToTransfer,
                total_paid: summary.totalPaid,
                remaining: summary.remaining,
                invoice_count: summary.invoiceCount,
              }}
              isExpanded={expandedPartnerId === summary.partnerId}
              onExpand={() => setExpandedPartnerId(
                expandedPartnerId === summary.partnerId ? null : summary.partnerId
              )}
            >
              <div className="pt-4 space-y-3">
                <PartnerInvoicesDetail
                  partnerId={summary.partnerId}
                  partnerName={summary.partnerName}
                  onPaymentRecorded={handlePaymentSuccess}
                />
                <div className="flex flex-col gap-2">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={(e) => {
                      e.stopPropagation();
                      openPartnerInvoices(summary.partnerId);
                    }}
                    data-testid={`button-view-invoices-${summary.partnerId}`}
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Все счета
                  </Button>
                  {summary.totalToTransfer > 0 && (
                    <Button
                      className="w-full"
                      onClick={() => handleRecordPayment(summary)}
                      data-testid={`button-record-payment-card-${summary.partnerId}`}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Записать приход
                    </Button>
                  )}
                </div>
              </div>
            </PartnerDebtCard>
          </div>
        ))}
      </div>

      {selectedPartner && (
        <RecordPaymentDialog
          open={paymentDialogOpen}
          onOpenChange={setPaymentDialogOpen}
          partnerId={selectedPartner.partnerId}
          partnerName={selectedPartner.partnerName}
          remaining={selectedPartner.remaining}
          onSuccess={handlePaymentSuccess}
        />
      )}
    </div>
  );
};
