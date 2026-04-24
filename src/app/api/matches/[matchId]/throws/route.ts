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

type ThrowSequenceRow = {
  id: string;
  dart_index: number;
  segment: string;
  scored: number;
};

function scoreFromSegment(segment: string): number | null {
  if (segment === 'Miss') return 0;
  if (segment === 'SB' || segment === 'OuterBull') return 25;
  if (segment === 'DB' || segment === 'InnerBull') return 50;

  const match = segment.match(/^([SDT])(\d{1,2})$/);
  if (!match) return null;

  const modifier = match[1];
  const value = Number.parseInt(match[2] ?? '', 10);
  if (!Number.isInteger(value) || value < 1 || value > 20) return null;

  if (modifier === 'S') return value;
  if (modifier === 'D') return value * 2;
  if (modifier === 'T') return value * 3;
  return null;
}

function getExpectedNextDartIndex(throws: ThrowSequenceRow[]): { ok: true; nextDartIndex: number } | { ok: false; error: string } {
  const ordered = throws.slice().sort((a, b) => a.dart_index - b.dart_index);
  for (let i = 0; i < ordered.length; i++) {
    const expected = i + 1;
    if (ordered[i].dart_index !== expected) {
      return {
        ok: false,
        error: `Turn has inconsistent dart order. Use undo to remove the latest persisted dart before scoring again.`,
      };
    }
  }

  if (ordered.length >= 3) {
    return { ok: false, error: 'Turn already has three darts' };
  }

  return { ok: true, nextDartIndex: ordered.length + 1 };
}

async function loadThrowsForTurn(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  turnId: string
): Promise<{ throws: ThrowSequenceRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('throws')
    .select('id, dart_index, segment, scored')
    .eq('turn_id', turnId)
    .order('dart_index', { ascending: true });

  if (error) return { throws: [], error: error.message };
  return { throws: ((data ?? []) as ThrowSequenceRow[]), error: null };
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

    const derivedScored = scoreFromSegment(body.segment);
    if (derivedScored == null) {
      return NextResponse.json({ error: 'Invalid segment' }, { status: 400 });
    }
    if (derivedScored !== body.scored) {
      return NextResponse.json({ error: 'Segment and scored value do not match' }, { status: 400 });
    }

    const existing = await loadThrowsForTurn(supabase, resolvedTurnId);
    if (existing.error) {
      return NextResponse.json({ error: existing.error }, { status: 500 });
    }

    const expected = getExpectedNextDartIndex(existing.throws);
    if (!expected.ok) {
      return NextResponse.json({ error: expected.error }, { status: 409 });
    }
    if (body.dartIndex !== expected.nextDartIndex) {
      return NextResponse.json(
        { error: `Expected dartIndex ${expected.nextDartIndex}, got ${body.dartIndex}` },
        { status: 409 }
      );
    }

    const { data, error } = await supabase
      .from('throws')
      .insert({
        turn_id: resolvedTurnId,
        dart_index: body.dartIndex,
        segment: body.segment,
        scored: derivedScored,
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
    if (!body.turnId) {
      return NextResponse.json({ error: 'turnId is required' }, { status: 400 });
    }
    const supabase = getSupabaseServerClient();
    const match = await loadMatch(supabase, matchId);
    if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    if (!isMatchActive(match)) return NextResponse.json({ error: 'Match is not active' }, { status: 409 });

    const linked = await ensureTurnInMatch(supabase, matchId, body.turnId);
    if (!linked) return NextResponse.json({ error: 'Turn not found for match' }, { status: 404 });

    const { data: latestThrows, error: latestError } = await supabase
      .from('throws')
      .select('id, dart_index, segment, scored')
      .eq('turn_id', body.turnId)
      .order('dart_index', { ascending: false })
      .limit(1);
    if (latestError) return NextResponse.json({ error: latestError.message }, { status: 500 });

    const latestThrow = ((latestThrows ?? []) as ThrowSequenceRow[])[0];
    if (!latestThrow) {
      return NextResponse.json({ error: 'No throws to undo' }, { status: 404 });
    }

    const { error, count } = await supabase
      .from('throws')
      .delete({ count: 'exact' })
      .eq('id', latestThrow.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (count === 0) return NextResponse.json({ error: 'Throw was already removed' }, { status: 404 });
    return NextResponse.json({ ok: true, deletedThrow: latestThrow });
  } catch (error) {
    console.error('DELETE /api/matches/[matchId]/throws error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
