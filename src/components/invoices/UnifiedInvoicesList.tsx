import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate, getSchemeLabel } from "@/lib/invoiceCalculations";
import { Progress } from "@/components/ui/progress";
import { Eye, Trash2, Loader2, FileText, Trash, EyeOff, Clock } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { InvoiceDetailsDialog } from "./InvoiceDetailsDialog";
import { InvoicesCardsSkeleton, InvoicesTableSkeleton } from "./InvoicesSkeleton";
import { CardSkeleton } from "@/components/ui/card-skeleton";
import { useStaggerAnimation } from "@/hooks/useStaggerAnimation";
import { EmptyState } from "@/components/ui/empty-state";
import { InvoiceProgressBadge } from "./InvoiceProgressBadge";
import { InvoiceCard } from "./InvoiceCard";
import { InvoiceFilters } from "./filters/InvoiceFilters";
import { useInvoiceFilters, InvoiceStatus } from "@/hooks/useInvoiceFilters";
import { useIsMobile } from "@/hooks/use-mobile";
import { apiGet, apiDelete } from "@/lib/api";
import { useSearchParams } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type UserRole = 'admin' | 'assistant' | 'client' | 'partner';
type ViewMode = 'table' | 'cards';

interface UnifiedInvoicesListProps {
  role: UserRole;
  viewMode: ViewMode;
  partnerId?: string;
  clientId?: string;
  enableDelete?: boolean;
  enableRealtime?: boolean;
  initialStatusFilter?: InvoiceStatus;
}

