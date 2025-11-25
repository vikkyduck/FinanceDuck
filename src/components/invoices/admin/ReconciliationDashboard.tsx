import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { toast } from "@/hooks/use-toast";
import { AlertCircle, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ReconciliationRecord {
  id: string;
  invoice_id: string;
  invoices: {
    invoice_number: string;
    clients: { name: string };
  };
  expected_client_payment: number;
  actual_client_payment: number;
  expected_partner_payment: number;
  actual_partner_payment: number;
  client_variance: number;
  partner_variance: number;
  status: string;
  reconciliation_notes: string | null;
}

export const ReconciliationDashboard = () => {
  const [records, setRecords] = useState<ReconciliationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedRecord, setSelectedRecord] = useState<ReconciliationRecord | null>(null);
  const [notes, setNotes] = useState("");
  const [processing, setProcessing] = useState(false);

  const fetchRecords = async () => {
    let query = supabase
      .from("reconciliation_records")
      .select(`
        *,
        invoices(
          invoice_number,
          clients(name)
        )
      `)
      .order("created_at", { ascending: false });

    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

    const { data, error } = await query;

    if (!error && data) {
      setRecords(data as any);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRecords();
  }, [statusFilter]);

  useRealtimeSubscription({
    channelName: 'reconciliation_updates',
    table: 'reconciliation_records',
    event: '*',
    onUpdate: fetchRecords,
    enabled: true,
  });

  const handleResolve = async () => {
    if (!selectedRecord) return;

    setProcessing(true);
    try {
      const { error } = await supabase
        .from("reconciliation_records")
        .update({
          status: "resolved",
          reconciled_at: new Date().toISOString(),
          reconciliation_notes: notes || null,
        })
        .eq("id", selectedRecord.id);

      if (error) throw error;

      toast({
        title: "Расхождение разрешено",
        description: `Запись по счёту № ${selectedRecord.invoices.invoice_number} отмечена как разрешённая`,
      });

      setSelectedRecord(null);
      setNotes("");
      fetchRecords();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: error.message,
      });
    } finally {
      setProcessing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "resolved":
        return (
          <Badge variant="default" className="gap-1 bg-green-500 hover:bg-green-600">
            <CheckCircle2 className="h-3 w-3" />
            Разрешено
          </Badge>
        );
      case "disputed":
        return (
          <Badge variant="destructive" className="gap-1">
            <AlertCircle className="h-3 w-3" />
            Спорно
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary" className="gap-1">
            <Clock className="h-3 w-3" />
            Ожидает
          </Badge>
        );
    }
  };

  const getVarianceColor = (variance: number) => {
    if (variance === 0) return "text-green-600";
    if (Math.abs(variance) < 1000) return "text-yellow-600";
    return "text-red-600";
  };

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
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-500" />
              Сверка платежей
            </CardTitle>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Фильтр по статусу" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все записи</SelectItem>
                <SelectItem value="pending">Ожидает</SelectItem>
                <SelectItem value="disputed">Спорные</SelectItem>
                <SelectItem value="resolved">Разрешено</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {records.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              {statusFilter === "all"
                ? "Нет записей для сверки"
                : `Нет записей со статусом "${statusFilter}"`}
            </p>
          ) : (
            <div className="space-y-3">
              {records.map((record) => {
                const clientVariance = record.client_variance || 0;
                const partnerVariance = record.partner_variance || 0;
                const hasVariance = clientVariance !== 0 || partnerVariance !== 0;

                return (
                  <div
                    key={record.id}
                    className={`p-4 border rounded-lg bg-card hover:bg-muted/50 transition-colors ${
                      hasVariance ? "border-orange-200" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">
                            № {record.invoices.invoice_number}
                          </span>
                          {getStatusBadge(record.status)}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {record.invoices.clients?.name}
                        </p>

                        <div className="grid grid-cols-2 gap-4 text-sm mt-3">
                          <div>
                            <p className="text-muted-foreground mb-1">От клиента</p>
                            <p>
                              Ожидалось: <span className="font-medium">{formatCurrency(record.expected_client_payment)}</span>
                            </p>
                            <p>
                              Получено: <span className="font-medium">{formatCurrency(record.actual_client_payment)}</span>
                            </p>
                            {clientVariance !== 0 && (
                              <p className={`font-semibold ${getVarianceColor(clientVariance)}`}>
                                Расхождение: {formatCurrency(Math.abs(clientVariance))}
                                {clientVariance > 0 ? " ↑" : " ↓"}
                              </p>
                            )}
                          </div>

                          {record.expected_partner_payment !== null && (
                            <div>
                              <p className="text-muted-foreground mb-1">Партнёру</p>
                              <p>
                                Ожидалось: <span className="font-medium">{formatCurrency(record.expected_partner_payment)}</span>
                              </p>
                              <p>
                                Выплачено: <span className="font-medium">{formatCurrency(record.actual_partner_payment)}</span>
                              </p>
                              {partnerVariance !== 0 && (
                                <p className={`font-semibold ${getVarianceColor(partnerVariance)}`}>
                                  Расхождение: {formatCurrency(Math.abs(partnerVariance))}
                                  {partnerVariance > 0 ? " ↑" : " ↓"}
                                </p>
                              )}
                            </div>
                          )}
                        </div>

                        {record.reconciliation_notes && (
                          <p className="text-xs text-muted-foreground mt-2 p-2 bg-muted rounded">
                            {record.reconciliation_notes}
                          </p>
                        )}
                      </div>

                      {record.status !== "resolved" && (
                        <Button
                          size="sm"
                          onClick={() => {
                            setSelectedRecord(record);
                            setNotes(record.reconciliation_notes || "");
                          }}
                          className="ml-4"
                        >
                          Разрешить
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedRecord} onOpenChange={() => setSelectedRecord(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Разрешить расхождение</DialogTitle>
            <DialogDescription>
              {selectedRecord && (
                <>
                  Счёт № {selectedRecord.invoices.invoice_number} •{" "}
                  {selectedRecord.invoices.clients?.name}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">
                Комментарий к разрешению
              </label>
              <Textarea
                placeholder="Укажите, как было разрешено расхождение..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSelectedRecord(null);
                setNotes("");
              }}
              disabled={processing}
            >
              Отмена
            </Button>
            <Button
              onClick={handleResolve}
              disabled={processing}
              className="gap-2"
            >
              {processing && <Loader2 className="h-4 w-4 animate-spin" />}
              Разрешить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
