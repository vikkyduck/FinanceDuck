import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { AlertCircle, TrendingUp, DollarSign, Calendar, Calculator, FileText } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatCurrency } from "@/lib/invoiceCalculations";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface DebtData {
  totalDebt: number;
  agency30Debt: number;
  commissionBasedDebt: number;
  totalPaid: number;
  remainingDebt: number;
}

interface PaymentHistory {
  id: string;
  amount: number;
  payment_date: string;
  notes: string | null;
  invoice_number: string | null;
}

interface InvoiceDetail {
  id: string;
  invoice_number: string;
  scheme: string;
  client_bill: number;
  partner_share: number;
  admin_share: number;
  amount_to_admin: number;
  admin_expenses: number;
}

const COLORS = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b'];

export default function PartnerDebtDashboard() {
  const { partnerId, loading: roleLoading } = useUserRole();
  const [loading, setLoading] = useState(true);
  const [debtData, setDebtData] = useState<DebtData | null>(null);
  const [payments, setPayments] = useState<PaymentHistory[]>([]);
  const [invoices, setInvoices] = useState<InvoiceDetail[]>([]);

  useEffect(() => {
    if (partnerId) {
      fetchData();
    }
  }, [partnerId]);

  const fetchData = async () => {
    if (!partnerId) return;
    
    setLoading(true);
    try {
      // Fetch invoices and calculations with full details
      const { data: invoicesData, error: invoicesError } = await supabase
        .from("invoices")
        .select(`
          id,
          scheme,
          status,
          invoice_number,
          invoice_calculations(
            amount_to_admin,
            client_bill,
            partner_share_from_margin,
            admin_share_from_margin,
            commission_amount
          )
        `)
        .eq("partner_id", partnerId)
        .eq("status", "paid")
        .order("invoice_number");

      if (invoicesError) throw invoicesError;

      // Fetch partner payments
      const { data: paymentsData, error: paymentsError } = await supabase
        .from("partner_payments")
        .select("id, amount, payment_date, notes, invoice_id")
        .eq("partner_id", partnerId)
        .order("payment_date", { ascending: false })
        .limit(20);

      if (paymentsError) throw paymentsError;

      // Calculate debt by scheme and prepare invoice details
      let agency30Debt = 0;
      let commissionBasedDebt = 0;
      let totalPaid = 0;

      const invoiceDetails: InvoiceDetail[] = [];

      for (const inv of invoicesData || []) {
        const calc = inv.invoice_calculations?.[0];
        const amountToAdmin = calc?.amount_to_admin || 0;
        
        // Get admin expenses for this invoice
        const { data: expenses } = await supabase
          .from("executor_expenses")
          .select("amount")
          .eq("invoice_id", inv.id)
          .eq("is_admin_expense", true);
        
        const adminExpenses = expenses?.reduce((sum, exp) => sum + exp.amount, 0) || 0;

        if (inv.scheme === "agency_30") {
          agency30Debt += amountToAdmin;
          invoiceDetails.push({
            id: inv.id,
            invoice_number: inv.invoice_number,
            scheme: "Agency 30%",
            client_bill: calc?.client_bill || 0,
            partner_share: calc?.partner_share_from_margin || 0,
            admin_share: calc?.admin_share_from_margin || 0,
            amount_to_admin: amountToAdmin,
            admin_expenses: adminExpenses,
          });
        } else if (inv.scheme === "commission_based") {
          commissionBasedDebt += amountToAdmin;
          invoiceDetails.push({
            id: inv.id,
            invoice_number: inv.invoice_number,
            scheme: "Commission-based",
            client_bill: calc?.client_bill || 0,
            partner_share: calc?.commission_amount || 0,
            admin_share: (calc?.client_bill || 0) - (calc?.commission_amount || 0),
            amount_to_admin: amountToAdmin,
            admin_expenses: adminExpenses,
          });
        }
      }

      setInvoices(invoiceDetails);

      paymentsData?.forEach((payment) => {
        totalPaid += payment.amount;
      });

      const totalDebt = agency30Debt + commissionBasedDebt;
      const remainingDebt = totalDebt - totalPaid;

      setDebtData({
        totalDebt,
        agency30Debt,
        commissionBasedDebt,
        totalPaid,
        remainingDebt,
      });

      // Map payments with invoice numbers
      const mappedPayments: PaymentHistory[] = await Promise.all(
        (paymentsData || []).map(async (payment) => {
          let invoiceNumber = null;
          if (payment.invoice_id) {
            const { data: invoice } = await supabase
              .from("invoices")
              .select("invoice_number")
              .eq("id", payment.invoice_id)
              .single();
            invoiceNumber = invoice?.invoice_number || null;
          }
          return {
            ...payment,
            invoice_number: invoiceNumber,
          };
        })
      );

      setPayments(mappedPayments);
    } catch (error: any) {
      console.error("Error fetching debt data:", error);
    } finally {
      setLoading(false);
    }
  };

  if (roleLoading || loading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
          <Skeleton className="h-96" />
        </div>
      </DashboardLayout>
    );
  }

  if (!partnerId) {
    return (
      <DashboardLayout>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Только партнёры могут просматривать эту страницу.
          </AlertDescription>
        </Alert>
      </DashboardLayout>
    );
  }

  const pieData = [
    { name: "Схема Agency 30%", value: debtData?.agency30Debt || 0 },
    { name: "Схема Commission", value: debtData?.commissionBasedDebt || 0 },
  ];

  const barData = [
    { name: "Всего долг", amount: debtData?.totalDebt || 0, fill: COLORS[0] },
    { name: "Выплачено", amount: debtData?.totalPaid || 0, fill: COLORS[2] },
    { name: "Осталось", amount: debtData?.remainingDebt || 0, fill: COLORS[3] },
  ];

  const paymentProgress = debtData?.totalDebt
    ? ((debtData.totalPaid / debtData.totalDebt) * 100).toFixed(1)
    : "0";

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            Дашборд задолженности
          </h1>
          <p className="text-muted-foreground mt-1">
            Визуализация вашей задолженности перед администратором
          </p>
        </div>

        {/* Key Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-6 space-y-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
            <div className="flex items-center justify-between">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <span className="text-sm font-medium text-muted-foreground">Общий долг</span>
            </div>
            <div className="text-2xl font-bold">{formatCurrency(debtData?.totalDebt || 0)}</div>
          </Card>

          <Card className="p-6 space-y-2 border-green-500/20 bg-gradient-to-br from-green-500/5 to-transparent">
            <div className="flex items-center justify-between">
              <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-green-500" />
              </div>
              <span className="text-sm font-medium text-muted-foreground">Выплачено</span>
            </div>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {formatCurrency(debtData?.totalPaid || 0)}
            </div>
          </Card>

          <Card className="p-6 space-y-2 border-orange-500/20 bg-gradient-to-br from-orange-500/5 to-transparent">
            <div className="flex items-center justify-between">
              <div className="h-10 w-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
                <AlertCircle className="h-5 w-5 text-orange-500" />
              </div>
              <span className="text-sm font-medium text-muted-foreground">Осталось</span>
            </div>
            <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
              {formatCurrency(debtData?.remainingDebt || 0)}
            </div>
          </Card>
        </div>

        {/* Progress Bar */}
        <Card className="p-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Прогресс выплат</span>
              <span className="text-sm font-bold text-primary">{paymentProgress}%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-primary/60 transition-all duration-500 rounded-full"
                style={{ width: `${paymentProgress}%` }}
              />
            </div>
          </div>
        </Card>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Структура долга по схемам</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Обзор задолженности</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Bar dataKey="amount" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* Payment History */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">История платежей</h3>
          </div>
          
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Платежей пока не было
            </p>
          ) : (
            <div className="space-y-3">
              {payments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{formatCurrency(payment.amount)}</span>
                      {payment.invoice_number && (
                        <span className="text-xs text-muted-foreground">
                          по счёту #{payment.invoice_number}
                        </span>
                      )}
                    </div>
                    {payment.notes && (
                      <p className="text-sm text-muted-foreground">{payment.notes}</p>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {format(new Date(payment.payment_date), "dd.MM.yyyy")}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Calculation Formulas */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Calculator className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Формулы расчёта</h3>
          </div>
          
          <div className="space-y-6">
            {/* Agency 30% Formula */}
            <div className="p-4 rounded-lg border border-purple-500/20 bg-purple-500/5">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-3 w-3 rounded-full bg-purple-500" />
                <h4 className="font-semibold text-purple-600 dark:text-purple-400">Схема Agency 30%</h4>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Сумма счёта:</span>
                  <span className="font-mono font-medium">Сумма от клиента</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Комиссия агентства (30%):</span>
                  <span className="font-mono font-medium">Сумма × 0.30</span>
                </div>
                <div className="flex items-center gap-2 pl-4 border-l-2 border-purple-500">
                  <span className="text-muted-foreground">Ваша доля:</span>
                  <span className="font-mono font-medium text-purple-600 dark:text-purple-400">15% от суммы</span>
                </div>
                <div className="flex items-center gap-2 pt-2 border-t">
                  <span className="text-muted-foreground font-semibold">К оплате админу:</span>
                  <span className="font-mono font-bold text-purple-600 dark:text-purple-400">Комиссия агентства − Ваша доля + Расходы админа</span>
                </div>
              </div>
            </div>

            {/* Commission-based Formula */}
            <div className="p-4 rounded-lg border border-cyan-500/20 bg-cyan-500/5">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-3 w-3 rounded-full bg-cyan-500" />
                <h4 className="font-semibold text-cyan-600 dark:text-cyan-400">Схема Commission-based</h4>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Сумма счёта:</span>
                  <span className="font-mono font-medium">Сумма от клиента</span>
                </div>
                <div className="flex items-center gap-2 pl-4 border-l-2 border-cyan-500">
                  <span className="text-muted-foreground">Ваша комиссия:</span>
                  <span className="font-mono font-medium text-cyan-600 dark:text-cyan-400">Сумма × (Ставка% ÷ 100)</span>
                </div>
                <div className="flex items-center gap-2 pl-4 border-l-2 border-cyan-500">
                  <span className="text-muted-foreground">Доля админа:</span>
                  <span className="font-mono font-medium text-cyan-600 dark:text-cyan-400">Сумма - Ваша комиссия</span>
                </div>
                <div className="flex items-center gap-2 pt-2 border-t">
                  <span className="text-muted-foreground font-semibold">К оплате админу:</span>
                  <span className="font-mono font-bold text-cyan-600 dark:text-cyan-400">Доля админа + Расходы админа</span>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Invoice Details Table */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Детализация счетов</h3>
          </div>
          
          {invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Оплаченных счетов пока нет
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Счёт</TableHead>
                    <TableHead>Схема</TableHead>
                    <TableHead className="text-right">Сумма счёта</TableHead>
                    <TableHead className="text-right">Ваша доля</TableHead>
                    <TableHead className="text-right">Доля админа</TableHead>
                    <TableHead className="text-right">Расходы админа</TableHead>
                    <TableHead className="text-right">К оплате</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-medium">#{invoice.invoice_number}</TableCell>
                      <TableCell>
                        <Badge variant={invoice.scheme === "Agency 30%" ? "default" : "secondary"}>
                          {invoice.scheme}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(invoice.client_bill)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-green-600 dark:text-green-400">
                        {formatCurrency(invoice.partner_share)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(invoice.admin_share)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-orange-600 dark:text-orange-400">
                        {invoice.admin_expenses > 0 ? `+${formatCurrency(invoice.admin_expenses)}` : "-"}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold text-primary">
                        {formatCurrency(invoice.amount_to_admin)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/50 font-bold">
                    <TableCell colSpan={2}>ИТОГО</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(invoices.reduce((sum, inv) => sum + inv.client_bill, 0))}
                    </TableCell>
                    <TableCell className="text-right text-green-600 dark:text-green-400">
                      {formatCurrency(invoices.reduce((sum, inv) => sum + inv.partner_share, 0))}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(invoices.reduce((sum, inv) => sum + inv.admin_share, 0))}
                    </TableCell>
                    <TableCell className="text-right text-orange-600 dark:text-orange-400">
                      {formatCurrency(invoices.reduce((sum, inv) => sum + inv.admin_expenses, 0))}
                    </TableCell>
                    <TableCell className="text-right text-primary">
                      {formatCurrency(invoices.reduce((sum, inv) => sum + inv.amount_to_admin, 0))}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </Card>

        {/* Breakdown by Scheme */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="p-6 border-purple-500/20">
            <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-purple-500" />
              Схема Agency 30%
            </h3>
            <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">
              {formatCurrency(debtData?.agency30Debt || 0)}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              {invoices.filter(inv => inv.scheme === "Agency 30%").length} счетов
            </p>
          </Card>

          <Card className="p-6 border-cyan-500/20">
            <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-cyan-500" />
              Схема Commission-based
            </h3>
            <p className="text-3xl font-bold text-cyan-600 dark:text-cyan-400">
              {formatCurrency(debtData?.commissionBasedDebt || 0)}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              {invoices.filter(inv => inv.scheme === "Commission-based").length} счетов
            </p>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
