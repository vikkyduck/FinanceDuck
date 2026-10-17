import type { InvoiceScheme } from "@shared/schema";
import type { InvoiceDto, ExpenseDto } from "@shared/contracts";
import { parseNum } from "@shared/financialEngine";
export interface InvoiceCalcView {
  client_bill?: number;
  commission_rate?: number;
  commission_amount?: number;
  amount_to_admin?: number;
  partner_transfer_due?: number;
  agency_margin?: number;
  partner_share_from_margin?: number;
  admin_share_from_margin?: number;
  client_base_after_margin?: number;
  client_spent?: number;
  executor_expenses_total?: number;
  net_profit_admin?: number;
  admin_share_50?: number;
  cat_share_50?: number;
  client_remaining?: number;
}

export interface InvoiceDetailsView {
  id: string;
  invoice_number?: string | null;
  client_id?: string | null;
  partner_id?: string | null;
  scheme: InvoiceScheme;
  status: string;
  payment_date?: string | null;
  actual_payment_date?: string | null;
  notes?: string | null;
  created_at?: string | null;
  hidden_from_assistant?: boolean | null;
  planned_expenses?: number;
  clients?: { name: string } | null;
  partners?: { name: string } | null;
  client_bill?: number;
  partner_commission_rate?: number;
  client_title?: string | null;
  service_type?: string | null;
  period_unit?: string | null;
  price_per_period?: number;
  total_periods?: number;
  periods_used?: number;
  invoice_calculations: InvoiceCalcView | null;
}


export function invoiceDetailsView(invoiceData: InvoiceDto): InvoiceDetailsView {
  return {
        id: invoiceData.id,
        invoice_number: invoiceData.invoiceNumber,
        client_id: invoiceData.clientId,
        partner_id: invoiceData.partnerId,
        scheme: invoiceData.scheme,
        status: invoiceData.status,
        payment_date: invoiceData.paymentDate,
        actual_payment_date: invoiceData.actualPaymentDate,
        notes: invoiceData.notes,
        created_at: invoiceData.createdAt,
        hidden_from_assistant: invoiceData.hideFromAssistant,
        planned_expenses: parseNum(invoiceData.plannedExpenses),
        clients: invoiceData.client ? { name: invoiceData.client.name } : null,
        partners: invoiceData.partner ? { name: invoiceData.partner.name } : null,
        client_bill: parseNum(invoiceData.calculations?.clientBill || invoiceData.clientBill),
        partner_commission_rate: parseNum(parseNum(invoiceData.calculations?.commissionRate)),
        client_title: invoiceData.clientTitle ?? null,
        service_type:    invoiceData.serviceType    ?? 'one_time',
        period_unit:     invoiceData.periodUnit     ?? 'month',
        price_per_period: parseNum(invoiceData.pricePerPeriod),
        total_periods:   invoiceData.totalPeriods ?? undefined,
        periods_used:    invoiceData.periodsUsed ?? 0,
        invoice_calculations: invoiceData.calculations ? {
          client_bill: parseNum(invoiceData.calculations.clientBill),
          commission_rate: parseNum(invoiceData.calculations.commissionRate),
          commission_amount: parseNum(invoiceData.calculations.commissionAmount),
          amount_to_admin: parseNum(invoiceData.calculations.amountToAdmin),
          partner_transfer_due: parseNum(invoiceData.calculations.partnerTransferDue),
          agency_margin: parseNum(invoiceData.calculations.agencyMargin),
          partner_share_from_margin: parseNum(invoiceData.calculations.partnerShareFromMargin),
          admin_share_from_margin: parseNum(invoiceData.calculations.adminShareFromMargin),
          client_base_after_margin: parseNum(invoiceData.calculations.clientBaseAfterMargin),
          client_spent: parseNum(invoiceData.calculations.clientSpent),
          executor_expenses_total: parseNum(invoiceData.calculations.executorExpensesTotal),
          net_profit_admin: parseNum(invoiceData.calculations.netProfitAdmin),
          admin_share_50: parseNum(invoiceData.calculations.adminShare50),
          cat_share_50: parseNum(invoiceData.calculations.catShare50),
          client_remaining: parseNum(invoiceData.calculations.clientRemaining),
        } : null,
      };

}
