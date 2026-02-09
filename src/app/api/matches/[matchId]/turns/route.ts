import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { isMatchActive, loadMatch } from '@/lib/server/matchGuards';
import { resolveOrCreateTurnForPlayer } from '@/lib/server/turnLifecycle';

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

    const resolved = await resolveOrCreateTurnForPlayer(supabase, body.legId, body.playerId);
    if ('error' in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }

    return NextResponse.json({ turn: resolved.turn });
  } catch (error) {
    console.error('POST /api/matches/[matchId]/turns error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
