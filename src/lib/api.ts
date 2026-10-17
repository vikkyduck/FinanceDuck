export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

export async function apiRequest<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const csrfToken = localStorage.getItem("csrf_token");
  
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(["POST", "PATCH", "PUT", "DELETE"].includes(options.method ?? "GET") ? { "Idempotency-Key": crypto.randomUUID() } : {}),
    ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    if (response.status === 401 && csrfToken === localStorage.getItem('csrf_token')) window.dispatchEvent(new Event('auth-expired'));
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Request failed: ${response.status}`);
  }

  // Handle 204 No Content response (e.g., DELETE requests)
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export async function api<T>(endpoint: string, options?: RequestInit): Promise<T> {
  return apiRequest<T>(`/api${endpoint}`, options);
}

export async function apiGet<T>(endpoint: string): Promise<T> {
  return api<T>(endpoint, { method: "GET" });
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
