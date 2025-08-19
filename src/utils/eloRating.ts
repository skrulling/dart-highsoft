import { getSupabaseClient } from '@/lib/supabaseClient';

export type EloRating = {
  id: string;
  player_id: string;
  match_id: string;
  rating_before: number;
  rating_after: number;
  rating_change: number;
  opponent_id: string;
  opponent_rating_before: number;
  is_winner: boolean;
  created_at: string;
};

export type PlayerEloStats = {
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

export type EloLeaderboardEntry = {
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

export type RecentEloChange = {
  id: string;
  player_id: string;
  player_name: string;
  rating_before: number;
  rating_after: number;
  rating_change: number;
  opponent_id: string;
  opponent_name: string;
  opponent_rating_before: number;
  is_winner: boolean;
  match_id: string;
  created_at: string;
};

/**
 * Calculate expected score for ELO rating (probability of winning)
 */
export function calculateExpectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * Calculate new ELO ratings after a match
 */
export function calculateNewEloRatings(
  winnerRating: number,
  loserRating: number,
  kFactor: number = 32
): { newWinnerRating: number; newLoserRating: number; winnerChange: number; loserChange: number } {
  const expectedWinner = calculateExpectedScore(winnerRating, loserRating);
  const expectedLoser = calculateExpectedScore(loserRating, winnerRating);
  
  const winnerChange = Math.round(kFactor * (1 - expectedWinner));
  const loserChange = Math.round(kFactor * (0 - expectedLoser));
  
  const newWinnerRating = Math.max(100, winnerRating + winnerChange);
  const newLoserRating = Math.max(100, loserRating + loserChange);
  
  return {
    newWinnerRating,
    newLoserRating,
    winnerChange,
    loserChange
  };
}

/**
 * Update ELO ratings after a match completion
 */
export async function updateMatchEloRatings(
  matchId: string,
  winnerId: string,
  loserId: string,
  kFactor: number = 32
): Promise<void> {
  const supabase = await getSupabaseClient();
  
  // Call the database function to update ratings
  const { error } = await supabase.rpc('update_elo_ratings', {
    p_match_id: matchId,
    p_winner_id: winnerId,
    p_loser_id: loserId,
    p_k_factor: kFactor
  });
  
  if (error) {
    console.error('Error updating ELO ratings:', error);
    throw error;
  }
}

/**
 * Get player ELO statistics
 */
export async function getPlayerEloStats(playerId: string): Promise<PlayerEloStats | null> {
  const supabase = await getSupabaseClient();
  
  const { data, error } = await supabase
    .from('player_elo_stats')
    .select('*')
    .eq('player_id', playerId)
    .single();
    
  if (error) {
    console.error('Error fetching player ELO stats:', error);
    return null;
  }
  
  return data;
}

/**
 * Get ELO leaderboard
 */
export async function getEloLeaderboard(limit: number = 50): Promise<EloLeaderboardEntry[]> {
  const supabase = await getSupabaseClient();
  
  const { data, error } = await supabase
    .from('elo_leaderboard')
    .select('*')
    .limit(limit);
    
  if (error) {
    console.error('Error fetching ELO leaderboard:', error);
    return [];
  }
  
  return data || [];
}

/**
 * Get player's ELO rating history
 */
export async function getPlayerEloHistory(
  playerId: string,
  limit: number = 20
): Promise<EloRating[]> {
  const supabase = await getSupabaseClient();
  
  const { data, error } = await supabase
    .from('elo_ratings')
    .select('*')
    .eq('player_id', playerId)
    .order('created_at', { ascending: false })
    .limit(limit);
    
  if (error) {
    console.error('Error fetching player ELO history:', error);
    return [];
  }
  
  return data || [];
}

/**
 * Get recent ELO changes across all players
 */
export async function getRecentEloChanges(limit: number = 20): Promise<RecentEloChange[]> {
  const supabase = await getSupabaseClient();
  
  const { data, error } = await supabase
    .from('recent_elo_changes')
    .select('*')
    .limit(limit);
    
  if (error) {
    console.error('Error fetching recent ELO changes:', error);
    return [];
  }
  
  return data || [];
}

/**
 * Get ELO rating tier name based on rating
 */
export function getEloTier(rating: number): { name: string; color: string; icon: string } {
  if (rating >= 2400) return { name: 'Grand Master', color: 'text-purple-600 dark:text-purple-400', icon: '👑' };
  if (rating >= 2200) return { name: 'Master', color: 'text-red-600 dark:text-red-400', icon: '💎' };
  if (rating >= 2000) return { name: 'Expert', color: 'text-orange-600 dark:text-orange-400', icon: '🥇' };
  if (rating >= 1800) return { name: 'Advanced', color: 'text-yellow-600 dark:text-yellow-400', icon: '🥈' };
  if (rating >= 1600) return { name: 'Intermediate', color: 'text-green-600 dark:text-green-400', icon: '🥉' };
  if (rating >= 1400) return { name: 'Novice', color: 'text-blue-600 dark:text-blue-400', icon: '📈' };
  if (rating >= 1200) return { name: 'Beginner', color: 'text-gray-600 dark:text-gray-400', icon: '🎯' };
  return { name: 'Unrated', color: 'text-gray-500 dark:text-gray-500', icon: '❓' };
}

/**
 * Format ELO rating change with appropriate styling
 */
export function formatEloChange(change: number): { text: string; color: string } {
  if (change > 0) {
    return { 
      text: `+${change}`, 
      color: 'text-green-600 dark:text-green-400' 
    };
  } else if (change < 0) {
    return { 
      text: change.toString(), 
      color: 'text-red-600 dark:text-red-400' 
    };
  } else {
    return { 
      text: '0', 
      color: 'text-gray-600 dark:text-gray-400' 
    };
  }
}

/**
 * Check if a match should be rated (only 1v1 matches for now)
 */
export function shouldMatchBeRated(playerCount: number): boolean {
  return playerCount === 2;
}