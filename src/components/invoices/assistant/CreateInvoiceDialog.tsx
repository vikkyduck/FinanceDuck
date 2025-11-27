import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/hooks/useAuth";
import { calculateInvoice, type InvoiceScheme } from "@/lib/invoiceCalculations";
import { handleValidationError, showSuccess } from "@/lib/errorHandler";
import { Loader2, EyeOff, ChevronLeft, ChevronRight } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
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
  const { role } = useUserRole();
  const { role: authRole } = useAuth();
  const effectiveRole = role || authRole;
  const [loading, setLoading] = useState(false);
  const { checkLimit } = useRateLimit('form');
  
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedPartner, setSelectedPartner] = useState("");
  const [selectedClient, setSelectedClient] = useState("");
  const [scheme, setScheme] = useState<string>("agency_30");
  const [partnerCommissionRate, setPartnerCommissionRate] = useState("10");
  const [clientBill, setClientBill] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentDate, setPaymentDate] = useState<Date | undefined>(undefined);
  const [hiddenFromAssistant, setHiddenFromAssistant] = useState(false);

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
      return !!(scheme && clientBill && parseFloat(clientBill) > 0);
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
          commissionRate = 10;
          break;
        case 'partner_10':
          dbScheme = 'commission_based';
          commissionRate = 10;
          break;
        case 'partner_15':
          dbScheme = 'commission_based';
          commissionRate = 15;
          break;
        case 'vika_ie_7':
          dbScheme = 'commission_based';
          commissionRate = 7;
          break;
        case 'custom':
          dbScheme = 'commission_based';
          const customRate = parseFloat(partnerCommissionRate);
          if (isNaN(customRate) || customRate < 0 || customRate > 100) {
            throw new Error("Некорректная комиссия партнера");
          }
          commissionRate = customRate;
          break;
        default:
          dbScheme = 'agency_30';
          commissionRate = undefined;
      }
      
      const trimmedInvoiceNumber = invoiceNumber.trim();
      if (!trimmedInvoiceNumber) {
        throw new Error("Укажите номер счета");
      }
      
      const validated = invoiceSchema.parse({ 
        invoiceNumber: trimmedInvoiceNumber,
        partnerId: selectedPartner, 
        clientId: selectedClient, 
        scheme: dbScheme,
        clientBill,
        partnerCommissionRate: commissionRate?.toString() || '',
        notes,
        paymentDate
      });

      const calculations = calculateInvoice(dbScheme, validated.clientBill, commissionRate);
      const formattedPaymentDate = validated.paymentDate ? format(validated.paymentDate, 'yyyy-MM-dd') : undefined;

      await invoiceService.createInvoice({
        invoiceNumber: trimmedInvoiceNumber,
        clientId: validated.clientId,
        partnerId: validated.partnerId,
        scheme: dbScheme,
        partnerCommissionRate: commissionRate,
        status: 'draft',
        notes: validated.notes || undefined,
        paymentDate: formattedPaymentDate,
        hiddenFromAssistant: effectiveRole === 'admin' ? hiddenFromAssistant : false,
        clientBill: validated.clientBill,
        calculations: calculations,
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
    setPaymentDate(undefined);
    setHiddenFromAssistant(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
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
                          description="Схема с фиксированной комиссией агентства"
                        />

                        {effectiveRole === 'assistant' && (
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
                              value="vika_ie_7"
                              selected={scheme === "vika_ie_7"}
                              onSelect={() => setScheme("vika_ie_7")}
                              icon="user"
                              title="Партнерское 7% (Vika IE)"
                              description="Специальная схема для ИП"
                              rate="7%"
                            />
                            <SchemeCard
                              value="custom"
                              selected={scheme === "custom"}
                              onSelect={() => setScheme("custom")}
                              icon="settings"
                              title="Индивидуальная ставка"
                              description="Установите свой процент"
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
                        <Label>Дата оплаты</Label>
                        <DatePicker
                          date={paymentDate}
                          onDateChange={setPaymentDate}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Примечания</Label>
                        <Textarea
                          data-testid="input-invoice-notes"
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="Дополнительная информация..."
                          className="min-h-[100px]"
                        />
                      </div>

                      {effectiveRole === 'admin' && (
                        <div className="flex items-center gap-2 p-4 bg-muted/50 rounded-lg">
                          <Checkbox
                            id="hidden"
                            data-testid="checkbox-hidden-from-assistant"
                            checked={hiddenFromAssistant}
                            onCheckedChange={(checked) => setHiddenFromAssistant(checked as boolean)}
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
              {effectiveRole === 'admin' && (
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
