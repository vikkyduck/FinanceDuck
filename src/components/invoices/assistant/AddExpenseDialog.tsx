import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useRateLimit } from "@/hooks/useRateLimit";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/hooks/use-toast";
import { sanitizeText, sanitizeNumber, sanitizeDate, isValidUuid } from "@/lib/sanitize";
import { ensureSessionContext } from "@/lib/supabaseHelpers";
import { Loader2 } from "lucide-react";

interface AddExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  onSuccess?: () => void;
}

export const AddExpenseDialog = ({ open, onOpenChange, invoiceId, onSuccess }: AddExpenseDialogProps) => {
  const { toast } = useToast();
  const { checkLimit } = useRateLimit("form");
  const { getSession } = useUserRole();
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [isAdminExpense, setIsAdminExpense] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Проверка лимитов
    const limitCheck = checkLimit();
    if (!limitCheck.allowed) {
      return;
    }

    // Валидация и санитизация
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
      // Получаем токен для вызова RPC‑функции
      let tokenId: string | undefined;

      try {
        const sessionContext = await ensureSessionContext();
        if (sessionContext?.accessTokenId) {
          tokenId = sessionContext.accessTokenId;
        }
      } catch (contextError: any) {
        console.warn("Session context warning in AddExpenseDialog:", contextError);
      }

      // Фолбэк: используем токен из useUserRole
      if (!tokenId) {
        const session = getSession();
        if (session?.accessTokenId) {
          tokenId = session.accessTokenId;
        }
      }

      if (!tokenId) {
        toast({
          title: "Ошибка доступа",
          description: "Не удалось определить вашу сессию. Попробуйте выйти и войти снова.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      // Вызываем безопасную RPC‑функцию для добавления расхода
      const { error } = await supabase.rpc("add_executor_expense", {
        _token_id: tokenId,
        _invoice_id: invoiceId,
        _description: sanitizedDescription,
        _amount: sanitizedAmount,
        _date: sanitizedDate,
        _is_admin_expense: isAdminExpense,
      });

      if (error) {
        // Дружественные сообщения об ошибках
        if (error.code === "42501" || error.message?.includes("permission_denied")) {
          toast({
            title: "Доступ запрещен",
            description: "У вас нет прав на добавление расходов к этому счету. Обратитесь к администратору.",
            variant: "destructive",
          });
        } else if (error.message?.includes("Amount must be positive")) {
          toast({
            title: "Некорректная сумма",
            description: "Сумма должна быть положительной. Проверьте введённые данные.",
            variant: "destructive",
          });
        } else if (error.message?.includes("Description is required")) {
          toast({
            title: "Описание обязательно",
            description: "Заполните описание расхода.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Ошибка добавления расхода",
            description: error.message || "Не удалось добавить расход. Попробуйте еще раз.",
            variant: "destructive",
          });
        }
        setLoading(false);
        return;
      }

      toast({
        title: "Успешно",
        description: "Расход добавлен",
      });

      setDescription("");
      setAmount("");
      setDate(new Date().toISOString().split("T")[0]);
      setIsAdminExpense(false);
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      console.error("Unexpected error adding expense:", error);
      toast({
        title: "Непредвиденная ошибка",
        description: "Что-то пошло не так. Попробуйте обновить страницу и повторить попытку.",
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
          <DialogTitle>Добавить расход</DialogTitle>
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
              Добавить
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
