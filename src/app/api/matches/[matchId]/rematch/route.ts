import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

export async function POST(_: Request, { params }: { params: Promise<{ matchId: string }> }) {
  try {
    const { matchId } = await params;
    const supabase = getSupabaseServerClient();

    const { data: match } = await supabase
      .from('matches')
      .select('id, start_score, finish, legs_to_win, winner_player_id')
      .eq('id', matchId)
      .single();
    if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });

    const { data: mpData, error: mpErr } = await supabase
      .from('match_players')
      .select('player_id, play_order')
      .eq('match_id', matchId)
      .order('play_order');
    if (mpErr || !mpData) return NextResponse.json({ error: mpErr?.message ?? 'Failed to load players' }, { status: 500 });
    const playerIds = (mpData as { player_id: string; play_order: number }[]).map((r) => r.player_id);
    if (playerIds.length < 2) {
      return NextResponse.json({ error: 'Need at least 2 players to start a rematch' }, { status: 400 });
    }

    const winnerId = match.winner_player_id ?? null;
    const eligibleStarters = winnerId ? playerIds.filter((id) => id !== winnerId) : [...playerIds];
    const starter =
      eligibleStarters.length > 0
        ? eligibleStarters[Math.floor(Math.random() * eligibleStarters.length)]
        : playerIds[0];
    const remaining = playerIds.filter((id) => id !== starter);
    const order = [starter, ...remaining.sort(() => Math.random() - 0.5)];

    const { data: newMatch, error: mErr } = await supabase
      .from('matches')
      .insert({ mode: 'x01', start_score: match.start_score, finish: match.finish, legs_to_win: match.legs_to_win })
      .select('*')
      .single();
    if (mErr || !newMatch) return NextResponse.json({ error: mErr?.message ?? 'Failed to create rematch' }, { status: 500 });

    const mp = order.map((id, idx) => ({ match_id: (newMatch as { id: string }).id, player_id: id, play_order: idx }));
    const { error: mpInsertErr } = await supabase.from('match_players').insert(mp);
    if (mpInsertErr) return NextResponse.json({ error: mpInsertErr.message }, { status: 500 });

    const { error: legErr } = await supabase
      .from('legs')
      .insert({ match_id: (newMatch as { id: string }).id, leg_number: 1, starting_player_id: order[0] });
    if (legErr) return NextResponse.json({ error: legErr.message }, { status: 500 });

    return NextResponse.json({ newMatchId: (newMatch as { id: string }).id });
  } catch (error) {
    console.error('POST /api/matches/[matchId]/rematch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
