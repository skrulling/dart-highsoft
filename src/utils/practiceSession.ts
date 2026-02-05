import { getSupabaseClient } from '@/lib/supabaseClient';
import { apiRequest } from '@/lib/apiClient';
import { SegmentResult } from './dartboard';

export type PracticeSession = {
  id: string;
  player_id: string;
  start_score: number;
  finish_rule: 'single_out' | 'double_out';
  session_goal?: string;
  notes?: string;
  started_at: string;
  ended_at?: string;
  is_active: boolean;
};

export type PracticeTurn = {
  id: string;
  session_id: string;
  turn_number: number;
  score_before: number;
  total_scored: number;
  score_after: number;
  busted: boolean;
  finished: boolean;
  created_at: string;
};

export type PracticeThrow = {
  id: string;
  turn_id: string;
  dart_index: number;
  segment: string;
  scored: number;
};

export type PracticeSessionStats = {
  session_id: string;
  player_id: string;
  started_at: string;
  ended_at?: string;
  is_active: boolean;
  total_turns: number;
  avg_turn_score: number;
  max_turn_score: number;
  tons: number;
  high_finishes: number;
  busts: number;
  games_finished: number;
};

export async function createPracticeSession(
  playerId: string,
  startScore: number = 501,
  finishRule: 'single_out' | 'double_out' = 'double_out',
  sessionGoal?: string
): Promise<string> {
  const result = await apiRequest<{ sessionId: string }>('/api/practice/sessions', {
    body: { playerId, startScore, finishRule, sessionGoal },
  });
  return result.sessionId;
}

export async function getActivePracticeSession(playerId: string): Promise<PracticeSession | null> {
  const supabase = await getSupabaseClient();
  
  const { data, error } = await supabase
    .from('practice_sessions')
    .select('*')
    .eq('player_id', playerId)
    .eq('is_active', true)
    .eq('is_cancelled', false)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function endPracticeSession(sessionId: string, notes?: string): Promise<void> {
  await apiRequest('/api/practice/sessions/' + sessionId + '/end', { method: 'PATCH', body: { notes } });
}

export async function addPracticeThrow(
  sessionId: string,
  segment: SegmentResult,
  dartIndex: number
): Promise<{ turn: PracticeTurn; throw: PracticeThrow; turnCompleted: boolean }> {
  const result = await apiRequest<{ turn: PracticeTurn; throw: PracticeThrow; turnCompleted: boolean }>(
    `/api/practice/sessions/${sessionId}/throws`,
    { body: { segment: segment.label, scored: segment.scored, dartIndex } }
  );
  return result;
}

export async function getPracticeSessionTurns(sessionId: string): Promise<PracticeTurn[]> {
  const supabase = await getSupabaseClient();
  
  const { data, error } = await supabase
    .from('practice_turns')
    .select('*')
    .eq('session_id', sessionId)
    .order('turn_number', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function getPracticeSessionStats(sessionId: string): Promise<PracticeSessionStats | null> {
  const supabase = await getSupabaseClient();
  
  const { data, error } = await supabase
    .from('practice_session_stats')
    .select('*')
    .eq('session_id', sessionId)
    .single();

  if (error) throw error;
  return data;
}

export async function getPlayerPracticeHistory(playerId: string, limit = 10): Promise<PracticeSessionStats[]> {
  const supabase = await getSupabaseClient();
  
  const { data, error } = await supabase
    .from('practice_session_stats')
    .select('*')
    .eq('player_id', playerId)
    .eq('is_active', false)
    .order('started_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

export async function getPlayerOverallPracticeStats(playerId: string) {
  const supabase = await getSupabaseClient();
  
  const { data, error } = await supabase
    .from('player_practice_stats')
    .select('*')
    .eq('player_id', playerId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}
