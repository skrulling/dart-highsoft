import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { isMatchActive, loadMatch } from '@/lib/server/matchGuards';
import { resolveOrCreateTurnForPlayer } from '@/lib/server/turnLifecycle';

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
    let body:
      | { turnId?: string; dartIndex?: number; segment?: string; scored?: number; legId?: string; playerId?: string; tiebreakRound?: number }
      | null = null;
    try {
      body = (await request.json()) as {
        turnId?: string;
        dartIndex?: number;
        segment?: string;
        scored?: number;
        legId?: string;
        playerId?: string;
        tiebreakRound?: number;
      };
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (typeof body.dartIndex !== 'number' || !body.segment || typeof body.scored !== 'number') {
      return NextResponse.json({ error: 'dartIndex, segment, scored are required' }, { status: 400 });
    }
    const supabase = getSupabaseServerClient();
    const match = await loadMatch(supabase, matchId);
    if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    if (!isMatchActive(match)) return NextResponse.json({ error: 'Match is not active' }, { status: 409 });

    // Only allow tiebreakRound when match has fair_ending enabled and value is valid
    let tiebreakRound: number | undefined;
    if (body.tiebreakRound != null) {
      if (!match.fair_ending) {
        return NextResponse.json({ error: 'tiebreakRound not allowed without fair_ending' }, { status: 400 });
      }
      if (typeof body.tiebreakRound !== 'number' || !Number.isInteger(body.tiebreakRound) || body.tiebreakRound < 1) {
        return NextResponse.json({ error: 'tiebreakRound must be a positive integer' }, { status: 400 });
      }
      tiebreakRound = body.tiebreakRound;
    }

    let resolvedTurnId: string | null = null;
    if (body.turnId) {
      const linked = await ensureTurnInMatch(supabase, matchId, body.turnId);
      if (!linked) return NextResponse.json({ error: 'Turn not found for match' }, { status: 404 });
      resolvedTurnId = body.turnId;
    } else if (body.legId && body.playerId) {
      const [{ data: leg }, { data: matchPlayer }] = await Promise.all([
        supabase
          .from('legs')
          .select('id')
          .eq('id', body.legId)
          .eq('match_id', matchId)
          .single(),
        supabase
          .from('match_players')
          .select('player_id')
          .eq('match_id', matchId)
          .eq('player_id', body.playerId)
          .maybeSingle(),
      ]);
      if (!leg) {
        return NextResponse.json({ error: 'Leg not found for match' }, { status: 404 });
      }
      if (!matchPlayer) {
        return NextResponse.json({ error: 'Player not found for match' }, { status: 404 });
      }

      const resolved = await resolveOrCreateTurnForPlayer(supabase, body.legId, body.playerId, tiebreakRound);
      if ('error' in resolved) {
        return NextResponse.json({ error: resolved.error }, { status: resolved.status });
      }
      resolvedTurnId = resolved.turn.id;
    } else {
      return NextResponse.json(
        { error: 'Provide either turnId or legId + playerId, along with dartIndex, segment, scored' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('throws')
      .insert({
        turn_id: resolvedTurnId,
        dart_index: body.dartIndex,
        segment: body.segment,
        scored: body.scored,
      })
      .select('*')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? 'Failed to create throw' }, { status: 500 });
    }
    return NextResponse.json({ turnId: resolvedTurnId, throw: data });
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
