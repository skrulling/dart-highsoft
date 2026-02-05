import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { playerId?: string; variant?: 'single' | 'double' };
    if (!body.playerId || !body.variant) {
      return NextResponse.json({ error: 'playerId and variant are required' }, { status: 400 });
    }
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from('around_world_sessions')
      .insert({
        player_id: body.playerId,
        variant: body.variant,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? 'Failed to create session' }, { status: 500 });
    }
    return NextResponse.json({ session: data });
  } catch (error) {
    console.error('POST /api/around-world/sessions error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
