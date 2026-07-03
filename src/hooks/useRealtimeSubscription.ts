import { useEffect, useState } from "react";

interface UseRealtimeSubscriptionOptions {
  channelName: string;
  table: string;
  filter?: string;
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  schema?: string;
  onUpdate: (payload?: any) => void;
  enabled?: boolean;
  dependencies?: any[];
}

export const useRealtimeSubscription = ({
  channelName,
  table,
  onUpdate,
  enabled = true,
  dependencies = [],
}: UseRealtimeSubscriptionOptions) => {
  const [isVisible, setIsVisible] = useState(document.visibilityState === 'visible');
  
  useEffect(() => {
    const handleVisibilityChange = () => {
      const visible = document.visibilityState === 'visible';
      setIsVisible(visible);
      if (visible && enabled) onUpdate();
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, onUpdate]);
  
  useEffect(() => {
    if (!enabled || !isVisible) return;

    const pollInterval = setInterval(() => {
      onUpdate();
    }, 120000);
    
    return () => {
      clearInterval(pollInterval);
    };
  }, [enabled, isVisible, channelName, table, onUpdate, ...dependencies]);
};
