import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/hooks/use-toast';
import { useAuth } from './useAuth';

const SESSION_DURATION = 30 * 60 * 1000; // 30 minutes in milliseconds
const CHECK_INTERVAL = 60 * 1000; // Check every 1 minute
const REFRESH_THRESHOLD = 5 * 60 * 1000; // Refresh 5 minutes before expiry
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart'];

export function useCookieSession() {
  const navigate = useNavigate();
  const { isAuthenticated, refreshSession, logout, validateSession } = useAuth();
  const checkIntervalRef = useRef<NodeJS.Timeout>();
  const activityTimeoutRef = useRef<NodeJS.Timeout>();
  const hasShownWarningRef = useRef(false);
  const lastActivityRef = useRef(Date.now());

  const handleExpiredSession = useCallback(() => {
    toast({
      variant: "destructive",
      title: "Сессия истекла",
      description: "Ваша сессия истекла из-за неактивности. Пожалуйста, войдите снова.",
    });
    logout();
    navigate('/auth');
  }, [logout, navigate]);

  const checkAndRefreshSession = useCallback(async () => {
    if (!isAuthenticated) return;

    const timeSinceActivity = Date.now() - lastActivityRef.current;
    const timeUntilExpiration = SESSION_DURATION - timeSinceActivity;

    // Session expired
    if (timeUntilExpiration <= 0) {
      handleExpiredSession();
      return;
    }

    // Show warning 5 minutes before expiration
    if (timeUntilExpiration <= REFRESH_THRESHOLD && !hasShownWarningRef.current) {
      hasShownWarningRef.current = true;
      const minutesLeft = Math.ceil(timeUntilExpiration / 60000);
      toast({
        title: "Сессия скоро истечет",
        description: `Ваша сессия истечет через ${minutesLeft} мин. Любое действие продлит сессию.`,
      });
    }

    // Auto-refresh session when close to expiry
    if (timeUntilExpiration <= REFRESH_THRESHOLD) {
      const refreshed = await refreshSession();
      if (refreshed) {
        hasShownWarningRef.current = false;
        lastActivityRef.current = Date.now();
        if (import.meta.env.DEV) {
          console.log('Session auto-refreshed');
        }
      }
    }
  }, [isAuthenticated, refreshSession, handleExpiredSession]);

  const handleActivity = useCallback(() => {
    if (!isAuthenticated) return;

    // Debounce activity updates
    if (activityTimeoutRef.current) {
      clearTimeout(activityTimeoutRef.current);
    }

    activityTimeoutRef.current = setTimeout(async () => {
      lastActivityRef.current = Date.now();
      hasShownWarningRef.current = false;

      // Refresh session on activity
      await refreshSession();
      
      if (import.meta.env.DEV) {
        console.log('Session refreshed on activity');
      }
    }, 1000); // Update at most once per second
  }, [isAuthenticated, refreshSession]);

  useEffect(() => {
    if (!isAuthenticated) return;

    // Initial check
    checkAndRefreshSession();

    // Set up periodic checks
    checkIntervalRef.current = setInterval(checkAndRefreshSession, CHECK_INTERVAL);

    // Set up activity listeners
    ACTIVITY_EVENTS.forEach(event => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    // Cleanup
    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
      if (activityTimeoutRef.current) {
        clearTimeout(activityTimeoutRef.current);
      }
      ACTIVITY_EVENTS.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [isAuthenticated, checkAndRefreshSession, handleActivity]);

  return {
    logout: () => {
      logout();
      navigate('/auth');
    },
    validateSession,
  };
}
