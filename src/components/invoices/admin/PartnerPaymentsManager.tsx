import { useEffect, useState, useCallback } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Plus, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { RecordPaymentDialog } from "./RecordPaymentDialog";
import { PartnerInvoicesDetail } from "./PartnerInvoicesDetail";
import { useStaggerAnimation } from "@/hooks/useStaggerAnimation";
import { cn } from "@/lib/utils";
import { invoiceService } from "@/lib/services/invoices";

interface PartnerPaymentSummary {
  partnerId: string;
  partnerName: string;
  totalToTransfer: number;
  totalPaid: number;
  remaining: number;
  invoiceCount: number;
}

export const PartnerPaymentsManager = () => {
  const [summaries, setSummaries] = useState<PartnerPaymentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPartner, setSelectedPartner] = useState<PartnerPaymentSummary | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [expandedPartnerId, setExpandedPartnerId] = useState<string | null>(null);
  const { setRef } = useStaggerAnimation(summaries.length, 50);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invoiceService.getPartnerDebtSummaries();
      setSummaries(data);
    } catch (error) {
      console.error("Error fetching partner payments data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Poll for updates every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleRecordPayment = (partner: PartnerPaymentSummary) => {
    setSelectedPartner(partner);
    setDialogOpen(true);
  };

  const handleSuccess = () => {
    fetchData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (summaries.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Нет партнёров в системе
      </div>
    );
  }

  const totalRemaining = summaries.reduce((sum, s) => sum + s.remaining, 0);
  const partnersWithDebt = summaries.filter(s => s.totalToTransfer > 0);

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        Всего должны партнёры: <span className="font-semibold text-foreground">{formatCurrency(totalRemaining)}</span>
        <span className="ml-4">Партнёров в системе: {summaries.length}</span>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Партнёр</TableHead>
            <TableHead className="text-right">Счетов</TableHead>
            <TableHead className="text-right">Долг</TableHead>
            <TableHead className="text-right">Оплачено</TableHead>
            <TableHead className="text-right">Осталось</TableHead>
            <TableHead className="text-right">Действие</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {summaries.map((summary, index) => {
            const isExpanded = expandedPartnerId === summary.partnerId;
            return (
              <>
                <TableRow 
                  key={summary.partnerId} 
                  ref={setRef(index)}
                  className={cn("table-row-hover cursor-pointer", isExpanded && "bg-muted/50")}
                  onClick={() => setExpandedPartnerId(isExpanded ? null : summary.partnerId)}
                  data-testid={`row-partner-${summary.partnerId}`}
                >
                  <TableCell className="font-medium table-cell-highlight">
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                      {summary.partnerName}
                    </div>
                  </TableCell>
                  <TableCell className="text-right table-cell-highlight text-muted-foreground">
                    {summary.invoiceCount}
                  </TableCell>
                  <TableCell className="text-right table-cell-highlight">
                    {formatCurrency(summary.totalToTransfer)}
                  </TableCell>
                  <TableCell className="text-right text-green-600 dark:text-green-500 table-cell-highlight">
                    {formatCurrency(summary.totalPaid)}
                  </TableCell>
                  <TableCell className={cn(
                    "text-right font-semibold table-cell-highlight",
                    summary.remaining > 0 ? 'text-red-600 dark:text-red-500' : 'text-green-600 dark:text-green-500'
                  )}>
                    {formatCurrency(summary.remaining)}
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    {summary.totalToTransfer > 0 && (
                      <Button
                        size="sm"
                        onClick={() => handleRecordPayment(summary)}
                        data-testid={`button-record-payment-${summary.partnerId}`}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Записать приход
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
                {isExpanded && (
                  <TableRow key={`${summary.partnerId}-detail`}>
                    <TableCell colSpan={6} className="p-0">
                      <PartnerInvoicesDetail
                        partnerId={summary.partnerId}
                        partnerName={summary.partnerName}
                        onPaymentRecorded={fetchData}
                      />
                    </TableCell>
                  </TableRow>
                )}
              </>
            );
          })}
        </TableBody>
      </Table>

      {selectedPartner && (
        <RecordPaymentDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          partnerId={selectedPartner.partnerId}
          partnerName={selectedPartner.partnerName}
          remaining={selectedPartner.remaining}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
};
