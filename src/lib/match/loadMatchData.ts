import type { SupabaseClient } from '@supabase/supabase-js';

import type { LegRecord, MatchPlayersRow, MatchRecord, Player, TurnRecord, TurnWithThrows } from './types';

export type MatchLoadResult = {
  match: MatchRecord | null;
  players: Player[];
  legs: LegRecord[];
  turns: TurnRecord[]; // current leg only (objects may include `throws`)
  turnThrowCounts: Record<string, number>;
  turnsByLeg: Record<string, TurnRecord[]>;
};

export type LoadMatchDataOptions = {
  includeTurnsByLegSummary?: boolean;
};

export async function loadMatchData(
  supabase: SupabaseClient,
  matchId: string,
  options: LoadMatchDataOptions = {}
): Promise<MatchLoadResult> {
  const includeTurnsByLegSummary = options.includeTurnsByLegSummary ?? true;
  const [
    { data: m, error: matchError },
    { data: mp, error: matchPlayersError },
    { data: lgs, error: legsError },
  ] = await Promise.all([
    supabase.from('matches').select('*').eq('id', matchId).single(),
    supabase
      .from('match_players')
      .select('*, players:player_id(*)')
      .eq('match_id', matchId)
      .order('play_order'),
    supabase.from('legs').select('*').eq('match_id', matchId).order('leg_number'),
  ]);

  if (matchError) throw matchError;
  if (matchPlayersError) throw matchPlayersError;
  if (legsError) throw legsError;

  const match = (m ?? null) as MatchRecord | null;
  const players = (((mp as MatchPlayersRow[] | null) ?? []).map((r) => r.players) ?? []) as Player[];
  const legs = ((lgs ?? []) as LegRecord[]) ?? [];

  const currentLeg = legs.find((l) => !l.winner_player_id) || legs[legs.length - 1] || null;
  const legIds = includeTurnsByLegSummary ? legs.map((l) => l.id) : [];

  const [{ data: currentLegTurns, error: currentLegTurnsError }, { data: allTurns, error: allTurnsError }] =
    await Promise.all([
      currentLeg
        ? supabase
            .from('turns')
            .select(
              `
            *,
            throws:throws(id, turn_id, dart_index, segment, scored)
          `
            )
            .eq('leg_id', currentLeg.id)
            .order('turn_number')
        : Promise.resolve({ data: null as TurnWithThrows[] | null, error: null as unknown }),
      legIds.length > 0
        ? supabase.from('turns').select('*').in('leg_id', legIds).order('turn_number')
        : Promise.resolve({ data: null as TurnRecord[] | null, error: null as unknown }),
    ]);

  if (currentLegTurnsError) throw currentLegTurnsError;
  if (allTurnsError) throw allTurnsError;

  const turns = currentLeg
    ? (((currentLegTurns ?? []) as TurnWithThrows[]).sort((a, b) => a.turn_number - b.turn_number) as unknown as TurnRecord[])
    : ([] as TurnRecord[]);

  const turnThrowCounts: Record<string, number> = {};
  for (const turn of turns as unknown as TurnWithThrows[]) {
    turnThrowCounts[turn.id] = (turn.throws ?? []).length;
  }

  const turnsByLeg: Record<string, TurnRecord[]> = {};
  for (const t of ((allTurns ?? []) as TurnRecord[])) {
    if (!turnsByLeg[t.leg_id]) turnsByLeg[t.leg_id] = [];
    turnsByLeg[t.leg_id].push(t);
  }

  return { match, players, legs, turns, turnThrowCounts, turnsByLeg };
}
