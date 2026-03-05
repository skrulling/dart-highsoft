import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { isMatchActive, loadMatch } from '@/lib/server/matchGuards';
import { completeLeg } from '@/lib/server/completeLeg';
import { advanceTournament } from '@/lib/tournament/advance';

export async function POST(request: Request, { params }: { params: Promise<{ matchId: string; legId: string }> }) {
  try {
    const { matchId, legId } = await params;
    const body = (await request.json()) as { winnerPlayerId?: string };
    if (!body.winnerPlayerId) {
      return NextResponse.json({ error: 'winnerPlayerId is required' }, { status: 400 });
    }
    const supabase = getSupabaseServerClient();
    const match = await loadMatch(supabase, matchId);
    if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    if (!isMatchActive(match)) return NextResponse.json({ error: 'Match is not active' }, { status: 409 });
    let tournamentPlayers: { player1_id: string | null; player2_id: string | null } | null = null;
    if (match.tournament_match_id) {
      const { data: tm, error: tmErr } = await supabase
        .from('tournament_matches')
        .select('player1_id, player2_id')
        .eq('id', match.tournament_match_id)
        .single();
      if (tmErr || !tm) {
        console.error('Failed to load tournament match for validation:', tmErr);
        return NextResponse.json({ error: 'Failed to load tournament match' }, { status: 500 });
      }
      const isParticipant = tm.player1_id === body.winnerPlayerId || tm.player2_id === body.winnerPlayerId;
      if (!isParticipant) {
        return NextResponse.json(
          { error: 'winnerPlayerId must be one of the tournament match players' },
          { status: 400 }
        );
      }
      tournamentPlayers = tm;
    }

    const result = await completeLeg(supabase, matchId, legId, body.winnerPlayerId, match);

    // ── Tournament advancement ─────────────────────────────────────
    if (result.matchCompleted && match.tournament_match_id && tournamentPlayers) {
      try {
        const loserId = tournamentPlayers.player1_id === body.winnerPlayerId
          ? tournamentPlayers.player2_id
          : tournamentPlayers.player1_id;
        if (loserId) {
          await advanceTournament(supabase, match.tournament_match_id, body.winnerPlayerId, loserId);
        }
      } catch (advErr) {
        console.error('Tournament advancement error:', advErr);
        // Don't fail the leg completion — the match result is already saved
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('POST /api/matches/[matchId]/legs/[legId]/complete error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
