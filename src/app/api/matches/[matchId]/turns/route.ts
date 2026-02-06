import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { isMatchActive, loadMatch } from '@/lib/server/matchGuards';

export async function POST(request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  try {
    const { matchId } = await params;
    const body = (await request.json()) as { legId?: string; playerId?: string };
    if (!body.legId || !body.playerId) {
      return NextResponse.json({ error: 'legId and playerId are required' }, { status: 400 });
    }
    const supabase = getSupabaseServerClient();
    const match = await loadMatch(supabase, matchId);
    if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    if (!isMatchActive(match)) return NextResponse.json({ error: 'Match is not active' }, { status: 409 });

    const { data: leg } = await supabase.from('legs').select('id').eq('id', body.legId).eq('match_id', matchId).single();
    if (!leg) {
      return NextResponse.json({ error: 'Leg not found for match' }, { status: 404 });
    }

    const { data: lastTurn } = await supabase
      .from('turns')
      .select('turn_number')
      .eq('leg_id', body.legId)
      .order('turn_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextTurnNumber = (lastTurn?.turn_number ?? 0) + 1;

    const { data, error } = await supabase
      .from('turns')
      .insert({
        leg_id: body.legId,
        player_id: body.playerId,
        turn_number: nextTurnNumber,
        total_scored: 0,
        busted: false,
      })
      .select('*')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? 'Failed to create turn' }, { status: 500 });
    }
    return NextResponse.json({ turn: data });
  } catch (error) {
    console.error('POST /api/matches/[matchId]/turns error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
