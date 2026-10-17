import type { InvoiceDto } from '@shared/contracts';
import { parseNum } from '@shared/financialEngine';

/** One API-to-view adapter for both cards and tables. Money is numeric here. */
export function invoiceListView(inv: InvoiceDto) {
  const c = inv.calculations;
  return {
    id: inv.id, invoice_number: inv.invoiceNumber, client_id: inv.clientId, partner_id: inv.partnerId,
    scheme: inv.scheme, status: inv.status, payment_date: inv.paymentDate, actual_payment_date: inv.actualPaymentDate,
    issue_date: inv.issueDate, notes: inv.notes, created_at: inv.createdAt, client_name: inv.client?.name, partner_name: inv.partner?.name,
    client_bill: parseNum(c?.clientBill ?? inv.clientBill), commission_rate: parseNum(c?.commissionRate),
    commission_amount: parseNum(c?.commissionAmount), agency_margin: parseNum(c?.agencyMargin),
    client_base_after_margin: parseNum(c?.clientBaseAfterMargin), amount_to_admin: parseNum(c?.amountToAdmin),
    partner_share_from_margin: parseNum(c?.partnerShareFromMargin), admin_share_from_margin: parseNum(c?.adminShareFromMargin),
    executor_expenses_total: parseNum(c?.executorExpensesTotal), net_profit_admin: parseNum(c?.netProfitAdmin),
    client_remaining: parseNum(c?.clientRemaining), partner_transfer_due: parseNum(c?.partnerTransferDue),
    partner_commission_rate: parseNum(inv.partnerCommissionRate), service_type: inv.serviceType, period_unit: inv.periodUnit,
    price_per_period: parseNum(inv.pricePerPeriod), total_periods: inv.totalPeriods, periods_used: inv.periodsUsed,
    hidden_from_assistant: inv.hideFromAssistant,
  };
}
export type InvoiceListView = ReturnType<typeof invoiceListView>;
