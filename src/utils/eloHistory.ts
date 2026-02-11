import { getSupabaseClient } from '@/lib/supabaseClient';

/**
 * Fetch ELO rating history for multiple players (1v1) in a single query.
 * Returns a Map from player_id to an array of rating_after values in chronological order.
 */
export async function batchEloHistory(
  playerIds: string[],
  limit = 20
): Promise<Map<string, number[]>> {
  if (playerIds.length === 0) return new Map();

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
