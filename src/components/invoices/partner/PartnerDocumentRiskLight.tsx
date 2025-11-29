import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, Shield, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface DocumentRiskResponse {
  status: "green" | "red";
  missingActsCount: number;
  missingActsInvoices: { id: string; invoiceNumber: string }[];
}

export const PartnerDocumentRiskLight = () => {
  const { data: riskStatus, isLoading } = useQuery<DocumentRiskResponse>({
    queryKey: ['/api/partner/document-risk'],
    refetchInterval: 120000,
    refetchOnWindowFocus: true,
  });

  if (isLoading) {
    return (
      <Card data-testid="card-partner-document-risk">
        <CardContent className="flex justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!riskStatus) {
    return null;
  }

  const statusConfig = {
    green: {
      icon: Shield,
      color: "text-green-500",
      bgColor: "bg-green-50 dark:bg-green-950/20",
      borderColor: "border-green-200 dark:border-green-800",
      title: "Документы в порядке",
      description: "Все акты загружены",
    },
    red: {
      icon: AlertTriangle,
      color: "text-red-500",
      bgColor: "bg-red-50 dark:bg-red-950/20",
      borderColor: "border-red-200 dark:border-red-800",
      title: "Документарный риск",
      description: "Есть оплаченные счета без актов. Налоговый риск!",
    },
  };

  const config = statusConfig[riskStatus.status];
  const Icon = config.icon;

  return (
    <Card 
      className={`border-2 ${config.borderColor} ${config.bgColor}`}
      data-testid="card-partner-document-risk"
    >
      <CardContent className="pt-6">
        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-full ${config.bgColor}`}>
            <Icon className={`h-8 w-8 ${config.color}`} />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold mb-1" data-testid="text-risk-title">
              {config.title}
            </h3>
            <p className="text-sm text-muted-foreground mb-2">{config.description}</p>
            {riskStatus.status === "red" && riskStatus.missingActsCount > 0 && (
              <div className="space-y-2">
                <p 
                  className="text-xl font-bold text-red-600 dark:text-red-400"
                  data-testid="text-missing-acts-count"
                >
                  Счетов без актов: {riskStatus.missingActsCount}
                </p>
                {riskStatus.missingActsInvoices.length > 0 && (
                  <div className="text-sm">
                    <p className="font-medium mb-1">Номера счетов:</p>
                    <p className="text-muted-foreground">
                      {riskStatus.missingActsInvoices.slice(0, 5).map(i => i.invoiceNumber).join(", ")}
                      {riskStatus.missingActsInvoices.length > 5 && "..."}
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
