import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { isMatchActive, loadMatch } from '@/lib/server/matchGuards';
import { recomputeLegTurns } from '@/lib/server/recomputeLegTurns';

async function getLegIdForThrow(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  throwId: string
): Promise<string | null> {
  const { data: thr } = await supabase.from('throws').select('id, turn_id').eq('id', throwId).single();
  if (!thr) return null;
  const { data: turn } = await supabase.from('turns').select('id, leg_id').eq('id', thr.turn_id).single();
  if (!turn) return null;
  return turn.leg_id as string;
}

async function ensureThrowInMatch(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  matchId: string,
  throwId: string
): Promise<string | null> {
  const legId = await getLegIdForThrow(supabase, throwId);
  if (!legId) return null;
  const { data: leg } = await supabase.from('legs').select('id, match_id').eq('id', legId).single();
  if (!leg || leg.match_id !== matchId) return null;
  return legId;
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
