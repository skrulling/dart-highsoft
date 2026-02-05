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
        // Add database change listeners directly here
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'throws',
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
            console.log('🔄 Match players change detected:', payload.eventType, payload);
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
