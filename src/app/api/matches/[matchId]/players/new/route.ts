import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { isMatchActive, loadMatch } from '@/lib/server/matchGuards';

export async function POST(request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  try {
    const { matchId } = await params;
    const body = (await request.json()) as { displayName?: string };
    const displayName = body.displayName?.trim();
    if (!displayName) {
      return NextResponse.json({ error: 'displayName is required' }, { status: 400 });
    }
    const supabase = getSupabaseServerClient();
    const match = await loadMatch(supabase, matchId);
    if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    if (!isMatchActive(match)) return NextResponse.json({ error: 'Match is not active' }, { status: 409 });

    const { data: newPlayer, error: playerError } = await supabase
      .from('players')
      .insert({ display_name: displayName })
      .select('*')
      .single();
    if (playerError || !newPlayer) {
      if (playerError?.code === '23505') {
        return NextResponse.json({ error: 'A player with that name already exists' }, { status: 409 });
      }
      return NextResponse.json({ error: playerError?.message ?? 'Failed to create player' }, { status: 500 });
    }

    const { data: maxOrder } = await supabase
      .from('match_players')
      .select('play_order')
      .eq('match_id', matchId)
      .order('play_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder = (maxOrder?.play_order ?? -1) + 1;

    const { error: mpError } = await supabase
      .from('match_players')
      .insert({ match_id: matchId, player_id: (newPlayer as { id: string }).id, play_order: nextOrder });
    if (mpError) return NextResponse.json({ error: mpError.message }, { status: 500 });

    return NextResponse.json({ player: newPlayer });
  } catch (error) {
    console.error('POST /api/matches/[matchId]/players/new error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
