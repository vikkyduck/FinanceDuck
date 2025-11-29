import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { useStaggerAnimation } from "@/hooks/useStaggerAnimation";
import { Skeleton } from "@/components/ui/skeleton";
import { useVisibilityAwareInterval } from "@/hooks/useVisibilityAwareInterval";

interface Payment {
  id: string;
  amount: number;
  paymentDate: string;
  notes: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
}

export const PartnerPaymentsList = () => {
  const { partnerId, isLoading: authLoading } = useAuth();
  const refetchInterval = useVisibilityAwareInterval();

  const { data: payments = [], isLoading, error } = useQuery<Payment[]>({
    queryKey: ["/api/partner/payments"],
    queryFn: () => apiGet<Payment[]>("/partner/payments"),
    enabled: !authLoading && !!partnerId,
    refetchInterval,
  });

  const { setRef } = useStaggerAnimation(payments.length, 50);

  if (isLoading || authLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (error) {
    return <div className="text-center py-4 text-destructive">Ошибка загрузки платежей</div>;
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
              data-testid={`payment-row-${payment.id}`}
            >
              <TableCell className="table-cell-highlight">
                {format(new Date(payment.paymentDate), 'dd.MM.yyyy')}
              </TableCell>
              <TableCell className="text-right font-medium text-green-600 table-cell-highlight">
                {formatCurrency(payment.amount)}
              </TableCell>
              <TableCell className="table-cell-highlight">
                {payment.invoiceNumber ? `№ ${payment.invoiceNumber}` : '-'}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground table-cell-highlight">
                {payment.notes || '-'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
