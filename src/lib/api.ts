import type { z } from 'zod';
import { apiResponseContract } from '@shared/apiContract';

export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

let pendingSession: string | null = null;
const uncertainCommands = new Map<string, string>();

export async function apiRequest<T>(
  url: string,
  options: RequestInit = {},
  schema?: z.ZodType<T>
): Promise<T> {
  const csrfToken = localStorage.getItem("csrf_token");
  
  const method = (options.method ?? 'GET').toUpperCase();
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (csrfToken) headers.set('X-CSRF-Token', csrfToken);
  // Invoice and partner-payment commands have transactional receipts. Other mutations must not
  // be automatically repeated after an ambiguous network failure.
  const retrySafe = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)
    && /^\/api\/(?:invoices(?:\/transfer|\/[^/]+(?:\/(?:expenses|periods|archive))?)?|expenses\/[^/]+|transfers\/[^/]+|partner-payments(?:\/[^/]+)?)$/.test(url)
    && (options.body === undefined || typeof options.body === 'string');
  if (pendingSession !== csrfToken) { uncertainCommands.clear(); pendingSession = csrfToken; }
  const signature = retrySafe ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(JSON.stringify([method, url, options.body ?? ''])))), byte => byte.toString(16).padStart(2, '0')).join('') : undefined;
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method) && !headers.has('Idempotency-Key')) {
    const key = signature ? uncertainCommands.get(signature) ?? crypto.randomUUID() : crypto.randomUUID();
    headers.set('Idempotency-Key', key);
  }
  if (signature) uncertainCommands.set(signature, headers.get('Idempotency-Key')!);
  const confirm = () => {
    if (signature && pendingSession === csrfToken && uncertainCommands.get(signature) === headers.get('Idempotency-Key')) uncertainCommands.delete(signature);
  };
  const send = () => fetch(url, { ...options, method, headers, credentials: 'include' });
  let response: Response;
  try { response = await send(); }
  catch (error) {
    if (!retrySafe || options.signal?.aborted || !(error instanceof TypeError)
      || csrfToken !== localStorage.getItem('csrf_token')) throw error;
    // Reuse the exact headers/body, including the command key and session.
    response = await send();
  }

  if (!response.ok) {
    if (response.status < 500) confirm();
    if (response.status === 401 && csrfToken === localStorage.getItem('csrf_token')) window.dispatchEvent(new Event('auth-expired'));
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Request failed: ${response.status}`);
  }

  // Handle 204 No Content response (e.g., DELETE requests)
  if (response.status === 204) {
    confirm();
    return undefined as T;
  }

  const data = await response.json();
  const validator = schema ?? apiResponseContract(url, method);
  const validated = validator ? validator.parse(data) : data;
  confirm();
  return validated;
}

export async function api<T>(endpoint: string, options?: RequestInit): Promise<T> {
  return apiRequest<T>(`/api${endpoint}`, options);
}

export async function apiGet<T>(endpoint: string, schema?: z.ZodType<T>): Promise<T> {
  if (!endpoint.startsWith('/') || endpoint.startsWith('/api/')) throw new Error('API endpoint must start with / and omit the /api prefix');
  return apiRequest<T>(`/api${endpoint}`, { method: "GET" }, schema);
}

export async function apiPost<T>(endpoint: string, data?: unknown): Promise<T> {
  return api<T>(endpoint, {
    method: "POST",
    body: data ? JSON.stringify(data) : undefined,
  });
}

export async function apiPatch<T>(endpoint: string, data?: unknown): Promise<T> {
  return api<T>(endpoint, {
    method: "PATCH",
    body: data ? JSON.stringify(data) : undefined,
  });
}

export async function apiPut<T>(endpoint: string, data?: unknown): Promise<T> {
  return api<T>(endpoint, {
    method: "PUT",
    body: data ? JSON.stringify(data) : undefined,
  });
}

export async function apiDelete<T>(endpoint: string): Promise<T> {
  return api<T>(endpoint, { method: "DELETE" });
}
