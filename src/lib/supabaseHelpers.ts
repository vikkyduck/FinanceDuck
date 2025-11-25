import { supabase } from "@/integrations/supabase/client";
import { handleSupabaseError } from "./errorHandler";

export interface QueryOptions {
  operation?: string;
  details?: Record<string, any>;
  throwOnError?: boolean;
}

/**
 * Session data returned by ensureSessionContext
 */
export interface SessionContext {
  accessTokenId: string;
  role: string;
  partnerId: string | null;
  clientId: string | null;
}

/**
 * Ensures session context is set before database operations
 * Uses session_id + csrf_token stored in localStorage and validates them
 * via the auth-validate backend function. On success it sets the
 * session context in the database for proper RLS.
 * @returns Session context data including accessTokenId
 * @throws Error if session is not found or context cannot be set
 */
async function _ensureSessionContext(): Promise<SessionContext> {
  const sessionId = localStorage.getItem("session_id");
  const csrfToken = localStorage.getItem("csrf_token");

  if (!sessionId) {
    throw new Error("No valid session found. Please log in again.");
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const response = await fetch(`${supabaseUrl}/functions/v1/auth-validate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({
      session_id: sessionId,
      csrf_token: csrfToken,
    }),
  });

  const data = await response.json();

  if (!response.ok || !data?.valid) {
    localStorage.removeItem("session_id");
    localStorage.removeItem("csrf_token");
    throw new Error("No valid session found. Please log in again.");
  }

  await supabase.rpc("set_session_context", { _token_id: data.access_token_id });

  return {
    accessTokenId: data.access_token_id,
    role: data.role,
    partnerId: data.partner_id,
    clientId: data.client_id,
  };
}


/**
 * Public function to ensure session context (exported for use in components)
 * @returns Session context data including accessTokenId
 * @throws Error if session cannot be established
 */
export async function ensureSessionContext(): Promise<SessionContext> {
  return _ensureSessionContext();
}

/**
 * Safe wrapper for RPC calls that automatically ensures session context
 * @param rpcName Name of the RPC function to call
 * @param params Parameters to pass to the RPC function
 * @param options Query options for error handling
 */
export async function callRPC<T = any>(
  rpcName: string,
  params: Record<string, any> = {},
  options: QueryOptions = {}
): Promise<T | null> {
  await _ensureSessionContext();
  
  const { operation = `rpc_${rpcName}`, throwOnError = false } = options;
  
  const { data, error } = await supabase.rpc(rpcName as any, params);
  
  if (error) {
    handleSupabaseError(error, { operation, details: params });
    if (throwOnError) throw error;
    return null;
  }
  
  return data as T;
}

/**
 * Generic Supabase query wrapper with automatic error handling
 */
export async function querySupabase<T = any>(
  table: string,
  selectQuery: string = "*",
  options: QueryOptions = {}
): Promise<T[] | null> {
  await _ensureSessionContext();
  const { operation = `fetch_${table}`, details, throwOnError = false } = options;

  const { data, error } = await supabase
    .from(table as any)
    .select(selectQuery);

  if (error) {
    handleSupabaseError(error, { operation, details });
    if (throwOnError) throw error;
    return null;
  }

  return data as T[];
}

/**
 * Supabase query with custom filter builder
 * Allows chaining .eq(), .order(), etc.
 */
export async function querySupabaseWithFilter<T = any>(
  table: string,
  selectQuery: string = "*",
  filterFn: (query: any) => any,
  options: QueryOptions = {}
): Promise<T[] | null> {
  await _ensureSessionContext();
  const { operation = `fetch_${table}`, details, throwOnError = false } = options;

  let query = supabase.from(table as any).select(selectQuery);
  query = filterFn(query);

  const { data, error } = await query;

  if (error) {
    handleSupabaseError(error, { operation, details });
    if (throwOnError) throw error;
    return null;
  }

  return data as T[];
}

/**
 * Supabase insert wrapper with automatic error handling
 */
export async function insertSupabase<T = any>(
  table: string,
  data: Partial<T> | Partial<T>[],
  options: QueryOptions = {}
): Promise<T[] | null> {
  await _ensureSessionContext();
  const { operation = `insert_${table}`, details, throwOnError = false } = options;

  const { data: result, error } = await supabase
    .from(table as any)
    .insert(data as any)
    .select();

  if (error) {
    handleSupabaseError(error, { operation, details: { ...details, data } });
    if (throwOnError) throw error;
    return null;
  }

  return result as T[];
}

/**
 * Supabase insert without returning data (for better performance)
 */
export async function insertSupabaseNoReturn(
  table: string,
  data: any | any[],
  options: QueryOptions = {}
): Promise<boolean> {
  await _ensureSessionContext();
  const { operation = `insert_${table}`, details, throwOnError = false } = options;

  const { error } = await supabase
    .from(table as any)
    .insert(data as any);

  if (error) {
    handleSupabaseError(error, { operation, details: { ...details, data } });
    if (throwOnError) throw error;
    return false;
  }

  return true;
}

/**
 * Supabase update wrapper with automatic error handling
 */
export async function updateSupabase<T = any>(
  table: string,
  data: Partial<T>,
  filterFn: (query: any) => any,
  options: QueryOptions = {}
): Promise<T[] | null> {
  await _ensureSessionContext();
  const { operation = `update_${table}`, details, throwOnError = false } = options;

  let query = supabase.from(table as any).update(data as any);
  query = filterFn(query);

  const { data: result, error } = await query.select();

  if (error) {
    handleSupabaseError(error, { operation, details: { ...details, data } });
    if (throwOnError) throw error;
    return null;
  }

  return result as T[];
}

/**
 * Supabase update without returning data (for better performance)
 */
export async function updateSupabaseNoReturn(
  table: string,
  data: any,
  filterFn: (query: any) => any,
  options: QueryOptions = {}
): Promise<boolean> {
  await ensureSessionContext();
  const { operation = `update_${table}`, details, throwOnError = false } = options;

  let query = supabase.from(table as any).update(data as any);
  query = filterFn(query);

  const { error } = await query;

  if (error) {
    handleSupabaseError(error, { operation, details: { ...details, data } });
    if (throwOnError) throw error;
    return false;
  }

  return true;
}

/**
 * Supabase delete wrapper with automatic error handling
 */
export async function deleteSupabase(
  table: string,
  filterFn: (query: any) => any,
  options: QueryOptions = {}
): Promise<boolean> {
  await _ensureSessionContext();
  const { operation = `delete_${table}`, details, throwOnError = false } = options;

  let query = supabase.from(table as any).delete();
  query = filterFn(query);

  const { error } = await query;

  if (error) {
    handleSupabaseError(error, { operation, details });
    if (throwOnError) throw error;
    return false;
  }

  return true;
}

/**
 * Supabase single record query with automatic error handling
 */
export async function querySupabaseSingle<T = any>(
  table: string,
  selectQuery: string = "*",
  filterFn: (query: any) => any,
  options: QueryOptions = {}
): Promise<T | null> {
  await _ensureSessionContext();
  const { operation = `fetch_${table}_single`, details, throwOnError = false } = options;

  let query = supabase.from(table as any).select(selectQuery);
  query = filterFn(query);

  const { data, error } = await query.maybeSingle();

  if (error) {
    handleSupabaseError(error, { operation, details });
    if (throwOnError) throw error;
    return null;
  }

  return data as T;
}

/**
 * Supabase count query with automatic error handling
 */
export async function countSupabase(
  table: string,
  filterFn?: (query: any) => any,
  options: QueryOptions = {}
): Promise<number> {
  await _ensureSessionContext();
  const { operation = `count_${table}`, details, throwOnError = false } = options;

  let query = supabase.from(table as any).select("*", { count: "exact", head: true });
  
  if (filterFn) {
    query = filterFn(query);
  }

  const { count, error } = await query;

  if (error) {
    handleSupabaseError(error, { operation, details });
    if (throwOnError) throw error;
    return 0;
  }

  return count || 0;
}
