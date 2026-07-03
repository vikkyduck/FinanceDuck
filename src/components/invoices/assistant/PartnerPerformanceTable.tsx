import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronDown, ChevronRight, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Progress } from "@/components/ui/progress";
import { motion, AnimatePresence } from "framer-motion";
import { formatMoney } from "@/lib/format";

interface Props {
  selectedYear: number;
}

export const PartnerPerformanceTable = ({ selectedYear }: Props) => {
  const [expandedPartner, setExpandedPartner] = useState<string | null>(null);

  const { data: partnerStats, isLoading } = useQuery({
    queryKey: ['assistant-partner-stats', selectedYear],
    queryFn: async () => {
      const response = await fetch(
        `/api/assistant/stats-invoices?year=${selectedYear}`,
        { credentials: 'include' }
      );
      if (!response.ok) return [];
      const invoices: any[] = await response.json();

      if (!invoices || invoices.length === 0) {
        return [];
      }

      const partnerMap = new Map<string, {
        id: string;
        name: string;
        total: number;
        invoiceCount: number;
        clients: Map<string, { name: string; total: number; count: number }>;
      }>();

      invoices.forEach(inv => {
        const partnerName = inv.partner_name;
        const partnerId = inv.partner_id;
        const clientName = inv.client_name;
        const clientId = inv.client_id;
        const amount = inv.client_bill || 0;

        if (!partnerName || !clientName) return;

        if (!partnerMap.has(partnerId)) {
          partnerMap.set(partnerId, {
            id: partnerId,
            name: partnerName,
            total: 0,
            invoiceCount: 0,
            clients: new Map()
          });
        }

        const p = partnerMap.get(partnerId)!;
        p.total += amount;
        p.invoiceCount++;

        if (!p.clients.has(clientId)) {
          p.clients.set(clientId, { name: clientName, total: 0, count: 0 });
        }
        const c = p.clients.get(clientId)!;
        c.total += amount;
        c.count++;
      });

      const totalAmount = Array.from(partnerMap.values())
        .reduce((sum, p) => sum + p.total, 0);

      return Array.from(partnerMap.values())
        .map(p => ({
          ...p,
          percentage: (p.total / totalAmount) * 100,
          clients: Array.from(p.clients.values())
        }))
        .sort((a, b) => b.total - a.total);
    }
  });

  if (isLoading) {
    return (
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Разбивка по партнёрам</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-muted rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Разбивка по партнёрам
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {partnerStats?.map((partner) => (
          <div key={partner.id} className="border rounded-lg overflow-hidden">
            <button
              onClick={() => setExpandedPartner(
                expandedPartner === partner.id ? null : partner.id
              )}
              className="w-full p-4 hover:bg-accent/5 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  {expandedPartner === partner.id ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  <div className="text-left">
                    <p className="font-semibold">{partner.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {partner.clients.length} клиентов · {partner.invoiceCount} счетов
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-lg">
                    {formatMoney(partner.total)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {partner.percentage.toFixed(1)}% от общего
                  </p>
                </div>
              </div>
              <Progress value={partner.percentage} className="h-2" />
            </button>

            <AnimatePresence>
              {expandedPartner === partner.id && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="border-t bg-muted/20"
                >
                  <div className="p-4 space-y-2">
                    {partner.clients.map((client) => (
                      <div
                        key={client.name}
                        className="flex items-center justify-between py-2 px-3 rounded bg-background/50"
                      >
                        <div>
                          <p className="font-medium text-sm">{client.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {client.count} {client.count === 1 ? 'счёт' : 'счетов'}
                          </p>
                        </div>
                        <p className="font-semibold">
                          {formatMoney(client.total)}
                        </p>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
