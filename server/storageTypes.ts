import type { AssistantActionLog, UserRole } from "../shared/schema";

export interface RecurringInvoiceForMonth {
  id: string;
  clientName: string | null;
  partnerName: string | null;
  amount: number;
  expectedProfit: number;
  frequency: string;
  dayOfMonth: number;
  scheme: string;
}

export interface AssistantActionLogFilters {
  limit?: number;
  offset?: number;
  role?: UserRole | null;
  dateFrom?: string | null;
  dateTo?: string | null;
}

export interface AssistantActionLogWithDetails extends AssistantActionLog {
  tokenCode?: string;
  tokenRole?: string;
}

export interface WorkingCapitalData {
  id: string;
  amount: number;
  notes: string | null;
  updated_at: string | null;
}

export interface ClientLTVData {
  client_id: string;
  client_name: string;
  total_invoices: number;
  paid_invoices: number;
  total_admin_profit: number;
  potential_profit: number;
}

export interface PartnerClientStatsData {
  clientId: string;
  clientName: string;
  month: number;
  monthName: string;
  clientBill: number;
  partnerCommission: number;
  clientRemaining: number;
  invoiceCount: number;
}

export interface PartnerDocumentRiskData {
  status: "green" | "red";
  missingActsCount: number;
  missingActsInvoices: { id: string; invoiceNumber: string }[];
}

export interface PartnerAgency30FundsData {
  clientId: string;
  clientName: string;
  totalBudget: number;
  totalSpent: number;
  remaining: number;
  invoiceCount: number;
}

export interface PartnerHeroMetricsData {
  debtToAdmin: number;
  reservedForExpenses: number;
  yearlyCommission: number;
  signedActsCount: number;
  totalPaidInvoices: number;
  invoicesWithDebt: { id: string; number: string; amount: number }[];
}

export interface DashboardInvoiceDetail {
  id: string;
  invoiceNumber: string;
  clientName: string | null;
  netProfitAdmin: number;
  clientBill: number;
  status: string;
  paymentDate: string | null;
}

export interface MonthlyData {
  monthNumber: number;
  totalSales: number;
  totalProfit: number;
  invoiceCount: number;
  expenses: number;
}

export interface MonthInvoiceDetail {
  id: string;
  invoiceNumber: string | null;
  clientName: string | null;
  clientBill: number;
  netProfitAdmin: number;
  status: string;
  paymentDate: string | null;
  isExpected: boolean;
  isPaid: boolean;
}

export interface DraftsStats {
  totalDrafts: number;
  totalDraftAmount: number;
  currentMonthDrafts: number;
  currentMonthAmount: number;
  fromRecurring: number;
  fromRecurringAmount: number;
}

export interface ForecastData {
  monthIndex: number;
  monthName: string;
  yearNum: number;
  expectedAmount: number;
  receivedAmount: number;
  recurringAmount?: number;
}

export interface OverdueInvoice {
  id: string;
  invoiceNumber: string;
  paymentDate: string;
  clientName: string;
  partnerName: string;
  amount: number;
  daysOverdue: number;
}

export interface PaymentHistoryEntry {
  id: string;
  paymentDate: string;
  amount: number;
  notes: string | null;
  runningBalance: number;
}

export interface PlanFactData {
  monthNumber: number;
  monthName: string;
  salesTarget: number;
  receiptsTarget: number;
  actualSales: number;
  actualReceipts: number;
}

export interface MonthlyPlanInput {
  year: number;
  month: number;
  salesTarget?: number;
  profitTarget?: number;
  receiptsTarget?: number;
}

export interface DashboardStats {
  expectedProfit?: number;
  receivedProfit?: number;
  totalPlannedExpenses?: number;
  totalInvoices: number;
  paidInvoices: number;
  pendingInvoices: number;
  overdueInvoices: number;
  totalClientBill: number;
  paidClientBill: number;
  pendingClientBill: number;
  totalExpenses: number;
  totalPartnerCommission?: number;
  totalAdminShare?: number;
  totalNetProfit?: number;
  partnerDebt?: number;
  clientRemaining?: number;
  recurringExpectedMonthly?: number;
  recurringExpectedYearly?: number;
}
