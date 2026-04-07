import { NextResponse } from 'next/server';

import { getSupabaseServerClient } from '@/lib/supabaseServer';
import type { TournamentStatus } from '@/lib/tournament/types';

type TournamentRow = {
  id: string;
  status: TournamentStatus;
  winner_player_id: string | null;
  completed_at: string | null;
};

export async function PATCH(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: tournamentId } = await params;
    const supabase = getSupabaseServerClient();

    const { data: tournament, error: tournamentError } = await supabase
      .from('tournaments')
      .select('id, status, winner_player_id, completed_at')
      .eq('id', tournamentId)
      .single();

    if (tournamentError) {
      return NextResponse.json({ error: tournamentError.message }, { status: 500 });
    }

    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    const currentTournament = tournament as TournamentRow;
    if (currentTournament.status !== 'in_progress') {
      return NextResponse.json({ error: 'Tournament is already completed' }, { status: 409 });
    }

    const completedAt = new Date().toISOString();

    const { data: tournamentMatches, error: matchesError } = await supabase
      .from('tournament_matches')
      .select('match_id, winner_id')
      .eq('tournament_id', tournamentId);

    if (matchesError) {
      return NextResponse.json({ error: matchesError.message }, { status: 500 });
    }

    const unresolvedMatchIds = (tournamentMatches ?? [])
      .filter((row) => !row.winner_id && row.match_id)
      .map((row) => row.match_id as string);

    const { error: tournamentUpdateError } = await supabase
      .from('tournaments')
      .update({
        status: 'cancelled',
        completed_at: completedAt,
      })
      .eq('id', tournamentId)
      .eq('status', 'in_progress');

    if (tournamentUpdateError) {
      return NextResponse.json({ error: tournamentUpdateError.message }, { status: 500 });
    }

    if (unresolvedMatchIds.length > 0) {
      const { error: linkedMatchesUpdateError } = await supabase
        .from('matches')
        .update({
          ended_early: true,
          completed_at: completedAt,
        })
        .in('id', unresolvedMatchIds)
        .eq('ended_early', false)
        .is('winner_player_id', null)
        .is('completed_at', null);

      if (linkedMatchesUpdateError) {
        return NextResponse.json({ error: linkedMatchesUpdateError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('PATCH /api/tournaments/[id]/end error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
