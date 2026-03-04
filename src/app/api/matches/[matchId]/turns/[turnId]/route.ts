import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { isMatchActive, loadMatch } from '@/lib/server/matchGuards';
import { completeLeg } from '@/lib/server/completeLeg';
import { computeFairEndingState } from '@/utils/fairEnding';
import { advanceTournament } from '@/lib/tournament/advance';

async function ensureTurnInMatch(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  matchId: string,
  turnId: string
) {
  const { data: turn } = await supabase
    .from('turns')
    .select('id, leg_id, legs!inner(match_id)')
    .eq('id', turnId)
    .eq('legs.match_id', matchId)
    .single();
  if (!turn) return null;
  return { turn: { id: turn.id as string, leg_id: turn.leg_id as string } };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ matchId: string; turnId: string }> }) {
  try {
    const { matchId, turnId } = await params;
    let body: { totalScored?: number; busted?: boolean } | null = null;
    try {
      body = (await request.json()) as { totalScored?: number; busted?: boolean };
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    if (typeof body.totalScored !== 'number' || typeof body.busted !== 'boolean') {
      return NextResponse.json({ error: 'totalScored and busted are required' }, { status: 400 });
    }
    const supabase = getSupabaseServerClient();
    const match = await loadMatch(supabase, matchId);
    if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    if (!isMatchActive(match)) return NextResponse.json({ error: 'Match is not active' }, { status: 409 });

    const linked = await ensureTurnInMatch(supabase, matchId, turnId);
    if (!linked) return NextResponse.json({ error: 'Turn not found for match' }, { status: 404 });

    const { error } = await supabase
      .from('turns')
      .update({ total_scored: body.totalScored, busted: body.busted })
      .eq('id', turnId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // ── Fair ending: check if this turn completes a round/tiebreak ────
    if (match.fair_ending) {
      const legId = linked.turn.leg_id;

      const [{ data: legTurns, error: turnsErr }, { data: mpData, error: mpErr }] =
        await Promise.all([
          supabase
            .from('turns')
            .select('id, player_id, total_scored, busted, tiebreak_round, throws:throws(id)')
            .eq('leg_id', legId)
            .order('turn_number'),
          supabase
            .from('match_players')
            .select('player_id, play_order')
            .eq('match_id', matchId)
            .order('play_order'),
        ]);

      if (!turnsErr && legTurns && !mpErr && mpData) {
        const turnsForState = legTurns.map((t) => ({
          player_id: t.player_id as string,
          total_scored: t.total_scored as number,
          busted: t.busted as boolean,
          tiebreak_round: t.tiebreak_round as number | null,
          throw_count: Array.isArray(t.throws) ? t.throws.length : 0,
        }));

        const orderPlayers = (mpData as { player_id: string; play_order: number }[]).map(
          (r) => ({ id: r.player_id })
        );

        const startScore = parseInt(match.start_score, 10);
        const state = computeFairEndingState(turnsForState, orderPlayers, startScore, true);

        if (state.phase === 'resolved' && state.winnerId) {
          try {
            const result = await completeLeg(supabase, matchId, legId, state.winnerId, match);

            // ── Tournament advancement ─────────────────────────────────
            if (result.matchCompleted && match.tournament_match_id) {
              try {
                const { data: tm, error: tmErr } = await supabase
                  .from('tournament_matches')
                  .select('player1_id, player2_id')
                  .eq('id', match.tournament_match_id)
                  .single();

                if (tmErr) {
                  console.error('Failed to load tournament match for advancement:', tmErr);
                } else if (tm) {
                  const isParticipant = tm.player1_id === state.winnerId || tm.player2_id === state.winnerId;
                  if (!isParticipant) {
                    console.error(
                      'Skipping tournament advancement: winner is not one of tournament match players',
                      { tournamentMatchId: match.tournament_match_id, winnerId: state.winnerId }
                    );
                    return NextResponse.json({ ok: true, legCompleted: true, matchCompleted: result.matchCompleted });
                  }
                  const loserId = tm.player1_id === state.winnerId
                    ? tm.player2_id
                    : tm.player1_id;
                  if (loserId) {
                    await advanceTournament(supabase, match.tournament_match_id, state.winnerId, loserId);
                  }
                }
              } catch (advErr) {
                console.error('Tournament advancement error (fair ending):', advErr);
              }
            }

            return NextResponse.json({ ok: true, legCompleted: true, matchCompleted: result.matchCompleted });
          } catch (err) {
            console.error('Fair ending completeLeg error:', err);
            // Non-fatal: the client-side fallback will still work
          }
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('PATCH /api/matches/[matchId]/turns/[turnId] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ matchId: string; turnId: string }> }) {
  try {
    const { matchId, turnId } = await params;
    const supabase = getSupabaseServerClient();
    const match = await loadMatch(supabase, matchId);
    if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    if (!isMatchActive(match)) return NextResponse.json({ error: 'Match is not active' }, { status: 409 });

    const linked = await ensureTurnInMatch(supabase, matchId, turnId);
    if (!linked) return NextResponse.json({ error: 'Turn not found for match' }, { status: 404 });

    const { error } = await supabase.from('turns').delete().eq('id', turnId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/matches/[matchId]/turns/[turnId] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
