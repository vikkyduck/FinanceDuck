import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { DollarSign, FileText, Receipt } from "lucide-react";

export const AssistantBonusCard = () => {
  const [bonusData, setBonusData] = useState({
    clientActs: 0,
    executorReceipts: 0,
    total: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBonusData();
    
    // Subscribe to real-time updates - listen to invoices table
    const channel = supabase
      .channel('assistant_bonus_changes')
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'invoices' 
        },
        () => {
          fetchBonusData();
        }
      )
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'invoice_calculations' 
        },
        () => {
          fetchBonusData();
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchBonusData = async () => {
    // Fetch bonus data only for paid invoices
    const { data, error } = await supabase
      .from("invoices")
      .select(`
        id,
        status,
        invoice_calculations(
          assistant_bonus_client_acts, 
          assistant_bonus_executor_receipts, 
          assistant_bonus_total, 
          assistant_bonus_paid
        )
      `)
      .eq("status", "paid")
      .not("actual_payment_date", "is", null);

    if (!error && data) {
      // Sum up all bonuses from paid invoices
      const totals = data.reduce((acc, invoice: any) => {
        const calc = invoice.invoice_calculations?.[0];
        if (!calc) return acc;
        
        return {
          clientActs: acc.clientActs + (calc.assistant_bonus_client_acts || 0),
          executorReceipts: acc.executorReceipts + (calc.assistant_bonus_executor_receipts || 0),
          total: acc.total + (calc.assistant_bonus_total || 0),
        };
      }, { clientActs: 0, executorReceipts: 0, total: 0 });

      setBonusData(totals);
    }
    
    setLoading(false);
  };

  const clientActsAmount = bonusData.clientActs * 2000;
  const executorReceiptsAmount = bonusData.executorReceipts * 1000;
  const progressPercent = Math.min((bonusData.total / 10000) * 100, 100);

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
    <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-primary" />
          Ваши бонусы
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="text-3xl font-bold text-primary">
            {formatCurrency(bonusData.total)}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Накоплено за загруженные документы
          </p>
        </div>

        <Progress value={progressPercent} className="h-2" />

        <div className="grid grid-cols-2 gap-4 pt-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="h-4 w-4" />
              <span>Акты от клиентов</span>
            </div>
            <div className="text-lg font-semibold">
              {bonusData.clientActs} × 2000₽ = {formatCurrency(clientActsAmount)}
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Receipt className="h-4 w-4" />
              <span>Чеки от исполнителей</span>
            </div>
            <div className="text-lg font-semibold">
              {bonusData.executorReceipts} × 1000₽ = {formatCurrency(executorReceiptsAmount)}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
