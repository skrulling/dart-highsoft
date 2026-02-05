import type { SupabaseClient } from '@supabase/supabase-js';

export type MatchRow = {
  id: string;
  winner_player_id: string | null;
  completed_at: string | null;
  ended_early: boolean;
  start_score: string;
  finish: 'single_out' | 'double_out';
  legs_to_win: number;
};

export async function loadMatch(supabase: SupabaseClient, matchId: string): Promise<MatchRow | null> {
  const { data, error } = await supabase
    .from('matches')
    .select('id, winner_player_id, completed_at, ended_early, start_score, finish, legs_to_win')
    .eq('id', matchId)
    .single();
  if (error || !data) return null;
  return data as MatchRow;
}

export function isMatchActive(match: MatchRow): boolean {
  return !match.ended_early && !match.winner_player_id && !match.completed_at;
}
