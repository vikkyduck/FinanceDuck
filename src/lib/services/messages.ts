import { apiGet, apiPost, apiDelete } from "@/lib/api";

export interface MessageThread {
  invoice_id: string;
  expense_id: string | null;
  invoice_number: string;
  client_id: string;
  client_name: string;
  expense_description: string | null;
  expense_amount: string | null;
  message_count: number;
  last_message_at: string;
  last_message_body: string;
  last_message_role: 'client' | 'admin' | 'assistant';
}

export interface Message {
  id: string;
  invoiceId: string;
  expenseId: string | null;
  authorRole: 'client' | 'admin' | 'assistant';
  body: string;
  createdAt: string;
}

export interface UnreadSummary {
  totalUnread: number;
  byInvoice: Record<string, number>;
}

export const messagesService = {
  async listThreads(): Promise<MessageThread[]> {
    return apiGet<MessageThread[]>("/messages/threads");
  },
  async listMessages(invoiceId: string, expenseId?: string | null): Promise<Message[]> {
    const params = new URLSearchParams({ invoiceId });
    if (expenseId) params.set("expenseId", expenseId);
    return apiGet<Message[]>(`/messages?${params.toString()}`);
  },
  async sendMessage(invoiceId: string, body: string, expenseId?: string | null): Promise<Message> {
    return apiPost<Message>("/messages", { invoiceId, expenseId: expenseId ?? null, body });
  },
  async markRead(invoiceId: string, expenseId?: string | null): Promise<void> {
    await apiPost("/messages/mark-read", { invoiceId, expenseId: expenseId ?? null });
  },
  async unreadSummary(): Promise<UnreadSummary> {
    return apiGet<UnreadSummary>("/messages/unread-summary");
  },
  async deleteMessage(id: string): Promise<void> {
    await apiDelete(`/messages/${id}`);
  },
};
