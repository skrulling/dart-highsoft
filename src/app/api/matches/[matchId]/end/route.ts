import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { loadMatch } from '@/lib/server/matchGuards';

export async function PATCH(_: Request, { params }: { params: Promise<{ matchId: string }> }) {
  try {
    const { matchId } = await params;
    const supabase = getSupabaseServerClient();
    const match = await loadMatch(supabase, matchId);
    if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    if (match.ended_early || match.winner_player_id || match.completed_at) {
      return NextResponse.json({ error: 'Match is already completed' }, { status: 409 });
    }
    const { error } = await supabase
      .from('matches')
      .update({ ended_early: true, completed_at: new Date().toISOString() })
      .eq('id', matchId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('PATCH /api/matches/[matchId]/end error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
