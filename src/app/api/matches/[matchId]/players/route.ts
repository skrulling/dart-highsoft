import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { isMatchActive, loadMatch } from '@/lib/server/matchGuards';

export async function POST(request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  try {
    const { matchId } = await params;
    const body = (await request.json()) as { playerId?: string };
    if (!body.playerId) {
      return NextResponse.json({ error: 'playerId is required' }, { status: 400 });
    }
    const supabase = getSupabaseServerClient();
    const match = await loadMatch(supabase, matchId);
    if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    if (!isMatchActive(match)) return NextResponse.json({ error: 'Match is not active' }, { status: 409 });

    const [{ data: existing }, { data: maxOrder }] = await Promise.all([
      supabase
        .from('match_players')
        .select('player_id')
        .eq('match_id', matchId)
        .eq('player_id', body.playerId)
        .maybeSingle(),
      supabase
        .from('match_players')
        .select('play_order')
        .eq('match_id', matchId)
        .order('play_order', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (existing) {
      return NextResponse.json({ error: 'Player is already in match' }, { status: 409 });
    }
    const nextOrder = (maxOrder?.play_order ?? -1) + 1;

    const { error } = await supabase
      .from('match_players')
      .insert({ match_id: matchId, player_id: body.playerId, play_order: nextOrder });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('POST /api/matches/[matchId]/players error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
