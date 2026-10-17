import { useEffect, useState, useRef } from "react";

interface UseRealtimeSubscriptionOptions {
  channelName: string;
  table: string;
  filter?: string;
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  schema?: string;
  onUpdate: (payload?: unknown) => void;
  enabled?: boolean;
}

export const useRealtimeSubscription = ({
  channelName,
  table,
  onUpdate,
  enabled = true,
}: UseRealtimeSubscriptionOptions) => {
  const updateRef = useRef(onUpdate);
  useEffect(() => { updateRef.current = onUpdate; }, [onUpdate]);
  const [isVisible, setIsVisible] = useState(document.visibilityState === 'visible');
  
  useEffect(() => {
    const handleVisibilityChange = () => {
      const visible = document.visibilityState === 'visible';
      setIsVisible(visible);
      if (visible && enabled) updateRef.current();
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled]);
  
  useEffect(() => {
    if (!enabled || !isVisible) return;

    const pollInterval = setInterval(() => {
      updateRef.current();
    }, 120000);
    
    return () => {
      clearInterval(pollInterval);
    };
  }, [enabled, isVisible, channelName, table]);
};
