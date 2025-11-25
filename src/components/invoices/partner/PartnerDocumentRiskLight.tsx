import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, Shield } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";

type RiskStatus = "green" | "red";

interface DocumentRisk {
  status: RiskStatus;
  missingActsCount: number;
  missingActsInvoices: string[];
}

export const PartnerDocumentRiskLight = () => {
  const { partnerId, isLoading: authLoading } = useAuth();
  const [riskStatus, setRiskStatus] = useState<DocumentRisk | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDocumentRisk = async () => {
    if (!partnerId || authLoading) return;

    try {
      setLoading(true);

      // Find paid invoices without client_act documents
      const { data: invoicesWithoutActs, error } = await supabase
        .from("invoices")
        .select(`
          id,
          invoice_number,
          invoice_documents!left(id, document_type)
        `)
        .eq("partner_id", partnerId)
        .eq("status", "paid");

      if (error) throw error;

      // Filter invoices that don't have client_act
      const missingActs = (invoicesWithoutActs || []).filter((invoice: any) => {
        const hasClientAct = invoice.invoice_documents?.some(
          (doc: any) => doc.document_type === "client_act"
        );
        return !hasClientAct;
      });

      const missingCount = missingActs.length;
      const status: RiskStatus = missingCount > 0 ? "red" : "green";

      setRiskStatus({
        status,
        missingActsCount: missingCount,
        missingActsInvoices: missingActs.map((inv: any) => inv.invoice_number),
      });
    } catch (error) {
      console.error("Error fetching document risk:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocumentRisk();
  }, [partnerId, authLoading]);

  // Realtime subscriptions for automatic updates
  useRealtimeSubscription({
    channelName: 'partner_document_risk_invoices',
    table: 'invoices',
    filter: partnerId ? `partner_id=eq.${partnerId}` : undefined,
    onUpdate: fetchDocumentRisk,
    enabled: !!partnerId,
  });

  useRealtimeSubscription({
    channelName: 'partner_document_risk_docs',
    table: 'invoice_documents',
    onUpdate: fetchDocumentRisk,
    enabled: !!partnerId,
  });

  if (loading || !riskStatus) {
    return null;
  }

  const statusConfig = {
    green: {
      icon: Shield,
      color: "text-green-500",
      bgColor: "bg-green-50 dark:bg-green-950/20",
      borderColor: "border-green-200 dark:border-green-800",
      title: "✅ Документы в порядке",
      description: "Все акты загружены и подписаны",
    },
    red: {
      icon: AlertTriangle,
      color: "text-red-500",
      bgColor: "bg-red-50 dark:bg-red-950/20",
      borderColor: "border-red-200 dark:border-red-800",
      title: "🚨 Документарный риск!",
      description: "Деньги получены, но акты не загружены. Риск для налоговой и Авито!",
    },
  };

  const config = statusConfig[riskStatus.status];
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
            {riskStatus.status === "red" && riskStatus.missingActsCount > 0 && (
              <div className="space-y-2">
                <p className="text-xl font-bold text-red-600 dark:text-red-400">
                  Счетов без актов: {riskStatus.missingActsCount}
                </p>
                {riskStatus.missingActsInvoices.length > 0 && (
                  <div className="text-sm">
                    <p className="font-medium mb-1">Номера счетов:</p>
                    <p className="text-muted-foreground">
                      {riskStatus.missingActsInvoices.slice(0, 3).join(", ")}
                      {riskStatus.missingActsInvoices.length > 3 && "..."}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
