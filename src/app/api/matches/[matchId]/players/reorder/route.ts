import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { isMatchActive, loadMatch } from '@/lib/server/matchGuards';

export async function PATCH(request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  try {
    const { matchId } = await params;
    const body = (await request.json()) as { orderedPlayerIds?: string[] };
    if (!body.orderedPlayerIds || body.orderedPlayerIds.length < 2) {
      return NextResponse.json({ error: 'orderedPlayerIds must include at least 2 players' }, { status: 400 });
    }
    const supabase = getSupabaseServerClient();
    const match = await loadMatch(supabase, matchId);
    if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    if (!isMatchActive(match)) return NextResponse.json({ error: 'Match is not active' }, { status: 409 });

    await Promise.all(
      body.orderedPlayerIds.map((id, index) =>
        supabase.from('match_players').update({ play_order: index }).eq('match_id', matchId).eq('player_id', id)
      )
    );

    const { data: currentLeg } = await supabase
      .from('legs')
      .select('id, starting_player_id')
      .eq('match_id', matchId)
      .is('winner_player_id', null)
      .order('leg_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (currentLeg && body.orderedPlayerIds.length > 0) {
      const first = body.orderedPlayerIds[0]!;
      if (currentLeg.starting_player_id !== first) {
        await supabase.from('legs').update({ starting_player_id: first }).eq('id', currentLeg.id);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('PATCH /api/matches/[matchId]/players/reorder error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
