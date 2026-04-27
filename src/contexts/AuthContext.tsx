import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type UserRole = 'assistant' | 'partner' | 'admin' | 'client' | 'accountant';

export interface LoginResult {
  success: boolean;
  error?: string;
  message?: string;
  data?: any;
  locked_until?: string;
  attempts_remaining?: number;
}

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  role: UserRole | null;
  partnerId: string | null;
  clientId: string | null;
  csrfToken: string | null;
}

interface AuthContextValue extends AuthState {
  login: (code: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
  validateSession: () => Promise<boolean>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

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
  const [authState, setAuthState] = useState<AuthState>(INITIAL_STATE);

  const validateSession = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch('/api/auth/validate', {
        method: 'GET',
        credentials: 'include',
      });

      const data = await response.json();

      if (!data?.valid) {
        localStorage.removeItem('csrf_token');
        setAuthState(LOGGED_OUT_STATE);
        return false;
      }

      setAuthState({
        isAuthenticated: true,
        isLoading: false,
        role: data.user?.role ?? null,
        partnerId: data.user?.partnerId ?? null,
        clientId: data.user?.clientId ?? null,
        csrfToken: localStorage.getItem('csrf_token'),
      });

      return true;
    } catch {
      localStorage.removeItem('csrf_token');
      setAuthState(LOGGED_OUT_STATE);
      return false;
    }
  }, []);

  const login = useCallback(async (code: string): Promise<LoginResult> => {
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ code: code.toUpperCase() }),
        });

        let data: any;
        try {
          data = await response.json();
        } catch {
          if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, 500 * attempt));
            continue;
          }
          return { success: false, error: 'parse_error', message: 'Ошибка обработки ответа сервера' };
        }

        if (!response.ok || !data?.success) {
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
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
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
      const response = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
      const data = await response.json();
      return response.ok && !!data?.success;
    } catch {
      return false;
    }
  }, []);

  // Single validate on mount — one network request for the whole app
  useEffect(() => {
    validateSession();
  }, [validateSession]);

  return (
    <AuthContext.Provider value={{ ...authState, login, logout, refreshSession, validateSession }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuthContext must be used within <AuthProvider>');
  }
  return ctx;
}
