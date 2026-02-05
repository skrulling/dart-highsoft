import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { segment?: string; scored?: number; dartIndex?: number };
    if (!body.segment || typeof body.scored !== 'number' || typeof body.dartIndex !== 'number') {
      return NextResponse.json({ error: 'segment, scored, dartIndex are required' }, { status: 400 });
    }
    const supabase = getSupabaseServerClient();

    const { data: lastTurn } = await supabase
      .from('practice_turns')
      .select('id, turn_number, total_scored')
      .eq('session_id', id)
      .order('turn_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextTurnNumber = (lastTurn?.turn_number ?? 0) + 1;
    let turnId = lastTurn?.id as string | undefined;
    let turnTotal = lastTurn?.total_scored ?? 0;

    if (!turnId || body.dartIndex === 1) {
      const { data: newTurn, error: turnError } = await supabase
        .from('practice_turns')
        .insert({
          session_id: id,
          turn_number: nextTurnNumber,
          score_before: 0,
          total_scored: 0,
          score_after: 0,
          busted: false,
          finished: false,
        })
        .select()
        .single();
      if (turnError || !newTurn) {
        return NextResponse.json({ error: turnError?.message ?? 'Failed to create practice turn' }, { status: 500 });
      }
      turnId = newTurn.id;
      turnTotal = newTurn.total_scored;
    }

    const { data: practiceThrow, error: throwError } = await supabase
      .from('practice_throws')
      .insert({
        turn_id: turnId,
        dart_index: body.dartIndex,
        segment: body.segment,
        scored: body.scored,
      })
      .select()
      .single();
    if (throwError || !practiceThrow) {
      return NextResponse.json({ error: throwError?.message ?? 'Failed to create practice throw' }, { status: 500 });
    }

    const newTotalScored = turnTotal + body.scored;
    const turnCompleted = body.dartIndex === 3;
    const { data: updatedTurn, error: updateError } = await supabase
      .from('practice_turns')
      .update({ total_scored: newTotalScored, finished: turnCompleted })
      .eq('id', turnId)
      .select()
      .single();
    if (updateError || !updatedTurn) {
      return NextResponse.json({ error: updateError?.message ?? 'Failed to update practice turn' }, { status: 500 });
    }

    return NextResponse.json({ turn: updatedTurn, throw: practiceThrow, turnCompleted });
  } catch (error) {
    console.error('POST /api/practice/sessions/[id]/throws error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
