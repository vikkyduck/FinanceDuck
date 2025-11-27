import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { calculateInvoice, type InvoiceScheme } from "@/lib/invoiceCalculations";

function mapScheme(scheme: string): InvoiceScheme {
  if (scheme === "agency_30_margin" || scheme === "agency_30") {
    return "agency_30";
  }
  return "commission_based";
}

export interface InvoiceExpense {
  id: string;
  invoice_id: string;
  description: string;
  amount: string;
  date: string | null;
  notes: string | null;
}

export interface InvoiceDocument {
  id: string;
  invoice_id: string;
  file_name: string;
  file_size: number;
  file_type: string;
  document_type: string | null;
  storage_path: string | null;
  uploaded_at: string;
}

export interface InvoiceCalculations {
  client_bill: number;
  commission_rate: number | null;
  commission_amount: number | null;
  partner_share_from_margin: number | null;
  admin_share_from_margin: number | null;
  executor_expenses_total: string;
  net_profit_admin: number | null;
  client_remaining: number | null;
  client_base_after_margin?: number | null;
  agency_margin?: number | null;
  amount_to_admin?: number | null;
  admin_share_50?: number | null;
  cat_share_50?: number | null;
}

export interface InvoiceViewModel {
  id: string;
  invoice_number: string;
  client_id: string | null;
  partner_id: string | null;
  scheme: "agency_30_margin" | "commission_based";
  status: "draft" | "sent" | "paid" | "cancelled";
  payment_date: string | null;
  actual_payment_date: string | null;
  notes: string | null;
  created_at: string;
  hidden_from_assistant: boolean;
  clients: { name: string } | null;
  partners: { name: string } | null;
  client_bill: number;
  partner_commission_rate: number | null;
  invoice_calculations: InvoiceCalculations | null;
}

export interface InvoiceListItem {
  id: string;
  invoice_number: string;
  client_id: string | null;
  partner_id: string | null;
  scheme: string;
  status: string;
  payment_date: string | null;
  notes: string | null;
  created_at: string;
  client_name: string | null;
  partner_name: string | null;
  client_bill: number;
  commission_rate: number | null;
  commission_amount: number | null;
  partner_share_from_margin: number | null;
  admin_share_from_margin: number | null;
  executor_expenses_total: string;
  net_profit_admin: number | null;
  client_remaining: number | null;
  hidden_from_assistant: boolean;
}

function normalizeInvoiceFromApi(data: any): InvoiceViewModel {
  const calculations = data.calculations;
  
  return {
    id: data.id,
    invoice_number: data.invoiceNumber,
    client_id: data.clientId,
    partner_id: data.partnerId,
    scheme: data.scheme,
    status: data.status,
    payment_date: data.paymentDate,
    actual_payment_date: data.actualPaymentDate,
    notes: data.notes,
    created_at: data.createdAt,
    hidden_from_assistant: data.hiddenFromAssistant || false,
    clients: data.client ? { name: data.client.name } : null,
    partners: data.partner ? { name: data.partner.name } : null,
    client_bill: calculations?.clientBill || data.clientBill || 0,
    partner_commission_rate: calculations?.commissionRate || null,
    invoice_calculations: calculations ? {
      client_bill: calculations.clientBill || 0,
      commission_rate: calculations.commissionRate,
      commission_amount: calculations.commissionAmount,
      partner_share_from_margin: calculations.partnerShareFromMargin,
      admin_share_from_margin: calculations.adminShareFromMargin,
      executor_expenses_total: calculations.executorExpensesTotal || "0",
      net_profit_admin: calculations.netProfitAdmin,
      client_remaining: calculations.clientRemaining,
      client_base_after_margin: calculations.clientBaseAfterMargin,
      agency_margin: calculations.agencyMargin,
      amount_to_admin: calculations.amountToAdmin,
      admin_share_50: calculations.adminShare50,
      cat_share_50: calculations.catShare50,
    } : null,
  };
}

