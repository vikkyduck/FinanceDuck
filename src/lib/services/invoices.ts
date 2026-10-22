import type { InvoiceDto, Jsonify } from "@shared/contracts";
import type { PartnerPayment } from "@shared/schema";
import { apiGet, apiPost, apiPatch, apiPut, apiDelete } from "@/lib/api";

export interface ClientListItem {
  id: string;
  name: string;
  telegram: string | null;
  phone: string | null;
  contactPerson: string | null;
  tgChatId: string | null;
  hasTgBotToken: boolean;
  partnerId: string | null;
  createdAt?: string;
}

export interface ClientWithPartner extends ClientListItem {
  partner?: PartnerListItem;
}

export interface ClientWithPartners extends ClientListItem {
  partners: PartnerListItem[];
}

// Роль партнёра в коэффициенте эффективности (владельческая метрика):
// external — обычный партнёр, managed_asset — актив под управлением владельца,
// owner — личная работа владельца. Задаётся админом в «Управлении партнёрами».
export type PartnerLeverageRole = 'external' | 'managed_asset' | 'owner';

export interface PartnerListItem {
  id: string;
  name: string;
  telegram: string | null;
  phone: string | null;
  email: string | null;
  leverageRole: PartnerLeverageRole;
  // Клиенты этого партнера платят напрямую владельцу, долга партнера нет.
  directToOwner: boolean;
  createdAt?: string;
}

export interface PartnerWithClients extends PartnerListItem {
  clients: ClientListItem[];
}

