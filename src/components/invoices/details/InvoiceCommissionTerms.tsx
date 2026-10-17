
import { Button } from "@/components/ui/button";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

import { getSchemeLabel } from "@/lib/invoiceCalculations";
import { Loader2 } from "lucide-react";

import type { InvoiceDetailsModel } from "@/hooks/useInvoiceCommands";
type Props = Pick<
  InvoiceDetailsModel,
  | "userRole"
  | "invoice"
  | "isAgency30"
  | "partnerRate"
  | "setPartnerRate"
  | "updatingPartnerRate"
  | "handleUpdateCommission"
  | "calc"
>;
export function InvoiceCommissionTerms({ model }: { model: Props }) {
  const {
    userRole,
    invoice,
    isAgency30,
    partnerRate,
    setPartnerRate,
    updatingPartnerRate,
    handleUpdateCommission,
    calc,
  } = model;
  if (!invoice) return null;
  return (
    <>
      {(userRole === "partner" || userRole === "admin") && (
        <div className="col-span-full pt-3 border-t">
          <p className="text-sm font-semibold text-muted-foreground mb-2">
            Условия сотрудничества по счёту
          </p>
          <div className="bg-muted/30 p-3 rounded-lg space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Схема:</span>
              <span className="font-medium">
                {getSchemeLabel(
                  invoice.scheme,
                  userRole,
                  invoice.partner_commission_rate,
                )}
              </span>
            </div>
            {isAgency30 ? (
              <div className="text-xs text-muted-foreground pt-1">
                Условия распределения маржи закреплены в договоре и не
                раскрываются ассистенту.
              </div>
            ) : (
              <div className="space-y-1">
                {userRole === "admin" ? (
                  <div>
                    <Label className="text-sm text-muted-foreground">
                      Процент партнёра
                    </Label>
                    <div className="flex gap-2 items-center mt-1">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={partnerRate}
                        onChange={(e) => {
                          const value = e.target.value;
                          setPartnerRate(value === "" ? "" : Number(value));
                        }}
                        className="w-24 text-sm"
                        disabled={updatingPartnerRate}
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (
                            partnerRate !== "" &&
                            !Number.isNaN(partnerRate)
                          ) {
                            handleUpdateCommission(Number(partnerRate));
                          }
                        }}
                        disabled={updatingPartnerRate || partnerRate === ""}
                      >
                        {updatingPartnerRate ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Сохранить"
                        )}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      Процент партнёра:
                    </span>
                    <span className="font-semibold text-primary">
                      {(() => {
                        const rate =
                          calc?.commission_rate ??
                          invoice.partner_commission_rate;
                        return rate ? `${rate}%` : "по договору";
                      })()}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
