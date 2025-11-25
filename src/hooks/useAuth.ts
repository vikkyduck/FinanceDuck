import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type UserRole = 'assistant' | 'partner' | 'admin' | 'client';

interface AuthSession {
  role: UserRole;
  partnerId: string | null;
  clientId: string | null;
  accessTokenId: string;
  csrfToken: string;
  sessionId: string;
  expiresAt?: string;
}

interface AuthState extends Omit<AuthSession, 'expiresAt' | 'sessionId'> {
  isAuthenticated: boolean;
  isLoading: boolean;
}

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    role: null as any,
    partnerId: null,
    clientId: null,
    accessTokenId: null as any,
    csrfToken: null as any,
  });

  const validateSession = useCallback(async () => {
    try {
      const sessionId = localStorage.getItem('session_id');
      const csrfToken = localStorage.getItem('csrf_token');
      
      if (!sessionId) {
        console.log('[useAuth] No session_id in localStorage');
        setAuthState({
          isAuthenticated: false,
          isLoading: false,
          role: null as any,
          partnerId: null,
          clientId: null,
          accessTokenId: null as any,
          csrfToken: null as any,
        });
        return false;
      }

      console.log('[useAuth] Validating session from localStorage');
      
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/auth-validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          session_id: sessionId,
          csrf_token: csrfToken,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data?.valid) {
        console.log('[useAuth] Session validation failed:', data?.error || 'response not ok');
        localStorage.removeItem('session_id');
        localStorage.removeItem('csrf_token');
        setAuthState({
          isAuthenticated: false,
          isLoading: false,
          role: null as any,
          partnerId: null,
          clientId: null,
          accessTokenId: null as any,
          csrfToken: null as any,
        });
        return false;
      }

      console.log('[useAuth] Session validated successfully:', {
        role: data.role,
        partnerId: data.partner_id,
        clientId: data.client_id,
        accessTokenId: data.access_token_id
      });
      
      // Update csrf_token if changed
      if (data.csrf_token) {
        localStorage.setItem('csrf_token', data.csrf_token);
      }
      
      setAuthState({
        isAuthenticated: true,
        isLoading: false,
        role: data.role,
        partnerId: data.partner_id,
        clientId: data.client_id,
        accessTokenId: data.access_token_id,
        csrfToken: data.csrf_token,
      });

      // Set session context for Supabase RLS
      await supabase.rpc('set_session_context', { _token_id: data.access_token_id });

      return true;
    } catch (err) {
      console.error('[useAuth] Session validation error:', err);
      localStorage.removeItem('session_id');
      localStorage.removeItem('csrf_token');
      setAuthState({
        isAuthenticated: false,
        isLoading: false,
        role: null as any,
        partnerId: null,
        clientId: null,
        accessTokenId: null as any,
        csrfToken: null as any,
      });
      return false;
    }
  }, []);

  const login = useCallback(async (code: string) => {
    try {
      console.log('[useAuth] Login started');
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/auth-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ code }),
      });

      const data = await response.json();

      if (!response.ok || !data?.success) {
        console.log('[useAuth] Login failed:', data?.error);
        return {
          success: false,
          error: data?.error || 'Login failed',
          message: data?.message,
          attempts_remaining: data?.attempts_remaining,
          locked_until: data?.locked_until,
        };
      }

      console.log('[useAuth] Login successful, storing session in localStorage');
      
      // Store session data in localStorage
      localStorage.setItem('session_id', data.session_id);
      localStorage.setItem('csrf_token', data.csrf_token);
      
      setAuthState({
        isAuthenticated: true,
        isLoading: false,
        role: data.role,
        partnerId: data.partner_id,
        clientId: data.client_id,
        accessTokenId: data.access_token_id || '',
        csrfToken: data.csrf_token,
      });

      return { success: true, data };
    } catch (err) {
      console.error('Login error:', err);
      return {
        success: false,
        error: 'network_error',
        message: 'Ошибка соединения с сервером',
      };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      const sessionId = localStorage.getItem('session_id');
      
      if (sessionId) {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        await fetch(`${supabaseUrl}/functions/v1/auth-logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ session_id: sessionId }),
        });
      }
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      // Clear localStorage and state
      localStorage.removeItem('session_id');
      localStorage.removeItem('csrf_token');
      // Also clear legacy sessionStorage
      sessionStorage.removeItem('access_session');
      sessionStorage.removeItem('session_data');
      setAuthState({
        isAuthenticated: false,
        isLoading: false,
        role: null as any,
        partnerId: null,
        clientId: null,
        accessTokenId: null as any,
        csrfToken: null as any,
      });
    }
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const sessionId = localStorage.getItem('session_id');
      
      if (!sessionId) {
        console.log('[useAuth] No session to refresh');
        return false;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/auth-refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ session_id: sessionId }),
      });

      const data = await response.json();

      if (!response.ok || !data?.success) {
        localStorage.removeItem('session_id');
        localStorage.removeItem('csrf_token');
        return false;
      }

      return true;
    } catch (err) {
      console.error('Session refresh error:', err);
      return false;
    }
  }, []);

  // Initial session validation on mount
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
