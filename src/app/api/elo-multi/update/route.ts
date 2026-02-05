import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { matchId?: string; playerIds?: string[]; ranks?: number[]; kFactor?: number };
    if (!body.matchId || !body.playerIds || !body.ranks || body.playerIds.length !== body.ranks.length) {
      return NextResponse.json({ error: 'matchId, playerIds, ranks are required and must align' }, { status: 400 });
    }
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.rpc('update_elo_ratings_multiplayer', {
      p_match_id: body.matchId,
      p_player_ids: body.playerIds,
      p_ranks: body.ranks,
      p_k_factor: body.kFactor ?? 32,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('POST /api/elo-multi/update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
