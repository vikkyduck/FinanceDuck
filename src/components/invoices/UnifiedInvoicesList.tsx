import { useEffect, useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { isAgencyScheme } from "@/lib/invoiceHelpers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate, getSchemeLabel } from "@/lib/invoiceCalculations";
import { Progress } from "@/components/ui/progress";
import { Eye, Trash2, Loader2, FileText, Trash, EyeOff, Clock, MessageSquare } from "lucide-react";
import { SendMessageDialog } from "@/components/messages/SendMessageDialog";
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
  const clientIdParam = searchParams.get('clientId');
  const partnerIdParam = searchParams.get('partnerId');
  const monthParam = searchParams.get('month');
  const yearParam = searchParams.get('year');
  const statusParam = searchParams.get('statusFilter') as InvoiceStatus | null;
  const queryClient = useQueryClient();
  // Список читается через React Query под общим префиксом ключа ['/api/invoices'],
  // поэтому инвалидация из InvoiceDetailsDialog/удаления обновляет его мгновенно
  // (раньше был ручной useState + setInterval-поллинг мимо кэша — правки счёта
  // проявлялись только через таймер). Фетч без параметров: сервер сам скоупит по
  // токену/роли, а фильтры остаются клиентскими (useInvoiceFilters).
  const {
    data: invoices = [],
    isLoading: loading,
    error: invoicesError,
  } = useQuery<any[]>({
    queryKey: ['/api/invoices', 'unified-list'],
    queryFn: async () => {
      const data = await apiGet<any[]>('/invoices');
      return data.map((inv: any) => ({
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
        agency_margin: inv.calculations?.agencyMargin,
        client_base_after_margin: inv.calculations?.clientBaseAfterMargin,
        amount_to_admin: inv.calculations?.amountToAdmin,
        partner_share_from_margin: inv.calculations?.partnerShareFromMargin,
        admin_share_from_margin: inv.calculations?.adminShareFromMargin,
        executor_expenses_total: inv.calculations?.executorExpensesTotal || '0',
        net_profit_admin: inv.calculations?.netProfitAdmin,
        client_remaining: inv.calculations?.clientRemaining,
        partner_transfer_due: inv.calculations?.partnerTransferDue,
        partner_commission_rate: inv.partnerCommissionRate,
        service_type: inv.serviceType,
        period_unit: inv.periodUnit,
        price_per_period: inv.pricePerPeriod,
        total_periods: inv.totalPeriods,
        periods_used: inv.periodsUsed,
        hidden_from_assistant: inv.hiddenFromAssistant,
      }));
    },
    staleTime: 30000,
    // enableRealtime → фоновый опрос; RQ сам ставит его на паузу для скрытой
    // вкладки и делает refetch при возврате фокуса.
    refetchInterval: enableRealtime ? 120000 : false,
  });

  const refreshInvoices = () =>
    queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });

  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(openInvoiceParam);
  const [detailsOpen, setDetailsOpen] = useState(!!openInvoiceParam);
  const [isOpeningDetails, setIsOpeningDetails] = useState(false);
  const [deleteInvoice, setDeleteInvoice] = useState<{id: string, number: string} | null>(null);
  const [deletingInvoiceId, setDeletingInvoiceId] = useState<string | null>(null);
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [msgDialogOpen, setMsgDialogOpen] = useState(false);
  const [msgTarget, setMsgTarget] = useState<{ invoiceId: string; invoiceNumber?: string } | null>(null);
  const [deletingBulk, setDeletingBulk] = useState(false);
  const isMobile = useIsMobile();
  
  const {
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    sortBy,
    setSortBy,
    clientFilter,
    setClientFilter,
    partnerFilter,
    setPartnerFilter,
    monthFilter,
    setMonthFilter,
    clients,
    partners,
    filteredInvoices,
    statusCounts,
  } = useInvoiceFilters(
    invoices,
    statusParam || initialStatusFilter,
    role === 'client'
      ? { prefix: 'clientInvoices', fields: ['searchQuery', 'statusFilter', 'sortBy'] }
      : undefined
  );
  
  const { setRef } = useStaggerAnimation(filteredInvoices.length, viewMode === 'table' ? 60 : 80);

  const filtersActive =
    searchQuery.trim() !== '' ||
    statusFilter !== 'all' ||
    clientFilter !== 'all' ||
    partnerFilter !== 'all' ||
    monthFilter !== 'all';

  const hiddenByFilters = invoices.length - filteredInvoices.length;

  const resetAllFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setClientFilter('all');
    setPartnerFilter('all');
    setMonthFilter('all');
  };

  // 401/просрочка сессии → на /auth; прочие ошибки — тост (как было в ручном fetch).
  useEffect(() => {
    if (!invoicesError) return;
    const msg = (invoicesError as Error).message || '';
    if (msg.includes('Not authenticated') || msg.includes('Session expired') || msg.includes('401')) {
      window.location.href = '/auth';
    } else {
      toast({
        variant: "destructive",
        title: "Ошибка загрузки",
        description: msg || "Не удалось загрузить счета",
      });
    }
  }, [invoicesError]);

  // ?statusFilter=... из URL — quick-action из ⌘K-палитры.
  // Применяется и при заходе на страницу, и если юзер уже на /invoices.
  useEffect(() => {
    if (statusParam && statusParam !== statusFilter) {
      setStatusFilter(statusParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusParam]);

  useEffect(() => {
    if (openInvoiceParam) {
      setSelectedInvoiceId(openInvoiceParam);
      setDetailsOpen(true);
    }
  }, [openInvoiceParam]);

  // Track previous URL params to detect when navigating away from deep-links
  const prevParamsRef = useRef<{
    clientId: string | null;
    partnerId: string | null;
    month: string | null;
    year: string | null;
    isFirstMount: boolean;
  }>({ clientId: null, partnerId: null, month: null, year: null, isFirstMount: true });

  // Apply prop-driven filters on mount (so UI shows correct filter value)
  useEffect(() => {
    if (clientId) {
      setClientFilter(clientId);
    }
    if (partnerId) {
      setPartnerFilter(partnerId);
    }
  }, [clientId, partnerId, setClientFilter, setPartnerFilter]);

  // Apply URL filters when component mounts or URL params change
  // Reset filters only when navigating away from deep-links (param was set, now is null)
  // Skip URL-driven filtering when component has prop-driven scoping (partnerId/clientId props)
  useEffect(() => {
    const prevParams = prevParamsRef.current;
    
    // Don't apply URL-based client filter if component has prop-driven clientId
    if (!clientId) {
      if (clientIdParam) {
        setClientFilter(clientIdParam);
      } else if (!prevParams.isFirstMount && prevParams.clientId) {
        // Only reset if we had a param before (navigating away from deep-link)
        setClientFilter('all');
      }
    }
    // Don't apply URL-based partner filter if component has prop-driven partnerId
    if (!partnerId) {
      if (partnerIdParam) {
        setPartnerFilter(partnerIdParam);
      } else if (!prevParams.isFirstMount && prevParams.partnerId) {
        setPartnerFilter('all');
      }
    }
    // Month filter is always URL-driven (no prop equivalent)
    if (monthParam && yearParam) {
      const monthValue = `${yearParam}-${monthParam.padStart(2, '0')}`;
      setMonthFilter(monthValue);
    } else if (!prevParams.isFirstMount && prevParams.month && prevParams.year) {
      setMonthFilter('all');
    }
    
    // Update previous params for next comparison
    prevParamsRef.current = {
      clientId: clientIdParam,
      partnerId: partnerIdParam,
      month: monthParam,
      year: yearParam,
      isFirstMount: false
    };
  }, [clientIdParam, partnerIdParam, monthParam, yearParam, clientId, partnerId, setClientFilter, setPartnerFilter, setMonthFilter]);

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
      refreshInvoices();
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
      refreshInvoices();
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
          clientFilter={clientFilter}
          onClientChange={setClientFilter}
          clients={clients}
          partnerFilter={partnerFilter}
          onPartnerChange={setPartnerFilter}
          partners={partners}
          showClientFilter={!clientId}
          showPartnerFilter={(role === 'admin' || role === 'assistant') && !partnerId}
        />

        {filtersActive && hiddenByFilters > 0 && filteredInvoices.length > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-md border bg-amber-50/50 dark:bg-amber-950/20 border-amber-200/60 dark:border-amber-800/30 px-3 py-2 text-sm">
            <span className="text-muted-foreground">
              Фильтр скрывает <strong className="text-foreground">{hiddenByFilters}</strong> счёт{hiddenByFilters === 1 ? '' : hiddenByFilters < 5 ? 'а' : 'ов'} из {invoices.length}.
            </span>
            <Button variant="ghost" size="sm" onClick={resetAllFilters} data-testid="button-reset-filters">
              Показать все
            </Button>
          </div>
        )}
        {filteredInvoices.length === 0 ? (
          filtersActive && invoices.length > 0 ? (
            <EmptyState
              icon={FileText}
              title="Счета не найдены"
              description={`У вас ${invoices.length} счёт${invoices.length === 1 ? '' : invoices.length < 5 ? 'а' : 'ов'}, но все скрыты текущим фильтром.`}
              action={{ label: 'Показать все счета', onClick: resetAllFilters }}
            />
          ) : (
            <EmptyState
              icon={FileText}
              title="Счета не найдены"
              description="Попробуйте изменить параметры фильтрации или поиска"
            />
          )
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
          clientFilter={clientFilter}
          onClientChange={setClientFilter}
          clients={clients}
          partnerFilter={partnerFilter}
          onPartnerChange={setPartnerFilter}
          partners={partners}
          showClientFilter={!clientId}
          showPartnerFilter={(role === 'admin' || role === 'assistant') && !partnerId}
        />

        {filtersActive && hiddenByFilters > 0 && filteredInvoices.length > 0 && (
          <div className="mb-3 flex items-center justify-between gap-3 rounded-md border bg-amber-50/50 dark:bg-amber-950/20 border-amber-200/60 dark:border-amber-800/30 px-3 py-2 text-sm">
            <span className="text-muted-foreground">
              Фильтр скрывает <strong className="text-foreground">{hiddenByFilters}</strong> из {invoices.length}.
            </span>
            <Button variant="ghost" size="sm" onClick={resetAllFilters} data-testid="button-reset-filters-table">
              Показать все
            </Button>
          </div>
        )}
        {filteredInvoices.length === 0 ? (
          filtersActive && invoices.length > 0 ? (
            <EmptyState
              icon={FileText}
              title="Счета не найдены"
              description={`У вас ${invoices.length} счёт${invoices.length === 1 ? '' : invoices.length < 5 ? 'а' : 'ов'}, но все скрыты текущим фильтром.`}
              action={{ label: 'Показать все счета', onClick: resetAllFilters }}
            />
          ) : (
            <EmptyState
              icon={FileText}
              title="Счета не найдены"
              description="Попробуйте изменить параметры фильтрации или поиска"
            />
          )
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
        
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <div className="px-4 sm:px-0">
            {/* [&_th]:px-2 [&_td]:px-2 — уплотнили боковые отступы (16px→8px),
                чтобы 10 колонок влезали без горизонтального скролла. */}
            <Table className="w-full [&_th]:px-2 [&_td]:px-2">
              <TableHeader>
                <TableRow className="hover:bg-transparent border-b">
                  {enableDelete && (
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={selectedInvoices.length === invoices.length && invoices.length > 0}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Выбрать все"
                      />
                    </TableHead>
                  )}
                  <TableHead className="text-xs sm:text-sm font-semibold whitespace-nowrap">Номер</TableHead>
                  <TableHead className="text-xs sm:text-sm font-semibold">Клиент</TableHead>
                  {(role === 'admin' || role === 'assistant') && (
                    <TableHead className="hidden xl:table-cell text-xs sm:text-sm font-semibold">Партнёр</TableHead>
                  )}
                  <TableHead className="text-xs sm:text-sm font-semibold">Сумма</TableHead>
                  {role === 'partner' && (
                    <>
                      <TableHead className="hidden lg:table-cell text-xs sm:text-sm font-semibold">Расходы</TableHead>
                      <TableHead className="text-xs sm:text-sm font-semibold">Моя доля</TableHead>
                      <TableHead className="hidden xl:table-cell text-xs sm:text-sm font-semibold">Доля админа</TableHead>
                      <TableHead className="text-xs sm:text-sm font-semibold">Остаток</TableHead>
                    </>
                  )}
                  {role === 'admin' && (
                    <>
                      <TableHead className="hidden lg:table-cell text-xs sm:text-sm font-semibold">Расходы</TableHead>
                      <TableHead className="text-xs sm:text-sm font-semibold">Прибыль</TableHead>
                      <TableHead className="text-xs sm:text-sm font-semibold">Остаток</TableHead>
                    </>
                  )}
                  <TableHead className="text-xs sm:text-sm font-semibold">Статус</TableHead>
                  {(role === 'admin' || role === 'assistant') && (
                    <TableHead className="text-xs sm:text-sm font-semibold">Комментарий</TableHead>
                  )}
                  <TableHead className="hidden lg:table-cell text-xs sm:text-sm font-semibold text-center">Оплачен</TableHead>
                </TableRow>
              </TableHeader>
            <TableBody>
              {displayInvoices.map((invoice, index) => {
                return (
                  <TableRow 
                    key={invoice.id} 
                    ref={setRef(index)}
                    className={`hover:bg-muted/30 transition-colors cursor-pointer ${invoice.hidden_from_assistant ? 'opacity-50' : ''}`}
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
                    <TableCell className="font-medium text-sm whitespace-nowrap align-top py-3">
                      <div className="flex items-center gap-1.5">
                        {invoice.invoice_number}
                        {invoice.hidden_from_assistant && (
                          <Badge variant="secondary" className="gap-1 text-xs">
                            <EyeOff className="h-3 w-3" />
                            Скрыт
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground align-top py-3 break-words">{invoice.client_name}</TableCell>
                    {(role === 'admin' || role === 'assistant') && (
                      <TableCell className="hidden xl:table-cell text-muted-foreground align-top py-3 break-words">{invoice.partner_name || "—"}</TableCell>
                    )}
                    <TableCell className="align-top py-3">
                      <div className="text-base font-semibold whitespace-nowrap">{formatCurrency(invoice.client_bill || 0)}</div>
                      {invoice.service_type === 'periodic' && Number(invoice.total_periods || 0) > 0 && (
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {formatCurrency(Number(invoice.price_per_period || 0))} × {Number(invoice.total_periods || 0)} {invoice.period_unit === 'day' ? 'дн' : 'мес'} · использовано {Number(invoice.periods_used || 0)}/{Number(invoice.total_periods || 0)}
                        </div>
                      )}
                    </TableCell>
                    {role === 'partner' && (
                      <>
                        <TableCell className="hidden lg:table-cell text-muted-foreground whitespace-nowrap align-top py-3">{formatCurrency(invoice.executor_expenses_total || 0)}</TableCell>
                        <TableCell className="font-semibold text-primary whitespace-nowrap align-top py-3">
                          {(isAgencyScheme(invoice.scheme))
                            ? formatCurrency(invoice.partner_share_from_margin || 0)
                            : formatCurrency(invoice.commission_amount || 0)
                          }
                        </TableCell>
                        <TableCell className="hidden xl:table-cell text-muted-foreground whitespace-nowrap align-top py-3">
                          {(isAgencyScheme(invoice.scheme))
                            ? formatCurrency(invoice.admin_share_from_margin || 0)
                            : '—'
                          }
                        </TableCell>
                        <TableCell className="font-medium whitespace-nowrap align-top py-3">{formatCurrency(invoice.client_remaining || 0)}</TableCell>
                      </>
                    )}
                    {role === 'admin' && (
                      <>
                        <TableCell className="hidden lg:table-cell text-muted-foreground whitespace-nowrap align-top py-3">{formatCurrency(invoice.executor_expenses_total || 0)}</TableCell>
                        <TableCell className="font-semibold text-primary whitespace-nowrap align-top py-3">{formatCurrency(invoice.net_profit_admin || 0)}</TableCell>
                        <TableCell className="font-medium whitespace-nowrap align-top py-3">{formatCurrency(invoice.client_remaining || 0)}</TableCell>
                      </>
                    )}
                    <TableCell className="align-top py-3">
                      <InvoiceProgressBadge status={invoice.status} />
                    </TableCell>
                    {(role === 'admin' || role === 'assistant') && (
                      <TableCell className="text-muted-foreground text-xs whitespace-normal break-words align-top py-3 max-w-[200px]">
                        {invoice.notes || "—"}
                      </TableCell>
                    )}
                    <TableCell className="hidden lg:table-cell text-center align-top py-3">
                      {invoice.actual_payment_date && (
                        <div className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
                          <svg className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              </TableBody>
            </Table>
          </div>
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
          // «Открытая комиссия» для клиента — только agency_30/40 (30/40% маржа
          // в названии). commission_based, partner_10, partner_15 — закрытые.
          const isAgency30 = isAgencyScheme(invoice.scheme);
          
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
                  // Client view:
                  //   agency_30/40            → открытая раскладка с маржой и расходами
                  //   periodic (любая схема)  → оплачено / цена / использовано / осталось
                  //   остальное (commission_based one_time, partner_10/15) → только сумма + статус
                  (() => {
                    const isAgencyDeal = isAgencyScheme(invoice.scheme);
                    const isPeriodic = invoice.service_type === 'periodic';
                    const bill = Number(invoice.client_bill || 0);
                    return (
                      <div className="space-y-3">
                        <div className="flex justify-between text-lg font-bold group-hover:text-primary transition-colors">
                          <span>{isAgencyDeal ? 'Всего оплачено:' : 'Сумма счёта:'}</span>
                          <span>{formatCurrency(bill)}</span>
                        </div>

                        {isPeriodic && (() => {
                          const total = Number(invoice.total_periods || 0);
                          const used = Number(invoice.periods_used || 0);
                          const left = Math.max(0, total - used);
                          const unit = invoice.period_unit === 'day' ? 'дн' : 'мес';
                          const price = Number(invoice.price_per_period || 0);
                          return (
                            <div className="border-t pt-3 space-y-1 text-sm">
                              <div className="flex justify-between"><span className="text-muted-foreground">Цена за {unit}</span><span className="font-medium">{formatCurrency(price)}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">Использовано</span><span className="font-medium">{used} из {total} {unit}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">Осталось</span><span className="font-medium text-green-600">{left} {unit} · {formatCurrency(price * left)}</span></div>
                            </div>
                          );
                        })()}

                        {isAgencyDeal && !isPeriodic && (() => {
                          const marginRate = invoice.scheme === 'agency_40' ? 40 : 30;
                          const commissionAmount = Number(invoice.agency_margin || (bill * marginRate / 100));
                          const available = Number(invoice.client_base_after_margin || (bill - commissionAmount));
                          const spent = Number(invoice.executor_expenses_total || 0);
                          const remaining = Number(invoice.client_remaining || 0);
                          return (
                            <div className="border-t pt-3 space-y-2">
                              <div className="flex justify-between text-sm text-muted-foreground">
                                <span>Комиссия агентства ({marginRate}%):</span>
                                <span>{formatCurrency(commissionAmount)}</span>
                              </div>
                              <div className="bg-primary/5 p-4 rounded-lg space-y-3">
                                <div className="flex justify-between font-medium">
                                  <span>Доступно вам:</span>
                                  <span>{formatCurrency(available)}</span>
                                </div>
                                <div className="flex justify-between text-sm text-muted-foreground">
                                  <span>Потрачено:</span>
                                  <span>{formatCurrency(spent)}</span>
                                </div>
                                <div className="flex justify-between text-sm font-semibold text-primary">
                                  <span>Осталось:</span>
                                  <span>{formatCurrency(remaining)}</span>
                                </div>
                                <Progress
                                  value={available > 0 ? (spent / available) * 100 : 0}
                                  className="h-2"
                                />
                              </div>
                            </div>
                          );
                        })()}

                        <div className="flex justify-end pt-3 border-t mt-2 gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setMsgTarget({ invoiceId: invoice.id, invoiceNumber: invoice.invoice_number });
                              setMsgDialogOpen(true);
                            }}
                            className="gap-2"
                            data-testid={`button-write-invoice-${invoice.id}`}
                          >
                            <MessageSquare className="h-4 w-4" />
                            Написать
                          </Button>
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
                      </div>
                    );
                  })()
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
      {msgTarget && (
        <SendMessageDialog
          open={msgDialogOpen}
          onOpenChange={(o) => { setMsgDialogOpen(o); if (!o) setMsgTarget(null); }}
          invoiceId={msgTarget.invoiceId}
          invoiceNumber={msgTarget.invoiceNumber}
          currentRole={role as any}
        />
      )}
    </>
  );
};
