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

    const result = await completeLeg(supabase, matchId, legId, body.winnerPlayerId, match);

    // ── Tournament advancement ─────────────────────────────────────
    if (result.matchCompleted && match.tournament_match_id) {
      try {
        const { data: tm, error: tmErr } = await supabase
          .from('tournament_matches')
          .select('player1_id, player2_id')
          .eq('id', match.tournament_match_id)
          .single();

        if (tmErr) {
          console.error('Failed to load tournament match for advancement:', tmErr);
        } else if (tm) {
          const loserId = tm.player1_id === body.winnerPlayerId
            ? tm.player2_id
            : tm.player1_id;
          if (loserId) {
            await advanceTournament(supabase, match.tournament_match_id, body.winnerPlayerId, loserId);
          }
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
