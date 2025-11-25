import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { sanitizeText, sanitizeNumber, sanitizeDate } from "@/lib/sanitize";
import { ensureSessionContext } from "@/lib/supabaseHelpers";
import { Loader2 } from "lucide-react";

interface EditExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: {
    id: string;
    description: string;
    amount: number;
    date: string;
    is_admin_expense: boolean;
  } | null;
  onSuccess?: () => void;
}

export const EditExpenseDialog = ({ open, onOpenChange, expense, onSuccess }: EditExpenseDialogProps) => {
  const { toast } = useToast();
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [isAdminExpense, setIsAdminExpense] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (expense) {
      setDescription(expense.description);
      setAmount(expense.amount.toString());
      setDate(expense.date);
      setIsAdminExpense(expense.is_admin_expense || false);
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
      await ensureSessionContext();

      const { error } = await supabase
        .from("executor_expenses")
        .update({
          description: sanitizedDescription,
          amount: sanitizedAmount,
          date: sanitizedDate,
          is_admin_expense: isAdminExpense,
        })
        .eq("id", expense.id);

      if (error) {
        toast({
          title: "Ошибка",
          description: error.message || "Не удалось обновить расход",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Успешно",
        description: "Расход обновлен",
      });

      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      console.error("Error updating expense:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось обновить расход",
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
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Работы исполнителя..."
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Сумма (₽) *</Label>
              <Input
                id="amount"
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
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="isAdminExpense"
              checked={isAdminExpense}
              onCheckedChange={(checked) => setIsAdminExpense(checked as boolean)}
            />
            <Label htmlFor="isAdminExpense" className="text-sm font-normal cursor-pointer">
              Оплачено админом (партнер вернет эту сумму)
            </Label>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Сохранить
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
