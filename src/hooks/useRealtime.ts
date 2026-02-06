import { useEffect, useState, useCallback, useRef } from 'react';
import { getSupabaseClient } from '@/lib/supabaseClient';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export function useRealtime(matchId: string) {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);
  const supabaseRef = useRef<SupabaseClient | null>(null);

  const connect = useCallback(async () => {
    if (channel) return; // Already connected

    try {
      setConnectionStatus('connecting');
      const supabase = await getSupabaseClient();
      supabaseRef.current = supabase;
      
      const newChannel = supabase
        .channel(`dart_match_${matchId}`, {
          config: {
            presence: {
              key: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            },
          },
        })
        .on('broadcast', { event: 'rematch-created' }, (payload) => {
          window.dispatchEvent(new CustomEvent('supabase-rematch-created', { detail: payload?.payload }));
        })
        .on('system', {}, (payload) => {
          // Realtime can report postgres subscription errors via system events even when
          // channel status is "SUBSCRIBED". Surface this as an error so spectator mode
          // can fall back to polling instead of appearing connected but stale.
          const extension = payload && typeof payload === 'object' && 'extension' in payload ? payload.extension : null;
          const status = payload && typeof payload === 'object' && 'status' in payload ? payload.status : null;
          const message = payload && typeof payload === 'object' && 'message' in payload ? payload.message : null;
          const text = typeof message === 'string' ? message : '';
          const normalizedText = text.toLowerCase();
          const isEmptyObjectPayload = payload && typeof payload === 'object' && Object.keys(payload).length === 0;
          const isWildcardInspectorError = normalizedText.includes('table: *') || normalizedText.includes('table:*');
          const hasSubscriptionFailureText = normalizedText.includes('unable to subscribe to changes');
          if (extension === 'postgres_changes' && hasSubscriptionFailureText) {
            // Ignore known noisy payloads (for example wildcard inspector probes) that
            // can appear transiently while the actual app subscriptions are healthy.
            if (isEmptyObjectPayload || isWildcardInspectorError) {
              if (process.env.NODE_ENV !== 'production') {
                console.warn('Realtime postgres_changes warning ignored:', payload);
              }
              return;
            }
            // Keep the channel as connected here. In practice these system payloads can be
            // noisy/transient while websocket updates still flow. We only downgrade
            // connection status on explicit channel lifecycle failures.
            console.warn('Realtime postgres_changes subscription warning:', payload);
          }
        })
        // Add database change listeners directly here
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'throws',
            filter: `match_id=eq.${matchId}`,
          },
          (payload) => {
            window.dispatchEvent(new CustomEvent('supabase-throws-change', { detail: payload }));
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'turns',
            filter: `match_id=eq.${matchId}`,
          },
          (payload) => {
            window.dispatchEvent(new CustomEvent('supabase-turns-change', { detail: payload }));
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'legs',
            filter: `match_id=eq.${matchId}`,
          },
          (payload) => {
            window.dispatchEvent(new CustomEvent('supabase-legs-change', { detail: payload }));
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'matches',
            filter: `id=eq.${matchId}`,
          },
          (payload) => {
            window.dispatchEvent(new CustomEvent('supabase-matches-change', { detail: payload }));
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'match_players',
          },
          (payload) => {
            // Filter on client side to handle DELETE events properly
            // For DELETE events, payload.new is null and we need payload.old
            const record = payload.new || payload.old;
            if (record && typeof record === 'object' && 'match_id' in record && record.match_id === matchId) {
              window.dispatchEvent(new CustomEvent('supabase-match-players-change', { detail: payload }));
            }
          }
        );

      // Subscribe to the channel
      newChannel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnectionStatus('connected');
        } else if (status === 'CHANNEL_ERROR') {
          setConnectionStatus('error');
        } else if (status === 'TIMED_OUT') {
          setConnectionStatus('error');
        } else if (status === 'CLOSED') {
          setConnectionStatus('disconnected');
        }
      });

      setChannel(newChannel);
    } catch (error) {
      console.error('💥 Failed to connect to realtime:', error);
      setConnectionStatus('error');
    }
  }, [matchId, channel]);

  const disconnect = useCallback(() => {
    if (channel) {
      channel.unsubscribe();
      setChannel(null);
      setConnectionStatus('disconnected');
    }
  }, [channel]);

  // Update presence (indicate this user is viewing the match)
  const updatePresence = useCallback(async (isSpectator = false) => {
    if (channel && connectionStatus === 'connected') {
      await channel.track({
        user_id: Math.random().toString(36).substr(2, 9), // Generate a temp user ID
        is_spectator: isSpectator,
        timestamp: new Date().toISOString(),
      });
    }
  }, [channel, connectionStatus]);

  const broadcastRematch = useCallback(
    async (newMatchId: string) => {
      if (channel && connectionStatus === 'connected') {
        await channel.send({
          type: 'broadcast',
          event: 'rematch-created',
          payload: { newMatchId },
        });
      }
    },
    [channel, connectionStatus]
  );

  // Auto-connect on mount
  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    connectionStatus,
    connect,
    disconnect,
    updatePresence,
    broadcastRematch,
    isConnected: connectionStatus === 'connected',
  };
}
