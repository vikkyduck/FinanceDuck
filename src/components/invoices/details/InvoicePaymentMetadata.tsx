
import { Button } from "@/components/ui/button";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

import { Textarea } from "@/components/ui/textarea";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { formatDate } from "@/lib/invoiceCalculations";
import { CalendarIcon, Loader2, X } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";

import type { InvoiceDetailsModel } from "@/hooks/useInvoiceCommands";
type Props = Pick<
  InvoiceDetailsModel,
  | "permissions"
  | "invoice"
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
  | "getStatusLabel"
>;
export function InvoicePaymentMetadata({ model }: { model: Props }) {
  const {
    permissions,
    invoice,
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
    getStatusLabel,
  } = model;
  if (!invoice) return null;
  return (
    <>
      {permissions.canEditStatus && (
        <>
          <div className="col-span-full">
            <Label>Статус счета</Label>
            <Select
              value={invoice.status}
              onValueChange={handleStatusChangeRequest}
              disabled={updatingStatus}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Черновик</SelectItem>
                <SelectItem value="sent">Отправлен</SelectItem>
                <SelectItem value="paid">Оплачен</SelectItem>
                <SelectItem value="cancelled">Отменен</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      )}
      {permissions.canEditPaymentDates && (
        <>
          <div className="col-span-full">
            <Label>Планируемая дата оплаты</Label>
            <div className="flex gap-2 mt-1">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "flex-1 justify-start text-left font-normal",
                      !plannedPaymentDate && "text-muted-foreground",
                    )}
                    disabled={updatingPaymentDate}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {plannedPaymentDate ? (
                      format(plannedPaymentDate, "PPP", { locale: ru })
                    ) : (
                      <span>Дата не указана</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={plannedPaymentDate}
                    onSelect={(date) => {
                      setPlannedPaymentDate(date);
                      if (date) handleUpdatePlannedDate(date);
                    }}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              {plannedPaymentDate && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    setPlannedPaymentDate(undefined);
                    handleUpdatePlannedDate(undefined);
                  }}
                  disabled={updatingPaymentDate}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
          <div className="col-span-full">
            <Label>Фактическая дата оплаты</Label>
            <div className="flex gap-2 mt-1">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "flex-1 justify-start text-left font-normal",
                      !actualPaymentDate && "text-muted-foreground",
                    )}
                    disabled={updatingPaymentDate}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {actualPaymentDate ? (
                      format(actualPaymentDate, "PPP", { locale: ru })
                    ) : (
                      <span>Дата не указана</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={actualPaymentDate}
                    onSelect={(date) => {
                      setActualPaymentDate(date);
                      if (date) handleUpdateActualPaymentDate(date);
                    }}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              {actualPaymentDate && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    setActualPaymentDate(undefined);
                    handleUpdateActualPaymentDate(undefined);
                  }}
                  disabled={updatingPaymentDate}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </>
      )}
      {permissions.canEditNotes && (
        <>
          <div className="col-span-full">
            <Label>Комментарий</Label>
            <div className="flex gap-2 mt-1">
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Добавьте комментарий к счёту..."
                className="flex-1 min-h-[80px]"
                disabled={updatingNotes}
              />
              <Button
                onClick={handleUpdateNotes}
                disabled={updatingNotes || notes === (invoice.notes || "")}
                size="sm"
              >
                {updatingNotes ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Сохранение...
                  </>
                ) : (
                  "Сохранить"
                )}
              </Button>
            </div>
          </div>
        </>
      )}
      {!permissions.canEditStatus &&
        !permissions.canEditPaymentDates &&
        !permissions.canEditNotes && (
          <>
            <div>
              <p className="text-sm text-muted-foreground">Статус</p>
              <p className="font-medium">{getStatusLabel(invoice.status)}</p>
            </div>
            {invoice.payment_date && (
              <div>
                <p className="text-sm text-muted-foreground">Дата оплаты</p>
                <p className="font-medium">
                  {formatDate(invoice.payment_date)}
                </p>
              </div>
            )}
          </>
        )}
    </>
  );
}
