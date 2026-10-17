import { assistantGroupsSchema } from '@shared/assistantContract';
import { apiGet } from '@/lib/api';
import { InvoicePagination } from '../InvoicePagination';
import { useState, useEffect } from "react";
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

  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); setExpandedPartner(null); }, [selectedYear]);
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['/api/invoices', 'assistant-partner-groups', selectedYear, page],
    queryFn: () => apiGet(`/assistant/invoice-groups?year=${selectedYear}&page=${page}&limit=25`, assistantGroupsSchema),
  });
  const partnerStats = data?.rows.map(row => ({ ...row, total: Number(row.total),
    percentage: Number(data.amount) ? Number(row.total) / Number(data.amount) * 100 : 0 }));
  if (error) return <p role="alert">Не удалось загрузить партнёров. <button onClick={() => refetch()}>Повторить</button></p>;

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
                      {partner.clientCount} клиентов · {partner.invoiceCount} счетов
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
                    <PartnerClients key={`${partner.id}-${selectedYear}`} partnerId={partner.id} year={selectedYear} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
        <InvoicePagination page={page} pages={data?.pages ?? 0} total={data?.total ?? 0} onPage={setPage} disabled={isFetching} />
      </CardContent>
    </Card>
  );
};

function PartnerClients({ partnerId, year }: { partnerId: string; year: number }) {
  const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ['/api/invoices', 'assistant-partner-clients', partnerId, year, page],
    queryFn: () => apiGet(`/assistant/invoice-groups?year=${year}&partnerId=${partnerId}&page=${page}&limit=25`, assistantGroupsSchema) });
  if (query.error) return <p role="alert">Не удалось загрузить клиентов. <button onClick={() => query.refetch()}>Повторить</button></p>;
  return <>
    {query.isLoading && <p>Загрузка…</p>}
    {query.data?.rows.map(client => <div key={client.id} className="flex items-center justify-between py-2 px-3 rounded bg-background/50">
      <div><p className="font-medium text-sm">{client.name}</p><p className="text-xs text-muted-foreground">{client.invoiceCount} счетов</p></div>
      <p className="font-semibold">{formatMoney(Number(client.total))}</p>
    </div>)}
    <InvoicePagination page={page} pages={query.data?.pages ?? 0} total={query.data?.total ?? 0} onPage={setPage} disabled={query.isFetching} />
  </>;
}
