import { useState, useEffect, useCallback } from 'react';

export type UserRole = 'assistant' | 'partner' | 'admin' | 'client';

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

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    role: null,
    partnerId: null,
    clientId: null,
    csrfToken: null,
  });

  const validateSession = useCallback(async () => {
    try {
      console.log('[useAuth] Validating session');
      
      const response = await fetch('/api/auth/validate', {
        method: 'GET',
        credentials: 'include',
      });

      const data = await response.json();

      if (!data?.valid) {
        console.log('[useAuth] Session validation failed');
        localStorage.removeItem('csrf_token');
        setAuthState({
          isAuthenticated: false,
          isLoading: false,
          role: null,
          partnerId: null,
          clientId: null,
          csrfToken: null,
        });
        return false;
      }

      console.log('[useAuth] Session validated successfully:', {
        role: data.user?.role,
        partnerId: data.user?.partnerId,
        clientId: data.user?.clientId,
      });
      
      setAuthState({
        isAuthenticated: true,
        isLoading: false,
        role: data.user?.role,
        partnerId: data.user?.partnerId || null,
        clientId: data.user?.clientId || null,
        csrfToken: localStorage.getItem('csrf_token'),
      });

      return true;
    } catch (err) {
      console.error('[useAuth] Session validation error:', err);
      localStorage.removeItem('csrf_token');
      setAuthState({
        isAuthenticated: false,
        isLoading: false,
        role: null,
        partnerId: null,
        clientId: null,
        csrfToken: null,
      });
      return false;
    }
  }, []);

  const login = useCallback(async (code: string): Promise<LoginResult> => {
    const maxRetries = 3;
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[useAuth] Login attempt ${attempt}/${maxRetries} for code:`, code.substring(0, 3) + '***');
        
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ code: code.toUpperCase() }),
        });

        console.log('[useAuth] Login response status:', response.status);

        let data;
        try {
          data = await response.json();
          console.log('[useAuth] Login response data:', { success: data?.success, error: data?.error });
        } catch (parseError) {
          console.error('[useAuth] Failed to parse response:', parseError);
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 500 * attempt));
            continue;
          }
          return {
            success: false,
            error: 'parse_error',
            message: 'Ошибка обработки ответа сервера',
          };
        }

        if (!response.ok || !data?.success) {
          console.log('[useAuth] Login failed:', data?.error, data?.message);
          return {
            success: false,
            error: data?.error || 'login_failed',
            message: data?.message || 'Неверный код доступа',
            locked_until: data?.locked_until,
            attempts_remaining: data?.attempts_remaining,
          };
        }

        console.log('[useAuth] Login successful, role:', data.user?.role);
        
        localStorage.setItem('csrf_token', data.csrfToken);
        
        setAuthState({
          isAuthenticated: true,
          isLoading: false,
          role: data.user?.role,
          partnerId: data.user?.partnerId || null,
          clientId: data.user?.clientId || null,
          csrfToken: data.csrfToken,
        });

        return { success: true, data };
      } catch (err) {
        console.error(`[useAuth] Login network error (attempt ${attempt}/${maxRetries}):`, err);
        lastError = err instanceof Error ? err : new Error('Unknown error');
        
        if (attempt < maxRetries) {
          console.log(`[useAuth] Retrying in ${500 * attempt}ms...`);
          await new Promise(resolve => setTimeout(resolve, 500 * attempt));
        }
      }
    }
    
    return {
      success: false,
      error: 'network_error',
      message: 'Не удалось подключиться к серверу. Пожалуйста, попробуйте ещё раз.',
    };
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      localStorage.removeItem('csrf_token');
      localStorage.removeItem('session_id');
      sessionStorage.removeItem('access_session');
      sessionStorage.removeItem('session_data');
      setAuthState({
        isAuthenticated: false,
        isLoading: false,
        role: null,
        partnerId: null,
        clientId: null,
        csrfToken: null,
      });
    }
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok || !data?.success) {
        return false;
      }

      return true;
    } catch (err) {
      console.error('Session refresh error:', err);
      return false;
    }
  }, []);

  useEffect(() => {
    validateSession();
  }, [validateSession]);

  return {
    ...authState,
    login,
    logout,
    refreshSession,
    validateSession,
  };
}
