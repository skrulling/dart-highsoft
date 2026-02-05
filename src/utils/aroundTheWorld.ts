import { getSupabaseClient } from '@/lib/supabaseClient';
import { apiRequest } from '@/lib/apiClient';

export type AroundWorldVariant = 'single' | 'double';

export type AroundWorldSession = {
  id: string;
  player_id: string;
  variant: AroundWorldVariant;
  started_at: string;
  completed_at?: string;
  duration_seconds?: number;
  is_completed: boolean;
};

export type AroundWorldSessionStats = {
  session_id: string;
  player_id: string;
  variant: AroundWorldVariant;
  started_at: string;
  completed_at?: string;
  duration_seconds?: number;
  is_completed: boolean;
  rank_in_variant?: number;
  previous_avg_seconds?: number;
};

export type PlayerAroundWorldStats = {
  player_id: string;
  display_name: string;
  single_sessions_completed: number;
  single_best_time?: number;
  single_avg_time?: number;
  double_sessions_completed: number;
  double_best_time?: number;
  double_avg_time?: number;
  total_completed_sessions: number;
  total_sessions: number;
};

// Create a new Around the World session
export async function createAroundWorldSession(
  playerId: string, 
  variant: AroundWorldVariant
): Promise<AroundWorldSession> {
  const result = await apiRequest<{ session: AroundWorldSession }>('/api/around-world/sessions', {
    body: { playerId, variant },
  });
  return result.session;
}

// Complete an Around the World session
export async function completeAroundWorldSession(sessionId: string): Promise<AroundWorldSession> {
  await apiRequest(`/api/around-world/sessions/${sessionId}/complete`, { method: 'PATCH' });
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('around_world_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();
  if (error) throw error;
  return data as AroundWorldSession;
}

// Get current active session for player
export async function getActiveAroundWorldSession(playerId: string): Promise<AroundWorldSession | null> {
  const supabase = await getSupabaseClient();
  
  const { data, error } = await supabase
    .from('around_world_sessions')
    .select('*')
    .eq('player_id', playerId)
    .eq('is_completed', false)
    .eq('is_cancelled', false)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// Get session with stats
export async function getAroundWorldSessionStats(sessionId: string): Promise<AroundWorldSessionStats | null> {
  const supabase = await getSupabaseClient();
  
  const { data, error } = await supabase
    .from('around_world_stats')
    .select('*')
    .eq('session_id', sessionId)
    .single();

  if (error) throw error;
  return data;
}

// Get player's Around the World history
export async function getPlayerAroundWorldHistory(
  playerId: string, 
  variant?: AroundWorldVariant,
  limit = 10
): Promise<AroundWorldSessionStats[]> {
  const supabase = await getSupabaseClient();
  
  let query = supabase
    .from('around_world_stats')
    .select('*')
    .eq('player_id', playerId)
    .eq('is_completed', true)
    .order('completed_at', { ascending: false })
    .limit(limit);
    
  if (variant) {
    query = query.eq('variant', variant);
  }
  
  const { data, error } = await query;

  if (error) throw error;
  return data || [];
}

// Get player's overall Around the World stats
export async function getPlayerAroundWorldStats(playerId: string): Promise<PlayerAroundWorldStats | null> {
  const supabase = await getSupabaseClient();
  
  const { data, error } = await supabase
    .from('player_around_world_stats')
    .select('*')
    .eq('player_id', playerId)
    .single();

  if (error) throw error;
  return data;
}

// Delete incomplete session (if user navigates away)
export async function cancelAroundWorldSession(sessionId: string): Promise<void> {
  await apiRequest(`/api/around-world/sessions/${sessionId}/cancel`, { method: 'PATCH' });
}

// Format duration in a human readable way
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

// Get improvement message based on previous performance
export function getImprovementMessage(
  currentTime: number,
  previousAvg?: number,
  bestTime?: number
): { type: 'excellent' | 'good' | 'slower' | 'first'; message: string } {
  if (previousAvg === undefined) {
    return { type: 'first', message: 'Great job completing your first session!' };
  }
  
  if (bestTime && currentTime <= bestTime) {
    return { type: 'excellent', message: '🎉 New personal best!' };
  }
  
  const improvement = previousAvg - currentTime;
  const improvementPercent = (improvement / previousAvg) * 100;
  
  if (improvement > 0) {
    if (improvementPercent >= 10) {
      return { type: 'excellent', message: `🔥 ${improvement.toFixed(1)}s faster than your average!` };
    } else {
      return { type: 'good', message: `⚡ ${improvement.toFixed(1)}s improvement!` };
    }
  } else {
    return { 
      type: 'slower', 
      message: `${Math.abs(improvement).toFixed(1)}s slower than average. Keep practicing!` 
    };
  }
}
