import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ensureSessionContext } from "@/lib/supabaseHelpers";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Wallet, CheckCircle } from "lucide-react";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { RecordPaymentDialog } from "./RecordPaymentDialog";
import { useStaggerAnimation } from "@/hooks/useStaggerAnimation";
import { cn } from "@/lib/utils";

interface PartnerPaymentSummary {
  partner_id: string;
  partner_name: string;
  total_to_transfer: number;
  total_paid: number;
  remaining: number;
}

export const PartnerPaymentsManager = () => {
  const [summaries, setSummaries] = useState<PartnerPaymentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPartner, setSelectedPartner] = useState<PartnerPaymentSummary | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { setRef } = useStaggerAnimation(summaries.length, 50);

  const fetchData = async () => {
    setLoading(true);
    try {
      await ensureSessionContext();

      // Получаем все счета с расчётами по обеим схемам
      const { data: invoices, error: invoicesError } = await supabase
      .from("invoices")
      .select(`
        partner_id,
        scheme,
        partners(name),
        invoice_calculations(
          client_bill,
          amount_to_admin,
          admin_share_from_margin,
          partner_share_from_margin,
          commission_amount,
          executor_expenses_total
        )
      `);

    if (invoicesError) {
      console.error("Error fetching invoices:", invoicesError);
      setLoading(false);
      return;
    }

    // Получаем все платежи партнёров
    const { data: payments, error: paymentsError } = await supabase
      .from("partner_payments")
      .select("partner_id, amount");

    if (paymentsError) {
      console.error("Error fetching payments:", paymentsError);
      setLoading(false);
      return;
    }

    // Агрегируем данные по партнёрам
    const partnerMap = new Map<string, PartnerPaymentSummary>();

    invoices?.forEach((invoice: any) => {
      const partnerId = invoice.partner_id;
      const partnerName = invoice.partners?.name || "Unknown";
      const calc = invoice.invoice_calculations?.[0];

      if (!calc) return;

      // Во всех схемах используем единое поле amount_to_admin,
      // которое уже посчитано на бэкенде триггером recalculate_invoice_totals
      const amountToAdminForInvoice = Number(calc.amount_to_admin) || 0;

      if (!partnerMap.has(partnerId)) {
        partnerMap.set(partnerId, {
          partner_id: partnerId,
          partner_name: partnerName,
          total_to_transfer: 0,
          total_paid: 0,
          remaining: 0,
        });
      }

      const summary = partnerMap.get(partnerId)!;
      summary.total_to_transfer += amountToAdminForInvoice;
    });

    // Добавляем оплаченные суммы
    payments?.forEach((payment: any) => {
      if (partnerMap.has(payment.partner_id)) {
        const summary = partnerMap.get(payment.partner_id)!;
        summary.total_paid += Number(payment.amount);
      }
    });

    // Вычисляем остаток и сортируем по убыванию остатка
    const summariesArray = Array.from(partnerMap.values())
      .map((summary) => ({
        ...summary,
        remaining: Math.max(0, summary.total_to_transfer - summary.total_paid),
      }))
      .filter((summary) => summary.total_to_transfer > 0) // Показываем только тех, у кого есть долг
      .sort((a, b) => b.remaining - a.remaining);

      setSummaries(summariesArray);
    } catch (error) {
      console.error("Error fetching partner payments data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRecordPayment = (partner: PartnerPaymentSummary) => {
    setSelectedPartner(partner);
    setDialogOpen(true);
  };

  const handleSuccess = () => {
    fetchData();
  };

  if (loading) {
    return <div className="text-center py-4">Загрузка...</div>;
  }

  if (summaries.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Нет партнёров с долгами по комиссионной схеме
      </div>
    );
  }

  const totalRemaining = summaries.reduce((sum, s) => sum + s.remaining, 0);

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        Всего должны партнёры: <span className="font-semibold text-foreground">{formatCurrency(totalRemaining)}</span>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Партнёр</TableHead>
            <TableHead className="text-right">Долг</TableHead>
            <TableHead className="text-right">Оплачено</TableHead>
            <TableHead className="text-right">Осталось</TableHead>
            <TableHead className="text-right">Действие</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {summaries.map((summary, index) => (
            <TableRow 
              key={summary.partner_id} 
              ref={setRef(index)}
              className="table-row-hover"
            >
              <TableCell className="font-medium table-cell-highlight">{summary.partner_name}</TableCell>
              <TableCell className="text-right table-cell-highlight">
                {formatCurrency(summary.total_to_transfer)}
              </TableCell>
              <TableCell className="text-right text-green-600 table-cell-highlight">
                {formatCurrency(summary.total_paid)}
              </TableCell>
              <TableCell className={cn(
                "text-right font-semibold table-cell-highlight",
                summary.remaining > 0 ? 'text-red-600' : 'text-green-600'
              )}>
                {formatCurrency(summary.remaining)}
              </TableCell>
              <TableCell className="text-right">
                {summary.remaining > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRecordPayment(summary)}
                    className="hover:scale-105 transition-transform"
                  >
                    Записать выплату
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {selectedPartner && (
        <RecordPaymentDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          partnerId={selectedPartner.partner_id}
          partnerName={selectedPartner.partner_name}
          remaining={selectedPartner.remaining}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
};
