import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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

      // Invalidate all invoice-related caches to update partner debt everywhere
      queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/partner/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/do-not-spend/partner-schemes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/do-not-spend/agency'] });

      setDescription("");
      setAmount("");
      setDate(new Date().toISOString().split("T")[0]);
      setIsAdminExpense(false);
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      console.error("Error adding expense:", error);
      
      if (error.message?.includes("403") || error.message?.includes("Forbidden")) {
        toast({
          title: "Доступ запрещен",
          description: "У вас нет прав на добавление расходов к этому счету.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Ошибка",
          description: error.message || "Не удалось добавить расход",
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

          <div className="flex items-center space-x-2">
            <Checkbox
              id="isAdminExpense"
              data-testid="checkbox-admin-expense"
              checked={isAdminExpense}
              onCheckedChange={(checked) => setIsAdminExpense(checked as boolean)}
            />
            <Label htmlFor="isAdminExpense" className="text-sm font-normal cursor-pointer">
              Оплачено админом (партнер вернет эту сумму)
            </Label>
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
