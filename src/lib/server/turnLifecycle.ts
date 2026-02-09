import type { SupabaseClient } from '@supabase/supabase-js';

export type TurnSnapshot = {
  id: string;
  player_id: string;
  turn_number: number;
  busted: boolean;
  throws?: { dart_index: number }[];
};

export type TurnRow = {
  id: string;
  leg_id: string;
  player_id: string;
  turn_number: number;
  total_scored: number;
  busted: boolean;
  created_at?: string;
  match_id?: string;
};

export function isIncompleteTurn(turn: TurnSnapshot | null): boolean {
  if (!turn || turn.busted) return false;
  const throwCount = (turn.throws ?? []).length;
  return throwCount < 3;
}

export function isUniqueViolation(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === '23505') return true;
  const message = error.message?.toLowerCase() ?? '';
  return message.includes('duplicate key');
}

export async function getLatestTurnForLeg(supabase: SupabaseClient, legId: string): Promise<TurnSnapshot | null> {
  const { data } = await supabase
    .from('turns')
    .select(
      `
      id,
      player_id,
      turn_number,
      busted,
      throws:throws(dart_index)
    `
    )
    .eq('leg_id', legId)
    .order('turn_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as TurnSnapshot | null) ?? null;
}

export async function getTurnById(supabase: SupabaseClient, turnId: string): Promise<TurnRow | null> {
  const { data } = await supabase.from('turns').select('*').eq('id', turnId).maybeSingle();
  return (data as TurnRow | null) ?? null;
}

export async function resolveOrCreateTurnForPlayer(
  supabase: SupabaseClient,
  legId: string,
  playerId: string
): Promise<{ turn: TurnRow | TurnSnapshot } | { error: string; status: number }> {
  const latest = await getLatestTurnForLeg(supabase, legId);
  if (latest && latest.player_id === playerId && isIncompleteTurn(latest)) {
    const fullTurn = await getTurnById(supabase, latest.id);
    return { turn: fullTurn ?? latest };
  }

  // Race-tolerant create: concurrent callers can contend on turn_number uniqueness.
  for (let attempt = 0; attempt < 2; attempt++) {
    const lastTurn = attempt === 0 ? latest : await getLatestTurnForLeg(supabase, legId);
    const nextTurnNumber = (lastTurn?.turn_number ?? 0) + 1;

    const { data, error } = await supabase
      .from('turns')
      .insert({
        leg_id: legId,
        player_id: playerId,
        turn_number: nextTurnNumber,
        total_scored: 0,
        busted: false,
      })
      .select('*')
      .single();

    if (!error && data) {
      return { turn: data as TurnRow };
    }

    if (!isUniqueViolation(error)) {
      return { error: error?.message ?? 'Failed to create turn', status: 500 };
    }

    const latestAfterConflict = await getLatestTurnForLeg(supabase, legId);
    if (latestAfterConflict && latestAfterConflict.player_id === playerId && isIncompleteTurn(latestAfterConflict)) {
      const fullTurn = await getTurnById(supabase, latestAfterConflict.id);
      return { turn: fullTurn ?? latestAfterConflict };
    }
  }

  return { error: 'Failed to create turn due to concurrent updates', status: 409 };
}
