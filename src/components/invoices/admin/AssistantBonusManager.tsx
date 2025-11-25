import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { useToast } from "@/hooks/use-toast";
import { DollarSign, CheckCircle } from "lucide-react";

export const AssistantBonusManager = () => {
  const { toast } = useToast();
  const [bonusData, setBonusData] = useState({
    clientActs: 0,
    executorReceipts: 0,
    total: 0,
  });
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    fetchBonusData();
  }, []);

  const fetchBonusData = async () => {
    const { data, error } = await supabase
      .from("invoice_calculations")
      .select("assistant_bonus_client_acts, assistant_bonus_executor_receipts, assistant_bonus_total");

    if (!error && data) {
      const totals = data.reduce((acc, item) => ({
        clientActs: acc.clientActs + (item.assistant_bonus_client_acts || 0),
        executorReceipts: acc.executorReceipts + (item.assistant_bonus_executor_receipts || 0),
        total: acc.total + (item.assistant_bonus_total || 0),
      }), { clientActs: 0, executorReceipts: 0, total: 0 });

      setBonusData(totals);
    }
    setLoading(false);
  };

  const handleMarkAsPaid = async () => {
    if (!confirm("Подтвердите выплату бонусов. Счётчики будут обнулены.")) {
      return;
    }

    setResetting(true);

    try {
      // First, create assistant_bonuses record
      const { error: insertError } = await supabase
        .from("assistant_bonuses")
        .insert({
          client_acts_count: bonusData.clientActs,
          executor_receipts_count: bonusData.executorReceipts,
          total_bonus_amount: bonusData.total,
          payment_status: "paid",
          paid_at: new Date().toISOString(),
        });

      if (insertError) throw insertError;

      // Then reset all bonus fields in invoice_calculations
      const { error: updateError } = await supabase
        .from("invoice_calculations")
        .update({
          assistant_bonus_client_acts: 0,
          assistant_bonus_executor_receipts: 0,
          assistant_bonus_total: 0,
          assistant_bonus_paid: true,
        })
        .neq("id", "00000000-0000-0000-0000-000000000000");

      if (updateError) throw updateError;

      toast({
        title: "Успешно",
        description: "Выплата зафиксирована, бонусы обнулены",
      });

      fetchBonusData();
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setResetting(false);
    }
  };

  const clientActsAmount = bonusData.clientActs * 2000;
  const executorReceiptsAmount = bonusData.executorReceipts * 1000;

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground">Загрузка...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-primary" />
          Бонусы ассистента
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="text-2xl font-bold text-primary">
            {formatCurrency(bonusData.total)}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Сумма к выплате
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-2 border-t">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Акты от клиентов</p>
            <p className="font-semibold">
              {bonusData.clientActs} × 2000₽ = {formatCurrency(clientActsAmount)}
            </p>
          </div>

          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Чеки от исполнителей</p>
            <p className="font-semibold">
              {bonusData.executorReceipts} × 1000₽ = {formatCurrency(executorReceiptsAmount)}
            </p>
          </div>
        </div>

        {bonusData.total > 0 && (
          <Button 
            onClick={handleMarkAsPaid}
            disabled={resetting}
            className="w-full"
            variant="default"
          >
            <CheckCircle className="h-4 w-4 mr-2" />
            {resetting ? "Обработка..." : "Отметить выплату и обнулить"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
};
