import { motion, AnimatePresence } from "framer-motion";
import { DollarSign, FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getSchemeLabel } from "@/lib/invoiceCalculations";

interface InvoiceCalculatorProps {
  scheme: string;
  clientBill: number;
  partnerCommissionRate?: number;
}

export const InvoiceCalculator = ({
  scheme,
  clientBill,
  partnerCommissionRate = 0,
}: InvoiceCalculatorProps) => {
  if (!clientBill || clientBill <= 0) {
    return (
      <Card className="p-6 space-y-4 bg-muted/30">
        <div className="text-center text-muted-foreground">
          <DollarSign className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm">Введите сумму счета для расчета</p>
        </div>
      </Card>
    );
  }

  const formatMoney = (amount: number) =>
    new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: "RUB",
      maximumFractionDigits: 0,
    }).format(amount);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={scheme + clientBill}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.3 }}
      >
        <Card className="p-6 space-y-4 bg-muted/30">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-lg">Сводка по счету</h3>
          </div>

          <div className="space-y-3">
            <motion.div
              initial={{ x: -10, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="flex items-center justify-between p-3 rounded-lg bg-background/50"
            >
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Счет клиенту</span>
              </div>
              <span className="font-bold">
                {formatMoney(clientBill)}
              </span>
            </motion.div>

            <motion.div
              initial={{ x: -10, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
            >
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Схема</span>
              </div>
              <span className="font-bold text-sm">
                {getSchemeLabel(scheme as any, 'assistant')}
              </span>
            </motion.div>

            <Separator className="my-3" />

            <p className="text-xs text-muted-foreground text-center">
              Детальные расчеты вознаграждений доступны только админу.
            </p>
          </div>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
};
