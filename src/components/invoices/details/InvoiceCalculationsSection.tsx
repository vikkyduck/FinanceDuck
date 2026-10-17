import { parseNum } from "@shared/financialEngine";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { Progress } from "@/components/ui/progress";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

import { formatCurrency } from "@/lib/invoiceCalculations";
import { Loader2 } from "lucide-react";

import { lazy, Suspense } from "react";
const InvoiceWaterfallChart = lazy(() =>
  import("@/components/invoices/InvoiceWaterfallChart").then((module) => ({
    default: module.InvoiceWaterfallChart,
  })),
);
import { CatShareBadge } from "@/components/invoices/CatShareBadge";

import type { InvoiceDetailsModel } from "@/hooks/useInvoiceCommands";
type Props = Pick<
  InvoiceDetailsModel,
  | "userRole"
  | "calc"
  | "expenses"
  | "invoice"
  | "isAgency30"
  | "canEdit"
  | "clientBillEdit"
  | "setClientBillEdit"
  | "handleUpdateClientBill"
  | "updatingClientBill"
  | "permissions"
  | "handleUpdateCommission"
  | "toast"
  | "plannedExpensesEdit"
  | "setPlannedExpensesEdit"
  | "handleUpdatePlannedExpenses"
  | "updatingPlannedExpenses"
