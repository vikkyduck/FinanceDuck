import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { querySupabaseWithFilter } from "@/lib/supabaseHelpers";
import { useAuth } from "@/hooks/useAuth";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { formatCurrency, InvoiceScheme } from "@/lib/invoiceCalculations";
import { Loader2, User, Wallet, ShieldAlert, CreditCard } from "lucide-react";

interface ClientStatsData {
  client_id: string;
  client_name: string;
  partner_commission: number;
  client_remaining: number;
  admin_commission: number;
  admin_expenses: number;
  total_to_admin: number;
  payments_to_admin: number;
  remaining_debt: number;
}

export const PartnerClientStats = () => {
  const { partnerId, isLoading: authLoading } = useAuth();
  const [clientStats, setClientStats] = useState<ClientStatsData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!partnerId) {
      console.log('[PartnerClientStats] No partnerId provided');
      return;
    }

    console.log('[PartnerClientStats] Fetching data for partnerId:', partnerId);

    setLoading(true);
    try {
      // Fetch all invoices for this partner with client info (only paid)
      const invoices = await querySupabaseWithFilter<any>(
        'invoices',
        `
          *,
          invoice_calculations(
            client_bill,
            commission_amount,
            partner_share_from_margin,
            client_remaining,
            client_base_after_margin,
            executor_expenses_total,
            partner_transfer_due
          ),
          clients(id, name)
        `,
        (query) => query
          .eq('partner_id', partnerId)
          .eq('status', 'paid'),
        { operation: 'fetch_partner_invoices_by_client' }
      );

      if (!invoices) {
        setClientStats([]);
        return;
      }

      // Fetch all partner payments
      const payments = await querySupabaseWithFilter<any>(
        'partner_payments',
        'amount, invoice_id',
        (query) => query.eq('partner_id', partnerId),
        { operation: 'fetch_partner_payments_by_invoice' }
      );

      // Group invoices by client
      const clientMap = new Map<string, {
        client_id: string;
        client_name: string;
        partner_commission: number;
        client_remaining: number;
        total_debt_to_admin: number;
        invoice_ids: string[];
      }>();

      invoices.forEach((invoice: any) => {
        const clientId = invoice.client_id;
        const clientName = invoice.clients?.name || 'Неизвестный клиент';
        
        if (!clientMap.has(clientId)) {
          clientMap.set(clientId, {
            client_id: clientId,
            client_name: clientName,
            partner_commission: 0,
            client_remaining: 0,
            total_debt_to_admin: 0,
            invoice_ids: [],
          });
        }

        const clientData = clientMap.get(clientId)!;
        clientData.invoice_ids.push(invoice.id);

        const calcSource = invoice.invoice_calculations;
        const calc = Array.isArray(calcSource) ? calcSource[0] : calcSource;
        if (calc) {
          const scheme = invoice.scheme as InvoiceScheme;
          const clientBill = Number(calc.client_bill) || 0;
          const executorExpenses = Number(calc.executor_expenses_total) || 0;
          
          let commission = 0;
          if (scheme === 'agency_30') {
            commission = Number(calc.partner_share_from_margin) || 0;
            const clientBase = Number(calc.client_base_after_margin) || clientBill * 0.70;
            clientData.client_remaining += Math.max(0, clientBase - executorExpenses);
          } else {
            commission = Number(calc.commission_amount) || 0;
            clientData.client_remaining += Number(calc.client_remaining) || 0;
          }
          
          clientData.partner_commission += commission;
          
          // Use stored partnerTransferDue as single source of truth
          const storedDebt = Number(calc.partner_transfer_due) || 0;
          clientData.total_debt_to_admin += Math.max(0, storedDebt);
        }
      });

      // Calculate debt for each client
      const statsArray: ClientStatsData[] = Array.from(clientMap.values()).map(client => {
        // Calculate payments for this client's invoices
        const paymentsForClient = payments
          ?.filter((p: any) => client.invoice_ids.includes(p.invoice_id))
          .reduce((sum: number, p: any) => sum + (p.amount || 0), 0) || 0;
        
        const remainingDebt = client.total_debt_to_admin - paymentsForClient;

        return {
          client_id: client.client_id,
          client_name: client.client_name,
          partner_commission: client.partner_commission,
          client_remaining: client.client_remaining,
          admin_commission: 0,
          admin_expenses: 0,
          total_to_admin: client.total_debt_to_admin,
          payments_to_admin: paymentsForClient,
          remaining_debt: remainingDebt,
        };
      });

      // Sort by client name
      statsArray.sort((a, b) => a.client_name.localeCompare(b.client_name));
      setClientStats(statsArray);

      console.log('[PartnerClientStats] Calculated client stats:', {
        invoicesCount: invoices.length,
        clientsCount: statsArray.length,
        clients: statsArray.map(c => ({
          name: c.client_name,
          commission: c.partner_commission,
          remaining: c.client_remaining,
          debt: c.remaining_debt
        }))
      });
    } catch (error) {
      console.error('Error fetching client stats:', error);
      setClientStats([]);
    } finally {
      setLoading(false);
    }
  }, [partnerId]);

  useEffect(() => {
    if (!authLoading && partnerId) {
      fetchData();
    } else if (!authLoading && !partnerId) {
      console.log('[PartnerClientStats] No partnerId after auth loaded');
      setLoading(false);
    }
  }, [partnerId, authLoading, fetchData]);

  // Real-time subscriptions
  useRealtimeSubscription({
    channelName: 'partner_client_invoices',
    table: 'invoices',
    filter: partnerId ? `partner_id=eq.${partnerId}` : undefined,
    onUpdate: fetchData,
    enabled: !!partnerId,
  });

  useRealtimeSubscription({
    channelName: 'partner_client_payments',
    table: 'partner_payments',
    filter: partnerId ? `partner_id=eq.${partnerId}` : undefined,
    onUpdate: fetchData,
    enabled: !!partnerId,
  });

  useRealtimeSubscription({
    channelName: 'partner_client_expenses',
    table: 'executor_expenses',
    onUpdate: fetchData,
    enabled: !!partnerId,
  });

  if (loading) {
    return (
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Статистика по клиентам</CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (clientStats.length === 0) {
    return (
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Статистика по клиентам</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">У вас пока нет клиентов</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-2xl">Статистика по клиентам</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {clientStats.map((client) => (
          <div key={client.client_id} className="p-6 bg-accent/30 rounded-lg space-y-4">
            {/* Client name */}
            <div className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              <h3 className="text-xl font-semibold">{client.client_name}</h3>
            </div>

            <Separator />

            {/* Main metrics grid */}
            <div className="grid gap-4 md:grid-cols-2">
              {/* Partner commission */}
              <div className="p-4 bg-background rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Wallet className="h-4 w-4 text-primary" />
                  <p className="text-sm text-muted-foreground">Ваша доля</p>
                </div>
                <p className="text-2xl font-bold text-primary">{formatCurrency(client.partner_commission)}</p>
              </div>

              {/* Client remaining */}
              <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-900">
                <div className="flex items-center gap-2 mb-2">
                  <ShieldAlert className="h-4 w-4 text-green-600" />
                  <p className="text-sm font-medium text-green-900 dark:text-green-100">Не тратить. Деньги на проект</p>
                </div>
                <p className="text-2xl font-bold text-green-700 dark:text-green-400">{formatCurrency(client.client_remaining)}</p>
              </div>
            </div>

            <Separator />

            {/* Debt details */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <CreditCard className="h-4 w-4 text-muted-foreground" />
                <h4 className="font-semibold">Долг перед админом</h4>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center font-semibold">
                  <span>К переводу админу:</span>
                  <span>{formatCurrency(client.total_to_admin)}</span>
                </div>

                <div className="flex justify-between items-center text-green-600">
                  <span>Уже оплачено:</span>
                  <span className="font-medium">{formatCurrency(client.payments_to_admin)}</span>
                </div>

                <Separator />

                <div className="flex justify-between items-center font-bold text-base">
                  <span>Остаток долга:</span>
                  <span className={client.remaining_debt > 0 ? "text-destructive" : "text-green-600"}>
                    {formatCurrency(client.remaining_debt)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
