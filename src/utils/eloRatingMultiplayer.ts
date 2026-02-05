import { getSupabaseClient } from '@/lib/supabaseClient';
import { apiRequest } from '@/lib/apiClient';

export type MultiEloRating = {
  id: string;
  player_id: string;
  match_id: string;
  rating_before: number;
  rating_after: number;
  rating_change: number;
  field_size: number;
  rank: number;
  expected_score: number;
  observed_score: number;
  created_at: string;
};

export type PlayerMultiEloStats = {
  player_id: string;
  display_name: string;
  current_rating: number;
  total_rated_matches: number;
  wins: number;
  losses: number;
  win_percentage: number;
  peak_rating?: number;
  lowest_rating?: number;
  latest_rating: number;
};

export type MultiEloLeaderboardEntry = {
  player_id: string;
  display_name: string;
  current_rating: number;
  total_rated_matches: number;
  wins: number;
  losses: number;
  win_percentage: number;
  peak_rating?: number;
  rank: number;
};

export type RecentMultiEloChange = {
  id: string;
  player_id: string;
  player_name: string;
  rating_before: number;
  rating_after: number;
  rating_change: number;
  match_id: string;
  field_size: number;
  rank: number;
  expected_score: number;
  observed_score: number;
  created_at: string;
};

export type MultiplayerResult = {
  playerId: string;
  rank: number; // 1 = first; ties share rank
};

/**
 * Update multiplayer Elo ratings for a match.
 * Pass players and their finish ranks (1 = winner; ties share rank).
 */
export async function updateMatchEloRatingsMultiplayer(
  matchId: string,
  results: MultiplayerResult[],
  kFactor: number = 32
): Promise<void> {
  if (!results || results.length < 2) return;

  const sorted = [...results].sort((a, b) => a.rank - b.rank);
  const playerIds = sorted.map(r => r.playerId);
  const ranks = sorted.map(r => r.rank);
  await apiRequest('/api/elo-multi/update', {
    body: { matchId, playerIds, ranks, kFactor },
  });
}

export async function getPlayerMultiEloStats(playerId: string): Promise<PlayerMultiEloStats | null> {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('player_elo_stats_multi')
    .select('*')
    .eq('player_id', playerId)
    .single();

  if (error) {
    console.error('Error fetching player multiplayer Elo stats:', error);
    return null;
  }
  return data;
}

export async function getMultiEloLeaderboard(limit: number = 50): Promise<MultiEloLeaderboardEntry[]> {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('elo_leaderboard_multi')
    .select('*')
    .gt('wins', 0)
    .limit(limit);
  if (error) {
    console.error('Error fetching multiplayer Elo leaderboard:', error);
    return [];
  }
  return data || [];
}

export async function getPlayerMultiEloHistory(
  playerId: string,
  limit: number = 20
): Promise<MultiEloRating[]> {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('elo_ratings_multi')
    .select('*')
    .eq('player_id', playerId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('Error fetching multiplayer Elo history:', error);
    return [] as MultiEloRating[];
  }
  return data || [];
}

export async function getRecentMultiEloChanges(limit: number = 20): Promise<RecentMultiEloChange[]> {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('recent_elo_changes_multi')
    .select('*')
    .limit(limit);
  if (error) {
    console.error('Error fetching recent multiplayer Elo changes:', error);
    return [];
  }
  return data || [];
}

export function shouldMatchBeRatedMultiplayer(playerCount: number): boolean {
  return playerCount > 2;
}
