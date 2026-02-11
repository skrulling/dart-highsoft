import { getSupabaseClient } from '@/lib/supabaseClient';

type RecentEloTrendRow = {
  player_id: string;
  last_20_ratings: number[] | null;
};

async function fetchRecentTrendFromRpc(
  functionName: 'get_player_recent_elo_trend' | 'get_player_recent_elo_multi_trend',
  playerIds: string[]
): Promise<Map<string, number[]>> {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .rpc(functionName, {
      p_player_ids: playerIds,
      p_limit: 20,
    })
    .select('player_id, last_20_ratings');

  if (error) {
    throw error;
  }

  const map = new Map<string, number[]>();
  for (const row of (data as RecentEloTrendRow[] | null) ?? []) {
    map.set(row.player_id, row.last_20_ratings ?? []);
  }
  return map;
}

/**
 * Fetch ELO rating history for multiple players (1v1) in a single query.
 * Returns a Map from player_id to an array of rating_after values in chronological order.
 */
export async function batchEloHistory(
  playerIds: string[],
  limit = 20
): Promise<Map<string, number[]>> {
  if (playerIds.length === 0) return new Map();

  if (limit === 20) {
    try {
      return await fetchRecentTrendFromRpc('get_player_recent_elo_trend', playerIds);
    } catch (error) {
      console.error('Error fetching recent ELO trend via RPC:', error);
    }
  }

  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('elo_ratings')
    .select('player_id, rating_after, created_at')
    .in('player_id', playerIds)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching batch ELO history:', error);
    return new Map();
  }

  const map = new Map<string, number[]>();
  for (const row of data ?? []) {
    if (!map.has(row.player_id)) map.set(row.player_id, []);
    map.get(row.player_id)!.push(row.rating_after);
  }

  // Trim each player's history to the last `limit` entries
  for (const [id, ratings] of map) {
    if (ratings.length > limit) {
      map.set(id, ratings.slice(-limit));
    }
  }

  return map;
}

/**
 * Fetch multiplayer ELO rating history for multiple players in a single query.
 * Returns a Map from player_id to an array of rating_after values in chronological order.
 */
export async function batchMultiEloHistory(
  playerIds: string[],
  limit = 20
): Promise<Map<string, number[]>> {
  if (playerIds.length === 0) return new Map();

  if (limit === 20) {
    try {
      return await fetchRecentTrendFromRpc('get_player_recent_elo_multi_trend', playerIds);
    } catch (error) {
      console.error('Error fetching recent multi ELO trend via RPC:', error);
    }
  }

  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('elo_ratings_multi')
    .select('player_id, rating_after, created_at')
    .in('player_id', playerIds)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching batch multi ELO history:', error);
    return new Map();
  }

  const map = new Map<string, number[]>();
  for (const row of data ?? []) {
    if (!map.has(row.player_id)) map.set(row.player_id, []);
    map.get(row.player_id)!.push(row.rating_after);
  }

  // Trim each player's history to the last `limit` entries
  for (const [id, ratings] of map) {
    if (ratings.length > limit) {
      map.set(id, ratings.slice(-limit));
    }
  }

  return map;
}
