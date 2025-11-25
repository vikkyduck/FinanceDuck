import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { querySupabase, ensureSessionContext } from "@/lib/supabaseHelpers";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { TrendingUp, Users, DollarSign, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface ClientLTV {
  client_id: string;
  client_name: string;
  total_invoices: number;
  total_billed: number;
  total_paid: number;
  outstanding_debt: number;
  payment_rate: number;
}

export const ClientLTVReport = () => {
  const [clients, setClients] = useState<ClientLTV[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'total_billed' | 'total_paid' | 'outstanding_debt'>('total_billed');

  const fetchClientLTV = async () => {
    try {
      setLoading(true);
      await ensureSessionContext();

      // Получаем все счета с расчетами
      const invoices = await querySupabase<any>(
        'invoices',
        '*, clients!inner(name), invoice_calculations!inner(client_bill)'
      );

      if (!invoices) {
        setClients([]);
        return;
      }

      // Группируем по клиентам
      const clientMap = new Map<string, ClientLTV>();

      invoices.forEach((invoice) => {
        const clientId = invoice.client_id;
        const clientName = invoice.clients?.name || 'Неизвестный клиент';
        const clientBill = invoice.invoice_calculations?.[0]?.client_bill || 0;
        const isPaid = invoice.status === 'paid';

        if (!clientMap.has(clientId)) {
          clientMap.set(clientId, {
            client_id: clientId,
            client_name: clientName,
            total_invoices: 0,
            total_billed: 0,
            total_paid: 0,
            outstanding_debt: 0,
            payment_rate: 0,
          });
        }

        const client = clientMap.get(clientId)!;
        client.total_invoices += 1;
        client.total_billed += clientBill;

        if (isPaid) {
          client.total_paid += clientBill;
        } else if (invoice.status === 'sent') {
          client.outstanding_debt += clientBill;
        }
      });

      // Рассчитываем payment rate
      const clientsArray = Array.from(clientMap.values()).map(client => ({
        ...client,
        payment_rate: client.total_billed > 0 
          ? (client.total_paid / client.total_billed) * 100 
          : 0,
      }));

      setClients(clientsArray);
    } catch (error) {
      console.error('Error fetching client LTV:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClientLTV();
  }, []);

  const sortedClients = [...clients].sort((a, b) => b[sortBy] - a[sortBy]);

  const totals = clients.reduce(
    (acc, client) => ({
      total_billed: acc.total_billed + client.total_billed,
      total_paid: acc.total_paid + client.total_paid,
      outstanding_debt: acc.outstanding_debt + client.outstanding_debt,
    }),
    { total_billed: 0, total_paid: 0, outstanding_debt: 0 }
  );

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>LTV Драконов (Клиентов)</CardTitle>
          <CardDescription>Загрузка...</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              LTV Драконов (Клиентов)
            </CardTitle>
            <CardDescription>
              Пожизненная ценность каждого клиента
            </CardDescription>
          </div>
          <div className="flex gap-4 text-sm">
            <div className="text-center">
              <div className="text-muted-foreground">Всего выставлено</div>
              <div className="text-lg font-semibold">{formatCurrency(totals.total_billed)}</div>
            </div>
            <div className="text-center">
              <div className="text-muted-foreground">Оплачено</div>
              <div className="text-lg font-semibold text-green-600">{formatCurrency(totals.total_paid)}</div>
            </div>
            <div className="text-center">
              <div className="text-muted-foreground">Задолженность</div>
              <div className="text-lg font-semibold text-red-600">{formatCurrency(totals.outstanding_debt)}</div>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Клиент</TableHead>
                <TableHead className="text-right">Счетов</TableHead>
                <TableHead 
                  className="text-right cursor-pointer hover:bg-muted/50"
                  onClick={() => setSortBy('total_billed')}
                >
                  <div className="flex items-center justify-end gap-1">
                    Всего выставлено
                    {sortBy === 'total_billed' && <TrendingUp className="h-3 w-3" />}
                  </div>
                </TableHead>
                <TableHead 
                  className="text-right cursor-pointer hover:bg-muted/50"
                  onClick={() => setSortBy('total_paid')}
                >
                  <div className="flex items-center justify-end gap-1">
                    Оплачено
                    {sortBy === 'total_paid' && <TrendingUp className="h-3 w-3" />}
                  </div>
                </TableHead>
                <TableHead 
                  className="text-right cursor-pointer hover:bg-muted/50"
                  onClick={() => setSortBy('outstanding_debt')}
                >
                  <div className="flex items-center justify-end gap-1">
                    Задолженность
                    {sortBy === 'outstanding_debt' && <TrendingUp className="h-3 w-3" />}
                  </div>
                </TableHead>
                <TableHead className="text-right">Оплата %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedClients.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Нет данных по клиентам
                  </TableCell>
                </TableRow>
              ) : (
                sortedClients.map((client) => (
                  <TableRow key={client.client_id}>
                    <TableCell className="font-medium">{client.client_name}</TableCell>
                    <TableCell className="text-right">{client.total_invoices}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(client.total_billed)}
                    </TableCell>
                    <TableCell className="text-right text-green-600 font-medium">
                      {formatCurrency(client.total_paid)}
                    </TableCell>
                    <TableCell className="text-right">
                      {client.outstanding_debt > 0 ? (
                        <span className="text-red-600 font-medium flex items-center justify-end gap-1">
                          <AlertCircle className="h-3 w-3" />
                          {formatCurrency(client.outstanding_debt)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge 
                        variant={client.payment_rate >= 80 ? "default" : client.payment_rate >= 50 ? "secondary" : "destructive"}
                      >
                        {client.payment_rate.toFixed(0)}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};
