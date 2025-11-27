import { useEffect } from "react";

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
  useEffect(() => {
    if (!enabled) return;

    if (import.meta.env.DEV) {
      console.log(`[Realtime] Subscription to ${table} on ${channelName} disabled during migration`);
    }
    
    const pollInterval = setInterval(() => {
      onUpdate();
    }, 30000);

    return () => {
      clearInterval(pollInterval);
    };
  }, [enabled, channelName, table, onUpdate, ...dependencies]);
};
