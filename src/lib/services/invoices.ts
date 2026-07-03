import { apiGet, apiPost, apiPatch, apiPut, apiDelete } from "@/lib/api";

export interface ClientListItem {
  id: string;
  name: string;
  telegram: string | null;
  phone: string | null;
  contactPerson: string | null;
  tgChatId: string | null;
  tgBotToken: string | null;
  partnerId: string | null;
  createdAt?: string;
}

export interface ClientWithPartner extends ClientListItem {
  partner?: PartnerListItem;
}

export interface ClientWithPartners extends ClientListItem {
  partners: PartnerListItem[];
}

export interface PartnerListItem {
  id: string;
  name: string;
  telegram: string | null;
  phone: string | null;
  email: string | null;
  createdAt?: string;
}

export interface PartnerWithClients extends PartnerListItem {
  clients: ClientListItem[];
}

export interface InvoiceExpense {
  id: string;
  invoice_id: string;
  description: string;
  amount: string;
  date: string | null;
  paidByAdmin: boolean;
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
  scheme: "partner_10" | "partner_15" | "agency_30" | "agency_40" | "commission_based";
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
  partner_transfer_due: number | null;
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
    hidden_from_assistant: data.hideFromAssistant || false,
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
    hidden_from_assistant: data.hideFromAssistant || false,
    partner_transfer_due: calculations?.partnerTransferDue ? parseFloat(calculations.partnerTransferDue) : null,
  };
}

