import type { SupabaseClient } from '@supabase/supabase-js';
import type { TournamentMatchRecord } from './types';

/**
 * Advance the tournament bracket after a match completes.
 *
 * - Sets winner/loser on the tournament_match
 * - Places winner in next_winner destination, loser in next_loser destination
 * - If a destination slot now has both players, creates a real match
 * - Handles grand final logic (WB champ advantage, reset match)
 * - Assigns final_rank to eliminated players
 * - Completes tournament when appropriate
 */
export async function advanceTournament(
  supabase: SupabaseClient,
  tournamentMatchId: string,
  winnerId: string,
  loserId: string
): Promise<{ tournamentCompleted: boolean }> {
  // ── Atomic conditional update: only proceed if winner not yet set ─
  // This prevents race conditions when two requests complete the same match.
  const { data: updated, error: updateErr } = await supabase
    .from('tournament_matches')
    .update({ winner_id: winnerId, loser_id: loserId })
    .eq('id', tournamentMatchId)
    .is('winner_id', null)
    .select('*')
    .single();

  if (updateErr || !updated) {
    // Either the match doesn't exist or another request already set the winner
    return { tournamentCompleted: false };
  }

  const tournamentMatch = updated as TournamentMatchRecord;

  // ── Grand Final special logic ────────────────────────────────────
  if (tournamentMatch.bracket === 'grand_final') {
    return handleGrandFinal(supabase, tournamentMatch, winnerId, loserId);
  }

  // ── Place winner in next_winner destination ──────────────────────
  if (tournamentMatch.next_winner_tm_id) {
    await placePlayerInSlot(supabase, tournamentMatch.next_winner_tm_id, winnerId, tournamentMatch.tournament_id);
  }

  // ── Place loser in next_loser destination or eliminate ────────────
  if (tournamentMatch.next_loser_tm_id) {
    await placePlayerInSlot(supabase, tournamentMatch.next_loser_tm_id, loserId, tournamentMatch.tournament_id);
  } else {
    // Eliminated — assign final_rank
    await assignFinalRank(supabase, tournamentMatch.tournament_id, loserId);
  }

  return { tournamentCompleted: false };
}

/**
 * Place a player into the first available slot (player1 or player2) of a destination match.
 * Uses conditional updates to prevent race conditions when two players arrive concurrently.
 * If both players are now present, creates a real match.
 */
async function placePlayerInSlot(
  supabase: SupabaseClient,
  destTmId: string,
  playerId: string,
  tournamentId: string
): Promise<void> {
  // Try player1 slot first (atomic: only if currently null)
  const { data: p1Result } = await supabase
    .from('tournament_matches')
    .update({ player1_id: playerId })
    .eq('id', destTmId)
    .is('player1_id', null)
    .select('id')
    .maybeSingle();

  if (!p1Result) {
    // player1 was already taken — try player2 slot
    const { data: p2Result } = await supabase
      .from('tournament_matches')
      .update({ player2_id: playerId })
      .eq('id', destTmId)
      .is('player2_id', null)
      .select('id')
      .maybeSingle();

    if (!p2Result) {
      // Both slots already filled — shouldn't happen
      return;
    }
  }

  // Re-read the row to get the current state (both slots may now be filled)
  const { data: dest } = await supabase
    .from('tournament_matches')
    .select('*')
    .eq('id', destTmId)
    .single();

  if (!dest) return;
  const destMatch = dest as TournamentMatchRecord;

  if (destMatch.player1_id && destMatch.player2_id && !destMatch.match_id && !destMatch.winner_id) {
    await createMatchForSlot(supabase, destTmId, destMatch.player1_id, destMatch.player2_id, tournamentId);
  } else if (
    (destMatch.player1_id || destMatch.player2_id) &&
    !(destMatch.player1_id && destMatch.player2_id) &&
    !destMatch.match_id &&
    !destMatch.winner_id
  ) {
    // Only one player present — check if more will arrive
    await autoAdvanceIfBye(supabase, destTmId, destMatch, tournamentId);
  }
}

