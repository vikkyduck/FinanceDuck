import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch } from "@/lib/api";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { toast } from "sonner";
import { Edit2, Save, X, TrendingUp, TrendingDown, AlertCircle } from "lucide-react";

interface WorkingCapitalBalance {
  id: string;
  amount: number;
  notes: string | null;
  updated_at: string | null;
}

export const WorkingCapitalManager = () => {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [newAmount, setNewAmount] = useState("");
  const [notes, setNotes] = useState("");

  const { data: balance, isLoading, error } = useQuery<WorkingCapitalBalance>({
    queryKey: ["/api/admin/working-capital"],
    queryFn: () => apiGet<WorkingCapitalBalance>("/admin/working-capital"),
    retry: 1,
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { amount: number; notes: string | null }) => {
      return apiPatch<WorkingCapitalBalance>("/admin/working-capital", data);
    },
    onSuccess: () => {
      toast.success('Working Capital обновлен');
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/working-capital"] });
    },
    onError: () => {
      toast.error('Ошибка обновления');
    },
  });

  const handleSave = () => {
    const amount = parseFloat(newAmount);
    if (isNaN(amount) || amount < 0) {
      toast.error('Введите корректную сумму');
      return;
    }
    updateMutation.mutate({ amount, notes: notes.trim() || null });
  };

  const handleEdit = () => {
    setNewAmount(balance?.amount?.toString() || '0');
    setNotes(balance?.notes || '');
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setNewAmount(balance?.amount?.toString() || '0');
    setNotes(balance?.notes || '');
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Working Capital</CardTitle>
          <CardDescription>Загрузка...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (error || !balance) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-muted-foreground" />
            Working Capital
          </CardTitle>
          <CardDescription>Данные недоступны</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Функция временно недоступна. Обратитесь к администратору.
          </p>
        </CardContent>
      </Card>
    );
  }

  const currentAmount = balance.amount || 0;
  const isLowBalance = currentAmount < 300000;
  const changeAmount = parseFloat(newAmount || '0') - currentAmount;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              Working Capital
              {isLowBalance && (
                <span className="text-sm font-normal text-destructive">(Низкий баланс!)</span>
              )}
            </CardTitle>
            <CardDescription>
              Текущий остаток оборотных средств
            </CardDescription>
          </div>
          {!isEditing && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleEdit}
              data-testid="button-edit-working-capital"
            >
              <Edit2 className="h-4 w-4 mr-2" />
              Редактировать
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {!isEditing ? (
          <div className="space-y-4">
            <div className={`text-4xl font-bold ${isLowBalance ? 'text-destructive' : 'text-primary'}`}>
              {formatCurrency(currentAmount)}
            </div>
            {balance.notes && (
              <div className="text-sm text-muted-foreground border-l-2 pl-3">
                {balance.notes}
              </div>
            )}
            {balance.updated_at && (
              <div className="text-xs text-muted-foreground">
                Обновлено: {new Date(balance.updated_at).toLocaleString('ru-RU')}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Новая сумма</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                placeholder="0.00"
                data-testid="input-working-capital-amount"
              />
              {changeAmount !== 0 && !isNaN(changeAmount) && (
                <div className={`text-sm flex items-center gap-1 ${
                  changeAmount > 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {changeAmount > 0 ? (
                    <TrendingUp className="h-4 w-4" />
                  ) : (
                    <TrendingDown className="h-4 w-4" />
                  )}
                  <span>
                    {changeAmount > 0 ? '+' : ''}{formatCurrency(Math.abs(changeAmount))}
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Комментарий</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Причина изменения баланса..."
                rows={3}
                data-testid="input-working-capital-notes"
              />
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={updateMutation.isPending} data-testid="button-save-working-capital">
                <Save className="h-4 w-4 mr-2" />
                {updateMutation.isPending ? 'Сохранение...' : 'Сохранить'}
              </Button>
              <Button variant="outline" onClick={handleCancel} data-testid="button-cancel-working-capital">
                <X className="h-4 w-4 mr-2" />
                Отмена
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