export const invoiceService = {
  async updateInvoiceStatus(id: string, status: string): Promise<void> {
    await apiPatch(`/invoices/${id}`, { status });
  },

  async updateInvoice(id: string, updates: Record<string, unknown>): Promise<void> {
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

  async updateExpense(expenseId: string, updates: Record<string, unknown>): Promise<void> {
    await apiPatch(`/expenses/${expenseId}`, updates);
  },

  async deleteExpense(expenseId: string): Promise<void> {
    await apiDelete(`/expenses/${expenseId}`);
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
    calculations: Record<string, unknown>;
    plannedExpenses?: number;
    serviceType?: 'one_time' | 'periodic';
    periodUnit?: 'month' | 'day' | 'hour';
    pricePerPeriod?: number;
    totalPeriods?: number;
  }): Promise<InvoiceDto> {
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

  async fetchClients(): Promise<ClientListItem[]> {
    const data = await apiGet<ClientListItem[]>("/clients");
    return data.map((client) => ({
      id: client.id,
      name: client.name,
      telegram: client.telegram || null,
      phone: client.phone || null,
      contactPerson: client.contactPerson || null,
      tgChatId: client.tgChatId || null,
      hasTgBotToken: client.hasTgBotToken === true,
      partnerId: client.partnerId || null,
      createdAt: client.createdAt,
    }));
  },

  async fetchPartners(): Promise<PartnerListItem[]> {
    const data = await apiGet<PartnerListItem[]>("/partners");
    return data.map((partner) => ({
      id: partner.id,
      name: partner.name,
      telegram: partner.telegram || null,
      phone: partner.phone || null,
      email: partner.email || null,
      leverageRole: partner.leverageRole || 'external',
      directToOwner: partner.directToOwner ?? false,
      createdAt: partner.createdAt,
    }));
  },

  async fetchPartnerClients(partnerId: string): Promise<ClientListItem[]> {
    const data = await apiGet<ClientListItem[]>(`/partners/${partnerId}/clients`);
    return data.map((client) => ({
      id: client.id,
      name: client.name,
      telegram: client.telegram || null,
      phone: client.phone || null,
      contactPerson: client.contactPerson || null,
      tgChatId: client.tgChatId || null,
      hasTgBotToken: client.hasTgBotToken === true,
      partnerId: client.partnerId || null,
      createdAt: client.createdAt,
    }));
  },

  async fetchClientWithPartner(clientId: string): Promise<ClientWithPartner> {
    const data = await apiGet<ClientWithPartner>(`/clients/${clientId}/with-partner`);
    return {
      id: data.id,
      name: data.name,
      telegram: data.telegram || null,
      phone: data.phone || null,
      contactPerson: data.contactPerson || null,
      tgChatId: data.tgChatId || null,
      hasTgBotToken: data.hasTgBotToken === true,
      partnerId: data.partnerId || null,
      createdAt: data.createdAt,
      partner: data.partner ? {
        id: data.partner.id,
        name: data.partner.name,
        telegram: data.partner.telegram || null,
        phone: data.partner.phone || null,
        email: data.partner.email || null,
        leverageRole: data.partner.leverageRole || 'external',
        directToOwner: data.partner.directToOwner ?? false,
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
    const data = await apiPost<ClientListItem>("/clients", client);
    return {
      id: data.id,
      name: data.name,
      telegram: data.telegram || null,
      phone: data.phone || null,
      contactPerson: data.contactPerson || null,
      tgChatId: data.tgChatId || null,
      hasTgBotToken: data.hasTgBotToken === true,
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
    const data = await apiPatch<ClientListItem>(`/clients/${id}`, updates);
    return {
      id: data.id,
      name: data.name,
      telegram: data.telegram || null,
      phone: data.phone || null,
      contactPerson: data.contactPerson || null,
      tgChatId: data.tgChatId || null,
      hasTgBotToken: data.hasTgBotToken === true,
      partnerId: data.partnerId || null,
      createdAt: data.createdAt,
    };
  },

  async deleteClient(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      await apiDelete(`/clients/${id}`);
      return { success: true };
    } catch (error: unknown) {
      return { success: false, error: (error instanceof Error ? error.message : String(error)) || "Failed to delete client" };
    }
  },

  async fetchClientPartners(clientId: string): Promise<PartnerListItem[]> {
    const data = await apiGet<PartnerListItem[]>(`/clients/${clientId}/partners`);
    return data.map((partner) => ({
      id: partner.id,
      name: partner.name,
      telegram: partner.telegram || null,
      phone: partner.phone || null,
      email: partner.email || null,
      leverageRole: partner.leverageRole || 'external',
      directToOwner: partner.directToOwner ?? false,
      createdAt: partner.createdAt,
    }));
  },

  async setClientPartners(clientId: string, partnerIds: string[]): Promise<PartnerListItem[]> {
    const data = await apiPut<PartnerListItem[]>(`/clients/${clientId}/partners`, { partnerIds });
    return data.map((partner) => ({
      id: partner.id,
      name: partner.name,
      telegram: partner.telegram || null,
      phone: partner.phone || null,
      email: partner.email || null,
      leverageRole: partner.leverageRole || 'external',
      directToOwner: partner.directToOwner ?? false,
      createdAt: partner.createdAt,
    }));
  },

  async fetchClientsWithPartners(): Promise<ClientWithPartners[]> {
    const data = await apiGet<ClientWithPartners[]>("/clients-with-partners");
    return data.map((client) => ({
      id: client.id,
      name: client.name,
      telegram: client.telegram || null,
      phone: client.phone || null,
      contactPerson: client.contactPerson || null,
      tgChatId: client.tgChatId || null,
      hasTgBotToken: client.hasTgBotToken === true,
      partnerId: client.partnerId || null,
      createdAt: client.createdAt,
      partners: (client.partners || []).map((p) => ({
        id: p.id,
        name: p.name,
        telegram: p.telegram || null,
        phone: p.phone || null,
        email: p.email || null,
        leverageRole: p.leverageRole || 'external',
        directToOwner: p.directToOwner ?? false,
        createdAt: p.createdAt,
      })),
    }));
  },

  async createPartner(partner: {
    name: string;
    telegram?: string;
    phone?: string;
    email?: string;
    leverageRole?: PartnerLeverageRole;
    directToOwner?: boolean;
  }): Promise<PartnerListItem> {
    const data = await apiPost<PartnerListItem>("/partners", partner);
    return {
      id: data.id,
      name: data.name,
      telegram: data.telegram || null,
      phone: data.phone || null,
      email: data.email || null,
      leverageRole: data.leverageRole || 'external',
      directToOwner: data.directToOwner ?? false,
      createdAt: data.createdAt,
    };
  },

  async updatePartner(id: string, updates: {
    name?: string;
    telegram?: string;
    phone?: string;
    email?: string;
    leverageRole?: PartnerLeverageRole;
    directToOwner?: boolean;
  }): Promise<PartnerListItem> {
    const data = await apiPatch<PartnerListItem>(`/partners/${id}`, updates);
    return {
      id: data.id,
      name: data.name,
      telegram: data.telegram || null,
      phone: data.phone || null,
      email: data.email || null,
      leverageRole: data.leverageRole || 'external',
      directToOwner: data.directToOwner ?? false,
      createdAt: data.createdAt,
    };
  },

  async deletePartner(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      await apiDelete(`/partners/${id}`);
      return { success: true };
    } catch (error: unknown) {
      return { success: false, error: (error instanceof Error ? error.message : String(error)) || "Failed to delete partner" };
    }
  },

  async fetchPartnerPayments(): Promise<Jsonify<PartnerPayment>[]> {
    return apiGet<Jsonify<PartnerPayment>[]>("/partner-payments");
  },

  async createPartnerPayment(payment: {
    partnerId: string;
    invoiceId?: string;
    amount: number;
    paymentDate: string;
    notes?: string;
  }): Promise<Jsonify<PartnerPayment>> {
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
