import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

export async function PATCH(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = getSupabaseServerClient();
    const { data: session, error: fetchError } = await supabase
      .from('around_world_sessions')
      .select('started_at')
      .eq('id', id)
      .single();
    if (fetchError || !session) {
      return NextResponse.json({ error: fetchError?.message ?? 'Session not found' }, { status: 404 });
    }
    const completedAt = new Date().toISOString();
    const durationSeconds = Math.round((new Date(completedAt).getTime() - new Date(session.started_at).getTime()) / 1000);
    const { error } = await supabase
      .from('around_world_sessions')
      .update({ completed_at: completedAt, duration_seconds: durationSeconds, is_completed: true })
      .eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('PATCH /api/around-world/sessions/[id]/complete error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