function normalizeExpenseFromApi(data: any): InvoiceExpense {
  return {
    id: data.id,
    invoice_id: data.invoiceId,
    description: data.description,
    amount: data.amount,
    date: data.date,
    paidByAdmin: data.paidByAdmin ?? false,
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
  async fetchInvoices(partnerId?: string): Promise<InvoiceListItem[]> {
    const url = partnerId ? `/invoices?partnerId=${encodeURIComponent(partnerId)}` : "/invoices";
    const data = await apiGet<any[]>(url);
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
    paidByAdmin?: boolean;
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

  async createInvoice(invoice: {
    invoiceNumber: string;
    clientId: string;
    partnerId: string;
    scheme: string;
    partnerCommissionRate?: number;
    status?: string;
    notes?: string;
    clientTitle?: string;
    paymentDate?: string;
    hideFromAssistant?: boolean;
    clientBill: number;
    calculations: Record<string, any>;
    plannedExpenses?: number;
    serviceType?: 'one_time' | 'periodic';
    periodUnit?: 'month' | 'day' | 'hour';
    pricePerPeriod?: number;
    totalPeriods?: number;
  }): Promise<any> {
    return apiPost("/invoices", {
      invoiceNumber: invoice.invoiceNumber,
      clientId: invoice.clientId,
      partnerId: invoice.partnerId,
      scheme: invoice.scheme,
      partnerCommissionRate: invoice.partnerCommissionRate,
      status: invoice.status || "draft",
      notes: invoice.notes,
      clientTitle: invoice.clientTitle,
      paymentDate: invoice.paymentDate,
      hideFromAssistant: invoice.hideFromAssistant,
      plannedExpenses: invoice.plannedExpenses,
      serviceType: invoice.serviceType,
      periodUnit: invoice.periodUnit,
      pricePerPeriod: invoice.pricePerPeriod !== undefined ? invoice.pricePerPeriod.toString() : undefined,
      totalPeriods: invoice.totalPeriods,
      calculations: {
        clientBill: invoice.clientBill.toString(),
        ...invoice.calculations,
      },
    });
  },

  async closePeriod(invoiceId: string): Promise<any> {
    return apiPost(`/invoices/${invoiceId}/close-period`, {});
  },

  async updatePeriodsUsed(invoiceId: string, periodsUsed: number): Promise<any> {
    return apiPatch(`/invoices/${invoiceId}`, { periodsUsed });
  },

  async fetchClients(): Promise<ClientListItem[]> {
    const data = await apiGet<any[]>("/clients");
    return data.map((client) => ({
      id: client.id,
      name: client.name,
      telegram: client.telegram || null,
      phone: client.phone || null,
      contactPerson: client.contactPerson || null,
      tgChatId: client.tgChatId || null,
      tgBotToken: client.tgBotToken || null,
      partnerId: client.partnerId || null,
      createdAt: client.createdAt,
    }));
  },

  async fetchPartners(): Promise<PartnerListItem[]> {
    const data = await apiGet<any[]>("/partners");
    return data.map((partner) => ({
      id: partner.id,
      name: partner.name,
      telegram: partner.telegram || null,
      phone: partner.phone || null,
      email: partner.email || null,
      createdAt: partner.createdAt,
    }));
  },

  async fetchPartnerClients(partnerId: string): Promise<ClientListItem[]> {
    const data = await apiGet<any[]>(`/partners/${partnerId}/clients`);
    return data.map((client) => ({
      id: client.id,
      name: client.name,
      telegram: client.telegram || null,
      phone: client.phone || null,
      contactPerson: client.contactPerson || null,
      tgChatId: client.tgChatId || null,
      tgBotToken: client.tgBotToken || null,
      partnerId: client.partnerId || null,
      createdAt: client.createdAt,
    }));
  },

  async fetchClientWithPartner(clientId: string): Promise<ClientWithPartner> {
    const data = await apiGet<any>(`/clients/${clientId}/with-partner`);
    return {
      id: data.id,
      name: data.name,
      telegram: data.telegram || null,
      phone: data.phone || null,
      contactPerson: data.contactPerson || null,
      tgChatId: data.tgChatId || null,
      tgBotToken: data.tgBotToken || null,
      partnerId: data.partnerId || null,
      createdAt: data.createdAt,
      partner: data.partner ? {
        id: data.partner.id,
        name: data.partner.name,
        telegram: data.partner.telegram || null,
        phone: data.partner.phone || null,
        email: data.partner.email || null,
        createdAt: data.partner.createdAt,
      } : undefined,
    };
  },

  async createClient(client: {
    name: string;
    telegram?: string;
    phone?: string;
    partnerId?: string;
    partnerIds?: string[];
    tgChatId?: string | null;
    tgBotToken?: string | null;
    contactPerson?: string | null;
  }): Promise<ClientListItem> {
    const data = await apiPost<any>("/clients", client);
    return {
      id: data.id,
      name: data.name,
      telegram: data.telegram || null,
      phone: data.phone || null,
      contactPerson: data.contactPerson || null,
      tgChatId: data.tgChatId || null,
      tgBotToken: data.tgBotToken || null,
      partnerId: data.partnerId || null,
      createdAt: data.createdAt,
    };
  },

  async updateClient(id: string, updates: {
    name?: string;
    telegram?: string;
    phone?: string;
    partnerId?: string;
    partnerIds?: string[];
    tgChatId?: string | null;
    tgBotToken?: string | null;
    contactPerson?: string | null;
  }): Promise<ClientListItem> {
    const data = await apiPatch<any>(`/clients/${id}`, updates);
    return {
      id: data.id,
      name: data.name,
      telegram: data.telegram || null,
      phone: data.phone || null,
      contactPerson: data.contactPerson || null,
      tgChatId: data.tgChatId || null,
      tgBotToken: data.tgBotToken || null,
      partnerId: data.partnerId || null,
      createdAt: data.createdAt,
    };
  },

  async deleteClient(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      await apiDelete(`/clients/${id}`);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || "Failed to delete client" };
    }
  },

  async fetchClientPartners(clientId: string): Promise<PartnerListItem[]> {
    const data = await apiGet<any[]>(`/clients/${clientId}/partners`);
    return data.map((partner) => ({
      id: partner.id,
      name: partner.name,
      telegram: partner.telegram || null,
      phone: partner.phone || null,
      email: partner.email || null,
      createdAt: partner.createdAt,
    }));
  },

  async setClientPartners(clientId: string, partnerIds: string[]): Promise<PartnerListItem[]> {
    const data = await apiPut<any[]>(`/clients/${clientId}/partners`, { partnerIds });
    return data.map((partner) => ({
      id: partner.id,
      name: partner.name,
      telegram: partner.telegram || null,
      phone: partner.phone || null,
      email: partner.email || null,
      createdAt: partner.createdAt,
    }));
  },

  async fetchClientsWithPartners(): Promise<ClientWithPartners[]> {
    const data = await apiGet<any[]>("/clients-with-partners");
    return data.map((client) => ({
      id: client.id,
      name: client.name,
      telegram: client.telegram || null,
      phone: client.phone || null,
      contactPerson: client.contactPerson || null,
      tgChatId: client.tgChatId || null,
      tgBotToken: client.tgBotToken || null,
      partnerId: client.partnerId || null,
      createdAt: client.createdAt,
      partners: (client.partners || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        telegram: p.telegram || null,
        phone: p.phone || null,
        email: p.email || null,
        createdAt: p.createdAt,
      })),
    }));
  },

  async createPartner(partner: {
    name: string;
    telegram?: string;
    phone?: string;
    email?: string;
  }): Promise<PartnerListItem> {
    const data = await apiPost<any>("/partners", partner);
    return {
      id: data.id,
      name: data.name,
      telegram: data.telegram || null,
      phone: data.phone || null,
      email: data.email || null,
      createdAt: data.createdAt,
    };
  },

  async updatePartner(id: string, updates: {
    name?: string;
    telegram?: string;
    phone?: string;
    email?: string;
  }): Promise<PartnerListItem> {
    const data = await apiPatch<any>(`/partners/${id}`, updates);
    return {
      id: data.id,
      name: data.name,
      telegram: data.telegram || null,
      phone: data.phone || null,
      email: data.email || null,
      createdAt: data.createdAt,
    };
  },

  async deletePartner(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      await apiDelete(`/partners/${id}`);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || "Failed to delete partner" };
    }
  },

  async fetchPartnerPayments(): Promise<any[]> {
    return apiGet<any[]>("/partner-payments");
  },

  async createPartnerPayment(payment: {
    partnerId: string;
    invoiceId?: string;
    amount: number;
    paymentDate: string;
    notes?: string;
  }): Promise<any> {
    return apiPost("/partner-payments", payment);
  },

  async getPartnerDebtSummaries(): Promise<{
    partnerId: string;
    partnerName: string;
    totalToTransfer: number;
    totalPaid: number;
    remaining: number;
    invoiceCount: number;
  }[]> {
    return apiGet("/partner-debt");
  },
};

export default invoiceService;
