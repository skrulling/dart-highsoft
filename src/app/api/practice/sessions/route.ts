import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      playerId?: string;
      startScore?: number;
      finishRule?: 'single_out' | 'double_out';
      sessionGoal?: string;
    };
    if (!body.playerId) {
      return NextResponse.json({ error: 'playerId is required' }, { status: 400 });
    }
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from('practice_sessions')
      .insert({
        player_id: body.playerId,
        start_score: body.startScore ?? 501,
        finish_rule: body.finishRule ?? 'double_out',
        session_goal: body.sessionGoal,
      })
      .select('id')
      .single();
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? 'Failed to create session' }, { status: 500 });
    }
    return NextResponse.json({ sessionId: data.id });
  } catch (error) {
    console.error('POST /api/practice/sessions error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
