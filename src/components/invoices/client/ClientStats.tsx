import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/invoiceCalculations";
import { pluralizeRu as word } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { CatEmpty } from "@/components/bv/CatEmpty";
import { AlertCircle, ChevronDown, ChevronRight, MessageSquare } from "lucide-react";
import { format } from "date-fns";
import { SendMessageDialog } from "@/components/messages/SendMessageDialog";
import { useAuth } from "@/hooks/useAuth";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { VirtualizedList, VIRTUALIZATION_THRESHOLD } from "@/components/virtualized/VirtualizedList";

interface ClientStatsProps {
  dateFrom?: Date;
  dateTo?: Date;
}

interface InvoiceLine {
  invoiceId: string;
  invoiceNumber: string;
  status: string;
  bill: number;
  paymentDate: string | null;
  actualPaymentDate: string | null;
  notes: string | null;
}

interface OverviewBuckets {
  agency: {
    available: number;
    spent: number;
    remaining: number;
    count: number;
    invoices: Array<{
      invoiceId: string;
      invoiceNumber: string;
      status: string;
      bill: number;
      marginRate: number;
      commissionAmount: number;
      budgetAfter: number;
      spent: number;
      remaining: number;
      notes: string | null;
      expenses: Array<{
        id: string;
        description: string;
        amount: number;
        date: string | null;
      }>;
    }>;
  };
  recurring: Array<{
    kind: 'standalone' | 'template';
    key: string;
    invoiceNumber: string;
    description: string;
    partnerName: string;
    unit: 'month' | 'day' | 'hour';
    unitLabel: string;
    unitPrice: number;
    totalUnits: number;
    usedUnits: number;
    remainingUnits: number;
    remainingMoney: number;
    invoices: InvoiceLine[];
  }>;
  oneTime: {
    totalCount: number;
    paidCount: number;
    pendingCount: number;
    paidAmount: number;
    pendingAmount: number;
    totalAmount: number;
    invoices: InvoiceLine[];
  };
}

const statusLabel: Record<string, string> = { draft: "Черновик", sent: "Отправлен", paid: "Оплачен", cancelled: "Отменён" };

const Block = ({
  open,
  onToggle,
  hero,
  subhero,
  children,
  testId,
}: {
  open: boolean;
  onToggle: () => void;
  hero: React.ReactNode;
  subhero?: React.ReactNode;
  children?: React.ReactNode;
  testId?: string;
}) => (
  // Каждый блок — стеклянная карточка над сценой кабинета («Без Воды»,
  // раздел 7): сворачиваемость сохранена, тап по шапке раскрывает счета.
  <Card data-testid={testId}>
    <CardContent className="pt-5 pb-5 sm:pt-6 sm:pb-6">
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left group"
        aria-expanded={open}
      >
        <div className="flex items-baseline gap-3">
          <div className="flex-1 min-w-0">{hero}</div>
          <div className="text-muted-foreground/60 group-hover:text-foreground transition-colors shrink-0">
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </div>
        </div>
        {subhero && <div className="text-sm text-muted-foreground mt-1.5">{subhero}</div>}
      </button>
      {open && <div className="mt-4">{children}</div>}
    </CardContent>
  </Card>
);