/**
 * Check if a slot with a single player will never receive a second player.
 * If so, auto-advance the lone player as a bye winner.
 */
async function autoAdvanceIfBye(
  supabase: SupabaseClient,
  tmId: string,
  tm: TournamentMatchRecord,
  tournamentId: string
): Promise<void> {
  const { data: currentTm, error: tmErr } = await supabase
    .from('tournament_matches')
    .select('*')
    .eq('id', tmId)
    .single();

  if (tmErr || !currentTm) return;
  if (
    currentTm.winner_id ||
    currentTm.match_id ||
    (currentTm.player1_id && currentTm.player2_id)
  ) {
    return;
  }

  // Find feeders that can still place a player in this slot.
  // This includes already-resolved feeders whose player has not been placed yet.
  const { data: feeders, error: feederErr } = await supabase
    .from('tournament_matches')
    .select('id, next_winner_tm_id, next_loser_tm_id, winner_id, loser_id, is_bye')
    .or(`next_winner_tm_id.eq.${tmId},next_loser_tm_id.eq.${tmId}`);

  if (feederErr || !feeders) return;

  const pendingFeeders = feeders.filter((feeder) => {
    const isWinnerPath = feeder.next_winner_tm_id === tmId;
    const incomingPlayerId = isWinnerPath ? feeder.winner_id : feeder.loser_id;

    if (incomingPlayerId) {
      const alreadyPlaced =
        currentTm.player1_id === incomingPlayerId || currentTm.player2_id === incomingPlayerId;
      return !alreadyPlaced;
    }

    // Bye matches never produce a loser, so next_loser feeders from byes are not pending.
    if (!isWinnerPath && feeder.is_bye) return false;
    return true;
  });

  if (pendingFeeders.length > 0) return;

  const soloPlayerId = currentTm.player1_id || currentTm.player2_id;
  if (!soloPlayerId) return;

  // Mark as bye and set winner (atomic)
  const { data: updated } = await supabase
    .from('tournament_matches')
    .update({ winner_id: soloPlayerId, is_bye: true })
    .eq('id', tmId)
    .is('winner_id', null)
    .select('*')
    .maybeSingle();

  if (!updated) return; // Already resolved by another request
  const byeMatch = updated as TournamentMatchRecord;

  // Advance winner to next destination
  if (byeMatch.next_winner_tm_id) {
    await placePlayerInSlot(supabase, byeMatch.next_winner_tm_id, soloPlayerId, tournamentId);
  }

  // Byes don't produce losers — but if there's a loser destination,
  // check if it now has a lone player that should also auto-advance
  if (byeMatch.next_loser_tm_id) {
    const { data: loserDest } = await supabase
      .from('tournament_matches')
      .select('*')
      .eq('id', byeMatch.next_loser_tm_id)
      .single();

    if (
      loserDest &&
      !loserDest.winner_id &&
      !loserDest.match_id &&
      (loserDest.player1_id || loserDest.player2_id) &&
      !(loserDest.player1_id && loserDest.player2_id)
    ) {
      await autoAdvanceIfBye(supabase, byeMatch.next_loser_tm_id, loserDest as TournamentMatchRecord, tournamentId);
    }
  }
}

/**
 * Create a real match for a tournament bracket slot that now has two players.
 */
