import type { Invoice, InvoiceCalculation, InvoiceExpense, Client, Partner, UserRole, InvoiceScheme, InvoiceStatus } from './schema';

export type Jsonify<T> = T extends Date ? string : T extends object ? { [K in keyof T]: Jsonify<T[K]> } : T;
export type InvoiceDto = Partial<Jsonify<Invoice>> & {
  id: string; invoiceNumber: string; createdAt: string; scheme: InvoiceScheme; status: InvoiceStatus;
  calculations?: Partial<Jsonify<InvoiceCalculation>>;
  client?: Pick<Client, 'id' | 'name'>;
  partner?: Pick<Partner, 'id' | 'name'>;
};
export type ExpenseDto = Partial<Jsonify<InvoiceExpense>> & Pick<Jsonify<InvoiceExpense>, 'id' | 'invoiceId' | 'description' | 'date'>;
export interface AuthResponse {
  valid?: boolean; success?: boolean; csrfToken?: string;
  user?: { role: UserRole; partnerId?: string; clientId?: string };
  error?: string; message?: string; locked_until?: string; attempts_remaining?: number;
}

export interface AssistantInvoiceDto {
  id: string; client_id?: string; partner_id?: string; client_name?: string; partner_name?: string;
  status: string; actual_payment_date?: string; client_bill: number; executor_expenses_total: number;
}
