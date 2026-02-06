import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { isMatchActive, loadMatch } from '@/lib/server/matchGuards';

type TurnSnapshot = {
  id: string;
  player_id: string;
  turn_number: number;
  busted: boolean;
  throws?: { dart_index: number }[];
};

function isUniqueViolation(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === '23505') return true;
  const message = error.message?.toLowerCase() ?? '';
  return message.includes('duplicate key');
}

function isIncomplete(turn: TurnSnapshot | null): boolean {
  if (!turn || turn.busted) return false;
  const throwCount = (turn.throws ?? []).length;
  return throwCount < 3;
}

async function getLatestTurnForLeg(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  legId: string
): Promise<TurnSnapshot | null> {
  const { data } = await supabase
    .from('turns')
    .select(
      `
      id,
      player_id,
      turn_number,
      busted,
      throws:throws(dart_index)
    `
    )
    .eq('leg_id', legId)
    .order('turn_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as TurnSnapshot | null) ?? null;
}

export async function POST(request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  try {
    const { matchId } = await params;
    const body = (await request.json()) as { legId?: string; playerId?: string };
    if (!body.legId || !body.playerId) {
      return NextResponse.json({ error: 'legId and playerId are required' }, { status: 400 });
    }
    const supabase = getSupabaseServerClient();
    const match = await loadMatch(supabase, matchId);
    if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    if (!isMatchActive(match)) return NextResponse.json({ error: 'Match is not active' }, { status: 409 });

    const { data: leg } = await supabase.from('legs').select('id').eq('id', body.legId).eq('match_id', matchId).single();
    if (!leg) {
      return NextResponse.json({ error: 'Leg not found for match' }, { status: 404 });
    }

    // Idempotency guard: if the latest turn is still incomplete for this player, return it.
    const latest = await getLatestTurnForLeg(supabase, body.legId);
    if (latest && latest.player_id === body.playerId && isIncomplete(latest)) {
      return NextResponse.json({ turn: latest });
    }

    // Race-tolerant create: concurrent callers can contend on turn_number uniqueness.
    for (let attempt = 0; attempt < 2; attempt++) {
      const lastTurn = attempt === 0 ? latest : await getLatestTurnForLeg(supabase, body.legId);
      const nextTurnNumber = (lastTurn?.turn_number ?? 0) + 1;

      const { data, error } = await supabase
        .from('turns')
        .insert({
          leg_id: body.legId,
          player_id: body.playerId,
          turn_number: nextTurnNumber,
          total_scored: 0,
          busted: false,
        })
        .select('*')
        .single();

      if (!error && data) {
        return NextResponse.json({ turn: data });
      }

      if (!isUniqueViolation(error)) {
        return NextResponse.json({ error: error?.message ?? 'Failed to create turn' }, { status: 500 });
      }

      const latestAfterConflict = await getLatestTurnForLeg(supabase, body.legId);
      if (latestAfterConflict && latestAfterConflict.player_id === body.playerId && isIncomplete(latestAfterConflict)) {
        return NextResponse.json({ turn: latestAfterConflict });
      }
    }

    return NextResponse.json({ error: 'Failed to create turn due to concurrent updates' }, { status: 409 });
  } catch (error) {
    console.error('POST /api/matches/[matchId]/turns error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
