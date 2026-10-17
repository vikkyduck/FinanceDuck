import { authResponseSchema } from '@shared/authContract';
import { LoginResult, AuthState, AuthContext } from './auth-context';
import type { AuthResponse } from "@shared/contracts";
import { useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ─── Types ────────────────────────────────────────────────────────────────────

// ─── Types ────────────────────────────────────────────────────────────────────
import type { UserRole } from "@shared/schema";
export type { UserRole } from "@shared/schema";

// ─── Context ──────────────────────────────────────────────────────────────────

const INITIAL_STATE: AuthState = {
  isAuthenticated: false,
  isLoading: true,
  role: null,
  partnerId: null,
  clientId: null,
  csrfToken: null,
};

const LOGGED_OUT_STATE: AuthState = {
  isAuthenticated: false,
  isLoading: false,
  role: null,
  partnerId: null,
  clientId: null,
  csrfToken: null,
};

// ─── Provider ────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const authGeneration = useRef(0);
  const [authState, setAuthState] = useState<AuthState>(INITIAL_STATE);
  // A fresh cache AND a remounted component tree at every session boundary.
  // Late requests can only populate the old, detached cache.
  const queryClient = useMemo(() => new QueryClient({ defaultOptions: { queries: { enabled: Boolean(authState.csrfToken) } } }), [authState.csrfToken]);
  useEffect(() => () => { queryClient.clear(); }, [queryClient]);

  const validateSession = useCallback(async (): Promise<boolean> => {
    const generation = ++authGeneration.current;
    try {
      const response = await fetch('/api/auth/validate', {
        method: 'GET',
        credentials: 'include',
      });

      const data: AuthResponse = authResponseSchema.parse(await response.json());
      if (generation !== authGeneration.current) return false;

      if (!data?.valid || !data.csrfToken) {
        localStorage.removeItem('csrf_token');
        setAuthState(LOGGED_OUT_STATE);
        return false;
      }

      localStorage.setItem('csrf_token', data.csrfToken);
      setAuthState({
        isAuthenticated: true,
        isLoading: false,
        role: data.user?.role ?? null,
        partnerId: data.user?.partnerId ?? null,
        clientId: data.user?.clientId ?? null,
        csrfToken: data.csrfToken,
      });

      return true;
    } catch {
      if (generation !== authGeneration.current) return false;
      localStorage.removeItem('csrf_token');
      setAuthState(LOGGED_OUT_STATE);
      return false;
    }
  }, []);

  const login = useCallback(async (code: string): Promise<LoginResult> => {
    const generation = ++authGeneration.current;
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ code: code.toUpperCase() }),
        });

        let data: AuthResponse;
        try {
          data = authResponseSchema.parse(await response.json());
        } catch {
          if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, 500 * attempt));
            continue;
          }
          return { success: false, error: 'parse_error', message: 'Ошибка обработки ответа сервера' };
        }

        if (generation !== authGeneration.current) return { success: false };
        if (!response.ok || !data?.success || !data.csrfToken) {
          return {
            success: false,
            error: data?.error ?? 'login_failed',
            message: data?.message ?? 'Неверный код доступа',
            locked_until: data?.locked_until,
            attempts_remaining: data?.attempts_remaining,
          };
        }

        localStorage.setItem('csrf_token', data.csrfToken);
        setAuthState({
          isAuthenticated: true,
          isLoading: false,
          role: data.user?.role ?? null,
          partnerId: data.user?.partnerId ?? null,
          clientId: data.user?.clientId ?? null,
          csrfToken: data.csrfToken,
        });

        return { success: true, data };
      } catch {
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 500 * attempt));
        }
      }
    }

    return { success: false, error: 'network_error', message: 'Не удалось подключиться к серверу. Пожалуйста, попробуйте ещё раз.' };
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    ++authGeneration.current;
    setAuthState(LOGGED_OUT_STATE);
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': localStorage.getItem('csrf_token') ?? '' } });
    } catch {
      // Best-effort logout; clear local state regardless
    } finally {
      localStorage.removeItem('csrf_token');
      localStorage.removeItem('session_id');
      sessionStorage.removeItem('access_session');
      sessionStorage.removeItem('session_data');
      setAuthState(LOGGED_OUT_STATE);
    }
  }, []);

  const refreshSession = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': localStorage.getItem('csrf_token') ?? '' } });
      const data = authResponseSchema.parse(await response.json());
      return response.ok && !!data?.success;
    } catch {
      return false;
    }
  }, []);

  // Single validate on mount — one network request for the whole app
  useEffect(() => {
    validateSession();
  }, [validateSession]);

  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key === 'csrf_token') {
        setAuthState(INITIAL_STATE);
        void validateSession();
      }
    };
    const expired = () => { ++authGeneration.current; setAuthState(LOGGED_OUT_STATE); };
    window.addEventListener('storage', changed);
    window.addEventListener('auth-expired', expired);
    return () => {
      window.removeEventListener('storage', changed);
      window.removeEventListener('auth-expired', expired);
    };
  }, [validateSession]);

  return (
    <AuthContext.Provider value={{ ...authState, login, logout, refreshSession, validateSession }}>
      <QueryClientProvider client={queryClient} key={authState.csrfToken ?? 'anonymous'}>
        {children}
      </QueryClientProvider>
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
