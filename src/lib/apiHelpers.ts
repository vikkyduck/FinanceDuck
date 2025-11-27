import { apiGet, apiPost, apiPatch, apiDelete } from './api';

export interface QueryOptions {
  operation?: string;
  details?: Record<string, any>;
  throwOnError?: boolean;
}

export interface SessionContext {
  accessTokenId: string;
  role: string;
  partnerId: string | null;
  clientId: string | null;
}

let cachedSession: SessionContext | null = null;

export async function ensureSessionContext(): Promise<SessionContext> {
  if (cachedSession) {
    return cachedSession;
  }
  
  const response = await fetch('/api/auth/validate', {
    method: 'GET',
    credentials: 'include',
  });
  
  const data = await response.json();
  
  if (!data?.valid) {
    throw new Error('No valid session found. Please log in again.');
  }
  
  cachedSession = {
    accessTokenId: data.user?.accessTokenId || '',
    role: data.user?.role || '',
    partnerId: data.user?.partnerId || null,
    clientId: data.user?.clientId || null,
  };
  
  return cachedSession;
}

export function clearSessionCache(): void {
  cachedSession = null;
}

export async function fetchPartners() {
  return apiGet<any[]>('/partners');
}

export async function fetchPartner(id: string) {
  return apiGet<any>(`/partners/${id}`);
}

export async function createPartner(data: any) {
  return apiPost<any>('/partners', data);
}

export async function updatePartner(id: string, data: any) {
  return apiPatch<any>(`/partners/${id}`, data);
}

export async function fetchClients() {
  return apiGet<any[]>('/clients');
}

export async function fetchClient(id: string) {
  return apiGet<any>(`/clients/${id}`);
}

export async function createClient(data: any) {
  return apiPost<any>('/clients', data);
}

export async function updateClient(id: string, data: any) {
  return apiPatch<any>(`/clients/${id}`, data);
}

export async function fetchInvoices() {
  return apiGet<any[]>('/invoices');
}

export async function fetchInvoice(id: string) {
  return apiGet<any>(`/invoices/${id}`);
}

export async function createInvoice(data: any) {
  return apiPost<any>('/invoices', data);
}

export async function updateInvoice(id: string, data: any) {
  return apiPatch<any>(`/invoices/${id}`, data);
}

export async function fetchInvoiceExpenses(invoiceId: string) {
  return apiGet<any[]>(`/invoices/${invoiceId}/expenses`);
}

export async function createInvoiceExpense(invoiceId: string, data: any) {
  return apiPost<any>(`/invoices/${invoiceId}/expenses`, data);
}

export async function deleteInvoiceExpense(id: string) {
  return apiDelete<any>(`/expenses/${id}`);
}

export async function fetchPartnerPayments() {
  return apiGet<any[]>('/partner-payments');
}

export async function createPartnerPayment(data: any) {
  return apiPost<any>('/partner-payments', data);
}

export async function fetchAccessTokens() {
  return apiGet<any[]>('/access-tokens');
}

export async function createAccessToken(data: any) {
  return apiPost<any>('/access-tokens', data);
}

export async function deleteAccessToken(id: string) {
  return apiDelete<any>(`/access-tokens/${id}`);
}