export const ClientStats = ({ dateFrom, dateTo }: ClientStatsProps) => {
  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (dateFrom) p.set("dateFrom", format(dateFrom, "yyyy-MM-dd"));
    if (dateTo)   p.set("dateTo",   format(dateTo,   "yyyy-MM-dd"));
    return p.toString();
  }, [dateFrom, dateTo]);

  const { data, isLoading, error } = useQuery<OverviewBuckets>({
    queryKey: ["/api/client/overview-buckets", params],
    queryFn: () => apiGet<OverviewBuckets>(`/client/overview-buckets${params ? `?${params}` : ""}`),
  });

  // По умолчанию блоки свёрнуты — клиент видит только три hero-цифры
  // (По вашим проектам · Подписки · Разовые работы). Тап по заголовку
  // раскрывает счета внутри блока.
  const [agencyOpen, setAgencyOpen] = useState(false);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [oneTimeOpen, setOneTimeOpen] = useState(false);
  const [openTemplates, setOpenTemplates] = useState<Set<string>>(new Set());
  const [openInvoiceRows, setOpenInvoiceRows] = useState<Set<string>>(new Set());
  const [msgTarget, setMsgTarget] = useState<{ invoiceId: string; invoiceNumber: string } | null>(null);
  const { role: currentRole } = useAuth();
  const unread = useUnreadMessages();
  const toggleTemplate = (id: string) => {
    setOpenTemplates(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleRow = (id: string) => {
    setOpenInvoiceRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const MsgBtn = ({ inv, big = false }: { inv: { invoiceId: string; invoiceNumber: string }; big?: boolean }) => {
    const unreadCount = unread.byInvoice[inv.invoiceId] || 0;
    const hasUnread = unreadCount > 0;
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setMsgTarget({ invoiceId: inv.invoiceId, invoiceNumber: inv.invoiceNumber }); }}
        className={big
          ? "relative h-11 w-11 flex items-center justify-center text-muted-foreground hover:text-foreground active:bg-muted/40 rounded-full -mr-2 shrink-0"
          : "relative text-muted-foreground/60 hover:text-foreground transition-colors p-1 -m-1"}
        title={hasUnread ? `${unreadCount} непрочитанн${unreadCount === 1 ? 'ое' : 'ых'}` : "Написать по этому счёту"}
        aria-label={hasUnread ? `Написать по этому счёту, ${unreadCount} непрочитанных` : "Написать по этому счёту"}
        data-testid={`msg-${inv.invoiceId}`}
      >
        <MessageSquare className={`${big ? "h-5 w-5" : "h-4 w-4"} ${hasUnread ? "text-foreground" : ""}`} />
        {hasUnread && (
          <span className={`absolute ${big ? "top-2 right-2" : "-top-0.5 -right-0.5"} h-2 w-2 rounded-full bg-destructive ring-2 ring-background`} />
        )}
      </button>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-8">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-28 w-full" />)}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center gap-2 text-destructive">
        <AlertCircle className="h-4 w-4" />
        <span>Не удалось загрузить обзор</span>
      </div>
    );
  }

  const hasAgency = data.agency.count > 0;
  const hasRecurring = data.recurring.length > 0;
  const hasOneTime = data.oneTime.totalCount > 0;

  if (!hasAgency && !hasRecurring && !hasOneTime) {
    return (
      <CatEmpty testId="client-stats-empty">
        {(dateFrom || dateTo) ? "За выбранный период счетов нет." : "У вас пока нет счетов."}
      </CatEmpty>
    );
  }

  const recurringTotalRemaining = data.recurring.reduce((s, r) => s + r.remainingMoney, 0);
  const recurringHasActive = data.recurring.some(r => r.totalUnits > 0);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ============ Блок 1: По вашим проектам (agency 30/40) ============ */}
      {hasAgency && (
        <Block
          open={agencyOpen}
          onToggle={() => setAgencyOpen(o => !o)}
          testId="client-stats-agency"
          hero={
            <div>
              {/* Метка-капитель (Label из брендбука); цифра — Unbounded.
                  Монохром: спокойные суммы графитом, цвет — только тревоге. */}
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-2">
                По вашим проектам · осталось
              </div>
              <div className="bv-number text-3xl sm:text-4xl md:text-5xl">
                {formatCurrency(data.agency.remaining)}
              </div>
            </div>
          }
          subhero={
            <span>
              из <strong className="text-foreground">{formatCurrency(data.agency.available)}</strong> доступно ·
              потрачено <strong className="text-foreground">{formatCurrency(data.agency.spent)}</strong> ·
              {" "}{data.agency.count} {word(data.agency.count, ["счёт", "счёта", "счетов"])}
            </span>
          }
        >
          {/* Mobile: каждая запись — одна карточка с главным числом «Осталось». */}
          <div className="sm:hidden divide-y divide-border/60 -mx-1">
            {data.agency.invoices.map(inv => {
              const expanded = openInvoiceRows.has(inv.invoiceId);
              const hasExpenses = inv.expenses.length > 0;
              // Раскрытие — только ради списка затрат. Внутренние комментарии
              // (notes/description) клиенту не показываются: главное имя
              // приходит в clientTitle, остальное — служебное.
              const canExpand = hasExpenses;
              const serviceName = inv.notes || `Счёт № ${inv.invoiceNumber}`;
              return (
                <div key={inv.invoiceId} className="py-3" data-testid={`agency-card-${inv.invoiceId}`}>
                  <div
                    className={`flex items-start gap-2 ${canExpand ? "cursor-pointer" : ""}`}
                    onClick={canExpand ? () => toggleRow(inv.invoiceId) : undefined}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm line-clamp-2">{serviceName}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {inv.notes ? `№ ${inv.invoiceNumber} · ` : ""}{statusLabel[inv.status] || inv.status}
                      </div>
                      <div className="flex items-baseline gap-2 mt-1.5">
                        <div className="text-lg font-semibold tabular-nums">{formatCurrency(inv.remaining)}</div>
                        <div className="text-xs text-muted-foreground">осталось из {formatCurrency(inv.budgetAfter)}</div>
                      </div>
                    </div>
                    <MsgBtn inv={{ invoiceId: inv.invoiceId, invoiceNumber: inv.invoiceNumber }} big />
                  </div>
                  {expanded && canExpand && (
                    <div className="mt-3 pl-1 space-y-3">
                      <div className="text-xs text-muted-foreground">
                        Комиссия {formatCurrency(inv.commissionAmount)} ({inv.marginRate}%) · потрачено {formatCurrency(inv.spent)}
                      </div>
                      {hasExpenses && (() => {
                        const renderExpense = (e: typeof inv.expenses[number]) => (
                          <div className="flex items-start justify-between gap-2 text-sm py-1">
                            <div className="min-w-0 flex-1">
                              <div className="break-words">{e.description || '—'}</div>
                              {e.date && (
                                <div className="text-xs text-muted-foreground">{formatDate(e.date)}</div>
                              )}
                            </div>
                            <div className="tabular-nums whitespace-nowrap text-muted-foreground">{formatCurrency(e.amount)}</div>
                          </div>
                        );
                        return (
                          <div>
                            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">
                              Затраты · {inv.expenses.length}
                            </div>
                            {inv.expenses.length > VIRTUALIZATION_THRESHOLD ? (
                              <VirtualizedList
                                items={inv.expenses}
                                getRowKey={(e) => e.id}
                                rowHeight={56}
                                maxHeight={420}
                                renderRow={renderExpense}
                              />
                            ) : (
                              <div className="space-y-1.5">
                                {inv.expenses.map(e => (
                                  <div key={e.id}>{renderExpense(e)}</div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop: таблица. */}
          <div className="hidden sm:block overflow-x-auto -mx-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="w-7 py-2"></th>
                  <th className="text-left py-2 font-normal">Услуга</th>
                  <th className="text-right py-2 font-normal">Цена</th>
                  <th className="text-right py-2 font-normal">Комиссия</th>
                  <th className="text-right py-2 font-normal">Доступно</th>
                  <th className="text-right py-2 font-normal">Осталось</th>
                  <th className="w-8 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {data.agency.invoices.map(inv => {
                  const expanded = openInvoiceRows.has(inv.invoiceId);
                  const hasExpenses = inv.expenses.length > 0;
                  const canExpand = hasExpenses;
                  const serviceName = inv.notes || `Счёт № ${inv.invoiceNumber}`;
                  return (
                    <Fragment key={inv.invoiceId}>
                      <tr
                        className={`border-t border-border/60 ${canExpand ? "cursor-pointer" : ""}`}
                        onClick={canExpand ? () => toggleRow(inv.invoiceId) : undefined}
                        data-testid={`agency-row-${inv.invoiceId}`}
                      >
                        <td className="py-3 align-top">
                          {canExpand ? (
                            expanded
                              ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground mt-1" />
                              : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground mt-1" />
                          ) : null}
                        </td>
                        <td className="py-3 pr-4 align-top">
                          <div className="font-medium line-clamp-2 max-w-[28rem]">{serviceName}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {inv.notes ? `№ ${inv.invoiceNumber} · ` : ""}{statusLabel[inv.status] || inv.status}
                          </div>
                        </td>
                        <td className="py-3 text-right tabular-nums whitespace-nowrap align-top">{formatCurrency(inv.bill)}</td>
                        <td className="py-3 text-right tabular-nums whitespace-nowrap align-top">
                          <div>{formatCurrency(inv.commissionAmount)}</div>
                          <div className="text-xs text-muted-foreground">{inv.marginRate}%</div>
                        </td>
                        <td className="py-3 text-right tabular-nums whitespace-nowrap align-top">{formatCurrency(inv.budgetAfter)}</td>
                        <td className="py-3 text-right tabular-nums font-medium whitespace-nowrap align-top">{formatCurrency(inv.remaining)}</td>
                        <td className="py-3 pl-2 align-top">
                          <MsgBtn inv={{ invoiceId: inv.invoiceId, invoiceNumber: inv.invoiceNumber }} />
                        </td>
                      </tr>
                      {expanded && canExpand && (
                        <tr className="border-t border-border/40">
                          <td />
                          <td colSpan={6} className="py-3 pr-2 space-y-3">
                            <div className="text-xs text-muted-foreground">
                              Потрачено: <span className="tabular-nums text-foreground">{formatCurrency(inv.spent)}</span>
                            </div>
                            {hasExpenses && (() => {
                              const renderRow = (e: typeof inv.expenses[number]) => (
                                <div className="grid grid-cols-[100px_1fr_120px] gap-3 border-t border-border/30 py-1.5 text-sm">
                                  <div className="text-muted-foreground whitespace-nowrap">{e.date ? formatDate(e.date) : '—'}</div>
                                  <div className="break-words">{e.description || '—'}</div>
                                  <div className="text-right tabular-nums whitespace-nowrap">{formatCurrency(e.amount)}</div>
                                </div>
                              );
                              return (
                                <div>
                                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                                    Затраты по счёту · {inv.expenses.length}
                                  </div>
                                  <div className="grid grid-cols-[100px_1fr_120px] gap-3 text-xs text-muted-foreground py-1">
                                    <div>Дата</div>
                                    <div>Описание</div>
                                    <div className="text-right">Сумма</div>
                                  </div>
                                  {inv.expenses.length > VIRTUALIZATION_THRESHOLD ? (
                                    <VirtualizedList
                                      items={inv.expenses}
                                      getRowKey={(e) => e.id}
                                      rowHeight={40}
                                      maxHeight={480}
                                      renderRow={renderRow}
                                    />
                                  ) : (
                                    <div>
                                      {inv.expenses.map(e => (
                                        <div key={e.id}>{renderRow(e)}</div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Block>
      )}

      {/* ============ Блок 2: Подписки (recurring) ============ */}
      {hasRecurring && (
        <Block
          open={recurringOpen}
          onToggle={() => setRecurringOpen(o => !o)}
          testId="client-stats-recurring"
          hero={
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-2">
                Подписки · осталось
              </div>
              <div className="bv-number text-3xl sm:text-4xl md:text-5xl">
                {recurringHasActive ? formatCurrency(recurringTotalRemaining) : "без срока"}
              </div>
            </div>
          }
          subhero={
            <span>
              {data.recurring.length} {word(data.recurring.length, ["услуга", "услуги", "услуг"])}
            </span>
          }
        >
          <div className="divide-y divide-border/60">
            {data.recurring.map(r => {
              const isOpen = openTemplates.has(r.key);
              const unitForms: Record<string, [string, string, string]> = {
                month: ['месяц', 'месяца', 'месяцев'],
                day:   ['день',  'дня',    'дней'],
                hour:  ['час',   'часа',   'часов'],
              };
              return (
                <div key={r.key} data-testid={`recurring-row-${r.key}`}>
                  <button
                    type="button"
                    onClick={() => toggleTemplate(r.key)}
                    className="w-full flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 py-3 text-left"
                    aria-expanded={isOpen}
                  >
                    <div className="flex items-baseline gap-2 min-w-0">
                      <span className="text-muted-foreground shrink-0">
                        {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{r.description}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {formatCurrency(r.unitPrice)}/{r.unitLabel} · использовано {r.usedUnits} из {r.totalUnits}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {r.totalUnits > 0 ? (
                        <>
                          <div className="text-sm tabular-nums">
                            осталось <span className="font-semibold">{r.remainingUnits}</span> {word(r.remainingUnits, unitForms[r.unit] || unitForms.month)}
                          </div>
                          <div className="text-base font-semibold tabular-nums">
                            {formatCurrency(r.remainingMoney)}
                          </div>
                        </>
                      ) : (
                        <div className="text-sm text-muted-foreground">
                          без срока · использовано {r.usedUnits}
                        </div>
                      )}
                    </div>
                  </button>
                  {isOpen && r.invoices.length > 0 && (
                    <>
                    {/* Mobile: карточки счетов подписки. */}
                    <div className="sm:hidden divide-y divide-border/40 pb-3">
                      {r.invoices.map(inv => {
                        const hasTitle = !!inv.notes && inv.notes.trim().length > 0;
                        const isDuplicateName = hasTitle && inv.notes!.trim() === r.description.trim();
                        const showAsName = hasTitle && !isDuplicateName;
                        const dateLine = inv.actualPaymentDate
                          ? formatDate(inv.actualPaymentDate)
                          : inv.paymentDate ? `план ${formatDate(inv.paymentDate)}` : "—";
                        return (
                          <div key={inv.invoiceId} className="py-2.5">
                            <div className="flex items-start gap-2">
                              <div className="flex-1 min-w-0">
                                {showAsName ? (
                                  <>
                                    <div className="text-sm line-clamp-2">{inv.notes}</div>
                                    <div className="text-xs text-muted-foreground mt-0.5">№ {inv.invoiceNumber} · {statusLabel[inv.status] || inv.status}</div>
                                  </>
                                ) : (
                                  <div className="text-sm">№ {inv.invoiceNumber} <span className="text-xs text-muted-foreground ml-1">{statusLabel[inv.status] || inv.status}</span></div>
                                )}
                                <div className="flex items-baseline gap-2 mt-1">
                                  <div className="text-sm font-semibold tabular-nums">{formatCurrency(inv.bill)}</div>
                                  <div className="text-xs text-muted-foreground">{dateLine}</div>
                                </div>
                              </div>
                              <MsgBtn inv={{ invoiceId: inv.invoiceId, invoiceNumber: inv.invoiceNumber }} big />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {/* Desktop: таблица. */}
                    <div className="hidden sm:block pb-3 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-muted-foreground">
                            <th className="text-left py-2 font-normal">Период</th>
                            <th className="text-right py-2 font-normal">Сумма</th>
                            <th className="text-left py-2 font-normal">Оплата</th>
                            <th className="w-7 py-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {r.invoices.map(inv => {
                            const hasTitle = !!inv.notes && inv.notes.trim().length > 0;
                            const isDuplicateName = hasTitle && inv.notes!.trim() === r.description.trim();
                            const showAsName = hasTitle && !isDuplicateName;
                            return (
                              <tr key={inv.invoiceId} className="border-t border-border/40">
                                  <td className="py-2 pr-4 align-top">
                                    {showAsName ? (
                                      <>
                                        <div className="line-clamp-2 max-w-[24rem]">{inv.notes}</div>
                                        <div className="text-xs text-muted-foreground mt-0.5">
                                          № {inv.invoiceNumber} · {statusLabel[inv.status] || inv.status}
                                        </div>
                                      </>
                                    ) : (
                                      <div className="text-sm">
                                        № {inv.invoiceNumber}
                                        <span className="text-xs text-muted-foreground ml-2">{statusLabel[inv.status] || inv.status}</span>
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-2 text-right tabular-nums whitespace-nowrap align-top">{formatCurrency(inv.bill)}</td>
                                  <td className="py-2 text-muted-foreground whitespace-nowrap align-top">
                                    {inv.actualPaymentDate
                                      ? formatDate(inv.actualPaymentDate)
                                      : inv.paymentDate ? `план ${formatDate(inv.paymentDate)}` : "—"}
                                  </td>
                                  <td className="py-2 pl-2 align-top">
                                    <MsgBtn inv={{ invoiceId: inv.invoiceId, invoiceNumber: inv.invoiceNumber }} />
                                  </td>
                                </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </Block>
      )}

      {/* ============ Блок 3: Разовые работы ============ */}
      {hasOneTime && (
        <Block
          open={oneTimeOpen}
          onToggle={() => setOneTimeOpen(o => !o)}
          testId="client-stats-onetime"
          hero={
            data.oneTime.pendingCount > 0 ? (
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-2">
                  Разовые работы · к оплате
                </div>
                <div className="bv-number text-3xl sm:text-4xl md:text-5xl">
                  {formatCurrency(data.oneTime.pendingAmount)}
                </div>
              </div>
            ) : (
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-2">
                  Разовые работы
                </div>
                <div className="bv-number text-3xl sm:text-4xl md:text-5xl">
                  всё оплачено
                </div>
              </div>
            )
          }
          subhero={
            <span>
              оплачено <strong className="text-foreground">{formatCurrency(data.oneTime.paidAmount)}</strong> по {data.oneTime.paidCount} {word(data.oneTime.paidCount, ["счёту", "счетам", "счетам"])} ·
              {" "}итого <strong className="text-foreground">{formatCurrency(data.oneTime.totalAmount)}</strong> по {data.oneTime.totalCount} {word(data.oneTime.totalCount, ["счёту", "счетам", "счетам"])}
              {data.oneTime.pendingCount > 0 && (
                <> · <strong className="text-foreground">{data.oneTime.pendingCount}</strong> ждут оплаты</>
              )}
            </span>
          }
        >
          {/* Виртуализация при > 100 счетов: один скроллируемый список карточек
              для любого экрана. DOM держит ~10-20 строк независимо от размера
              data. Inline-раскрытие в этом режиме отключено — нужно открыть
              отдельный экран счёта для деталей (это редкий кейс для тех, у кого
              сотни разовых работ). */}
          {data.oneTime.invoices.length > VIRTUALIZATION_THRESHOLD ? (
            <div className="-mx-1">
              <div className="text-xs text-muted-foreground mb-2 px-1">
                Слишком много счетов для inline-просмотра.
                Виртуализированный список — скроллится плавно.
              </div>
              <VirtualizedList
                items={data.oneTime.invoices}
                getRowKey={(inv) => inv.invoiceId}
                rowHeight={92}
                maxHeight={typeof window !== "undefined" && window.innerWidth < 640 ? 560 : 720}
                renderRow={(inv) => {
                  const hasTitle = !!inv.notes && inv.notes.trim().length > 0;
                  const isPaid = inv.status === "paid";
                  const serviceName = hasTitle ? inv.notes! : `Счёт № ${inv.invoiceNumber}`;
                  const dateLine = inv.actualPaymentDate
                    ? formatDate(inv.actualPaymentDate)
                    : inv.paymentDate ? `план ${formatDate(inv.paymentDate)}` : "—";
                  return (
                    <div className="border-b border-border/60 py-3 flex items-start gap-2" data-testid={`onetime-virt-${inv.invoiceId}`}>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm line-clamp-1">{serviceName}</div>
                        <div className={`text-xs mt-0.5 ${isPaid ? "text-muted-foreground" : "text-foreground font-medium"}`}>
                          {hasTitle ? `№ ${inv.invoiceNumber} · ` : ""}{statusLabel[inv.status] || inv.status}
                        </div>
                        <div className="flex items-baseline gap-2 mt-1">
                          <div className="text-base font-semibold tabular-nums">{formatCurrency(inv.bill)}</div>
                          <div className="text-xs text-muted-foreground">{dateLine}</div>
                        </div>
                      </div>
                      <MsgBtn inv={{ invoiceId: inv.invoiceId, invoiceNumber: inv.invoiceNumber }} big />
                    </div>
                  );
                }}
              />
            </div>
          ) : (
          <>
          {/* Mobile: карточки. */}
          <div className="sm:hidden divide-y divide-border/60 -mx-1">
            {data.oneTime.invoices.map(inv => {
              const hasTitle = !!inv.notes && inv.notes.trim().length > 0;
              const isPaid = inv.status === 'paid';
              const serviceName = hasTitle ? inv.notes! : `Счёт № ${inv.invoiceNumber}`;
              const dateLine = inv.actualPaymentDate
                ? formatDate(inv.actualPaymentDate)
                : inv.paymentDate ? `план ${formatDate(inv.paymentDate)}` : "—";
              return (
                <div key={inv.invoiceId} className="py-3" data-testid={`onetime-card-${inv.invoiceId}`}>
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm line-clamp-2">{serviceName}</div>
                      <div className={`text-xs mt-0.5 ${isPaid ? "text-muted-foreground" : "text-foreground font-medium"}`}>
                        {hasTitle ? `№ ${inv.invoiceNumber} · ` : ""}{statusLabel[inv.status] || inv.status}
                      </div>
                      <div className="flex items-baseline gap-2 mt-1.5">
                        <div className="text-lg font-semibold tabular-nums">{formatCurrency(inv.bill)}</div>
                        <div className="text-xs text-muted-foreground">{dateLine}</div>
                      </div>
                    </div>
                    <MsgBtn inv={{ invoiceId: inv.invoiceId, invoiceNumber: inv.invoiceNumber }} big />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop: таблица. */}
          <div className="hidden sm:block overflow-x-auto -mx-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="text-left py-2 font-normal">Услуга</th>
                  <th className="text-right py-2 font-normal">Сумма</th>
                  <th className="text-left py-2 font-normal">Оплата</th>
                  <th className="w-8 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {data.oneTime.invoices.map(inv => {
                  const hasTitle = !!inv.notes && inv.notes.trim().length > 0;
                  const isPaid = inv.status === 'paid';
                  const serviceName = hasTitle ? inv.notes! : `Счёт № ${inv.invoiceNumber}`;
                  return (
                    <tr key={inv.invoiceId} className="border-t border-border/60" data-testid={`onetime-row-${inv.invoiceId}`}>
                      <td className="py-3 pr-4 align-top">
                        <div className="font-medium line-clamp-2 max-w-[32rem]">{serviceName}</div>
                        <div className={`text-xs mt-0.5 ${isPaid ? "text-muted-foreground" : "text-foreground font-medium"}`}>
                          {hasTitle ? `№ ${inv.invoiceNumber} · ` : ""}{statusLabel[inv.status] || inv.status}
                        </div>
                      </td>
                      <td className="py-3 text-right tabular-nums whitespace-nowrap align-top">{formatCurrency(inv.bill)}</td>
                      <td className="py-3 text-muted-foreground whitespace-nowrap align-top">
                        {inv.actualPaymentDate
                          ? formatDate(inv.actualPaymentDate)
                          : inv.paymentDate ? `план ${formatDate(inv.paymentDate)}` : "—"}
                      </td>
                      <td className="py-3 pl-2 align-top">
                        <MsgBtn inv={{ invoiceId: inv.invoiceId, invoiceNumber: inv.invoiceNumber }} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
          )}
        </Block>
      )}

      {msgTarget && (
        <SendMessageDialog
          open={!!msgTarget}
          onOpenChange={(o) => { if (!o) setMsgTarget(null); }}
          invoiceId={msgTarget.invoiceId}
          invoiceNumber={msgTarget.invoiceNumber}
          currentRole={currentRole ?? undefined}
        />
      )}
    </div>
  );
};
