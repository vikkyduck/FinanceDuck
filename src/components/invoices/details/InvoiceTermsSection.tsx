import { InvoiceArchiveAction } from './InvoiceArchiveAction';
import { InvoicePeriodicTerms } from "./InvoicePeriodicTerms";
import { InvoiceCommissionTerms } from "./InvoiceCommissionTerms";
import { InvoicePaymentMetadata } from "./InvoicePaymentMetadata";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

import { Switch } from "@/components/ui/switch";

import { formatDate } from "@/lib/invoiceCalculations";
import { Loader2 } from "lucide-react";

import { ClientCombobox } from "@/components/invoices/assistant/ClientCombobox";

import type { InvoiceDetailsModel } from "@/hooks/useInvoiceCommands";
type Props = Pick<
  InvoiceDetailsModel,
  | "invoice"
  | "userRole"
  | "moveOpen"
  | "setMoveClientId"
  | "setMoveOpen"
  | "moveClientId"
  | "movingInvoice"
  | "handleMoveInvoice"
  | "getStatusLabel"
  | "hideFromAssistant"
  | "handleToggleHideFromAssistant"
  | "updatingHideFromAssistant"
  | "clientTitleEdit"
  | "setClientTitleEdit"
  | "handleSaveClientTitle"
  | "updatingClientTitle"
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
  | "handleSetPeriod"
  | "isAgency30"
  | "partnerRate"
  | "setPartnerRate"
  | "updatingPartnerRate"
  | "handleUpdateCommission"
  | "calc"
  | "permissions"
  | "handleStatusChangeRequest"
  | "updatingStatus"
  | "plannedPaymentDate"
  | "updatingPaymentDate"
  | "setPlannedPaymentDate"
  | "handleUpdatePlannedDate"
  | "actualPaymentDate"
  | "setActualPaymentDate"
  | "handleUpdateActualPaymentDate"
  | "notes"
  | "setNotes"
  | "updatingNotes"
  | "handleUpdateNotes"
>;
export function InvoiceTermsSection({ model }: { model: Props }) {
  const {
    invoice,
    userRole,
    moveOpen,
    setMoveClientId,
    setMoveOpen,
    moveClientId,
    movingInvoice,
    handleMoveInvoice,
    getStatusLabel,
    hideFromAssistant,
    handleToggleHideFromAssistant,
    updatingHideFromAssistant,
    clientTitleEdit,
    setClientTitleEdit,
    handleSaveClientTitle,
    updatingClientTitle,
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
    isAgency30,
    partnerRate,
    setPartnerRate,
    updatingPartnerRate,
    handleUpdateCommission,
    calc,
    permissions,
    handleStatusChangeRequest,
    updatingStatus,
    plannedPaymentDate,
    updatingPaymentDate,
    setPlannedPaymentDate,
    handleUpdatePlannedDate,
    actualPaymentDate,
    setActualPaymentDate,
    handleUpdateActualPaymentDate,
    notes,
    setNotes,
    updatingNotes,
    handleUpdateNotes,
  } = model;
  if (!invoice) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Информация о счете</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {userRole === 'admin' && invoice && <InvoiceArchiveAction invoiceId={invoice.id} archived={Boolean(invoice.archived_at)} />}
        <div>
          <p className="text-sm text-muted-foreground">Клиент</p>
          <div className="flex items-center gap-2">
            <p className="font-medium">{invoice.clients?.name}</p>
            {userRole === "admin" && !moveOpen && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setMoveClientId(invoice.client_id || "");
                  setMoveOpen(true);
                }}
                data-testid="button-move-invoice"
              >
                Перенести →
              </Button>
            )}
          </div>
          {userRole === "admin" && moveOpen && (
            <div className="mt-2 space-y-2 rounded-md border bg-muted/20 p-2">
              <Label className="text-xs">Новый клиент</Label>
              <ClientCombobox value={moveClientId} onChange={setMoveClientId} />
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setMoveOpen(false);
                    setMoveClientId("");
                  }}
                  disabled={movingInvoice}
                >
                  Отмена
                </Button>
                <Button
                  size="sm"
                  onClick={handleMoveInvoice}
                  disabled={
                    movingInvoice ||
                    !moveClientId ||
                    moveClientId === invoice.client_id
                  }
                  data-testid="button-confirm-move"
                >
                  {movingInvoice && (
                    <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                  )}
                  Перенести
                </Button>
              </div>
            </div>
          )}
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Партнер</p>
          <p className="font-medium">{invoice.partners?.name}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Дата создания</p>
          <p className="font-medium">{formatDate(invoice.created_at)}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Статус</p>
          <p className="font-medium">{getStatusLabel(invoice.status)}</p>
        </div>

        {/* Скрыть от ассистента - только для админа */}
        {userRole === "admin" && (
          <div className="col-span-full pt-3 border-t">
            <div className="flex items-center justify-between">
              <div>
                <Label
                  htmlFor="hide-from-assistant"
                  className="text-sm font-medium"
                >
                  Скрыть от ассистента
                </Label>
                <p className="text-xs text-muted-foreground">
                  Ассистент не увидит этот счёт в списке
                </p>
              </div>
              <Switch
                id="hide-from-assistant"
                checked={hideFromAssistant}
                onCheckedChange={handleToggleHideFromAssistant}
                disabled={updatingHideFromAssistant}
                data-testid="switch-hide-from-assistant"
              />
            </div>
          </div>
        )}

        {/* Название для клиента — admin/assistant */}
        {(userRole === "admin" || userRole === "assistant") && (
          <div className="col-span-full pt-3 border-t">
            <Label htmlFor="client-title" className="text-sm font-medium">
              Название для клиента
            </Label>
            <p className="text-xs text-muted-foreground mb-2">
              То, что увидит клиент в кабинете. Перебивает «Примечания» и
              внутреннее «Описание».
            </p>
            <div className="flex items-end gap-2">
              <Input
                id="client-title"
                value={clientTitleEdit}
                onChange={(e) => setClientTitleEdit(e.target.value)}
                placeholder="Например: Цимерман А. — продление 6 мес"
                className="h-9"
                data-testid="input-client-title-edit"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={handleSaveClientTitle}
                disabled={
                  updatingClientTitle ||
                  clientTitleEdit === (invoice.client_title ?? "")
                }
                data-testid="button-save-client-title"
              >
                {updatingClientTitle && (
                  <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                )}
                Сохранить
              </Button>
            </div>
          </div>
        )}

        {/* Превратить разовый счёт в подписку — только admin/assistant */}
        <InvoicePeriodicTerms model={model} />

        {/* Условия сотрудничества - только для партнёра и админа */}
        <InvoiceCommissionTerms model={model} />

        <InvoicePaymentMetadata model={model} />
      </CardContent>
    </Card>
  );
}
