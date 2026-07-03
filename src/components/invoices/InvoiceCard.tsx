import { useSwipeable } from "react-swipeable";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InvoiceProgressBadge } from "./InvoiceProgressBadge";
import { formatCurrency, formatDate, getSchemeLabel, calculateInvoice } from "@/lib/invoiceCalculations";
import { Eye, CheckCircle2, Send, Trash2, EyeOff, Clock, Repeat } from "lucide-react";
import { Progress } from "@/components/ui/progress";

type InvoiceStatus = "draft" | "sent" | "paid" | "cancelled";

interface InvoiceCardProps {
  invoice: any;
  onViewDetails: (id: string) => void;
  onMarkPaid?: (id: string) => void;
  onSend?: (id: string) => void;
  onDelete?: (id: string, number: string) => void;
  role: 'admin' | 'assistant' | 'client' | 'partner';
  enableDelete?: boolean;
}

export const InvoiceCard = ({
  invoice,
  onViewDetails,
  onMarkPaid,
  onSend,
  onDelete,
  role,
  enableDelete = false,
}: InvoiceCardProps) => {
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);

  const scheme = invoice.scheme as 'agency_30' | 'agency_40' | 'commission_based';
  const clientBill = invoice.client_bill ?? 0;
  const executorExpensesTotal = invoice.executor_expenses_total ?? 0;
  const commissionRate = invoice.partner_commission_rate ?? invoice.commission_rate ?? undefined;
  const calc = calculateInvoice(scheme, clientBill, commissionRate, executorExpensesTotal);

  const clientRemaining = invoice.client_remaining ?? calc.client_remaining ?? 0;
  const partnerMarginShare = invoice.partner_share_from_margin ?? calc.partner_share_from_margin ?? 0;
  const adminMarginShare = invoice.admin_share_from_margin ?? calc.admin_share_from_margin ?? 0;
  const commissionAmount = invoice.commission_amount ?? calc.commission_amount ?? 0;

  const handlers = useSwipeable({
    onSwipedLeft: () => {
      if (enableDelete || invoice.status !== 'paid') {
        setSwipeDirection('left');
      }
    },
    onSwipedRight: () => {
      setSwipeDirection('right');
      setTimeout(() => onViewDetails(invoice.id), 200);
    },
    onSwiping: () => {},
    trackMouse: false,
    preventScrollOnSwipe: true,
  });

  const quickActions = [
    ...(invoice.status === 'draft' && onSend ? [{
      icon: Send,
      label: "Отправить",
      onClick: () => onSend(invoice.id),
      variant: "default" as const,
    }] : []),
    ...(invoice.status === 'sent' && onMarkPaid ? [{
      icon: CheckCircle2,
      label: "Оплачен",
      onClick: () => onMarkPaid(invoice.id),
      variant: "default" as const,
    }] : []),
    ...(enableDelete && onDelete ? [{
      icon: Trash2,
      label: "Удалить",
      onClick: () => onDelete(invoice.id, invoice.invoice_number),
      variant: "destructive" as const,
    }] : []),
  ];

  return (
    <div className="relative" {...handlers}>
      <motion.div
        animate={{
          x: swipeDirection === 'left' ? -100 : swipeDirection === 'right' ? 20 : 0,
        }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        onAnimationComplete={() => {
          if (swipeDirection === 'left') {
            setTimeout(() => setSwipeDirection(null), 2000);
          } else if (swipeDirection === 'right') {
            setSwipeDirection(null);
          }
        }}
      >
        <Card className={`transition-all duration-fast hover:shadow-md ${invoice.hidden_from_assistant ? 'opacity-60 border-border/50' : 'border-border'}`}>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-base font-semibold">
                  № {invoice.invoice_number}
                </CardTitle>
                {invoice.hidden_from_assistant && (
                  <Badge variant="secondary" className="gap-1 text-xs">
                    <EyeOff className="h-3 w-3" />
                    Скрыт
                  </Badge>
                )}
              </div>
              <InvoiceProgressBadge status={invoice.status as InvoiceStatus} />
            </div>
          </CardHeader>

          <CardContent className="space-y-3">
            {/* Client */}
            <div>
              <p className="text-xs text-muted-foreground">Клиент</p>
              <p className="font-medium text-sm">{invoice.clients?.name || invoice.client_name}</p>
              {(invoice.clients as any)?.contactPerson && (
                <p className="text-xs text-muted-foreground">
                  Контакт: {(invoice.clients as any).contactPerson}
                </p>
              )}
            </div>

            {/* Amount */}
            <div>
              <p className="text-xs text-muted-foreground">Сумма счета</p>
              <p className="text-2xl font-semibold tracking-tight">
                {formatCurrency(clientBill)}
              </p>
            </div>

            {/* Периодическая услуга — единый блок для всех ролей.
                Показываем цену за период, использовано / осталось, прогресс. */}
            {invoice.service_type === 'periodic' && (() => {
              const total = Number(invoice.total_periods ?? 0);
              const used = Math.max(0, Math.min(Number(invoice.periods_used ?? 0), total));
              const price = Number(invoice.price_per_period ?? 0);
              const left = Math.max(0, total - used);
              const unit = invoice.period_unit === 'day' ? 'дн' : 'мес';
              const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
              const unitWord = invoice.period_unit === 'day' ? 'день' : 'месяц';
              return (
                <div className="rounded-lg border border-indigo-200/50 dark:border-indigo-800/30 bg-indigo-50/40 dark:bg-indigo-950/20 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                    <Repeat className="h-3.5 w-3.5" />
                    Периодическая услуга
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Цена за {unit}</p>
                      <p className="font-medium">{formatCurrency(price)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Всего {unitWord}ев</p>
                      <p className="font-medium">{total}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Использовано</p>
                      <p className="font-medium">{used} из {total} {unit}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Осталось</p>
                      <p className="font-medium">{left} {unit} · {formatCurrency(price * left)}</p>
                    </div>
                  </div>
                  <Progress value={pct} className="h-1.5" />
                </div>
              );
            })()}

            {/* Условия сотрудничества (только для партнёра и админа) */}
            {(role === 'partner' || role === 'admin') && (
              <div className="pt-2 border-t bg-muted/30 -mx-6 px-6 py-3">
                <p className="text-xs font-semibold text-muted-foreground mb-2">Условия сотрудничества</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Схема:</span>
                    <span className="font-medium">{getSchemeLabel(scheme, role, commissionRate)}</span>
                  </div>
                  {(scheme === 'agency_30' || scheme === 'agency_40') ? (
                    <div className="text-xs text-muted-foreground pt-1">
                      Условия вознаграждения фиксируются в договоре и не раскрываются ассистенту.
                    </div>
                  ) : (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Процент партнёра:</span>
                      <span className="font-semibold">
                        {commissionRate ? `${commissionRate}%` : 'по договору'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Partner Financial Details - только для партнёра, ассистент не видит */}
            {role === 'partner' && (
              <div className="space-y-2 pt-2 border-t">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Расходы</p>
                    <p className="font-medium">{formatCurrency(executorExpensesTotal)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Остаток клиента</p>
                    <p className="font-medium">{formatCurrency(clientRemaining)}</p>
                  </div>
                </div>
                
                {(scheme === 'agency_30' || scheme === 'agency_40') ? (
                  <div className="grid grid-cols-2 gap-2 text-sm pt-1">
                    <div>
                      <p className="text-xs text-muted-foreground">Доля партнёра</p>
                      <p className="font-semibold text-primary">{formatCurrency(partnerMarginShare)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Доля админа</p>
                      <p className="font-medium">{formatCurrency(adminMarginShare)}</p>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs text-muted-foreground">Комиссия партнёра</p>
                    <p className="font-semibold text-primary text-lg">{formatCurrency(commissionAmount)}</p>
                  </div>
                )}
              </div>
            )}

            {/* Dates */}
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">План. оплата</p>
                <p className="font-medium text-sm">
                  {invoice.payment_date ? formatDate(invoice.payment_date) : "—"}
                </p>
              </div>
              {invoice.actual_payment_date && (
                <div>
                  <p className="text-xs text-muted-foreground">Факт. оплата</p>
                  <p className="font-medium text-sm text-success">
                    {formatDate(invoice.actual_payment_date)}
                  </p>
                </div>
              )}
            </div>

            {/* Admin Financial Details - полная информация для админа */}
            {role === 'admin' && (() => {
              // Use stored partnerTransferDue as single source of truth
              const storedDebt = Number(invoice.partner_transfer_due) || 0;
              const debtToAdmin = Math.max(0, storedDebt);
              const netProfit = invoice.net_profit_admin ?? calc.net_profit_admin ?? 0;
              return (
                <div className="space-y-2 pt-2 border-t">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Расходы</p>
                      <p className="font-medium">{formatCurrency(executorExpensesTotal)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {scheme === 'agency_40' ? 'Доля админа (24%)' : scheme === 'agency_30' ? 'Доля админа (15%)' : 'Прибыль админа'}
                      </p>
                      <p className="font-semibold text-primary">{formatCurrency(netProfit)}</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Долг партнёра</p>
                      <p className="font-semibold text-destructive">{formatCurrency(debtToAdmin)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {scheme === 'agency_40' ? 'Остаток 60%' : scheme === 'agency_30' ? 'Остаток 70%' : 'Остаток клиента'}
                      </p>
                      <p className="font-medium">{formatCurrency(clientRemaining)}</p>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Partner and Notes (for admin/assistant) */}
            {(role === 'admin' || role === 'assistant') && (
              <div className="pt-2 border-t space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Партнёр</p>
                    <p className="font-medium text-sm">{invoice.partner_name || invoice.partners?.name || "—"}</p>
                  </div>
                  {invoice.notes && (
                    <div>
                      <p className="text-xs text-muted-foreground">Комментарий</p>
                      <p className="font-medium text-sm text-muted-foreground line-clamp-2">{invoice.notes}</p>
                    </div>
                  )}
                </div>
                {!invoice.notes && (
                  <div className="text-xs text-muted-foreground/60 italic">Комментарий отсутствует</div>
                )}
              </div>
            )}

            {/* Action button */}
            <Button
              variant="outline"
              className="w-full gap-2 mt-2"
              onClick={() => onViewDetails(invoice.id)}
            >
              <Eye className="h-4 w-4" />
              Подробнее
            </Button>
          </CardContent>
        </Card>
      </motion.div>

      {/* Quick Actions Panel */}
      <AnimatePresence>
        {swipeDirection === 'left' && quickActions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 50 }}
            transition={{ duration: 0.2 }}
            className="absolute right-0 top-0 h-full flex items-center gap-1.5 pr-2"
          >
            {quickActions.map((action, index) => (
              <Button
                key={index}
                variant={action.variant}
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  action.onClick();
                  setSwipeDirection(null);
                }}
                className="h-10 w-10 rounded-full"
                aria-label={action.label}
              >
                <action.icon className="h-4 w-4" />
              </Button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
