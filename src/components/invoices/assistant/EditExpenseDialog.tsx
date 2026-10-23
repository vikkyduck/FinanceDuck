import { invalidateFinancialQueries } from '@/lib/financialQueries';
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { sanitizeText, sanitizeNumber, sanitizeDate } from "@/lib/sanitize";
import { formatDate, todayIsoDate } from "@/lib/format";
import { invoiceService } from "@/lib/services/invoices";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

interface EditExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: {
    id: string;
    description: string;
    amount?: number | string;
    date?: string;
    paidByAdmin?: boolean;
    paidAt?: string | null;
  } | null;
  onSuccess?: () => void;
}

export const EditExpenseDialog = ({ open, onOpenChange, expense, onSuccess }: EditExpenseDialogProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [isAdminExpense, setIsAdminExpense] = useState(false);
  const [isPaid, setIsPaid] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (expense) {
      setDescription(expense.description);
      setAmount((expense.amount ?? 0).toString());
      setDate(expense.date ?? "");
      setIsAdminExpense(expense.paidByAdmin || false);
      setIsPaid(expense.paidAt !== null);
    }
  }, [expense]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!expense) return;

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

    setLoading(true);

    try {
      await invoiceService.updateExpense(expense.id, {
        description: sanitizedDescription,
        amount: sanitizedAmount.toString(),
        date: sanitizedDate,
        paidByAdmin: isAdminExpense,
        // Уже оплаченный расход сохраняет свою дату оплаты.
        paidAt: isPaid ? expense.paidAt ?? todayIsoDate() : null,
      });

      toast({
        title: "Успешно",
        description: "Расход обновлен",
      });

      await invalidateFinancialQueries(queryClient);

      onOpenChange(false);
      onSuccess?.();
    } catch (error: unknown) {
      console.error("Error updating expense:", error);
      toast({
        title: "Ошибка",
        description: (error instanceof Error ? error.message : String(error)) || "Не удалось обновить расход",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Редактировать расход</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="description">Описание *</Label>
            <Textarea
              id="description"
              data-testid="input-edit-expense-description"
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
                data-testid="input-edit-expense-amount"
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
                data-testid="input-edit-expense-date"
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
                htmlFor="edit-paid-by-partner"
                className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-accent has-[input:checked]:border-primary has-[input:checked]:bg-accent/50"
              >
                <RadioGroupItem id="edit-paid-by-partner" value="partner" data-testid="radio-edit-paid-by-partner" className="mt-0.5" />
                <div className="leading-tight">
                  <div className="text-sm font-medium">Партнёр</div>
                  <div className="text-xs text-muted-foreground">Партнёр заплатил сам — сумма уменьшит его долг перед админом.</div>
                </div>
              </label>
              <label
                htmlFor="edit-paid-by-admin"
                className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-accent has-[input:checked]:border-primary has-[input:checked]:bg-accent/50"
              >
                <RadioGroupItem id="edit-paid-by-admin" value="admin" data-testid="radio-edit-paid-by-admin" className="mt-0.5" />
                <div className="leading-tight">
                  <div className="text-sm font-medium">Администратор</div>
                  <div className="text-xs text-muted-foreground">Админ заплатил из своих — партнёр вернёт эту сумму.</div>
                </div>
              </label>
            </RadioGroup>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={isPaid} onCheckedChange={(v) => setIsPaid(v === true)} data-testid="checkbox-edit-expense-paid" />
            Исполнителю оплачено{isPaid && expense?.paidAt ? ` ${formatDate(expense.paidAt)}` : ""}
          </label>

          <div className="flex justify-end gap-2">
            <Button 
              type="button" 
              variant="ghost" 
              onClick={() => onOpenChange(false)}
              data-testid="button-cancel-edit-expense"
            >
              Отмена
            </Button>
            <Button type="submit" disabled={loading} data-testid="button-submit-edit-expense">
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Сохранить
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
