/**
 * useUserRole — backward-compat shim over AuthContext.
 *
 * Previously made a standalone /api/auth/validate request on every mount.
 * Now reads from the single AuthContext instance — zero extra network calls.
 *
 * Field mapping kept intentionally to avoid changing all consumers:
 *   isLoading → loading
 *   role, partnerId, clientId — same names
 */
import { useCallback } from 'react';
import { useAuthContext, type UserRole } from '@/contexts/AuthContext';

export type { UserRole };

interface AccessSession {
  accessTokenId: string;
  code: string;
  role: UserRole;
  partnerId: string | null;
  clientId: string | null;
  expiresAt?: number;
  lastActivity?: number;
}

export function useUserRole() {
  const { isLoading, role, partnerId, clientId } = useAuthContext();

  const getSession = useCallback((): AccessSession | null => {
    try {
      const sessionStr = sessionStorage.getItem('access_session');
      if (!sessionStr) return null;
      return JSON.parse(sessionStr);
    } catch {
      return null;
    }
  }, []);

  return {
    role,
    partnerId,
    clientId,
    loading: isLoading,   // compat: consumers use `loading`, not `isLoading`
    accessCode: null,
    accessTokenId: null,
    getSession,
  };
}
