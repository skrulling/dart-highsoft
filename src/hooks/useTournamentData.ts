import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabaseClient';
import type { TournamentRecord, TournamentMatchRecord, TournamentPlayerRecord } from '@/lib/tournament/types';
import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';

type PlayerInfo = { id: string; display_name: string };

export function useTournamentData(tournamentId: string) {
  const [loading, setLoading] = useState(true);
  const [tournament, setTournament] = useState<TournamentRecord | null>(null);
  const [matches, setMatches] = useState<TournamentMatchRecord[]>([]);
  const [players, setPlayers] = useState<(TournamentPlayerRecord & { player: PlayerInfo })[]>([]);
  const [error, setError] = useState<string | null>(null);
  const supabaseRef = useRef<SupabaseClient | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const supabase = supabaseRef.current ?? await getSupabaseClient();
      supabaseRef.current = supabase;

      const [tourRes, matchRes, playerRes] = await Promise.all([
        supabase.from('tournaments').select('*').eq('id', tournamentId).single(),
        supabase
          .from('tournament_matches')
          .select('*')
          .eq('tournament_id', tournamentId)
          .order('bracket')
          .order('round')
          .order('position'),
        supabase
          .from('tournament_players')
          .select('*, players!inner(id, display_name)')
          .eq('tournament_id', tournamentId)
          .order('seed'),
      ]);

      if (tourRes.error) throw new Error(tourRes.error.message);
      if (matchRes.error) throw new Error(matchRes.error.message);
      if (playerRes.error) throw new Error(playerRes.error.message);

      setTournament(tourRes.data as TournamentRecord);
      setMatches((matchRes.data ?? []) as TournamentMatchRecord[]);
      setPlayers(
        (playerRes.data ?? []).map((row: any) => ({
          tournament_id: row.tournament_id,
          player_id: row.player_id,
          seed: row.seed,
          final_rank: row.final_rank,
          player: row.players as PlayerInfo,
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tournament');
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  // Initial load
  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Real-time subscription for tournament_matches changes
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const supabase = supabaseRef.current ?? await getSupabaseClient();
      supabaseRef.current = supabase;

      if (cancelled) return;

      const channel = supabase
        .channel(`tournament-${tournamentId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'tournament_matches',
            filter: `tournament_id=eq.${tournamentId}`,
          },
          () => {
            void loadAll();
          }
        )
        .subscribe();

      channelRef.current = channel;
    })();

    return () => {
      cancelled = true;
      if (channelRef.current && supabaseRef.current) {
        supabaseRef.current.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [tournamentId, loadAll]);

  const playerMap = useMemo(() => new Map(players.map((p) => [p.player_id, p.player])), [players]);

  return {
    loading,
    error,
    tournament,
    matches,
    players,
    playerMap,
    reload: loadAll,
  };
}
