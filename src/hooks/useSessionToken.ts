import { useCallback } from 'react';

/**
 * Hook for retrieving the session token ID from localStorage (new auth system)
 * or sessionStorage (legacy compatibility)
 */
export function useSessionToken() {
  const getTokenId = useCallback((): string | null => {
    // Try new localStorage-based auth first
    const sessionData = localStorage.getItem('session_data');
    if (sessionData) {
      try {
        const parsed = JSON.parse(sessionData);
        return parsed.accessTokenId || null;
      } catch {
        return null;
      }
    }

    // Fall back to legacy sessionStorage
    const legacySessionData = sessionStorage.getItem('session_data');
    const accessSession = sessionStorage.getItem('access_session');
    
    if (legacySessionData) {
      try {
        const parsed = JSON.parse(legacySessionData);
        return parsed.accessTokenId || null;
      } catch {
        return null;
      }
    }
    
    if (accessSession) {
      try {
        const parsed = JSON.parse(accessSession);
        return parsed.accessTokenId || null;
      } catch {
        return null;
      }
    }

    return null;
  }, []);

  return { getTokenId };
}
