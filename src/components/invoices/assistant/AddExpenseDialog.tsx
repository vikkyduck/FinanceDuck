import { invalidateFinancialQueries } from '@/lib/financialQueries';
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useRateLimit } from "@/hooks/useRateLimit";
import { useToast } from "@/hooks/use-toast";
import { sanitizeText, sanitizeNumber, sanitizeDate, isValidUuid } from "@/lib/sanitize";
import { invoiceService } from "@/lib/services/invoices";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

interface AddExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  onSuccess?: () => void;
}

export const AddExpenseDialog = ({ open, onOpenChange, invoiceId, onSuccess }: AddExpenseDialogProps) => {
  const { toast } = useToast();
  const { checkLimit } = useRateLimit("form");
  const queryClient = useQueryClient();
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [isAdminExpense, setIsAdminExpense] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const limitCheck = checkLimit();
    if (!limitCheck.allowed) {
      return;
    }

    const sanitizedDescription = sanitizeText(description);
    if (!sanitizedDescription) {
      toast({
        title: "Описание",
        description: "Заполните описание расхода",
        variant: "destructive",
      });
      return;
    }

    const sanitizedAmount = sanitizeNumber(amount);
    if (sanitizedAmount === null || sanitizedAmount <= 0) {
      toast({
        title: "Сумма",
        description: "Укажите корректную сумму",
        variant: "destructive",
      });
      return;
    }

    const sanitizedDate = sanitizeDate(date);
    if (!sanitizedDate) {
      toast({
        title: "Дата",
        description: "Укажите корректную дату",
        variant: "destructive",
      });
      return;
    }

    if (!isValidUuid(invoiceId)) {
      toast({
        title: "Счет",
        description: "Некорректный идентификатор счета",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      await invoiceService.createExpense(invoiceId, {
        description: sanitizedDescription,
        amount: sanitizedAmount.toString(),
        date: sanitizedDate,
        paidByAdmin: isAdminExpense,
      });

      toast({
        title: "Успешно",
        description: "Расход добавлен",
      });

      await invalidateFinancialQueries(queryClient);

      setDescription("");
      setAmount("");
      setDate(new Date().toISOString().split("T")[0]);
      setIsAdminExpense(false);
      onOpenChange(false);
      onSuccess?.();
    } catch (error: unknown) {
      console.error("Error adding expense:", error);
      
      if ((error instanceof Error ? error.message : String(error))?.includes("403") || (error instanceof Error ? error.message : String(error))?.includes("Forbidden")) {
        toast({
          title: "Доступ запрещен",
          description: "У вас нет прав на добавление расходов к этому счету.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Ошибка",
          description: (error instanceof Error ? error.message : String(error)) || "Не удалось добавить расход",
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:w-full">
        <DialogHeader>
          <DialogTitle>Добавить расход</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="description">Описание *</Label>
            <Textarea
              id="description"
              data-testid="input-expense-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Работы исполнителя..."
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Сумма *</Label>
              <Input
                id="amount"
                data-testid="input-expense-amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="50000"
                required
                min="0"
                step="0.01"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="date">Дата</Label>
              <Input
                id="date"
                data-testid="input-expense-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Кто оплатил расход *</Label>
            <RadioGroup
              value={isAdminExpense ? "admin" : "partner"}
              onValueChange={(v) => setIsAdminExpense(v === "admin")}
              className="grid grid-cols-1 sm:grid-cols-2 gap-2"
            >
              <label
                htmlFor="paid-by-partner"
                className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-accent has-[input:checked]:border-primary has-[input:checked]:bg-accent/50"
              >
                <RadioGroupItem id="paid-by-partner" value="partner" data-testid="radio-paid-by-partner" className="mt-0.5" />
                <div className="leading-tight">
                  <div className="text-sm font-medium">Партнёр</div>
                  <div className="text-xs text-muted-foreground">Партнёр заплатил сам — сумма уменьшит его долг перед админом.</div>
                </div>
              </label>
              <label
                htmlFor="paid-by-admin"
                className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-accent has-[input:checked]:border-primary has-[input:checked]:bg-accent/50"
              >
                <RadioGroupItem id="paid-by-admin" value="admin" data-testid="radio-paid-by-admin" className="mt-0.5" />
                <div className="leading-tight">
                  <div className="text-sm font-medium">Администратор</div>
                  <div className="text-xs text-muted-foreground">Админ заплатил из своих — партнёр вернёт эту сумму.</div>
                </div>
              </label>
            </RadioGroup>
          </div>

          <div className="flex justify-end gap-2">
            <Button 
              type="button" 
              variant="ghost" 
              onClick={() => onOpenChange(false)}
              data-testid="button-cancel-expense"
            >
              Отмена
            </Button>
            <Button type="submit" disabled={loading} data-testid="button-submit-expense">
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Добавить
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
