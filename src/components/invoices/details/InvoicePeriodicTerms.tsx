import { parseNum } from "@shared/financialEngine";
import { Button } from "@/components/ui/button";

import { Progress } from "@/components/ui/progress";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

import { formatCurrency } from "@/lib/invoiceCalculations";
import { Loader2 } from "lucide-react";

import type { InvoiceDetailsModel } from "@/hooks/useInvoiceCommands";
type Props = Pick<
  InvoiceDetailsModel,
  | "invoice"
  | "userRole"
  | "convertOpen"
  | "setConvertOpen"
  | "setConvertUnit"
  | "convertUnit"
  | "convertPrice"
  | "setConvertPrice"
  | "convertTotal"
  | "setConvertTotal"
  | "converting"
  | "handleConvertToSubscription"
  | "handleRevertToOneTime"
>;
export function InvoicePeriodicTerms({ model }: { model: Props }) {
  const {
    invoice,
    userRole,
    convertOpen,
    setConvertOpen,
    setConvertUnit,
    convertUnit,
    convertPrice,
    setConvertPrice,
    convertTotal,
    setConvertTotal,
    converting,
    handleConvertToSubscription,
    handleRevertToOneTime,
  } = model;
  if (!invoice) return null;
  return (
    <>
      {invoice.service_type !== "periodic" &&
        (userRole === "admin" || userRole === "assistant") && (
          <div className="col-span-full pt-3 border-t">
            {!convertOpen ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConvertOpen(true)}
                className="gap-2"
                data-testid="button-convert-to-subscription"
              >
                + Превратить в подписку
              </Button>
            ) : (
              <div className="bg-indigo-50/40 dark:bg-indigo-950/20 p-3 rounded-lg space-y-3">
                <p className="text-sm font-semibold">Превратить в подписку</p>
                <p className="text-xs text-muted-foreground">
                  Сумма счёта пересчитается автоматически: цена × количество.
                  «Использовано» будет считаться по записям расходов
                  админа/ассистента.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Единица</Label>
                    <div className="grid grid-cols-3 gap-1">
                      {(["month", "day", "hour"] as const).map((u) => (
                        <button
                          key={u}
                          type="button"
                          onClick={() => setConvertUnit(u)}
                          className={`h-9 rounded-md border text-sm transition-colors ${
                            convertUnit === u
                              ? "border-primary bg-primary/10 font-medium"
                              : "border-input hover:bg-accent"
                          }`}
                          data-testid={`convert-unit-${u}`}
                        >
                          {u === "month"
                            ? "Месяц"
                            : u === "day"
                              ? "День"
                              : "Час"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">
                      Цена за{" "}
                      {convertUnit === "month"
                        ? "месяц"
                        : convertUnit === "day"
                          ? "день"
                          : "час"}
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={convertPrice}
                      onChange={(e) => setConvertPrice(e.target.value)}
                      placeholder="270000"
                      className="h-9"
                      data-testid="input-convert-price"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Количество</Label>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      value={convertTotal}
                      onChange={(e) => setConvertTotal(e.target.value)}
                      placeholder="11"
                      className="h-9"
                      data-testid="input-convert-total"
                    />
                  </div>
                </div>
                {parseNum(convertPrice) > 0 &&
                  parseInt(convertTotal, 10) > 0 && (
                    <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2 text-sm">
                      <span className="text-muted-foreground">
                        Новая сумма счёта:
                      </span>
                      <span className="font-semibold tabular-nums">
                        {formatCurrency(
                          parseNum(convertPrice) * parseInt(convertTotal, 10),
                        )}
                      </span>
                    </div>
                  )}
                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setConvertOpen(false);
                      setConvertPrice("");
                      setConvertTotal("");
                    }}
                    disabled={converting}
                  >
                    Отмена
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleConvertToSubscription}
                    disabled={
                      converting ||
                      !(parseNum(convertPrice) > 0) ||
                      !(parseInt(convertTotal, 10) > 0)
                    }
                    data-testid="button-confirm-convert"
                  >
                    {converting && (
                      <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                    )}
                    Превратить
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      {/* Периодическая услуга — для всех ролей, у админа/ассистента — с управлением */}
      {invoice.service_type === "periodic" &&
        (() => {
          const total = Number(invoice.total_periods ?? 0);
          const used = Math.max(
            0,
            Math.min(Number(invoice.periods_used ?? 0), total),
          );
          const price = Number(invoice.price_per_period ?? 0);
          const remaining = Math.max(0, total - used);
          const unitLabel =
            invoice.period_unit === "day"
              ? "дн"
              : invoice.period_unit === "hour"
                ? "ч"
                : "мес";
          const canManage = userRole === "admin" || userRole === "assistant";
          const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
          return (
            <div className="col-span-full pt-3 border-t">
              <p className="text-sm font-semibold text-muted-foreground mb-2">
                Периодическая услуга
              </p>
              <div className="bg-indigo-50/40 dark:bg-indigo-950/20 p-3 rounded-lg space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Цена за {unitLabel}
                    </p>
                    <p className="font-semibold tabular-nums">
                      {formatCurrency(price)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Всего</p>
                    <p className="font-semibold tabular-nums">
                      {total} {unitLabel}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Использовано
                    </p>
                    <p className="font-semibold tabular-nums">
                      {used} {unitLabel}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Осталось</p>
                    <p className="font-semibold tabular-nums">
                      {remaining} {unitLabel} ·{" "}
                      {formatCurrency(price * remaining)}
                    </p>
                  </div>
                </div>
                <Progress value={pct} className="h-2" />
                {canManage && (
                  <div className="flex justify-end pt-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleRevertToOneTime}
                      disabled={converting}
                      className="text-muted-foreground hover:text-foreground"
                      data-testid="button-revert-to-onetime"
                    >
                      Превратить обратно в разовый
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })()}
    </>
  );
}