async function createMatchForSlot(
  supabase: SupabaseClient,
  tournamentMatchId: string,
  player1Id: string,
  player2Id: string,
  tournamentId: string
): Promise<void> {
  // Load tournament to get game settings
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('*')
    .eq('id', tournamentId)
    .single();

  if (!tournament) return;

  // Create the match
  const { data: match, error: matchErr } = await supabase
    .from('matches')
    .insert({
      mode: 'x01',
      start_score: tournament.start_score,
      finish: tournament.finish,
      legs_to_win: tournament.legs_to_win,
      fair_ending: tournament.fair_ending,
      tournament_match_id: tournamentMatchId,
    })
    .select()
    .single();

  if (matchErr || !match) return;

  // Randomize player order
  const players = Math.random() < 0.5
    ? [player1Id, player2Id]
    : [player2Id, player1Id];

  // Create match_players
  await supabase.from('match_players').insert(
    players.map((pid, idx) => ({
      match_id: match.id,
      player_id: pid,
      play_order: idx,
    }))
  );

  // Create first leg
  await supabase.from('legs').insert({
    match_id: match.id,
    leg_number: 1,
    starting_player_id: players[0],
  });

  // Link match to tournament_match (atomic: only if no match linked yet)
  const { data: linked } = await supabase
    .from('tournament_matches')
    .update({ match_id: match.id })
    .eq('id', tournamentMatchId)
    .is('match_id', null)
    .select('id')
    .maybeSingle();

  if (!linked) {
    // Another concurrent call already created a match — clean up ours
    await supabase.from('legs').delete().eq('match_id', match.id);
    await supabase.from('match_players').delete().eq('match_id', match.id);
    await supabase.from('matches').delete().eq('id', match.id);
  }
}

/**
 * Handle grand final advancement.
 *
 * GF match 1 (round 1):
 *   - If WB champ (player1) wins → tournament complete
 *   - If LB champ (player2) wins → create reset match (round 2)
 *
 * GF reset (round 2):
 *   - Winner is tournament champion regardless
 */
async function handleGrandFinal(
  supabase: SupabaseClient,
  tm: TournamentMatchRecord,
  winnerId: string,
  loserId: string
): Promise<{ tournamentCompleted: boolean }> {
  if (tm.round === 1) {
    // GF match 1
    // player1 = WB champion, player2 = LB champion
    if (winnerId === tm.player1_id) {
      // WB champion wins — tournament complete
      await completeTournament(supabase, tm.tournament_id, winnerId, loserId);
      return { tournamentCompleted: true };
    } else {
      // LB champion wins — need a reset match
      // Find the GF reset slot (round 2)
      const { data: allGf } = await supabase
        .from('tournament_matches')
        .select('*')
        .eq('tournament_id', tm.tournament_id)
        .eq('bracket', 'grand_final')
        .eq('round', 2)
        .single();

      if (allGf) {
        // Set both players in the reset match
        await supabase
          .from('tournament_matches')
          .update({
            player1_id: tm.player1_id, // WB champ
            player2_id: tm.player2_id, // LB champ
          })
          .eq('id', allGf.id);

        // Create the actual match
        await createMatchForSlot(
          supabase,
          allGf.id,
          tm.player1_id!,
          tm.player2_id!,
          tm.tournament_id
        );
      }

      return { tournamentCompleted: false };
    }
  } else {
    // GF reset match (round 2) — winner takes it all
    await completeTournament(supabase, tm.tournament_id, winnerId, loserId);
    return { tournamentCompleted: true };
  }
}

/**
 * Mark tournament as completed and assign final ranks 1 and 2.
 */
async function completeTournament(
  supabase: SupabaseClient,
  tournamentId: string,
  winnerId: string,
  runnerUpId: string
): Promise<void> {
  await supabase
    .from('tournaments')
    .update({
      status: 'completed',
      winner_player_id: winnerId,
      completed_at: new Date().toISOString(),
    })
    .eq('id', tournamentId);

  // Assign final ranks
  await supabase
    .from('tournament_players')
    .update({ final_rank: 1 })
    .eq('tournament_id', tournamentId)
    .eq('player_id', winnerId);

  await supabase
    .from('tournament_players')
    .update({ final_rank: 2 })
    .eq('tournament_id', tournamentId)
    .eq('player_id', runnerUpId);
}

/**
 * Assign a final rank to an eliminated player.
 * Rank = total players - number already eliminated.
 */
async function assignFinalRank(
  supabase: SupabaseClient,
  tournamentId: string,
  playerId: string
): Promise<void> {
  const { error } = await supabase.rpc('assign_elimination_rank', {
    p_tournament_id: tournamentId,
    p_player_id: playerId,
  });
  if (error) {
    console.error('Failed to assign elimination rank:', error);
  }
}
