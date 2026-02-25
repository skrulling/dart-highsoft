import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { isMatchActive, loadMatch } from '@/lib/server/matchGuards';

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

    const { data: leg } = await supabase
      .from('legs')
      .select('id, match_id, starting_player_id, winner_player_id')
      .eq('id', legId)
      .single();
    if (!leg || leg.match_id !== matchId) {
      return NextResponse.json({ error: 'Leg not found for match' }, { status: 404 });
    }

    // Idempotency guard: if leg already has a winner, don't re-process (prevents double Elo)
    if (leg.winner_player_id) {
      const alreadyCompleted = !!match.completed_at;
      return NextResponse.json({ matchCompleted: alreadyCompleted });
    }

    const { error: legErr } = await supabase
      .from('legs')
      .update({ winner_player_id: body.winnerPlayerId })
      .eq('id', legId)
      .is('winner_player_id', null);
    if (legErr) {
      return NextResponse.json({ error: legErr.message }, { status: 500 });
    }

    const [{ data: allLegs, error: listErr }, { data: mpData, error: mpErr }] = await Promise.all([
      supabase.from('legs').select('*').eq('match_id', matchId),
      supabase
        .from('match_players')
        .select('player_id, play_order')
        .eq('match_id', matchId)
        .order('play_order'),
    ]);
    if (listErr || !allLegs) {
      return NextResponse.json({ error: listErr?.message ?? 'Failed to load legs' }, { status: 500 });
    }
    if (mpErr || !mpData) {
      return NextResponse.json({ error: mpErr?.message ?? 'Failed to load match players' }, { status: 500 });
    }
    const wonCounts = (allLegs as { winner_player_id: string | null }[]).reduce<Record<string, number>>((acc, l) => {
      if (l.winner_player_id) acc[l.winner_player_id] = (acc[l.winner_player_id] || 0) + 1;
      return acc;
    }, {});
    const target = match.legs_to_win;
    const someoneWonMatch = Object.entries(wonCounts).find(([, c]) => c >= target);

    if (!someoneWonMatch) {
      const orderedPlayerIds = (mpData as { player_id: string; play_order: number }[]).map((r) => r.player_id);
      const currentIdx = orderedPlayerIds.findIndex((id) => id === leg.starting_player_id);
      const nextIdx = currentIdx >= 0 ? (currentIdx + 1) % orderedPlayerIds.length : 0;
      const nextStarterId = orderedPlayerIds[nextIdx] ?? body.winnerPlayerId;

      const nextLegNumber = (allLegs ?? []).length + 1;
      const { error: insErr } = await supabase
        .from('legs')
        .insert({ match_id: matchId, leg_number: nextLegNumber, starting_player_id: nextStarterId });
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
      return NextResponse.json({ matchCompleted: false });
    }

    const [winnerPid] = someoneWonMatch;
    const { error: setWinnerErr } = await supabase
      .from('matches')
      .update({ winner_player_id: winnerPid, completed_at: new Date().toISOString() })
      .eq('id', matchId);
    if (setWinnerErr) return NextResponse.json({ error: setWinnerErr.message }, { status: 500 });

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
        if (error) {
          console.error('ELO update error:', error);
        }
      }
    } else if (playerIds.length > 2) {
      const results = playerIds.map((id) => ({ id, rank: id === winnerPid ? 1 : 2 }));
      const { error } = await supabase.rpc('update_elo_ratings_multiplayer', {
        p_match_id: matchId,
        p_player_ids: results.map((r) => r.id),
        p_ranks: results.map((r) => r.rank),
        p_k_factor: 32,
      });
      if (error) {
        console.error('Multiplayer ELO update error:', error);
      }
    }

    return NextResponse.json({ matchCompleted: true });
  } catch (error) {
    console.error('POST /api/matches/[matchId]/legs/[legId]/complete error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
