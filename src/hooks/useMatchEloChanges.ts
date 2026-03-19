import { useQuery } from '@tanstack/react-query';
import { getSupabaseClient } from '@/lib/supabaseClient';

export type MatchEloChange = {
  player_id: string;
  rating_before: number;
  rating_after: number;
  rating_change: number;
};

async function fetchMatchEloChanges(
  matchId: string,
  playerCount: number
): Promise<MatchEloChange[]> {
  const supabase = await getSupabaseClient();
  const table = playerCount > 2 ? 'elo_ratings_multi' : 'elo_ratings';

  const { data, error } = await supabase
    .from(table)
    .select('player_id, rating_before, rating_after, rating_change')
    .eq('match_id', matchId);

  if (error) {
    console.error('Error fetching ELO changes:', error);
    return [];
  }

  return data ?? [];
}

export function useMatchEloChanges(
  matchId: string,
  matchWinnerId: string | null,
  playerCount: number
) {
  const { data, isLoading } = useQuery({
    queryKey: ['matchEloChanges', matchId, playerCount],
    queryFn: () => fetchMatchEloChanges(matchId, playerCount),
    enabled: !!matchWinnerId,
  });

  return {
    eloChanges: data ?? [],
    loading: isLoading,
  };
}
