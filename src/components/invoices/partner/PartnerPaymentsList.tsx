import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { useStaggerAnimation } from "@/hooks/useStaggerAnimation";
import { ensureSessionContext } from "@/lib/supabaseHelpers";

interface Payment {
  id: string;
  amount: number;
  payment_date: string;
  notes: string | null;
  invoice_id: string | null;
  invoice_number?: string;
}

export const PartnerPaymentsList = () => {
  const { partnerId, isLoading: authLoading } = useAuth();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { setRef } = useStaggerAnimation(payments.length, 50);

  useEffect(() => {
    if (authLoading) return;

    if (!partnerId) {
      setLoading(false);
      return;
    }

    fetchPayments();
  }, [authLoading, partnerId]);

  useEffect(() => {
    if (authLoading || !partnerId) return;

    const channel = supabase
      .channel('partner_payments_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'partner_payments',
          filter: `partner_id=eq.${partnerId}`
        },
        () => {
          fetchPayments();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [authLoading, partnerId]);

  const fetchPayments = async () => {
    try {
      setLoading(true);
      setError(null);

      // Ensure session context so RLS works for partner
      // before loading invoices and payments
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      await ensureSessionContext();

      // Получаем invoice_ids для партнёра
      const invoicesRes = await supabase
        .from("invoices")
        .select("id, invoice_number")
        .eq("partner_id", partnerId);

      if (invoicesRes.error) throw invoicesRes.error;

      const invoices = invoicesRes.data || [];
      const invoiceIds = invoices.map((inv) => inv.id);
      const invoiceMap = new Map(invoices.map((inv) => [inv.id, inv.invoice_number]));

      // Получаем платежи через два канала и объединяем
      const paymentsMap = new Map<string, Payment>();

      // A) Платежи по invoice_id
      if (invoiceIds.length > 0) {
        const paymentsByInvoiceRes = await supabase
          .from("partner_payments")
          .select("id, amount, payment_date, notes, invoice_id")
          .in("invoice_id", invoiceIds)
          .order("payment_date", { ascending: false });

        if (paymentsByInvoiceRes.error) throw paymentsByInvoiceRes.error;
        
        (paymentsByInvoiceRes.data || []).forEach((p) => {
          paymentsMap.set(p.id, {
            ...p,
            invoice_number: invoiceMap.get(p.invoice_id!),
          });
        });
      }

      // B) Платежи по partner_id (старые, без invoice_id)
      const paymentsByPartnerRes = await supabase
        .from("partner_payments")
        .select("id, amount, payment_date, notes, invoice_id")
        .eq("partner_id", partnerId)
        .order("payment_date", { ascending: false });

      if (paymentsByPartnerRes.error) throw paymentsByPartnerRes.error;

      (paymentsByPartnerRes.data || []).forEach((p) => {
        if (!paymentsMap.has(p.id)) {
          paymentsMap.set(p.id, {
            ...p,
            invoice_number: p.invoice_id ? invoiceMap.get(p.invoice_id) : undefined,
          });
        }
      });

      // Сортируем по дате
      const allPayments = Array.from(paymentsMap.values()).sort(
        (a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime()
      );

      setPayments(allPayments);
    } catch (err: any) {
      console.error("Error fetching partner payments:", err);
      setError(err.message || "Не удалось загрузить платежи");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-4 text-muted-foreground">Загрузка платежей...</div>;
  }

  if (error) {
    return <div className="text-center py-4 text-destructive">Ошибка: {error}</div>;
  }

  if (payments.length === 0) {
    return <div className="text-center py-4 text-muted-foreground">Платежей пока нет</div>;
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Дата</TableHead>
            <TableHead>Сумма</TableHead>
            <TableHead>Счёт</TableHead>
            <TableHead>Примечание</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {payments.map((payment, index) => (
            <TableRow 
              key={payment.id} 
              ref={setRef(index)}
              className="table-row-hover"
            >
              <TableCell className="table-cell-highlight">
                {format(new Date(payment.payment_date), 'dd.MM.yyyy')}
              </TableCell>
              <TableCell className="text-right font-medium text-green-600 table-cell-highlight">
                {formatCurrency(payment.amount)}
              </TableCell>
              <TableCell className="table-cell-highlight">
                {payment.invoice_number ? `№ ${payment.invoice_number}` : '—'}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground table-cell-highlight">
                {payment.notes || '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
