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

export async function POST(request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  try {
    const { matchId } = await params;
    let body: { turnId?: string; dartIndex?: number; segment?: string; scored?: number } | null = null;
    try {
      body = (await request.json()) as { turnId?: string; dartIndex?: number; segment?: string; scored?: number };
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    if (!body.turnId || typeof body.dartIndex !== 'number' || !body.segment || typeof body.scored !== 'number') {
      return NextResponse.json({ error: 'turnId, dartIndex, segment, scored are required' }, { status: 400 });
    }
    const supabase = getSupabaseServerClient();
    const match = await loadMatch(supabase, matchId);
    if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    if (!isMatchActive(match)) return NextResponse.json({ error: 'Match is not active' }, { status: 409 });

    const linked = await ensureTurnInMatch(supabase, matchId, body.turnId);
    if (!linked) return NextResponse.json({ error: 'Turn not found for match' }, { status: 404 });

    const { data, error } = await supabase
      .from('throws')
      .insert({
        turn_id: body.turnId,
        dart_index: body.dartIndex,
        segment: body.segment,
        scored: body.scored,
      })
      .select('*')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? 'Failed to create throw' }, { status: 500 });
    }
    return NextResponse.json({ throw: data });
  } catch (error) {
    console.error('POST /api/matches/[matchId]/throws error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  try {
    const { matchId } = await params;
    let body: { turnId?: string; dartIndex?: number } | null = null;
    try {
      body = (await request.json()) as { turnId?: string; dartIndex?: number };
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    if (!body.turnId || typeof body.dartIndex !== 'number') {
      return NextResponse.json({ error: 'turnId and dartIndex are required' }, { status: 400 });
    }
    const supabase = getSupabaseServerClient();
    const match = await loadMatch(supabase, matchId);
    if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    if (!isMatchActive(match)) return NextResponse.json({ error: 'Match is not active' }, { status: 409 });

    const linked = await ensureTurnInMatch(supabase, matchId, body.turnId);
    if (!linked) return NextResponse.json({ error: 'Turn not found for match' }, { status: 404 });

    const { error } = await supabase
      .from('throws')
      .delete()
      .eq('turn_id', body.turnId)
      .eq('dart_index', body.dartIndex);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/matches/[matchId]/throws error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
