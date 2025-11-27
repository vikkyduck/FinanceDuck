import { useEffect, useState, useCallback } from 'react';

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
  expiresAt?: number;
  lastActivity?: number;
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

  const getSession = useCallback((): AccessSession | null => {
    try {
      const sessionStr = sessionStorage.getItem('access_session');
      if (!sessionStr) return null;
      return JSON.parse(sessionStr);
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    const fetchUserRole = async () => {
      try {
        const response = await fetch('/api/auth/validate', {
          method: 'GET',
          credentials: 'include',
        });
        
        const data = await response.json();
        
        if (!data?.valid) {
          setRoleData({ 
            role: null, 
            partnerId: null, 
            clientId: null, 
            loading: false, 
            accessCode: null, 
            accessTokenId: null 
          });
          return;
        }
        
        setRoleData({
          role: data.user?.role as UserRole,
          partnerId: data.user?.partnerId || null,
          clientId: data.user?.clientId || null,
          loading: false,
          accessCode: null,
          accessTokenId: null,
        });
      } catch {
        setRoleData({ 
          role: null, 
          partnerId: null, 
          clientId: null, 
          loading: false, 
          accessCode: null, 
          accessTokenId: null 
        });
      }
    };
    
    fetchUserRole();
  }, []);

  return { ...roleData, getSession };
}
