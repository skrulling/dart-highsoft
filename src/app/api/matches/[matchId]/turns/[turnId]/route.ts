import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { isMatchActive, loadMatch } from '@/lib/server/matchGuards';

async function ensureTurnInMatch(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  matchId: string,
  turnId: string
) {
  const { data: turn } = await supabase
    .from('turns')
    .select('id, legs!inner(match_id)')
    .eq('id', turnId)
    .eq('legs.match_id', matchId)
    .single();
  if (!turn) return null;
  return { turn };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ matchId: string; turnId: string }> }) {
  try {
    const { matchId, turnId } = await params;
    let body: { totalScored?: number; busted?: boolean } | null = null;
    try {
      body = (await request.json()) as { totalScored?: number; busted?: boolean };
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    if (typeof body.totalScored !== 'number' || typeof body.busted !== 'boolean') {
      return NextResponse.json({ error: 'totalScored and busted are required' }, { status: 400 });
    }
    const supabase = getSupabaseServerClient();
    const match = await loadMatch(supabase, matchId);
    if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    if (!isMatchActive(match)) return NextResponse.json({ error: 'Match is not active' }, { status: 409 });

    const linked = await ensureTurnInMatch(supabase, matchId, turnId);
    if (!linked) return NextResponse.json({ error: 'Turn not found for match' }, { status: 404 });

    const { error } = await supabase
      .from('turns')
      .update({ total_scored: body.totalScored, busted: body.busted })
      .eq('id', turnId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('PATCH /api/matches/[matchId]/turns/[turnId] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ matchId: string; turnId: string }> }) {
  try {
    const { matchId, turnId } = await params;
    const supabase = getSupabaseServerClient();
    const match = await loadMatch(supabase, matchId);
    if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    if (!isMatchActive(match)) return NextResponse.json({ error: 'Match is not active' }, { status: 409 });

    const linked = await ensureTurnInMatch(supabase, matchId, turnId);
    if (!linked) return NextResponse.json({ error: 'Turn not found for match' }, { status: 404 });

    const { error } = await supabase.from('turns').delete().eq('id', turnId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/matches/[matchId]/turns/[turnId] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
