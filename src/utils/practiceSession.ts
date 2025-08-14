import { getSupabaseClient } from '@/lib/supabaseClient';
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
  const supabase = await getSupabaseClient();
  
  const { data, error } = await supabase
    .from('practice_sessions')
    .insert({
      player_id: playerId,
      start_score: startScore,
      finish_rule: finishRule,
      session_goal: sessionGoal,
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

export async function getActivePracticeSession(playerId: string): Promise<PracticeSession | null> {
  const supabase = await getSupabaseClient();
  
  const { data, error } = await supabase
    .from('practice_sessions')
    .select('*')
    .eq('player_id', playerId)
    .eq('is_active', true)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function endPracticeSession(sessionId: string, notes?: string): Promise<void> {
  const supabase = await getSupabaseClient();
  
  const { error } = await supabase
    .from('practice_sessions')
    .update({
      ended_at: new Date().toISOString(),
      is_active: false,
      notes,
    })
    .eq('id', sessionId);

  if (error) throw error;
}

export async function addPracticeThrow(
  sessionId: string,
  segment: SegmentResult,
  dartIndex: number,
  currentTurn?: PracticeTurn
): Promise<{ turn: PracticeTurn; throw: PracticeThrow; turnCompleted: boolean }> {
  const supabase = await getSupabaseClient();
  
  // Get current turn or create new one
  let turn = currentTurn;
  if (!turn) {
    // Get next turn number
    const { data: lastTurn } = await supabase
      .from('practice_turns')
      .select('turn_number')
      .eq('session_id', sessionId)
      .order('turn_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    const nextTurnNumber = (lastTurn?.turn_number || 0) + 1;
    
    // Create new turn - no score tracking, just turn metrics
    const { data: newTurn, error: turnError } = await supabase
      .from('practice_turns')
      .insert({
        session_id: sessionId,
        turn_number: nextTurnNumber,
        score_before: 0, // Not used in practice mode
        total_scored: 0,
        score_after: 0, // Not used in practice mode  
        busted: false, // Not used in practice mode
        finished: false, // Not used in practice mode
      })
      .select()
      .single();
    
    if (turnError) throw turnError;
    turn = newTurn;
  }

  if (!turn) {
    throw new Error('Failed to create or find turn for practice throw');
  }

  // Add throw
  const { data: practiceThrow, error: throwError } = await supabase
    .from('practice_throws')
    .insert({
      turn_id: turn.id,
      dart_index: dartIndex,
      segment: segment.label,
      scored: segment.scored,
    })
    .select()
    .single();

  if (throwError) throw throwError;

  // Calculate new turn totals
  const newTotalScored = turn.total_scored + segment.scored;
  const turnCompleted = dartIndex === 3; // Turn completed after 3rd dart

  // Update turn
  const { data: updatedTurn, error: updateError } = await supabase
    .from('practice_turns')
    .update({
      total_scored: newTotalScored,
      finished: turnCompleted,
    })
    .eq('id', turn.id)
    .select()
    .single();

  if (updateError) throw updateError;

  return {
    turn: updatedTurn,
    throw: practiceThrow,
    turnCompleted,
  };
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

