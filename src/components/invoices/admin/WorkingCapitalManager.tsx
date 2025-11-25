import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { querySupabase, updateSupabase, ensureSessionContext } from "@/lib/supabaseHelpers";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { toast } from "sonner";
import { Edit2, Save, X, TrendingUp, TrendingDown } from "lucide-react";

export const WorkingCapitalManager = () => {
  const [balance, setBalance] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [newAmount, setNewAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchBalance = async () => {
    try {
      setLoading(true);
      await ensureSessionContext();
      
      const data = await querySupabase<any>(
        'working_capital_balance',
        '*',
        { operation: 'fetch_working_capital' }
      );

      if (data && data.length > 0) {
        setBalance(data[0]);
        setNewAmount(data[0].amount.toString());
        setNotes(data[0].notes || '');
      }
    } catch (error) {
      console.error('Error fetching working capital:', error);
      toast.error('Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!balance) return;

    const amount = parseFloat(newAmount);
    if (isNaN(amount) || amount < 0) {
      toast.error('Введите корректную сумму');
      return;
    }

    try {
      await ensureSessionContext();
      
      await updateSupabase(
        'working_capital_balance',
        { 
          amount,
          notes: notes.trim() || null,
        },
        (query) => query.eq('id', balance.id)
      );

      toast.success('Working Capital обновлен');
      setIsEditing(false);
      fetchBalance();
    } catch (error) {
      console.error('Error updating working capital:', error);
      toast.error('Ошибка обновления');
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setNewAmount(balance?.amount?.toString() || '0');
    setNotes(balance?.notes || '');
  };

  useEffect(() => {
    fetchBalance();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Working Capital</CardTitle>
          <CardDescription>Загрузка...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const currentAmount = balance?.amount || 0;
  const isLowBalance = currentAmount < 300000;
  const changeAmount = parseFloat(newAmount) - currentAmount;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
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
              onClick={() => setIsEditing(true)}
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
            {balance?.notes && (
              <div className="text-sm text-muted-foreground border-l-2 pl-3">
                {balance.notes}
              </div>
            )}
            {balance?.updated_at && (
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
              />
              {changeAmount !== 0 && (
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
              />
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSave}>
                <Save className="h-4 w-4 mr-2" />
                Сохранить
              </Button>
              <Button variant="outline" onClick={handleCancel}>
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
