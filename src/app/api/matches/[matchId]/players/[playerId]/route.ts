import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { isMatchActive, loadMatch } from '@/lib/server/matchGuards';

export async function DELETE(_: Request, { params }: { params: Promise<{ matchId: string; playerId: string }> }) {
  try {
    const { matchId, playerId } = await params;
    const supabase = getSupabaseServerClient();
    const match = await loadMatch(supabase, matchId);
    if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    if (!isMatchActive(match)) return NextResponse.json({ error: 'Match is not active' }, { status: 409 });

    const { data: players } = await supabase.from('match_players').select('player_id').eq('match_id', matchId);
    if ((players ?? []).length <= 2) {
      return NextResponse.json({ error: 'Match must have at least 2 players' }, { status: 400 });
    }

    const { error: deleteErr } = await supabase.from('match_players').delete().eq('match_id', matchId).eq('player_id', playerId);
    if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 });

    const { data: remainingPlayers, error: fetchError } = await supabase
      .from('match_players')
      .select('player_id')
      .eq('match_id', matchId)
      .order('play_order');
    if (fetchError || !remainingPlayers) {
      return NextResponse.json({ error: fetchError?.message ?? 'Failed to fetch remaining players' }, { status: 500 });
    }

    await Promise.all(
      remainingPlayers.map((p, index) =>
        supabase.from('match_players').update({ play_order: index }).eq('match_id', matchId).eq('player_id', p.player_id)
      )
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/matches/[matchId]/players/[playerId] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