function normalizeInvoiceListFromApi(data: any): InvoiceListItem {
  const calculations = data.calculations;
  
  return {
    id: data.id,
    invoice_number: data.invoiceNumber,
    client_id: data.clientId,
    partner_id: data.partnerId,
    scheme: data.scheme,
    status: data.status,
    payment_date: data.paymentDate,
    notes: data.notes,
    created_at: data.createdAt,
    client_name: data.client?.name || null,
    partner_name: data.partner?.name || null,
    client_bill: calculations?.clientBill || data.clientBill || 0,
    commission_rate: calculations?.commissionRate || null,
    commission_amount: calculations?.commissionAmount || null,
    partner_share_from_margin: calculations?.partnerShareFromMargin || null,
    admin_share_from_margin: calculations?.adminShareFromMargin || null,
    executor_expenses_total: calculations?.executorExpensesTotal || "0",
    net_profit_admin: calculations?.netProfitAdmin || null,
    client_remaining: calculations?.clientRemaining || null,
    hidden_from_assistant: data.hiddenFromAssistant || false,
  };
}

function normalizeExpenseFromApi(data: any): InvoiceExpense {
  return {
    id: data.id,
    invoice_id: data.invoiceId,
    description: data.description,
    amount: data.amount,
    date: data.date,
    notes: data.notes,
  };
}

function normalizeDocumentFromApi(data: any): InvoiceDocument {
  return {
    id: data.id,
    invoice_id: data.invoiceId,
    file_name: data.fileName,
    file_size: data.fileSize,
    file_type: data.fileType,
    document_type: data.documentType,
    storage_path: data.storagePath,
    uploaded_at: data.uploadedAt,
  };
}

export const invoiceService = {
  async fetchInvoices(): Promise<InvoiceListItem[]> {
    const data = await apiGet<any[]>("/invoices");
    return data.map(normalizeInvoiceListFromApi);
  },

  async fetchInvoiceById(id: string): Promise<{
    invoice: InvoiceViewModel;
    expenses: InvoiceExpense[];
    documents: InvoiceDocument[];
  }> {
    const data = await apiGet<any>(`/invoices/${id}`);
    
    const invoice = normalizeInvoiceFromApi(data);
    const expenses = (data.expenses || []).map(normalizeExpenseFromApi);
    const documents = (data.documents || []).map(normalizeDocumentFromApi);

    if (!invoice.invoice_calculations || invoice.invoice_calculations.client_bill === 0) {
      const clientBill = invoice.client_bill;
      const scheme = mapScheme(invoice.scheme);
      const partnerRate = invoice.partner_commission_rate;
      const expensesTotal = expenses.reduce((sum, e) => sum + parseFloat(e.amount || "0"), 0);

      if (clientBill > 0) {
        const calculated = calculateInvoice(scheme, clientBill, partnerRate, expensesTotal);
        invoice.invoice_calculations = {
          client_bill: clientBill,
          commission_rate: calculated.commission_rate,
          commission_amount: calculated.commission_amount,
          partner_share_from_margin: calculated.partner_share_from_margin,
          admin_share_from_margin: calculated.admin_share_from_margin,
          executor_expenses_total: String(expensesTotal),
          net_profit_admin: calculated.net_profit_admin,
          client_remaining: calculated.client_remaining,
          client_base_after_margin: calculated.client_base_after_margin,
          agency_margin: calculated.agency_margin,
          amount_to_admin: calculated.amount_to_admin,
          admin_share_50: calculated.admin_share_50,
          cat_share_50: calculated.cat_share_50,
        };
      }
    }

    return { invoice, expenses, documents };
  },

  async updateInvoiceStatus(id: string, status: string): Promise<void> {
    await apiPatch(`/invoices/${id}`, { status });
  },

  async updateInvoice(id: string, updates: Record<string, any>): Promise<void> {
    await apiPatch(`/invoices/${id}`, updates);
  },

  async deleteInvoice(id: string): Promise<void> {
    await apiDelete(`/invoices/${id}`);
  },

  async createExpense(invoiceId: string, expense: {
    description: string;
    amount: string;
    date?: string;
    notes?: string;
  }): Promise<void> {
    await apiPost(`/invoices/${invoiceId}/expenses`, expense);
  },

  async updateExpense(expenseId: string, updates: Record<string, any>): Promise<void> {
    await apiPatch(`/expenses/${expenseId}`, updates);
  },

  async deleteExpense(expenseId: string): Promise<void> {
    await apiDelete(`/expenses/${expenseId}`);
  },

  async deleteDocument(documentId: string): Promise<void> {
    await apiDelete(`/documents/${documentId}`);
  },
};

export default invoiceService;
