import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Check, FileText } from "lucide-react";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { showSuccess } from "@/lib/errorHandler";

interface PartnerInvoice {
  id: string;
  invoice_number: string | null;
  client_name: string;
  client_bill: number;
  partner_commission: number;
  debt_to_admin: number;
  paid_amount: number;
  remaining: number;
  status: string;
  created_at: string;
}

interface PartnerInvoicesDetailProps {
  partnerId: string;
  partnerName: string;
  onPaymentRecorded?: () => void;
}

export function PartnerInvoicesDetail({ partnerId, partnerName, onPaymentRecorded }: PartnerInvoicesDetailProps) {
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<PartnerInvoice | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: invoices = [], isLoading, isError, refetch } = useQuery<PartnerInvoice[]>({
    queryKey: ["/api/admin/partner-invoices", partnerId],
    queryFn: () => apiGet<PartnerInvoice[]>(`/admin/partner-invoices/${partnerId}`),
    enabled: !!partnerId,
    retry: 2,
  });

  const recordPaymentMutation = useMutation({
    mutationFn: async (data: { invoiceId: string; amount: number }) => {
      return apiPost("/partner-payments", {
        partnerId,
        invoiceId: data.invoiceId,
        amount: data.amount,
        paymentDate: new Date().toISOString().split('T')[0],
        notes: `Приход по счёту ${selectedInvoice?.invoice_number || data.invoiceId.slice(0, 8)}`,
      });
    },
    onSuccess: () => {
      showSuccess("Готово", `Приход записан`);
      setPaymentDialogOpen(false);
      setSelectedInvoice(null);
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/partner-invoices", partnerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/partner-payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/partner-debt"] });
      queryClient.invalidateQueries({ queryKey: ["/api/partner/payments"] });
      onPaymentRecorded?.();
    },
    onError: (error) => {
      toast({ title: "Ошибка", description: "Не удалось записать приход", variant: "destructive" });
      console.error("Error recording payment:", error);
    },
  });

  const handleRecordPayment = (invoice: PartnerInvoice) => {
    setSelectedInvoice(invoice);
    setPaymentAmount(invoice.remaining.toString());
    setPaymentDialogOpen(true);
  };

  const handleSavePayment = () => {
    if (!selectedInvoice) return;
    
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: "Ошибка", description: "Введите корректную сумму", variant: "destructive" });
      return;
    }

    if (amount > selectedInvoice.remaining) {
      toast({ title: "Ошибка", description: "Сумма не может превышать остаток долга", variant: "destructive" });
      return;
    }

    recordPaymentMutation.mutate({ invoiceId: selectedInvoice.id, amount });
  };

  if (isLoading) {
    return <div className="text-center py-4 text-sm text-muted-foreground">Загрузка счетов...</div>;
  }

  // Handle error gracefully
  if (isError) {
    return <div className="text-center py-4 text-sm text-muted-foreground">Ошибка загрузки счетов</div>;
  }

  if (invoices.length === 0) {
    return (
      <div className="text-center py-4 text-sm text-muted-foreground">
        Нет неоплаченных счетов
      </div>
    );
  }

  const totalDebt = invoices.reduce((sum, inv) => sum + inv.debt_to_admin, 0);
  const totalPaid = invoices.reduce((sum, inv) => sum + inv.paid_amount, 0);
  const totalRemaining = invoices.reduce((sum, inv) => sum + inv.remaining, 0);

  return (
    <div className="space-y-3 bg-muted/30 p-4 rounded-lg" data-testid={`partner-invoices-${partnerId}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 className="font-medium text-sm">Счета партнёра {partnerName}</h4>
        <div className="text-xs text-muted-foreground">
          Долг: {formatCurrency(totalDebt)} | Оплачено: {formatCurrency(totalPaid)} | Остаток: <span className="font-semibold text-red-600">{formatCurrency(totalRemaining)}</span>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-xs">Счёт</TableHead>
            <TableHead className="text-xs">Клиент</TableHead>
            <TableHead className="text-xs text-right">Долг</TableHead>
            <TableHead className="text-xs text-right">Оплачено</TableHead>
            <TableHead className="text-xs text-right">Остаток</TableHead>
            <TableHead className="text-xs text-right">Действие</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((invoice) => (
            <TableRow key={invoice.id} className="hover:bg-muted/50">
              <TableCell className="text-sm">
                <div className="flex items-center gap-2">
                  <FileText className="h-3 w-3 text-muted-foreground" />
                  {invoice.invoice_number || invoice.id.slice(0, 8)}
                </div>
              </TableCell>
              <TableCell className="text-sm">{invoice.client_name}</TableCell>
              <TableCell className="text-sm text-right">{formatCurrency(invoice.debt_to_admin)}</TableCell>
              <TableCell className="text-sm text-right text-green-600">{formatCurrency(invoice.paid_amount)}</TableCell>
              <TableCell className="text-sm text-right">
                {invoice.remaining > 0 ? (
                  <span className="text-red-600 font-medium">{formatCurrency(invoice.remaining)}</span>
                ) : (
                  <Badge variant="outline" className="gap-1 text-green-600 border-green-200">
                    <Check className="h-3 w-3" />
                    Оплачено
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                {invoice.remaining > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRecordPayment(invoice)}
                    data-testid={`button-pay-invoice-${invoice.id}`}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Приход
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Записать приход по счёту</DialogTitle>
            <DialogDescription>
              Счёт: {selectedInvoice?.invoice_number || selectedInvoice?.id.slice(0, 8)} - {selectedInvoice?.client_name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="flex justify-between gap-2 text-sm">
              <span className="text-muted-foreground">Долг по счёту:</span>
              <span>{formatCurrency(selectedInvoice?.debt_to_admin || 0)}</span>
            </div>
            <div className="flex justify-between gap-2 text-sm">
              <span className="text-muted-foreground">Уже оплачено:</span>
              <span className="text-green-600">{formatCurrency(selectedInvoice?.paid_amount || 0)}</span>
            </div>
            <div className="flex justify-between gap-2 text-sm font-medium">
              <span>Остаток:</span>
              <span className="text-red-600">{formatCurrency(selectedInvoice?.remaining || 0)}</span>
            </div>

            <div className="space-y-2 pt-2">
              <Label htmlFor="payment-amount">Сумма прихода</Label>
              <Input
                id="payment-amount"
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="0"
                data-testid="input-payment-amount"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>
              Отмена
            </Button>
            <Button onClick={handleSavePayment} disabled={recordPaymentMutation.isPending}>
              {recordPaymentMutation.isPending ? "Сохранение..." : "Записать приход"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
