import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { apiGet, apiPatch } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { SignedActsSection } from "@/components/invoices/SignedActsSection";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { useDownloadReport } from "@/hooks/useDownloadReport";
import { useReportPreview } from "@/hooks/useReportPreview";
import { ReportPreviewDialog } from "@/components/shared/ReportPreviewDialog";

interface Invoice {
  id: string;
  invoiceNumber: string | null;
  status: string;
  scheme: string;
  paymentDate: string | null;
  issueDate: string | null;
  notes: string | null;
  hideFromAssistant: boolean;
  clientId: string;
  partnerId: string;
  calculations?: {
    clientBill: string | null;
    partnerReward: string | null;
    adminShare50: string | null;
    catShare50: string | null;
    netProfitAdmin: string | null;
    expensesPaidByPartner: string | null;
    expensesPaidByAdmin: string | null;
    partnerTransferDue: string | null;
  };
  client?: { name: string };
  partner?: { name: string };
}

interface Expense {
  id: string;
  description: string;
  amount: string;
  paidBy: string;
}

const statusLabels: Record<string, string> = {
  draft: "Черновик",
  sent: "Отправлен",
  paid: "Оплачен",
  cancelled: "Отменен",
};

const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary",
  sent: "outline",
  paid: "default",
  cancelled: "destructive",
};

