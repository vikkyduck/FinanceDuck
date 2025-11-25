import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

interface UseRealtimeSubscriptionOptions {
  channelName: string;
  table: string;
  filter?: string;
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  schema?: string;
  onUpdate: (payload?: RealtimePostgresChangesPayload<any>) => void;
  enabled?: boolean;
  dependencies?: any[];
}

/**
 * Custom hook for Supabase realtime subscriptions
 * Consolidates realtime subscription logic to avoid duplication
 * 
 * @example
 * useRealtimeSubscription({
 *   channelName: 'client_stats',
 *   table: 'invoices',
 *   filter: `client_id=eq.${clientId}`,
 *   onUpdate: fetchStats,
 *   enabled: !!clientId
 * });
 */
export const useRealtimeSubscription = ({
  channelName,
  table,
  filter,
  event = '*',
  schema = 'public',
  onUpdate,
  enabled = true,
  dependencies = [],
}: UseRealtimeSubscriptionOptions) => {
  useEffect(() => {
    if (!enabled) return;

    if (import.meta.env.DEV) {
      console.log(`[Realtime] Subscribing to ${table} on channel ${channelName}`);
    }

    const config: any = {
      event,
      schema,
      table,
    };

    if (filter) {
      config.filter = filter;
    }

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        config,
        (payload: RealtimePostgresChangesPayload<any>) => {
          if (import.meta.env.DEV) {
            console.log(`[Realtime] ${table} event: ${payload.eventType}`);
          }
          onUpdate(payload);
        }
      )
      .subscribe();

    return () => {
      if (import.meta.env.DEV) {
        console.log(`[Realtime] Unsubscribing from ${channelName}`);
      }
      supabase.removeChannel(channel);
    };
  }, [enabled, channelName, table, filter, event, schema, onUpdate, ...dependencies]);
};
