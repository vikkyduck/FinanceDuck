import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type UserRole = 'assistant' | 'partner' | 'admin' | 'client';

interface UserRoleData {
  role: UserRole | null;
  partnerId: string | null;
  clientId: string | null;
  loading: boolean;
  accessCode: string | null;
  accessTokenId: string | null;
  getSession: () => AccessSession | null;
}

interface AccessSession {
  accessTokenId: string;
  code: string;
  role: UserRole;
  partnerId: string | null;
  clientId: string | null;
  expiresAt?: number; // Optional for backward compatibility
  lastActivity?: number; // Optional for backward compatibility
}

export function useUserRole(): UserRoleData {
  const [roleData, setRoleData] = useState<Omit<UserRoleData, 'getSession'>>({
    role: null,
    partnerId: null,
    clientId: null,
    loading: true,
    accessCode: null,
    accessTokenId: null,
  });

  const getSession = (): AccessSession | null => {
    try {
      const sessionStr = sessionStorage.getItem('access_session');
      if (!sessionStr) return null;
      return JSON.parse(sessionStr);
    } catch {
      return null;
    }
  };

  useEffect(() => {
    fetchUserRole();
  }, []);

  const fetchUserRole = async () => {
    try {
      const sessionStr = sessionStorage.getItem('access_session');
      
      if (!sessionStr) {
        setRoleData({ role: null, partnerId: null, clientId: null, loading: false, accessCode: null, accessTokenId: null });
        return;
      }

      const session: AccessSession = JSON.parse(sessionStr);

      // Check if session has expired
      if (session.expiresAt && session.expiresAt < Date.now()) {
        sessionStorage.removeItem('access_session');
        setRoleData({ role: null, partnerId: null, clientId: null, loading: false, accessCode: null, accessTokenId: null });
        return;
      }

      // Set session context for RLS policies
      await supabase.rpc('set_session_context', { _token_id: session.accessTokenId });

      setRoleData({
        role: session.role as UserRole,
        partnerId: session.partnerId,
        clientId: session.clientId,
        loading: false,
        accessCode: session.code,
        accessTokenId: session.accessTokenId,
      });
    } catch {
      setRoleData({ role: null, partnerId: null, clientId: null, loading: false, accessCode: null, accessTokenId: null });
    }
  };

  return { ...roleData, getSession };
}
