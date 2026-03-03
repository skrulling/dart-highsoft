import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { isMatchActive, loadMatch } from '@/lib/server/matchGuards';
import { completeLeg } from '@/lib/server/completeLeg';

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
    return NextResponse.json(result);
  } catch (error) {
    console.error('POST /api/matches/[matchId]/legs/[legId]/complete error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
