import { useEffect, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabaseClient';

export type MatchEloChange = {
  player_id: string;
  rating_before: number;
  rating_after: number;
  rating_change: number;
};

export function useMatchEloChanges(
  matchId: string,
  matchWinnerId: string | null,
  playerCount: number
) {
  const [eloChanges, setEloChanges] = useState<MatchEloChange[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!matchWinnerId) {
      setEloChanges([]);
      return;
    }

    let cancelled = false;

    async function fetchEloChanges() {
      setLoading(true);
      try {
        const supabase = await getSupabaseClient();
        const table = playerCount > 2 ? 'elo_ratings_multi' : 'elo_ratings';

        const { data, error } = await supabase
          .from(table)
          .select('player_id, rating_before, rating_after, rating_change')
          .eq('match_id', matchId);

        if (error) {
          console.error('Error fetching ELO changes:', error);
          if (!cancelled) setEloChanges([]);
          return;
        }

        if (!cancelled) {
          setEloChanges(data ?? []);
        }
      } catch (err) {
        console.error('Error fetching ELO changes:', err);
        if (!cancelled) setEloChanges([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchEloChanges();

    return () => {
      cancelled = true;
    };
  }, [matchId, matchWinnerId, playerCount]);

  return { eloChanges, loading };
}
