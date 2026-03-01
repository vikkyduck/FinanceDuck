import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, FileText, History, Link2, ExternalLink, X, Loader2, Download } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { CreateInvoiceDialog } from "./assistant/CreateInvoiceDialog";
import { InvoicesList } from "./assistant/InvoicesList";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { useExportMyInvoices } from "@/hooks/useExportMyInvoices";

interface ActionLog {
  id: string;
  actionType: string;
  description: string;
  createdAt: string;
  tokenCode?: string;
  tokenRole?: string;
  details?: string;
}

const ACTION_TYPE_LABELS: Record<string, string> = {
  create_invoice: "Создание счёта",
  update_invoice: "Обновление счёта",
  delete_invoice: "Удаление счёта",
  create_expense: "Создание расхода",
  update_expense: "Обновление расхода",
  delete_expense: "Удаление расхода",
  upload_act: "Загрузка акта",
  delete_act: "Удаление акта",
  other: "Другое",
};

export const AccountantDashboard = () => {
  const navigate = useNavigate();
  const { logout, csrfToken } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { viewMode, setViewMode } = useViewMode({ defaultMode: 'table' });
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("invoices");
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [docUrl, setDocUrl] = useState("");
  const { handleExport, isExporting } = useExportMyInvoices();

  const { data: logs } = useQuery<{ logs: ActionLog[]; total: number }>({
    queryKey: ['/api/accountant-logs'],
    queryFn: () => apiGet('/api/accountant-logs?limit=50'),
    enabled: activeTab === 'logs',
  });

  const { data: invoicesData } = useQuery<any[]>({
    queryKey: ['/api/invoices'],
    queryFn: () => apiGet('/api/invoices'),
  });

  const updateClosingDoc = useMutation({
    mutationFn: async ({ invoiceId, url }: { invoiceId: string; url: string | null }) => {
      const res = await fetch(`/api/invoices/${invoiceId}/closing-document`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken || '',
        },
        credentials: 'include',
        body: JSON.stringify({ closingDocumentUrl: url }),
      });
      if (!res.ok) throw new Error('Failed to update closing document');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
      queryClient.invalidateQueries({ queryKey: ['/api/accountant-logs'] });
      setEditingDocId(null);
      setDocUrl("");
      toast({ title: "Закрывающий документ обновлён" });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Ошибка", description: "Не удалось обновить документ" });
    },
  });

  const handleSaveDoc = (invoiceId: string) => {
    updateClosingDoc.mutate({ invoiceId, url: docUrl || null });
  };

  const handleRemoveDoc = (invoiceId: string) => {
    updateClosingDoc.mutate({ invoiceId, url: null });
  };

  return (
    <DashboardLayout>
      <DashboardHeader
        title="Бухгалтерия"
        subtitle="Управление счетами и закрывающими документами"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="invoices" data-testid="tab-accountant-invoices">
            <FileText className="h-4 w-4 mr-2" />
            Счета
          </TabsTrigger>
          <TabsTrigger value="documents" data-testid="tab-accountant-documents">
            <Link2 className="h-4 w-4 mr-2" />
            Документы
          </TabsTrigger>
          <TabsTrigger value="logs" data-testid="tab-accountant-logs">
            <History className="h-4 w-4 mr-2" />
            Журнал
          </TabsTrigger>
        </TabsList>

        <TabsContent value="invoices" className="space-y-6">
          <div className="flex gap-3 flex-wrap">
            <Button size="lg" onClick={() => setCreateDialogOpen(true)} data-testid="button-accountant-create-invoice">
              <Plus className="h-5 w-5 mr-2" />
              Создать счёт
            </Button>
            <Button 
              variant="outline" 
              size="lg"
              onClick={handleExport} 
              disabled={isExporting}
              data-testid="button-export-excel"
            >
              {isExporting ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <Download className="h-5 w-5 mr-2" />}
              <span className="hidden sm:inline">Выгрузить в Excel</span>
              <span className="sm:hidden">Excel</span>
            </Button>
          </div>

          <Card className="border-0 shadow-sm">
            <CardContent className="px-0 pt-4">
              <InvoicesList
                viewMode={viewMode}
                key={createDialogOpen ? 'dialog-open' : 'dialog-closed'}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Закрывающие документы</CardTitle>
            </CardHeader>
            <CardContent>
              {!invoicesData || invoicesData.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">Нет доступных счетов</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Счёт</TableHead>
                        <TableHead>Клиент</TableHead>
                        <TableHead>Статус</TableHead>
                        <TableHead>Документ</TableHead>
                        <TableHead className="text-right">Действия</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoicesData.map((invoice: any) => (
                        <TableRow key={invoice.id} data-testid={`row-closing-doc-${invoice.id}`}>
                          <TableCell className="font-medium">
                            {invoice.invoiceNumber || '—'}
                          </TableCell>
                          <TableCell>{invoice.client?.name || '—'}</TableCell>
                          <TableCell>
                            <Badge variant={invoice.status === 'paid' ? 'default' : 'secondary'}>
                              {invoice.status === 'paid' ? 'Оплачен' : invoice.status === 'sent' ? 'Отправлен' : invoice.status === 'draft' ? 'Черновик' : invoice.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {editingDocId === invoice.id ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  value={docUrl}
                                  onChange={(e) => setDocUrl(e.target.value)}
                                  placeholder="https://..."
                                  className="h-8 text-sm max-w-xs"
                                  data-testid={`input-closing-doc-${invoice.id}`}
                                />
                                <Button
                                  size="sm"
                                  onClick={() => handleSaveDoc(invoice.id)}
                                  disabled={updateClosingDoc.isPending}
                                  data-testid={`button-save-doc-${invoice.id}`}
                                >
                                  {updateClosingDoc.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Сохранить'}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => { setEditingDocId(null); setDocUrl(""); }}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            ) : invoice.closingDocumentUrl ? (
                              <a
                                href={invoice.closingDocumentUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline flex items-center gap-1 text-sm"
                                data-testid={`link-closing-doc-${invoice.id}`}
                              >
                                <ExternalLink className="h-3 w-3" />
                                Открыть
                              </a>
                            ) : (
                              <span className="text-muted-foreground text-sm">Не прикреплён</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingDocId(invoice.id);
                                setDocUrl(invoice.closingDocumentUrl || "");
                              }}
                              data-testid={`button-edit-doc-${invoice.id}`}
                            >
                              <Link2 className="h-3 w-3 mr-1" />
                              {invoice.closingDocumentUrl ? 'Изменить' : 'Прикрепить'}
                            </Button>
                            {invoice.closingDocumentUrl && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="ml-1 text-destructive"
                                onClick={() => handleRemoveDoc(invoice.id)}
                                disabled={updateClosingDoc.isPending}
                                data-testid={`button-remove-doc-${invoice.id}`}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Журнал действий бухгалтерии</CardTitle>
            </CardHeader>
            <CardContent>
              {!logs || logs.logs.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">Нет записей</p>
              ) : (
                <div className="space-y-3">
                  {logs.logs.map((log) => (
                    <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg border bg-card" data-testid={`log-entry-${log.id}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-xs">
                            {ACTION_TYPE_LABELS[log.actionType] || log.actionType}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(log.createdAt), "dd MMM yyyy, HH:mm", { locale: ru })}
                          </span>
                        </div>
                        <p className="text-sm">{log.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <CreateInvoiceDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
        }}
      />
    </DashboardLayout>
  );
};
