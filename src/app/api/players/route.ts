import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { displayName?: string };
    const displayName = body.displayName?.trim();
    if (!displayName) {
      return NextResponse.json({ error: 'displayName is required' }, { status: 400 });
    }
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from('players')
      .insert({ display_name: displayName })
      .select('*')
      .single();
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? 'Failed to create player' }, { status: 500 });
    }
    return NextResponse.json({ player: data });
  } catch (error) {
    console.error('POST /api/players error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
