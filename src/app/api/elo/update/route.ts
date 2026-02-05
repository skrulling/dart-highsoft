import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { matchId?: string; winnerId?: string; loserId?: string; kFactor?: number };
    if (!body.matchId || !body.winnerId || !body.loserId) {
      return NextResponse.json({ error: 'matchId, winnerId, loserId are required' }, { status: 400 });
    }
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.rpc('update_elo_ratings', {
      p_match_id: body.matchId,
      p_winner_id: body.winnerId,
      p_loser_id: body.loserId,
      p_k_factor: body.kFactor ?? 32,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('POST /api/elo/update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
