import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { generateBracket } from '@/lib/tournament/bracket';
import { fisherYatesShuffle } from '@/lib/tournament/shuffle';

async function cleanupTournament(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  tournamentId: string
) {
  const { data: tournamentMatches } = await supabase
    .from('tournament_matches')
    .select('id')
    .eq('tournament_id', tournamentId);

  const tournamentMatchIds = (tournamentMatches ?? [])
    .map((row) => row.id)
    .filter((id): id is string => typeof id === 'string');

  if (tournamentMatchIds.length > 0) {
    // Remove linked matches first so matches.tournament_match_id doesn't block tournament cleanup.
    await supabase.from('matches').delete().in('tournament_match_id', tournamentMatchIds);
  }

  // Nullify self-referential FKs before cascade delete
  await supabase
    .from('tournament_matches')
    .update({ next_winner_tm_id: null, next_loser_tm_id: null })
    .eq('tournament_id', tournamentId);
  await supabase.from('tournaments').delete().eq('id', tournamentId);
}

type CreateTournamentRequest = {
  name: string;
  startScore: 201 | 301 | 501;
  finishRule: 'single_out' | 'double_out';
  legsToWin: number;
  fairEnding?: boolean;
  playerIds: string[];
};

export async function POST(request: Request) {
  const supabase = getSupabaseServerClient();
  let tournamentId: string | null = null;

  try {
    const body = (await request.json()) as CreateTournamentRequest;

    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'Tournament name is required' }, { status: 400 });
    }
    if (!body.startScore || ![201, 301, 501].includes(body.startScore)) {
      return NextResponse.json({ error: 'Invalid startScore' }, { status: 400 });
    }
    if (!body.finishRule || !['single_out', 'double_out'].includes(body.finishRule)) {
      return NextResponse.json({ error: 'Invalid finishRule' }, { status: 400 });
    }
    if (!body.legsToWin || body.legsToWin < 1) {
      return NextResponse.json({ error: 'Invalid legsToWin' }, { status: 400 });
    }
    if (!body.playerIds || !Array.isArray(body.playerIds) || body.playerIds.length < 3) {
      return NextResponse.json({ error: 'Tournament requires at least 3 players' }, { status: 400 });
    }
    if (new Set(body.playerIds).size !== body.playerIds.length) {
      return NextResponse.json({ error: 'Duplicate player IDs' }, { status: 400 });
    }
    const startScore = String(body.startScore) as '201' | '301' | '501';
    const fairEnding = body.fairEnding && body.legsToWin === 1 ? true : false;

    // ── Shuffle player order for seeding ──────────────────────────────
    const shuffledIds = fisherYatesShuffle(body.playerIds);

    // ── Create tournament ─────────────────────────────────────────────
    const { data: tournament, error: tourErr } = await supabase
      .from('tournaments')
      .insert({
        name: body.name.trim(),
        mode: 'x01',
        start_score: startScore,
        finish: body.finishRule,
        legs_to_win: body.legsToWin,
        fair_ending: fairEnding,
        status: 'in_progress',
      })
      .select()
      .single();

    if (tourErr || !tournament) {
      console.error('Tournament insert error:', tourErr);
      return NextResponse.json({ error: tourErr?.message ?? 'Failed to create tournament' }, { status: 500 });
    }
    tournamentId = tournament.id;

    // ── Insert tournament_players ─────────────────────────────────────
    const { error: tpErr } = await supabase.from('tournament_players').insert(
      shuffledIds.map((pid, idx) => ({
        tournament_id: tournament.id,
        player_id: pid,
        seed: idx + 1,
      }))
    );

    if (tpErr) {
      await cleanupTournament(supabase, tournament.id);
      return NextResponse.json({ error: 'Failed to add players to tournament' }, { status: 500 });
    }

    // ── Generate bracket ──────────────────────────────────────────────
    const bracketSlots = generateBracket(shuffledIds);

    // ── Batch insert tournament_matches (first pass: without FK pointers) ─
    const tempIdToDbId = new Map<string, string>();

    // Insert slots in batches, collecting generated IDs
    for (const slot of bracketSlots) {
      const { data: tmRow, error: tmErr } = await supabase
        .from('tournament_matches')
        .insert({
          tournament_id: tournament.id,
          bracket: slot.bracket,
          round: slot.round,
          position: slot.position,
          player1_id: slot.player1Id,
          player2_id: slot.player2Id,
          winner_id: slot.winnerId,
          loser_id: slot.loserId,
          is_bye: slot.isBye,
        })
        .select('id')
        .single();

      if (tmErr || !tmRow) {
        console.error('Failed to insert tournament match:', tmErr);
        await cleanupTournament(supabase, tournament.id);
        return NextResponse.json({ error: 'Failed to create bracket' }, { status: 500 });
      }

      tempIdToDbId.set(slot.tempId, tmRow.id);
    }

    // ── Second pass: update FK pointers now that real UUIDs exist ──────
    for (const slot of bracketSlots) {
      const dbId = tempIdToDbId.get(slot.tempId);
      if (!dbId) continue;

      const update: Record<string, string | null> = {};
      if (slot.nextWinnerTempId) {
        update.next_winner_tm_id = tempIdToDbId.get(slot.nextWinnerTempId) ?? null;
      }
      if (slot.nextLoserTempId) {
        update.next_loser_tm_id = tempIdToDbId.get(slot.nextLoserTempId) ?? null;
      }

      if (Object.keys(update).length > 0) {
        await supabase
          .from('tournament_matches')
          .update(update)
          .eq('id', dbId);
      }
    }

    // ── Create actual matches for all ready slots (both players, not bye) ─
    for (const slot of bracketSlots) {
      if (slot.isBye || !slot.player1Id || !slot.player2Id) continue;

      const tmDbId = tempIdToDbId.get(slot.tempId);
      if (!tmDbId) continue;

      await createMatchForTournament(
        supabase,
        tmDbId,
        slot.player1Id,
        slot.player2Id,
        tournament.id,
        startScore,
        body.finishRule,
        body.legsToWin,
        fairEnding
      );
    }

    return NextResponse.json({ tournamentId: tournament.id }, { status: 201 });
  } catch (error) {
    console.error('POST /api/tournaments error:', error);
    if (tournamentId) {
      try {
        await cleanupTournament(supabase, tournamentId);
      } catch { /* ignore cleanup errors */ }
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function createMatchForTournament(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  tournamentMatchId: string,
  player1Id: string,
  player2Id: string,
  tournamentId: string,
  startScore: string,
  finish: string,
  legsToWin: number,
  fairEnding: boolean
) {
  // Randomize player order
  const players =
    Math.random() < 0.5 ? [player1Id, player2Id] : [player2Id, player1Id];

  const { data: match, error: matchErr } = await supabase
    .from('matches')
    .insert({
      mode: 'x01',
      start_score: startScore,
      finish,
      legs_to_win: legsToWin,
      fair_ending: fairEnding,
      tournament_match_id: tournamentMatchId,
    })
    .select()
    .single();

  if (matchErr || !match) {
    throw new Error(`Failed to create seeded match: ${matchErr?.message ?? 'unknown error'}`);
  }

  const { error: playersErr } = await supabase.from('match_players').insert(
    players.map((pid, idx) => ({
      match_id: match.id,
      player_id: pid,
      play_order: idx,
    }))
  );
  if (playersErr) {
    await supabase.from('matches').delete().eq('id', match.id);
    throw new Error(`Failed to create seeded match players: ${playersErr.message}`);
  }

  const { error: legErr } = await supabase.from('legs').insert({
    match_id: match.id,
    leg_number: 1,
    starting_player_id: players[0],
  });
  if (legErr) {
    await supabase.from('matches').delete().eq('id', match.id);
    throw new Error(`Failed to create seeded first leg: ${legErr.message}`);
  }

  // Link match to tournament_match (atomic: only if still unlinked)
  const { count: linkedCount, error: linkErr } = await supabase
    .from('tournament_matches')
    .update({ match_id: match.id }, { count: 'exact' })
    .eq('id', tournamentMatchId)
    .is('match_id', null);
  if (linkErr || linkedCount !== 1) {
    await supabase.from('matches').delete().eq('id', match.id);
    throw new Error(linkErr?.message ?? 'Failed to link seeded match to tournament slot');
  }
}
