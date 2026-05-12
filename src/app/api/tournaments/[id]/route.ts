import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { cleanupTournament } from '@/lib/server/cleanupTournament';

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = getSupabaseServerClient();

    const { data: tournament, error: loadErr } = await supabase
      .from('tournaments')
      .select('id, status')
      .eq('id', id)
      .maybeSingle();

    if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
    if (!tournament) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });

    if (tournament.status === 'completed') {
      return NextResponse.json(
        { error: 'Cannot delete a completed tournament' },
        { status: 403 }
      );
    }

    await cleanupTournament(supabase, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/tournaments/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
