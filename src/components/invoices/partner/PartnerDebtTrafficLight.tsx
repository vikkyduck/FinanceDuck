import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, CheckCircle, Clock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { callRPC } from "@/lib/supabaseHelpers";
import { querySupabaseWithFilter } from "@/lib/supabaseHelpers";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";

type TrafficLightStatus = "green" | "yellow" | "red";

interface DebtStatus {
  status: TrafficLightStatus;
  debtAmount: number;
  oldestPaymentDays: number | null;
}

export const PartnerDebtTrafficLight = () => {
  const { partnerId, isLoading: authLoading } = useAuth();
  const [debtStatus, setDebtStatus] = useState<DebtStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDebtStatus = async () => {
    if (!partnerId || authLoading) return;

    try {
      setLoading(true);

      // Get debt data from corrected RPC
      const debtData = await callRPC<{
        debt_to_admin: number;
        total_inflow: number;
        partner_commission: number;
        partner_expenses: number;
        admin_expenses: number;
        total_paid_to_admin: number;
        remaining_debt: number;
      }>("get_partner_debt_to_admin", { _partner_id: partnerId });

      if (!debtData) {
        setDebtStatus({ status: "green", debtAmount: 0, oldestPaymentDays: null });
        return;
      }

      const remainingDebt = debtData.remaining_debt || 0;

      // If no remaining debt, green light
      if (remainingDebt === 0) {
        setDebtStatus({ status: "green", debtAmount: 0, oldestPaymentDays: null });
        return;
      }

      // Get oldest paid invoice date to calculate days since payment
      const paidInvoices = await querySupabaseWithFilter(
        "invoices",
        "actual_payment_date",
        (query) => query.eq("partner_id", partnerId).eq("status", "paid").not("actual_payment_date", "is", null).order("actual_payment_date", { ascending: true }).limit(1)
      );

      let daysSincePayment: number | null = null;
      if (paidInvoices && paidInvoices.length > 0) {
        const oldestDate = new Date(paidInvoices[0].actual_payment_date);
        const today = new Date();
        daysSincePayment = Math.floor((today.getTime() - oldestDate.getTime()) / (1000 * 60 * 60 * 24));
      }

      // Determine status
      let status: TrafficLightStatus = "yellow";
      if (daysSincePayment !== null && daysSincePayment > 3) {
        status = "red";
      }

      setDebtStatus({
        status,
        debtAmount: remainingDebt,
        oldestPaymentDays: daysSincePayment,
      });
    } catch (error) {
      console.error("Error fetching debt status:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDebtStatus();
  }, [partnerId, authLoading]);

  // Realtime subscriptions for automatic updates
  useRealtimeSubscription({
    channelName: 'partner_debt_invoices',
    table: 'invoices',
    filter: partnerId ? `partner_id=eq.${partnerId}` : undefined,
    onUpdate: fetchDebtStatus,
    enabled: !!partnerId,
  });

  useRealtimeSubscription({
    channelName: 'partner_debt_payments',
    table: 'partner_payments',
    filter: partnerId ? `partner_id=eq.${partnerId}` : undefined,
    onUpdate: fetchDebtStatus,
    enabled: !!partnerId,
  });

  if (loading || !debtStatus) {
    return null;
  }

  const statusConfig = {
    green: {
      icon: CheckCircle,
      color: "text-green-500",
      bgColor: "bg-green-50 dark:bg-green-950/20",
      borderColor: "border-green-200 dark:border-green-800",
      title: "Долгов нет",
      description: "Все чисто, финансовых обязательств нет",
    },
    yellow: {
      icon: Clock,
      color: "text-yellow-500",
      bgColor: "bg-yellow-50 dark:bg-yellow-950/20",
      borderColor: "border-yellow-200 dark:border-yellow-800",
      title: "Рабочий процесс",
      description: "Деньги есть, необходимо перевести",
    },
    red: {
      icon: AlertCircle,
      color: "text-red-500",
      bgColor: "bg-red-50 dark:bg-red-950/20",
      borderColor: "border-red-200 dark:border-red-800",
      title: "⚠️ Нарушение договора!",
      description: "Срочно переведите средства! Прошло более 3 дней",
    },
  };

  const config = statusConfig[debtStatus.status];
  const Icon = config.icon;

  return (
    <Card className={`border-2 ${config.borderColor} ${config.bgColor}`}>
      <CardContent className="pt-6">
        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-full ${config.bgColor}`}>
            <Icon className={`h-8 w-8 ${config.color}`} />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold mb-1">{config.title}</h3>
            <p className="text-sm text-muted-foreground mb-2">{config.description}</p>
            {debtStatus.debtAmount > 0 && (
              <div className="space-y-1">
                <p className="text-2xl font-bold">{formatCurrency(debtStatus.debtAmount)}</p>
                {debtStatus.oldestPaymentDays !== null && (
                  <p className="text-sm text-muted-foreground">
                    С момента получения денег прошло: {debtStatus.oldestPaymentDays} дн.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