export const UnifiedInvoicesList = ({ 
  role, 
  viewMode, 
  partnerId, 
  clientId, 
  enableDelete = false,
  enableRealtime = false,
  initialStatusFilter
}: UnifiedInvoicesListProps) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const openInvoiceParam = searchParams.get('open');
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(openInvoiceParam);
  const [detailsOpen, setDetailsOpen] = useState(!!openInvoiceParam);
  const [isOpeningDetails, setIsOpeningDetails] = useState(false);
  const [deleteInvoice, setDeleteInvoice] = useState<{id: string, number: string} | null>(null);
  const [deletingInvoiceId, setDeletingInvoiceId] = useState<string | null>(null);
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [deletingBulk, setDeletingBulk] = useState(false);
  const isMobile = useIsMobile();
  
  const {
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    sortBy,
    setSortBy,
    filteredInvoices,
    statusCounts,
  } = useInvoiceFilters(invoices, initialStatusFilter);
  
  const { setRef } = useStaggerAnimation(filteredInvoices.length, viewMode === 'table' ? 60 : 80);

  useEffect(() => {
    fetchInvoices();
  }, [partnerId, clientId]);

  useEffect(() => {
    if (openInvoiceParam) {
      setSelectedInvoiceId(openInvoiceParam);
      setDetailsOpen(true);
    }
  }, [openInvoiceParam]);

  useEffect(() => {
    if (!enableRealtime) return;
    
    let isVisible = document.visibilityState === 'visible';
    
    const handleVisibilityChange = () => {
      isVisible = document.visibilityState === 'visible';
      if (isVisible) fetchInvoices();
    };
    
    const pollInterval = setInterval(() => {
      if (isVisible) fetchInvoices();
    }, 120000);
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      clearInterval(pollInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [partnerId, clientId, enableRealtime]);

  const fetchInvoices = async () => {
    try {
      const data = await apiGet<any[]>('/invoices');

      console.log('[UnifiedInvoicesList] API returned data:', data.length, 'invoices');
      
      const mappedInvoices = data.map((inv: any) => ({
        id: inv.id,
        invoice_number: inv.invoiceNumber,
        client_id: inv.clientId,
        partner_id: inv.partnerId,
        scheme: inv.scheme,
        status: inv.status,
        payment_date: inv.paymentDate,
        actual_payment_date: inv.actualPaymentDate,
        issue_date: inv.issueDate,
        notes: inv.notes,
        created_at: inv.createdAt,
        client_name: inv.client?.name,
        partner_name: inv.partner?.name,
        client_bill: inv.calculations?.clientBill || inv.clientBill,
        commission_rate: inv.calculations?.commissionRate,
        commission_amount: inv.calculations?.commissionAmount,
        partner_share_from_margin: inv.calculations?.partnerShareFromMargin,
        admin_share_from_margin: inv.calculations?.adminShareFromMargin,
        executor_expenses_total: inv.calculations?.executorExpensesTotal || '0',
        net_profit_admin: inv.calculations?.netProfitAdmin,
        client_remaining: inv.calculations?.clientRemaining,
        partner_transfer_due: inv.calculations?.partnerTransferDue,
        hidden_from_assistant: inv.hiddenFromAssistant,
      }));

      setInvoices(mappedInvoices);
    } catch (error: any) {
      console.error('Error fetching invoices:', error);
      if (error.message?.includes('Not authenticated') || error.message?.includes('Session expired')) {
        window.location.href = '/auth';
      } else {
        toast({
          variant: "destructive",
          title: "Ошибка загрузки",
          description: error.message || "Не удалось загрузить счета",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = (invoiceId: string) => {
    if (isOpeningDetails) return;
    setIsOpeningDetails(true);
    setSelectedInvoiceId(invoiceId);
    setDetailsOpen(true);
    setTimeout(() => setIsOpeningDetails(false), 500);
  };

  const handleCloseDetails = (open: boolean) => {
    setDetailsOpen(open);
    if (!open) {
      setSelectedInvoiceId(null);
      if (openInvoiceParam) {
        searchParams.delete('open');
        setSearchParams(searchParams);
      }
    }
  };

  const confirmDeleteInvoice = (invoiceId: string, invoiceNumber: string) => {
    setDeleteInvoice({ id: invoiceId, number: invoiceNumber });
  };

  const handleDeleteInvoice = async () => {
    if (!deleteInvoice) return;

    setDeletingInvoiceId(deleteInvoice.id);
    try {
      await apiDelete(`/invoices/${deleteInvoice.id}`);

      toast({
        title: "Счёт удалён",
        description: `Счёт № ${deleteInvoice.number} успешно удалён`,
      });

      setDeleteInvoice(null);
      fetchInvoices();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: error.message,
      });
    } finally {
      setDeletingInvoiceId(null);
    }
  };

  const toggleInvoiceSelection = (invoiceId: string) => {
    setSelectedInvoices(prev => 
      prev.includes(invoiceId) 
        ? prev.filter(id => id !== invoiceId)
        : [...prev, invoiceId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedInvoices.length === invoices.length) {
      setSelectedInvoices([]);
    } else {
      setSelectedInvoices(invoices.map(inv => inv.id));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedInvoices.length === 0) return;

    setDeletingBulk(true);
    try {
      await Promise.all(selectedInvoices.map(id => apiDelete(`/invoices/${id}`)));

      toast({
        title: "Счета удалены",
        description: `Удалено счетов: ${selectedInvoices.length}`,
      });

      setSelectedInvoices([]);
      fetchInvoices();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Ошибка удаления",
        description: error.message,
      });
    } finally {
      setDeletingBulk(false);
      setShowBulkDeleteDialog(false);
    }
  };

  if (loading) {
    if (viewMode === 'table' && !isMobile) return <InvoicesTableSkeleton />;
    return <CardSkeleton rows={3} />;
  }

  if (invoices.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="Счета отсутствуют"
        description={
          role === 'assistant' 
            ? "Создайте первый счёт, чтобы начать работу" 
            : "У вас пока нет выставленных счетов"
        }
      />
    );
  }

  const displayInvoices = filteredInvoices;

  // Mobile always shows cards
  if (isMobile || viewMode === 'cards') {
    return (
      <>
        <InvoiceFilters
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          sortBy={sortBy}
          onSortChange={setSortBy}
          statusCounts={statusCounts}
        />

        {filteredInvoices.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Счета не найдены"
            description="Попробуйте изменить параметры фильтрации или поиска"
          />
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              {displayInvoices.map((invoice, index) => (
                <div key={invoice.id} ref={setRef(index)}>
                  <InvoiceCard
                    invoice={invoice}
                    onViewDetails={handleViewDetails}
                    onDelete={enableDelete ? confirmDeleteInvoice : undefined}
                    role={role}
                    enableDelete={enableDelete}
                  />
                </div>
              ))}
            </motion.div>
          </AnimatePresence>
        )}

        <InvoiceDetailsDialog
          invoiceId={selectedInvoiceId}
          open={detailsOpen}
          onOpenChange={handleCloseDetails}
          canEdit={role === 'admin' || role === 'assistant'}
          userRole={role}
        />

        {enableDelete && (
          <AlertDialog open={!!deleteInvoice} onOpenChange={() => setDeleteInvoice(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Удалить счёт?</AlertDialogTitle>
                <AlertDialogDescription>
                  Вы уверены, что хотите удалить счёт № {deleteInvoice?.number}? 
                  Это действие нельзя отменить.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Отмена</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteInvoice}
                  className="bg-destructive hover:bg-destructive/90"
                >
                  Удалить
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </>
    );
  }

  // Desktop table view
  if (viewMode === 'table') {
    return (
      <>
        <InvoiceFilters
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          sortBy={sortBy}
          onSortChange={setSortBy}
          statusCounts={statusCounts}
        />

        {filteredInvoices.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Счета не найдены"
            description="Попробуйте изменить параметры фильтрации или поиска"
          />
        ) : (
          <>
            {enableDelete && selectedInvoices.length > 0 && (
          <div className="mb-4 flex items-center gap-3 bg-muted/50 p-3 rounded-lg">
            <span className="text-sm text-muted-foreground">
              Выбрано: {selectedInvoices.length}
            </span>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowBulkDeleteDialog(true)}
              className="gap-2"
            >
              <Trash className="h-4 w-4" />
              Удалить выбранные
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedInvoices([])}
            >
              Отменить выбор
            </Button>
          </div>
        )}
        
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-b">
                {enableDelete && (
                  <TableHead className="w-[50px]">
                    <Checkbox
                      checked={selectedInvoices.length === invoices.length && invoices.length > 0}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Выбрать все"
                    />
                  </TableHead>
                )}
                <TableHead className="font-semibold">Номер</TableHead>
                <TableHead className="font-semibold">Клиент</TableHead>
                <TableHead className="font-semibold">Сумма</TableHead>
                {role === 'partner' && (
                  <>
                    <TableHead className="font-semibold">Расходы</TableHead>
                    <TableHead className="font-semibold">Моя доля</TableHead>
                    <TableHead className="font-semibold">Доля админа</TableHead>
                    <TableHead className="font-semibold">Остаток</TableHead>
                  </>
                )}
                {role === 'admin' && (
                  <>
                    <TableHead className="font-semibold">Расходы</TableHead>
                    <TableHead className="font-semibold">Прибыль</TableHead>
                    <TableHead className="font-semibold">Долг партнёра</TableHead>
                  </>
                )}
                <TableHead className="font-semibold">Статус</TableHead>
                {(role === 'admin' || role === 'assistant') && (
                  <TableHead className="font-semibold">Комментарий</TableHead>
                )}
                <TableHead className="font-semibold">План. дата</TableHead>
                <TableHead className="font-semibold">Оплачен</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayInvoices.map((invoice, index) => {
                return (
                  <TableRow 
                    key={invoice.id} 
                    ref={setRef(index)}
                    className={`h-16 hover:bg-muted/30 transition-colors cursor-pointer ${invoice.hidden_from_assistant ? 'opacity-50' : ''}`}
                    onClick={() => !isOpeningDetails && handleViewDetails(invoice.id)}
                  >
                    {enableDelete && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedInvoices.includes(invoice.id)}
                          onCheckedChange={() => toggleInvoiceSelection(invoice.id)}
                          aria-label={`Выбрать счет ${invoice.invoice_number}`}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-medium text-base">
                      <div className="flex items-center gap-2">
                        {invoice.invoice_number}
                        {invoice.hidden_from_assistant && (
                          <Badge variant="secondary" className="gap-1 text-xs">
                            <EyeOff className="h-3 w-3" />
                            Скрыт
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{invoice.client_name}</TableCell>
                    <TableCell className="text-2xl font-semibold">{formatCurrency(invoice.client_bill || 0)}</TableCell>
                    {role === 'partner' && (
                      <>
                        <TableCell className="text-muted-foreground">{formatCurrency(invoice.executor_expenses_total || 0)}</TableCell>
                        <TableCell className="font-semibold text-primary">
                          {invoice.scheme === 'agency_30' 
                            ? formatCurrency(invoice.partner_share_from_margin || 0)
                            : formatCurrency(invoice.commission_amount || 0)
                          }
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {invoice.scheme === 'agency_30' 
                            ? formatCurrency(invoice.admin_share_from_margin || 0)
                            : '—'
                          }
                        </TableCell>
                        <TableCell className="font-medium">{formatCurrency(invoice.client_remaining || 0)}</TableCell>
                      </>
                    )}
                    {role === 'admin' && (() => {
                      const executorExpenses = invoice.executor_expenses_total || 0;
                      const netProfit = invoice.net_profit_admin || 0;
                      // Use stored partnerTransferDue as single source of truth
                      const storedDebt = Number(invoice.partner_transfer_due) || 0;
                      const debtToAdmin = Math.max(0, storedDebt);
                      
                      return (
                        <>
                          <TableCell className="text-muted-foreground">{formatCurrency(executorExpenses)}</TableCell>
                          <TableCell className="font-semibold text-primary">{formatCurrency(netProfit)}</TableCell>
                          <TableCell className="font-semibold text-destructive">{formatCurrency(debtToAdmin)}</TableCell>
                        </>
                      );
                    })()}
                    <TableCell>
                      <InvoiceProgressBadge status={invoice.status} />
                    </TableCell>
                    {(role === 'admin' || role === 'assistant') && (
                      <TableCell className="text-muted-foreground max-w-[200px] truncate">
                        {invoice.notes || "—"}
                      </TableCell>
                    )}
                    <TableCell className="text-muted-foreground">
                      {invoice.payment_date ? formatDate(invoice.payment_date) : "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      {invoice.actual_payment_date && (
                        <div className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
                          <svg className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewDetails(invoice.id);
                          }}
                          disabled={isOpeningDetails}
                          className="gap-2"
                        >
                          <Eye className="h-4 w-4" />
                          Открыть
                        </Button>
                        {enableDelete && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              confirmDeleteInvoice(invoice.id, invoice.invoice_number);
                            }}
                            disabled={deletingInvoiceId === invoice.id}
                            className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            {deletingInvoiceId === invoice.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        </>
        )}

        <AnimatePresence>
          {detailsOpen && (
            <InvoiceDetailsDialog
              invoiceId={selectedInvoiceId}
              open={detailsOpen}
              onOpenChange={handleCloseDetails}
              canEdit={role === 'admin' || role === 'assistant'}
              userRole={role}
            />
          )}
        </AnimatePresence>

        {enableDelete && (
          <AlertDialog open={!!deleteInvoice} onOpenChange={() => setDeleteInvoice(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Удалить счёт?</AlertDialogTitle>
                <AlertDialogDescription>
                  Вы уверены, что хотите удалить счёт № {deleteInvoice?.number}? 
                  Это действие нельзя отменить. Все связанные данные (расчёты, документы, расходы) также будут удалены.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Отмена</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteInvoice}
                  className="bg-destructive hover:bg-destructive/90"
                >
                  Удалить
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Подтвердите массовое удаление</AlertDialogTitle>
              <AlertDialogDescription>
                Вы действительно хотите удалить {selectedInvoices.length} {selectedInvoices.length === 1 ? 'счет' : 'счетов'}? 
                Это действие нельзя отменить.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Отмена</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleBulkDelete}
                disabled={deletingBulk}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deletingBulk ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Удаление...
                  </>
                ) : (
                  'Удалить'
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  // Cards view
  return (
    <>
      <InvoiceFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        sortBy={sortBy}
        onSortChange={setSortBy}
        statusCounts={statusCounts}
      />

      {filteredInvoices.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Счета не найдены"
          description="Попробуйте изменить параметры фильтрации или поиска"
        />
      ) : (
        <div className="space-y-4">
          {displayInvoices.map((invoice, index) => {
          const isAgency30 = invoice.scheme === 'agency_30';
          
          return (
            <Card 
              key={invoice.id} 
              ref={setRef(index)}
              className="card-hover-lift group"
            >
              <CardHeader>
                <CardTitle className="flex justify-between items-center">
                  <span className="group-hover:text-primary transition-colors">
                    Счет № {invoice.invoice_number}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-normal text-muted-foreground">
                      {formatDate(invoice.created_at)}
                    </span>
                    {enableDelete && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => confirmDeleteInvoice(invoice.id, invoice.invoice_number)}
                        disabled={deletingInvoiceId === invoice.id}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        {deletingInvoiceId === invoice.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4 text-destructive" />
                        )}
                      </Button>
                    )}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {role === 'client' ? (
                  // Client view - simplified
                  <div className="space-y-3">
                    <div className="flex justify-between text-lg font-bold group-hover:text-primary transition-colors">
                      <span>Счет к оплате:</span>
                      <span>{formatCurrency(invoice.client_bill || 0)}</span>
                    </div>

                    {isAgency30 && (
                      <>
                        <div className="border-t pt-3 space-y-2">
                          <div className="flex justify-between text-sm text-muted-foreground">
                            <span>Маржа агентства:</span>
                            <span>{formatCurrency((invoice.client_bill || 0) * 0.30)}</span>
                          </div>
                          
                          <div className="bg-primary/5 p-4 rounded-lg space-y-3">
                            <div className="flex justify-between font-medium">
                              <span>Доступно на расходы:</span>
                              <span>{formatCurrency((invoice.client_bill || 0) * 0.70)}</span>
                            </div>
                            
                            <div className="flex justify-between text-sm text-muted-foreground">
                              <span>Потрачено:</span>
                              <span>{formatCurrency(invoice.executor_expenses_total || 0)}</span>
                            </div>
                            
                            <div className="flex justify-between text-sm font-semibold text-primary">
                              <span>Остаток:</span>
                              <span>{formatCurrency(invoice.client_remaining || 0)}</span>
                            </div>

                            <div className="pt-2">
                              <Progress 
                                value={(invoice.client_bill || 0) > 0
                                  ? ((invoice.executor_expenses_total || 0) / ((invoice.client_bill || 0) * 0.70)) * 100 
                                  : 0
                                } 
                                className="h-2"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="flex justify-end pt-3 border-t mt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewDetails(invoice.id)}
                            disabled={isOpeningDetails}
                            className="gap-2"
                          >
                            <Eye className="h-4 w-4" />
                            Детали расходов
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  // Admin, Assistant, Partner view
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Клиент</p>
                        <p className="font-medium">{invoice.client_name}</p>
                      </div>
                      {role !== 'partner' && (
                        <div>
                          <p className="text-sm text-muted-foreground">Партнер</p>
                          <p className="font-medium">{invoice.partner_name}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-sm text-muted-foreground">Схема</p>
                        <p className="font-medium">{getSchemeLabel(invoice.scheme, role, invoice.partner_commission_rate)}</p>
                      </div>
                    </div>

                    {(role === 'admin' || role === 'assistant') && invoice.notes && (
                      <div className="bg-muted/50 p-3 rounded-lg">
                        <p className="text-sm text-muted-foreground mb-1">Комментарий:</p>
                        <p className="text-sm">{invoice.notes}</p>
                      </div>
                    )}

                    <div className="border-t pt-4 space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm">Счет клиенту:</span>
                        <span className="font-bold">{formatCurrency(invoice.client_bill || 0)}</span>
                      </div>

                      {/* Ассистент видит только базовую информацию без комиссий и долей */}
                      {role === 'assistant' ? (
                        <>
                          {isAgency30 && (
                            <>
                              <div className="flex justify-between text-sm">
                                <span>Расходы исполнителя:</span>
                                <span>{formatCurrency(invoice.executor_expenses_total || 0)}</span>
                              </div>
                              <div className="flex justify-between text-sm font-semibold text-primary">
                                <span>Остаток у клиента:</span>
                                <span>{formatCurrency(invoice.client_remaining || 0)}</span>
                              </div>
                            </>
                          )}
                          {!isAgency30 && (
                            <div className="flex justify-between text-sm">
                              <span>Расходы исполнителя:</span>
                              <span>{formatCurrency(invoice.executor_expenses_total || 0)}</span>
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          {/* Админ и партнер видят полную информацию */}
                          {isAgency30 ? (
                            <>
                              <div className="flex justify-between text-sm">
                                <span>Маржа агентства (30%):</span>
                                <span>{formatCurrency((invoice.client_bill || 0) * 0.30)}</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span>База клиента:</span>
                                <span>{formatCurrency((invoice.client_bill || 0) * 0.70)}</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span>Расходы исполнителя:</span>
                                <span>{formatCurrency(invoice.executor_expenses_total || 0)}</span>
                              </div>
                              <div className="flex justify-between text-sm font-semibold text-primary">
                                <span>Остаток у клиента:</span>
                                <span>{formatCurrency(invoice.client_remaining || 0)}</span>
                              </div>
                              {role === 'admin' && (
                                <>
                                  <div className="border-t pt-2 mt-2">
                                    <div className="flex justify-between text-sm">
                                      <span>Выплата партнёру:</span>
                                      <span className="font-medium">{formatCurrency((invoice.client_bill || 0) * 0.15)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                      <span>Доля админа:</span>
                                      <span className="font-medium">{formatCurrency((invoice.client_bill || 0) * 0.15)}</span>
                                    </div>
                                  </div>
                                </>
                              )}
                              {role === 'partner' && (
                                <div className="flex justify-between text-sm font-semibold text-primary border-t pt-2 mt-2">
                                  <span>Ваша выплата:</span>
                                  <span>{formatCurrency((invoice.client_bill || 0) * 0.15)}</span>
                                </div>
                              )}
                            </>
                          ) : (
                            <>
                              <div className="flex justify-between text-sm">
                                <span>Комиссия ({invoice.partner_commission_rate || 0}%):</span>
                                <span>{formatCurrency((invoice.client_bill || 0) * ((invoice.partner_commission_rate || 0) / 100))}</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span>Расходы исполнителя:</span>
                                <span>{formatCurrency(invoice.executor_expenses_total || 0)}</span>
                              </div>
                              {role === 'admin' && (
                                <div className="flex justify-between text-sm font-semibold text-primary">
                                  <span>К переводу от партнера:</span>
                                  <span>{formatCurrency(Math.max(0, (invoice.client_bill || 0) - ((invoice.client_bill || 0) * ((invoice.partner_commission_rate || 0) / 100)) - (invoice.executor_expenses_total || 0)))}</span>
                                </div>
                              )}
                              {role === 'partner' && (
                                <>
                                  <div className="flex justify-between text-sm font-semibold text-primary border-t pt-2 mt-2">
                                    <span>Ваша комиссия:</span>
                                    <span>{formatCurrency((invoice.client_bill || 0) * ((invoice.partner_commission_rate || 0) / 100))}</span>
                                  </div>
                                  <div className="flex justify-between text-sm">
                                    <span>К переводу админу:</span>
                                    <span>{formatCurrency(Math.max(0, (invoice.client_bill || 0) - ((invoice.client_bill || 0) * ((invoice.partner_commission_rate || 0) / 100)) - (invoice.executor_expenses_total || 0)))}</span>
                                  </div>
                                </>
                              )}
                            </>
                          )}
                        </>
                      )}
                    </div>

                    {(role === 'admin' || role === 'assistant' || role === 'partner') && (
                      <div className="flex justify-end pt-2 border-t">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewDetails(invoice.id)}
                          disabled={isOpeningDetails}
                          className="gap-2"
                        >
                          <Eye className="h-4 w-4" />
                          Детали
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
        </div>
      )}

      <InvoiceDetailsDialog
        invoiceId={selectedInvoiceId}
        open={detailsOpen}
        onOpenChange={handleCloseDetails}
        canEdit={role === 'admin' || role === 'assistant'}
        userRole={role}
      />

      {enableDelete && (
        <AlertDialog open={!!deleteInvoice} onOpenChange={() => setDeleteInvoice(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Удалить счёт?</AlertDialogTitle>
              <AlertDialogDescription>
                Вы уверены, что хотите удалить счёт № {deleteInvoice?.number}? 
                Это действие нельзя отменить. Все связанные данные (расчёты, документы, расходы) также будут удалены.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Отмена</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteInvoice}
                className="bg-destructive hover:bg-destructive/90"
              >
                Удалить
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
};
