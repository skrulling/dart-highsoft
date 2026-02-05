import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { notes?: string };
    const supabase = getSupabaseServerClient();
    const { error } = await supabase
      .from('practice_sessions')
      .update({ ended_at: new Date().toISOString(), is_active: false, notes: body.notes })
      .eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('PATCH /api/practice/sessions/[id]/end error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
