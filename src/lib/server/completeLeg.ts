import type { SupabaseClient } from '@supabase/supabase-js';
import type { MatchRow } from './matchGuards';

/**
 * Complete a leg: set the winner, check if the match is won, and either
 * create the next leg or finalise the match (with Elo updates).
 *
 * Contains an idempotency guard – if the leg already has a winner the
 * function returns early without side-effects.
 */
export async function completeLeg(
  supabase: SupabaseClient,
  matchId: string,
  legId: string,
  winnerPlayerId: string,
  match: MatchRow
): Promise<{ matchCompleted: boolean }> {
  // ── Idempotency guard ──────────────────────────────────────────────
  const { data: leg } = await supabase
    .from('legs')
    .select('id, match_id, starting_player_id, winner_player_id')
    .eq('id', legId)
    .single();

  if (!leg || leg.match_id !== matchId) {
    throw new Error('Leg not found for match');
  }

  if (leg.winner_player_id) {
    // Already completed – return current match state without re-processing.
    return { matchCompleted: !!match.completed_at };
  }

  // ── Set leg winner (conditional on winner still being null) ─────────
  const { error: legErr, count } = await supabase
    .from('legs')
    .update({ winner_player_id: winnerPlayerId }, { count: 'exact' })
    .eq('id', legId)
    .is('winner_player_id', null);

  if (legErr) throw new Error(legErr.message);
  if (count === 0) {
    // Another concurrent request already completed this leg
    return { matchCompleted: !!match.completed_at };
  }

  // ── Load legs + match players ──────────────────────────────────────
  const [{ data: allLegs, error: listErr }, { data: mpData, error: mpErr }] =
    await Promise.all([
      supabase.from('legs').select('*').eq('match_id', matchId),
      supabase
        .from('match_players')
        .select('player_id, play_order')
        .eq('match_id', matchId)
        .order('play_order'),
    ]);

  if (listErr || !allLegs) throw new Error(listErr?.message ?? 'Failed to load legs');
  if (mpErr || !mpData) throw new Error(mpErr?.message ?? 'Failed to load match players');

  // ── Check if someone won the match ─────────────────────────────────
  const wonCounts = (allLegs as { winner_player_id: string | null }[]).reduce<
    Record<string, number>
  >((acc, l) => {
    if (l.winner_player_id) acc[l.winner_player_id] = (acc[l.winner_player_id] || 0) + 1;
    return acc;
  }, {});

  const target = match.legs_to_win;
  const someoneWonMatch = Object.entries(wonCounts).find(([, c]) => c >= target);

  if (!someoneWonMatch) {
    // ── Create next leg with rotated starting player ─────────────────
    const orderedPlayerIds = (mpData as { player_id: string; play_order: number }[]).map(
      (r) => r.player_id
    );
    const currentIdx = orderedPlayerIds.findIndex((id) => id === leg.starting_player_id);
    const nextIdx = currentIdx >= 0 ? (currentIdx + 1) % orderedPlayerIds.length : 0;
    const nextStarterId = orderedPlayerIds[nextIdx] ?? winnerPlayerId;

    const nextLegNumber = (allLegs ?? []).length + 1;
    const { error: insErr } = await supabase
      .from('legs')
      .insert({ match_id: matchId, leg_number: nextLegNumber, starting_player_id: nextStarterId });
    if (insErr) throw new Error(insErr.message);

    return { matchCompleted: false };
  }

  // ── Match won – set winner + completed_at ──────────────────────────
  const [winnerPid] = someoneWonMatch;
  const { error: setWinnerErr } = await supabase
    .from('matches')
    .update({ winner_player_id: winnerPid, completed_at: new Date().toISOString() })
    .eq('id', matchId);
  if (setWinnerErr) throw new Error(setWinnerErr.message);

  // ── Elo update ─────────────────────────────────────────────────────
  const playerIds = (mpData as { player_id: string }[]).map((r) => r.player_id);
  if (playerIds.length === 2) {
    const loserId = playerIds.find((id) => id !== winnerPid);
    if (loserId) {
      const { error } = await supabase.rpc('update_elo_ratings', {
        p_match_id: matchId,
        p_winner_id: winnerPid,
        p_loser_id: loserId,
        p_k_factor: 32,
      });
      if (error) console.error('ELO update error:', error);
    }
  } else if (playerIds.length > 2) {
    const results = playerIds.map((id) => ({ id, rank: id === winnerPid ? 1 : 2 }));
    const { error } = await supabase.rpc('update_elo_ratings_multiplayer', {
      p_match_id: matchId,
      p_player_ids: results.map((r) => r.id),
      p_ranks: results.map((r) => r.rank),
      p_k_factor: 32,
    });
    if (error) console.error('Multiplayer ELO update error:', error);
  }

  return { matchCompleted: true };
}
