import { useState } from "react";
import { formatMoney } from "@/lib/format";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { useAuth } from "@/hooks/useAuth";
import { calculateInvoice, type InvoiceScheme } from "@/lib/invoiceCalculations";
import { handleValidationError, showSuccess } from "@/lib/errorHandler";
import { Loader2, EyeOff, ChevronLeft, ChevronRight } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useRateLimit } from "@/hooks/useRateLimit";
import { format } from "date-fns";
import { SchemeCard } from "./SchemeCard";
import { InvoiceCalculator } from "./InvoiceCalculator";
import { WizardProgress } from "./WizardProgress";
import { ClientCombobox } from "./ClientCombobox";
import { PartnerCombobox } from "./PartnerCombobox";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { invoiceService } from "@/lib/services/invoices";

interface CreateInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export const CreateInvoiceDialog = ({ open, onOpenChange, onSuccess }: CreateInvoiceDialogProps) => {
  const { role: effectiveRole } = useAuth();
  const [loading, setLoading] = useState(false);
  const { checkLimit } = useRateLimit('form');
  
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedPartner, setSelectedPartner] = useState("");
  const [selectedClient, setSelectedClient] = useState("");
  const [scheme, setScheme] = useState<string>("agency_30");
  const [partnerCommissionRate, setPartnerCommissionRate] = useState("0");
  const [clientBill, setClientBill] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [clientTitle, setClientTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentDate, setPaymentDate] = useState<Date | undefined>(undefined);
  const [hideFromAssistant, setHideFromAssistant] = useState(false);
  const [plannedExpenses, setPlannedExpenses] = useState("");
  // Тип услуги: разовая (как раньше) или периодическая (предоплата за N месяцев/дней)
  const [serviceType, setServiceType] = useState<'one_time' | 'periodic'>('one_time');
  const [periodUnit, setPeriodUnit] = useState<'month' | 'day'>('month');
  const [pricePerPeriod, setPricePerPeriod] = useState("");
  const [totalPeriods, setTotalPeriods] = useState("");
  const isPeriodic = serviceType === 'periodic';
  const periodicAutoBill =
    isPeriodic && parseFloat(pricePerPeriod) > 0 && parseInt(totalPeriods, 10) > 0
      ? Math.round(parseFloat(pricePerPeriod) * parseInt(totalPeriods, 10) * 100) / 100
      : 0;
  const effectiveClientBill = isPeriodic ? periodicAutoBill.toString() : clientBill;

  const wizardSteps = [
    { number: 1, label: "Клиент и партнер" },
    { number: 2, label: "Схема и сумма" },
    { number: 3, label: "Детали" },
  ];

  const validateStep = (step: number): boolean => {
    if (step === 1) {
      return !!(selectedClient && selectedPartner);
    }
    if (step === 2) {
      if (!scheme) return false;
      if (isPeriodic) {
        const price = parseFloat(pricePerPeriod);
        const total = parseInt(totalPeriods, 10);
        return Number.isFinite(price) && price > 0 && Number.isInteger(total) && total >= 1;
      }
      return !!(clientBill && parseFloat(clientBill) > 0);
    }
    if (step === 3) {
      return !!invoiceNumber.trim();
    }
    return true;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(currentStep + 1);
    } else {
      toast.error("Пожалуйста, заполните все обязательные поля");
    }
  };

  const handleBack = () => {
    setCurrentStep(currentStep - 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const limitCheck = checkLimit();
    if (!limitCheck.allowed) return;

    setLoading(true);

    try {
      const { invoiceSchema } = await import('@/lib/validationSchemas');
      
      let dbScheme: InvoiceScheme;
      let commissionRate: number | undefined;
      
      switch(scheme) {
        case 'commission_based':
          dbScheme = 'commission_based';
          commissionRate = 0; // По умолчанию 0% - вся сумма идёт админу
          break;
        case 'partner_10':
          dbScheme = 'partner_10';
          commissionRate = 10;
          break;
        case 'partner_15':
          dbScheme = 'partner_15';
          commissionRate = 15;
          break;
        case 'custom':
          dbScheme = 'commission_based';
          const customRate = parseFloat(partnerCommissionRate);
          if (isNaN(customRate) || customRate < 0 || customRate > 100) {
            throw new Error("Некорректная комиссия партнера");
          }
          commissionRate = customRate;
          break;
        case 'agency_40':
          dbScheme = 'agency_40';
          commissionRate = undefined;
          break;
        default:
          dbScheme = 'agency_30';
          commissionRate = undefined;
      }
      
      const trimmedInvoiceNumber = invoiceNumber.trim();
      if (!trimmedInvoiceNumber) {
        throw new Error("Укажите номер счета");
      }
      
      // Для periodic подставляем авто-сумму = цена × периодов;
      // для one_time — введённую вручную.
      const billForValidation = isPeriodic ? effectiveClientBill : clientBill;
      if (isPeriodic) {
        const price = parseFloat(pricePerPeriod);
        const total = parseInt(totalPeriods, 10);
        if (!Number.isFinite(price) || price < 0) throw new Error("Цена за период должна быть ≥ 0");
        if (!Number.isInteger(total) || total < 1) throw new Error("Количество периодов должно быть ≥ 1");
      }

      const validated = invoiceSchema.parse({
        invoiceNumber: trimmedInvoiceNumber,
        partnerId: selectedPartner,
        clientId: selectedClient,
        scheme: dbScheme,
        clientBill: billForValidation,
        partnerCommissionRate: commissionRate?.toString() || '',
        notes,
        paymentDate
      });

      const calculations = calculateInvoice(dbScheme, validated.clientBill, commissionRate);
      const formattedPaymentDate = validated.paymentDate ? format(validated.paymentDate, 'yyyy-MM-dd') : undefined;

      const isPartnerScheme = ['partner_10', 'partner_15', 'custom', 'commission_based'].includes(scheme);
      const plannedExpensesValue = isPartnerScheme && plannedExpenses ? parseFloat(plannedExpenses) : undefined;

      await invoiceService.createInvoice({
        invoiceNumber: trimmedInvoiceNumber,
        clientId: validated.clientId,
        partnerId: validated.partnerId,
        scheme: dbScheme,
        partnerCommissionRate: commissionRate,
        status: 'draft',
        notes: validated.notes || undefined,
        clientTitle: clientTitle.trim() || undefined,
        paymentDate: formattedPaymentDate,
        hideFromAssistant: effectiveRole === 'admin' ? hideFromAssistant : effectiveRole === 'accountant' ? true : false,
        clientBill: validated.clientBill,
        calculations: calculations,
        plannedExpenses: plannedExpensesValue,
        serviceType,
        periodUnit: isPeriodic ? periodUnit : undefined,
        pricePerPeriod: isPeriodic ? parseFloat(pricePerPeriod) : undefined,
        totalPeriods: isPeriodic ? parseInt(totalPeriods, 10) : undefined,
      });

      showSuccess("Успешно", "Счет создан");

      onOpenChange(false);
      resetForm();
      onSuccess?.();
    } catch (error: any) {
      console.error("CreateInvoiceDialog error:", error);
      if (error.name === 'ZodError') {
        console.error("Zod validation error:", error.errors);
        handleValidationError("Форма", error.errors[0]?.message || 'Ошибка валидации данных');
      } else {
        toast.error(error.message || "Не удалось создать счет");
      }
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setCurrentStep(1);
    setSelectedPartner("");
    setSelectedClient("");
    setScheme("agency_30");
    setPartnerCommissionRate("10");
    setClientBill("");
    setInvoiceNumber("");
    setNotes("");
    setClientTitle("");
    setPaymentDate(undefined);
    setHideFromAssistant(false);
    setPlannedExpenses("");
    setServiceType('one_time');
    setPeriodUnit('month');
    setPricePerPeriod("");
    setTotalPeriods("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto w-[95vw] sm:w-full">
        <DialogHeader>
          <DialogTitle className="text-2xl">Создать новый счет</DialogTitle>
        </DialogHeader>

        <WizardProgress currentStep={currentStep} steps={wizardSteps} />

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentStep}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-6"
                >
                  {currentStep === 1 && (
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold">Выберите клиента и партнера</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Клиент *</Label>
                          <ClientCombobox
                            value={selectedClient}
                            onChange={(value) => {
                              setSelectedClient(value);
                              setSelectedPartner("");
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Партнер *</Label>
                          <PartnerCombobox
                            value={selectedPartner}
                            onChange={setSelectedPartner}
                            clientId={selectedClient}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {currentStep === 2 && (
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold">Выберите схему и укажите сумму</h3>
                      
                      <div className="space-y-3">
                        <SchemeCard
                          value="agency_30"
                          selected={scheme === "agency_30"}
                          onSelect={() => setScheme("agency_30")}
                          icon="building"
                          title="Агентство 30%"
                          description="Маржа 30%: партнёру 15%, админу 15%"
                        />
                        
                        <SchemeCard
                          value="agency_40"
                          selected={scheme === "agency_40"}
                          onSelect={() => setScheme("agency_40")}
                          icon="building"
                          title="Агентство 40%"
                          description="Маржа 40%: партнёру 16%, админу 24%"
                        />

                        {(effectiveRole === 'assistant' || effectiveRole === 'accountant') && (
                          <SchemeCard
                            value="commission_based"
                            selected={scheme === "commission_based"}
                            onSelect={() => setScheme("commission_based")}
                            icon="handshake"
                            title="Партнерское соглашение"
                            description="Выберите, если работа идет по партнерскому договору"
                          />
                        )}

                        {effectiveRole === 'admin' && (
                          <>
                            <SchemeCard
                              value="partner_10"
                              selected={scheme === "partner_10"}
                              onSelect={() => setScheme("partner_10")}
                              icon="handshake"
                              title="Партнерское 10%"
                              description="Комиссия партнеру 10%"
                              rate="10%"
                            />
                            <SchemeCard
                              value="partner_15"
                              selected={scheme === "partner_15"}
                              onSelect={() => setScheme("partner_15")}
                              icon="handshake"
                              title="Партнерское 15%"
                              description="Комиссия партнеру 15%"
                              rate="15%"
                            />
                            <SchemeCard
                              value="custom"
                              selected={scheme === "custom"}
                              onSelect={() => setScheme("custom")}
                              icon="settings"
                              title="Индивидуальная ставка"
                              description="Установите свой процент комиссии"
                            />
                          </>
                        )}
                      </div>

                      {scheme === 'custom' && effectiveRole === 'admin' && (
                        <div className="space-y-2 p-4 bg-muted/50 rounded-lg">
                          <Label>Процент партнера (%) *</Label>
                          <Input
                            type="number"
                            data-testid="input-custom-commission-rate"
                            value={partnerCommissionRate}
                            onChange={(e) => setPartnerCommissionRate(e.target.value)}
                            min="0"
                            max="100"
                            step="0.1"
                            required
                            className="h-11"
                          />
                        </div>
                      )}

                      <div className="space-y-2">
                        <Label>Тип услуги *</Label>
                        <RadioGroup
                          value={serviceType}
                          onValueChange={(v) => setServiceType(v as 'one_time' | 'periodic')}
                          className="grid grid-cols-1 sm:grid-cols-2 gap-2"
                        >
                          <label
                            htmlFor="svc-one_time"
                            className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-accent has-[input:checked]:border-primary has-[input:checked]:bg-accent/50"
                          >
                            <RadioGroupItem id="svc-one_time" value="one_time" className="mt-0.5" />
                            <div className="leading-tight">
                              <div className="text-sm font-medium">Разовая</div>
                              <div className="text-xs text-muted-foreground">Один платёж, сумма вводится вручную.</div>
                            </div>
                          </label>
                          <label
                            htmlFor="svc-periodic"
                            className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-accent has-[input:checked]:border-primary has-[input:checked]:bg-accent/50"
                          >
                            <RadioGroupItem id="svc-periodic" value="periodic" className="mt-0.5" />
                            <div className="leading-tight">
                              <div className="text-sm font-medium">Периодическая</div>
                              <div className="text-xs text-muted-foreground">Предоплата за N месяцев/дней.</div>
                            </div>
                          </label>
                        </RadioGroup>
                      </div>

                      {isPeriodic ? (
                        <div className="space-y-3 p-4 bg-indigo-50/40 dark:bg-indigo-950/20 rounded-lg border border-indigo-200/40 dark:border-indigo-800/30">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="space-y-2">
                              <Label>Единица *</Label>
                              <RadioGroup
                                value={periodUnit}
                                onValueChange={(v) => setPeriodUnit(v as 'month' | 'day')}
                                className="grid grid-cols-2 gap-2"
                              >
                                <label htmlFor="pu-month" className="flex items-center gap-2 rounded-md border px-3 h-11 cursor-pointer hover:bg-accent has-[input:checked]:border-primary has-[input:checked]:bg-accent/50">
                                  <RadioGroupItem id="pu-month" value="month" />
                                  <span className="text-sm">Месяцы</span>
                                </label>
                                <label htmlFor="pu-day" className="flex items-center gap-2 rounded-md border px-3 h-11 cursor-pointer hover:bg-accent has-[input:checked]:border-primary has-[input:checked]:bg-accent/50">
                                  <RadioGroupItem id="pu-day" value="day" />
                                  <span className="text-sm">Дни</span>
                                </label>
                              </RadioGroup>
                            </div>
                            <div className="space-y-2">
                              <Label>Цена за период *</Label>
                              <Input
                                type="number"
                                data-testid="input-price-per-period"
                                value={pricePerPeriod}
                                onChange={(e) => setPricePerPeriod(e.target.value)}
                                placeholder="270000"
                                required
                                min="0"
                                step="0.01"
                                className="h-11"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Количество периодов *</Label>
                              <Input
                                type="number"
                                data-testid="input-total-periods"
                                value={totalPeriods}
                                onChange={(e) => setTotalPeriods(e.target.value)}
                                placeholder="11"
                                required
                                min="1"
                                step="1"
                                className="h-11"
                              />
                            </div>
                          </div>
                          <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
                            <span className="text-sm text-muted-foreground">Сумма счёта (авто):</span>
                            <span className="text-lg font-semibold tabular-nums">
                              {formatMoney(periodicAutoBill)}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Label>Счет клиенту *</Label>
                          <Input
                            type="number"
                            data-testid="input-client-bill"
                            value={clientBill}
                            onChange={(e) => setClientBill(e.target.value)}
                            placeholder="1000000"
                            required
                            min="0"
                            step="0.01"
                            className="h-11 text-lg font-semibold"
                          />
                        </div>
                      )}

                      {['partner_10', 'partner_15', 'custom', 'commission_based'].includes(scheme) && (
                        <div className="space-y-2 p-4 bg-blue-50/50 dark:bg-blue-950/20 rounded-lg border border-blue-200/50 dark:border-blue-800/30">
                          <Label className="flex items-center gap-2">
                            Планируемые расходы проекта
                            <span className="text-xs text-muted-foreground">(необязательно)</span>
                          </Label>
                          <Input
                            type="number"
                            data-testid="input-planned-expenses"
                            value={plannedExpenses}
                            onChange={(e) => setPlannedExpenses(e.target.value)}
                            placeholder="Сумма расходов на проект"
                            min="0"
                            step="0.01"
                            className="h-11"
                          />
                          <p className="text-xs text-muted-foreground">
                            Укажите планируемые расходы (зарплаты, материалы) для расчёта резерва
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {currentStep === 3 && (
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold">Дополнительная информация</h3>
                      
                      <div className="space-y-2">
                        <Label>Номер счета *</Label>
                        <Input
                          data-testid="input-invoice-number"
                          value={invoiceNumber}
                          onChange={(e) => setInvoiceNumber(e.target.value)}
                          placeholder="Введите номер счета"
                          required
                          className="h-11"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Название для клиента</Label>
                        <Input
                          data-testid="input-client-title"
                          value={clientTitle}
                          onChange={(e) => setClientTitle(e.target.value)}
                          placeholder="Например: Цимерман А. — продление 6 мес"
                          className="h-11"
                        />
                        <p className="text-xs text-muted-foreground">Это название клиент увидит в своём кабинете вместо «Счёт № …». Необязательно.</p>
                      </div>

                      <div className="space-y-2">
                        <Label>Дата оплаты</Label>
                        <DatePicker
                          date={paymentDate}
                          onDateChange={setPaymentDate}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Примечания (внутренние)</Label>
                        <Textarea
                          data-testid="input-invoice-notes"
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="Служебные заметки — клиенту не видны"
                          className="min-h-[100px]"
                        />
                      </div>

                      {effectiveRole === 'admin' && (
                        <div className="flex items-center gap-2 p-4 bg-muted/50 rounded-lg">
                          <Checkbox
                            id="hidden"
                            data-testid="checkbox-hidden-from-assistant"
                            checked={hideFromAssistant}
                            onCheckedChange={(checked) => setHideFromAssistant(checked as boolean)}
                          />
                          <Label htmlFor="hidden" className="cursor-pointer">
                            <div className="flex items-center gap-2">
                              <EyeOff className="w-4 h-4" />
                              <span>Скрыть от ассистента</span>
                            </div>
                          </Label>
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="lg:col-span-1">
              {(effectiveRole === 'admin' || effectiveRole === 'accountant') && (
                <InvoiceCalculator
                  scheme={scheme as any}
                  clientBill={parseFloat(clientBill) || 0}
                  partnerCommissionRate={scheme === 'custom' ? parseFloat(partnerCommissionRate) : undefined}
                />
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            {currentStep > 1 && (
              <Button
                type="button"
                variant="outline"
                onClick={handleBack}
                size="lg"
                className="mr-auto"
                data-testid="button-wizard-back"
              >
                <ChevronLeft className="w-4 h-4 mr-2" />
                Назад
              </Button>
            )}
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              size="lg"
              data-testid="button-cancel-create-invoice"
            >
              Отмена
            </Button>
            {currentStep < 3 ? (
              <Button
                type="button"
                onClick={handleNext}
                size="lg"
                data-testid="button-wizard-next"
              >
                Далее
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button 
                type="submit" 
                disabled={loading}
                size="lg"
                data-testid="button-submit-create-invoice"
              >
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {loading ? "Создание..." : "Создать счет"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