export default function InvoicePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { role, partnerId: authPartnerId, clientId: authClientId } = useAuth();
  const { toast } = useToast();
  const isAdmin = role === "admin";
  const isPartner = role === "partner";
  const isClient = role === "client";

  const { download: downloadReport, isDownloadingKey } = useDownloadReport();
  const downloading = isDownloadingKey();
  const { previewing, previewOpen, preview, fetchPreview, closePreview, confirmDownload } = useReportPreview();

  const { data: invoice, isLoading: invoiceLoading } = useQuery<Invoice>({
    queryKey: ['/api/invoices', id],
    queryFn: () => apiGet<Invoice>(`/invoices/${id}`),
    enabled: !!id,
  });

  const handleDownloadClientReport = () => {
    if (!id) return;
    fetchPreview({ invoiceId: id }, () => {
      downloadReport({
        url: '/api/admin/export/client-report',
        body: { invoiceId: id },
      });
    });
  };

  const { data: expenses = [] } = useQuery<Expense[]>({
    queryKey: ['/api/invoices', id, 'expenses'],
    queryFn: () => apiGet<Expense[]>(`/invoices/${id}/expenses`).catch(() => []),
    enabled: !!id,
  });

  const handleStatusChange = async (newStatus: string) => {
    if (!id) return;
    try {
      await apiPatch(`/invoices/${id}`, { status: newStatus });
      queryClient.invalidateQueries({ queryKey: ['/api/invoices', id] });
      queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
      toast({ title: "Статус обновлен" });
    } catch (error) {
      toast({ title: "Ошибка", description: "Не удалось обновить статус", variant: "destructive" });
    }
  };

  const goBack = () => {
    if (window.history.length > 2) {
      navigate(-1);
    } else {
      navigate('/invoices');
    }
  };

  if (invoiceLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="p-6">
        <Button variant="ghost" onClick={goBack} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Назад
        </Button>
        <div className="text-center text-muted-foreground">
          Счет не найден
        </div>
      </div>
    );
  }

  const calc = invoice.calculations;
  const clientBill = parseFloat(calc?.clientBill || '0');
  const partnerReward = parseFloat(calc?.partnerReward || '0');
  const netProfitAdmin = parseFloat(calc?.netProfitAdmin || '0');
  const expensesPaidByPartner = parseFloat(calc?.expensesPaidByPartner || '0');
  const expensesPaidByAdmin = parseFloat(calc?.expensesPaidByAdmin || '0');
  const totalExpenses = expensesPaidByPartner + expensesPaidByAdmin;

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-4 sm:space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <Button variant="ghost" size="icon" onClick={goBack} data-testid="button-back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-semibold">
            Счет {invoice.invoiceNumber ? `№ ${invoice.invoiceNumber}` : '(без номера)'}
          </h1>
          <p className="text-sm text-muted-foreground">
            Детальная информация по счету
          </p>
        </div>
        {(isAdmin || (isPartner && invoice.partnerId === authPartnerId) || (isClient && invoice.clientId === authClientId)) && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadClientReport}
            disabled={downloading || previewing}
            data-testid="button-download-client-report"
          >
            {previewing || downloading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            {isClient ? "Скачать отчёт" : "Отчёт для клиента"}
          </Button>
        )}
        <ReportPreviewDialog
          open={previewOpen}
          onClose={closePreview}
          onConfirm={confirmDownload}
          preview={preview}
          downloading={downloading}
        />
      </div>

      {/* Invoice Info */}
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">Информация о счете</CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-sm text-muted-foreground">Клиент</span>
              <p className="font-medium">{invoice.client?.name || 'Не указан'}</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Партнер</span>
              <p className="font-medium">{invoice.partner?.name || 'Не указан'}</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Дата создания</span>
              <p className="font-medium">
                {invoice.issueDate 
                  ? format(new Date(invoice.issueDate), 'dd.MM.yyyy', { locale: ru })
                  : 'Не указана'}
              </p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Статус</span>
              <div className="mt-1">
                <Badge variant={statusColors[invoice.status] || 'secondary'}>
                  {statusLabels[invoice.status] || invoice.status}
                </Badge>
              </div>
            </div>
            {invoice.paymentDate && (
              <div>
                <span className="text-sm text-muted-foreground">Дата оплаты</span>
                <p className="font-medium">
                  {format(new Date(invoice.paymentDate), 'dd.MM.yyyy', { locale: ru })}
                </p>
              </div>
            )}
            {invoice.notes && (
              <div className="col-span-2">
                <span className="text-sm text-muted-foreground">Примечания</span>
                <p className="font-medium">{invoice.notes}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Calculations */}
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">Расчеты</CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Счет клиенту:</span>
            <span className="font-semibold text-lg">{formatCurrency(clientBill)}</span>
          </div>
          
          {isAdmin && (
            <>
              <Separator />
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Вознаграждение партнера:</span>
                <span className="font-medium">{formatCurrency(partnerReward)}</span>
              </div>
              {totalExpenses > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Расходы:</span>
                  <span className="font-medium text-muted-foreground">{formatCurrency(totalExpenses)}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Чистая прибыль:</span>
                <span className="font-semibold text-primary">{formatCurrency(netProfitAdmin)}</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Expenses */}
      {expenses.length > 0 && (
        <Card>
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-base sm:text-lg">Расходы</CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
            <div className="space-y-2">
              {expenses.map(expense => (
                <div key={expense.id} className="flex justify-between items-center p-2 bg-muted/30 rounded-md">
                  <div>
                    <span className="text-sm font-medium">{expense.description}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      ({expense.paidBy === 'partner' ? 'Партнер' : 'Админ'})
                    </span>
                  </div>
                  <span className="text-sm">{formatCurrency(parseFloat(expense.amount))}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Signed Acts */}
      {id && role && (
        <SignedActsSection 
          invoiceId={id} 
          userRole={role}
          canEdit={isAdmin}
        />
      )}

      {/* Actions */}
      {isAdmin && invoice.status !== 'paid' && invoice.status !== 'cancelled' && (
        <Card>
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-base sm:text-lg">Действия</CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
            <div className="flex flex-wrap gap-2">
              {invoice.status === 'draft' && (
                <Button onClick={() => handleStatusChange('sent')} data-testid="button-mark-sent">
                  Отправить
                </Button>
              )}
              {invoice.status === 'sent' && (
                <Button onClick={() => handleStatusChange('paid')} data-testid="button-mark-paid">
                  Отметить оплаченным
                </Button>
              )}
              <Button 
                variant="destructive" 
                onClick={() => handleStatusChange('cancelled')}
                data-testid="button-cancel"
              >
                Отменить
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
