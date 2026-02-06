import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { isMatchActive, loadMatch } from '@/lib/server/matchGuards';
import { recomputeLegTurns } from '@/lib/server/recomputeLegTurns';

async function getLegIdForTurn(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  turnId: string
): Promise<string | null> {
  const { data: turn } = await supabase.from('turns').select('id, leg_id').eq('id', turnId).single();
  if (!turn) return null;
  return turn.leg_id as string;
}

async function ensureThrowInMatch(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  matchId: string,
  throwId: string
): Promise<string | null> {
  const { data: thr } = await supabase
    .from('throws')
    .select('id, turn_id, turns!inner(legs!inner(match_id))')
    .eq('id', throwId)
    .eq('turns.legs.match_id', matchId)
    .single();
  if (!thr) return null;
  return getLegIdForTurn(supabase, thr.turn_id as string);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ matchId: string; throwId: string }> }) {
  try {
    const { matchId, throwId } = await params;
    const body = (await request.json()) as { segment?: string; scored?: number };
    if (!body.segment || typeof body.scored !== 'number') {
      return NextResponse.json({ error: 'segment and scored are required' }, { status: 400 });
    }
    const supabase = getSupabaseServerClient();
    const match = await loadMatch(supabase, matchId);
    if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    if (!isMatchActive(match)) return NextResponse.json({ error: 'Match is not active' }, { status: 409 });

    const legId = await ensureThrowInMatch(supabase, matchId, throwId);
    if (!legId) return NextResponse.json({ error: 'Throw not found for match' }, { status: 404 });

    const { error } = await supabase.from('throws').update({ segment: body.segment, scored: body.scored }).eq('id', throwId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await recomputeLegTurns(supabase, legId, parseInt(match.start_score, 10), match.finish);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('PATCH /api/matches/[matchId]/throws/[throwId] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ matchId: string; throwId: string }> }) {
  try {
    const { matchId, throwId } = await params;
    const supabase = getSupabaseServerClient();
    const match = await loadMatch(supabase, matchId);
    if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    if (!isMatchActive(match)) return NextResponse.json({ error: 'Match is not active' }, { status: 409 });

    const legId = await ensureThrowInMatch(supabase, matchId, throwId);
    if (!legId) return NextResponse.json({ error: 'Throw not found for match' }, { status: 404 });

    const { error } = await supabase.from('throws').delete().eq('id', throwId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await recomputeLegTurns(supabase, legId, parseInt(match.start_score, 10), match.finish);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/matches/[matchId]/throws/[throwId] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