>;
export function InvoiceCalculationsSection({ model }: { model: Props }) {
  const {
    userRole,
    calc,
    expenses,
    invoice,
    isAgency30,
    canEdit,
    clientBillEdit,
    setClientBillEdit,
    handleUpdateClientBill,
    updatingClientBill,
    permissions,
    handleUpdateCommission,
    toast,
    plannedExpensesEdit,
    setPlannedExpensesEdit,
    handleUpdatePlannedExpenses,
    updatingPlannedExpenses,
  } = model;
  if (!invoice) return null;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-lg">Расчеты</CardTitle>
        {userRole === "admin" && calc && (calc.cat_share_50 ?? 0) > 0 && (
          <CatShareBadge
            catShare={calc.cat_share_50 ?? 0}
            adminShare={calc.admin_share_50 ?? 0}
          />
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Waterfall Visualization - only for admin, contains commission/profit data */}
        {userRole === "admin" &&
          (() => {
            const expensesPaidByPartner = expenses
              .filter((e) => e.paidByAdmin !== true)
              .reduce((sum: number, e) => sum + parseNum(e.amount || "0"), 0);
            const expensesPaidByAdmin = expenses
              .filter((e) => e.paidByAdmin === true)
              .reduce((sum: number, e) => sum + parseNum(e.amount || "0"), 0);

            return (
              <Suspense
                fallback={
                  <p className="text-sm text-muted-foreground">
                    Загрузка диаграммы…
                  </p>
                }
              >
                {" "}
                <InvoiceWaterfallChart
                  clientBill={calc?.client_bill || 0}
                  scheme={invoice.scheme}
                  commissionRate={calc?.commission_rate}
                  executorExpenses={calc?.executor_expenses_total || 0}
                  expensesPaidByPartner={expensesPaidByPartner}
                  expensesPaidByAdmin={expensesPaidByAdmin}
                  partnerShare={
                    isAgency30
                      ? calc?.partner_share_from_margin || 0
                      : calc?.commission_amount || 0
                  }
                  adminShare={
                    isAgency30
                      ? calc?.admin_share_from_margin || 0
                      : calc?.net_profit_admin || 0
                  }
                  netProfitAdmin={calc?.net_profit_admin || 0}
                  catShare={calc?.cat_share_50}
                  showCatShare={true}
                />{" "}
              </Suspense>
            );
          })()}

        <div className="flex justify-between text-lg font-bold">
          <span>Счет клиенту:</span>
          {userRole === "admin" && canEdit ? (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={clientBillEdit}
                onChange={(e) => {
                  const val = e.target.value;
                  setClientBillEdit(val === "" ? "" : Number(val));
                }}
                className="w-32 text-right"
                data-testid="input-client-bill"
              />
              <Button
                size="sm"
                onClick={() => {
                  if (clientBillEdit !== "" && !Number.isNaN(clientBillEdit)) {
                    handleUpdateClientBill(Number(clientBillEdit));
                  }
                }}
                disabled={updatingClientBill || clientBillEdit === ""}
                data-testid="button-save-client-bill"
              >
                {updatingClientBill ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Сохранить"
                )}
              </Button>
            </div>
          ) : (
            <span>{formatCurrency(calc?.client_bill || 0)}</span>
          )}
        </div>

        {isAgency30 ? (
          <>
            {permissions.showAgencyMargin && (
              <div className="pl-4 space-y-2 border-l-2 border-primary/20">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Маржа агентства (
                    {invoice.scheme === "agency_40" ? "40%" : "30%"}):
                  </span>
                  <span>{formatCurrency(calc?.agency_margin || 0)}</span>
                </div>
                {permissions.showPartnerShare && (
                  <div className="flex justify-between text-sm pl-4">
                    <span className="text-muted-foreground">→ Партнер:</span>
                    <span>
                      {formatCurrency(calc?.partner_share_from_margin || 0)}
                    </span>
                  </div>
                )}
                {permissions.showAdminShare && (
                  <div className="flex justify-between text-sm pl-4">
                    <span className="text-muted-foreground">→ Админ:</span>
                    <span className="text-primary font-medium">
                      {formatCurrency(calc?.admin_share_from_margin || 0)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {permissions.showClientBudget && (
              <div className="pl-4 space-y-2 border-l-2 border-muted">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Бюджет клиента (
                    {invoice.scheme === "agency_40" ? "60%" : "70%"}):
                  </span>
                  <span>
                    {formatCurrency(calc?.client_base_after_margin || 0)}
                  </span>
                </div>
                {permissions.showExpensesTotal && (
                  <div className="flex justify-between text-sm pl-4">
                    <span className="text-muted-foreground">→ Расходы:</span>
                    <span>
                      {formatCurrency(calc?.executor_expenses_total || 0)}
                    </span>
                  </div>
                )}
                {permissions.showClientRemaining && (
                  <div className="flex justify-between text-sm pl-4">
                    <span className="text-muted-foreground">→ Остаток:</span>
                    <span
                      className={
                        (calc?.client_remaining ?? 0) < 0
                          ? "text-destructive font-medium"
                          : ""
                      }
                    >
                      {formatCurrency(calc?.client_remaining || 0)}
                    </span>
                  </div>
                )}
                {calc && (calc.client_base_after_margin ?? 0) > 0 && (
                  <Progress
                    value={Math.min(
                      ((calc.executor_expenses_total ?? 0) /
                        (calc.client_base_after_margin ?? 1)) *
                        100,
                      100,
                    )}
                    className="h-2"
                  />
                )}
              </div>
            )}
          </>
        ) : (
          <>
            {permissions.showCommissionDetails && (
              <>
                <div className="space-y-3 pl-4 border-l-2 border-primary/20">
                  {userRole === "admin" ? (
                    <div className="space-y-2">
                      <Label>Процент партнера</Label>
                      <div className="flex gap-2 items-center">
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          defaultValue={calc?.commission_rate || 0}
                          className="w-24"
                          id="commission-rate-input"
                        />
                        <span>%</span>
                        <Button
                          size="sm"
                          onClick={() => {
                            const input = document.getElementById(
                              "commission-rate-input",
                            ) as HTMLInputElement;
                            const rate = parseNum(input.value);
                            if (rate >= 0 && rate <= 100) {
                              handleUpdateCommission(rate);
                            } else {
                              toast({
                                title: "Ошибка",
                                description: "Процент должен быть от 0 до 100",
                                variant: "destructive",
                              });
                            }
                          }}
                        >
                          Установить
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        Процент партнера:
                      </span>
                      <span className="font-medium">
                        {calc?.commission_rate}%
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Комиссия партнера:</span>
                    <span>{formatCurrency(calc?.commission_amount || 0)}</span>
                  </div>

                  {permissions.showPartnerShare && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        Доля партнера:
                      </span>
                      <span className="font-medium">
                        {formatCurrency(calc?.commission_amount || 0)}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between text-sm">
                    <span>Долг партнёра к переводу:</span>
                    <span className="text-primary font-medium">
                      {formatCurrency(calc?.partner_transfer_due || 0)}
                    </span>
                  </div>

                  {permissions.showExpensesTotal && (
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Расходы на исполнителей:</span>
                      <span>
                        {formatCurrency(calc?.executor_expenses_total || 0)}
                      </span>
                    </div>
                  )}

                  {userRole === "admin" &&
                    (() => {
                      const reservedAmount = invoice?.planned_expenses
                        ? parseNum(invoice.planned_expenses)
                        : 0;
                      // Only count expenses paid by partner (from client money) as spent from reserve
                      const spentFromReserve = expenses
                        .filter((e) => e.paidByAdmin !== true)
                        .reduce(
                          (sum: number, e) => sum + parseNum(e.amount || "0"),
                          0,
                        );
                      const adminPaidExpenses = expenses
                        .filter((e) => e.paidByAdmin === true)
                        .reduce(
                          (sum: number, e) => sum + parseNum(e.amount || "0"),
                          0,
                        );
                      const remainingReserve =
                        reservedAmount - spentFromReserve;
                      const isOverspent =
                        remainingReserve < 0 && reservedAmount > 0;

                      return (
                        <div className="space-y-3 pt-3 border-t border-muted">
                          <Label className="text-sm font-medium">
                            Планируемые расходы на проект
                          </Label>

                          {reservedAmount > 0 && (
                            <div className="bg-muted/50 rounded-md p-3 space-y-2">
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">
                                  Зарезервировано:
                                </span>
                                <span className="font-medium">
                                  {formatCurrency(reservedAmount)}
                                </span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">
                                  Потрачено (из денег клиента):
                                </span>
                                <span
                                  className={
                                    isOverspent
                                      ? "font-medium text-destructive"
                                      : "font-medium"
                                  }
                                >
                                  {formatCurrency(spentFromReserve)}
                                </span>
                              </div>
                              {adminPaidExpenses > 0 && (
                                <div className="flex justify-between text-sm text-muted-foreground">
                                  <span>Оплачено админом (не из резерва):</span>
                                  <span>
                                    {formatCurrency(adminPaidExpenses)}
                                  </span>
                                </div>
                              )}
                              <div className="flex justify-between text-sm border-t pt-2">
                                <span className="font-medium">
                                  Осталось резерва:
                                </span>
                                <span
                                  className={`font-bold ${isOverspent ? "text-destructive" : remainingReserve > 0 ? "text-primary" : "text-muted-foreground"}`}
                                >
                                  {isOverspent
                                    ? `-${formatCurrency(Math.abs(remainingReserve))}`
                                    : formatCurrency(remainingReserve)}
                                </span>
                              </div>
                              {isOverspent && (
                                <p className="text-xs text-destructive">
                                  Расходы превысили зарезервированную сумму
                                </p>
                              )}
                            </div>
                          )}

                          <div className="flex gap-2 items-center">
                            <Input
                              type="number"
                              min="0"
                              step="1"
                              value={plannedExpensesEdit}
                              onChange={(e) => {
                                const val = e.target.value;
                                setPlannedExpensesEdit(
                                  val === "" ? "" : Number(val),
                                );
                              }}
                              className="w-32 text-right"
                              data-testid="input-planned-expenses"
                              placeholder="0"
                            />
                            <Button
                              size="sm"
                              onClick={() => {
                                if (
                                  plannedExpensesEdit !== "" &&
                                  !Number.isNaN(plannedExpensesEdit)
                                ) {
                                  handleUpdatePlannedExpenses(
                                    Number(plannedExpensesEdit),
                                  );
                                }
                              }}
                              disabled={updatingPlannedExpenses}
                              data-testid="button-save-planned-expenses"
                            >
                              {updatingPlannedExpenses ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                "Сохранить"
                              )}
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Сумма резервируется на расходы проекта (зарплаты,
                            материалы)
                          </p>
                        </div>
                      );
                    })()}
                </div>
              </>
            )}
          </>
        )}

        {permissions.showNetProfitAdmin && (
          <div className="border-t pt-3 space-y-2 bg-primary/5 -mx-6 px-6 py-3">
            <div className="flex justify-between font-bold">
              <span>Чистая прибыль админа:</span>
              <span className="text-primary">
                {formatCurrency(calc?.net_profit_admin || 0)}
              </span>
            </div>
            {permissions.showAdminCatSplit && (
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Админ (50%):</span>
                  <span className="font-medium">
                    {formatCurrency(calc?.admin_share_50 || 0)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Доля Кота (50%):
                  </span>
                  <span className="font-medium">
                    {formatCurrency(calc?.cat_share_50 || 0)}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
