import type { SupabaseClient } from '@supabase/supabase-js';
import { applyThrow, type FinishRule } from '@/utils/x01';
import type { SegmentResult } from '@/utils/dartboard';

type TurnRow = {
  id: string;
  player_id: string;
  turn_number: number;
  total_scored: number | null;
  busted: boolean;
  tiebreak_round: number | null;
};

type ThrowRow = {
  id: string;
  turn_id: string;
  dart_index: number;
  segment: string;
  scored: number;
};

function segmentResultFromLabel(label: string): SegmentResult {
  if (label === 'Miss') return { kind: 'Miss', scored: 0, label: 'Miss' };
  if (label === 'SB') return { kind: 'OuterBull', scored: 25, label: 'SB' };
  if (label === 'DB') return { kind: 'InnerBull', scored: 50, label: 'DB' };
  const m = label.match(/^([SDT])(\d{1,2})$/);
  if (m) {
    const mod = m[1] as 'S' | 'D' | 'T';
    const n = parseInt(m[2]!, 10);
    if (mod === 'S') return { kind: 'Single', value: n, scored: n, label };
    if (mod === 'D') return { kind: 'Double', value: n, scored: n * 2, label };
    return { kind: 'Triple', value: n, scored: n * 3, label };
  }
  return { kind: 'Miss', scored: 0, label: 'Miss' };
}

export async function recomputeLegTurns(
  supabase: SupabaseClient,
  legId: string,
  startScore: number,
  finishRule: FinishRule
): Promise<void> {
  const { data: tData, error: tErr } = await supabase
    .from('turns')
    .select('id, player_id, turn_number, total_scored, busted, tiebreak_round')
    .eq('leg_id', legId)
    .order('turn_number');
  if (tErr || !tData) return;
  const turns = tData as TurnRow[];
  const turnIds = turns.map((t) => t.id);
  if (turnIds.length === 0) return;

  const { data: thrData, error: thrErr } = await supabase
    .from('throws')
    .select('id, turn_id, dart_index, segment, scored')
    .in('turn_id', turnIds)
    .order('dart_index');
  if (thrErr) return;
  const throws = (thrData ?? []) as ThrowRow[];

  const throwsByTurn = new Map<string, ThrowRow[]>();
  for (const thr of throws) {
    if (!throwsByTurn.has(thr.turn_id)) throwsByTurn.set(thr.turn_id, []);
    throwsByTurn.get(thr.turn_id)!.push(thr);
  }
  for (const list of throwsByTurn.values()) list.sort((a, b) => a.dart_index - b.dart_index);

  const perPlayerScore = new Map<string, number>();
  for (const t of turns) perPlayerScore.set(t.player_id, startScore);

  const updates: { id: string; total_scored: number; busted: boolean }[] = [];
  for (const t of turns) {
    if (t.tiebreak_round != null) continue; // skip tiebreak turns
    const start = perPlayerScore.get(t.player_id) ?? startScore;
    let current = start;
    let total = 0;
    let busted = false;
    let finished = false;
    const thrList = throwsByTurn.get(t.id) ?? [];
    for (const thr of thrList) {
      if (finished || busted) break;
      const seg = segmentResultFromLabel(thr.segment);
      const outcome = applyThrow(current, seg, finishRule);
      if (outcome.busted) {
        busted = true;
        total = 0;
        current = start;
        break;
      }
      total += current - outcome.newScore;
      current = outcome.newScore;
      if (outcome.finished) finished = true;
    }
    if (!busted) perPlayerScore.set(t.player_id, current);
    if (t.total_scored !== total || t.busted !== busted) {
      updates.push({ id: t.id, total_scored: total, busted });
    }
  }

  if (updates.length === 0) return;
  await Promise.all(
    updates.map((u) => supabase.from('turns').update({ total_scored: u.total_scored, busted: u.busted }).eq('id', u.id))
  );
}
