"use client";

import Dartboard from '@/components/Dartboard';
import { computeHit, SegmentResult } from '@/utils/dartboard';
import { applyThrow, FinishRule } from '@/utils/x01';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Player = { id: string; display_name: string };

type MatchRecord = {
  id: string;
  mode: 'x01';
  start_score: '201' | '301' | '501';
  finish: FinishRule;
  legs_to_win: number;
};

type LegRecord = {
  id: string;
  match_id: string;
  leg_number: number;
  starting_player_id: string;
  winner_player_id: string | null;
};

type TurnRecord = {
  id: string;
  leg_id: string;
  player_id: string;
  turn_number: number;
  total_scored: number;
  busted: boolean;
};

type MatchPlayersRow = {
  match_id: string;
  player_id: string;
  play_order: number;
  players: Player;
};

export default function MatchClient({ matchId }: { matchId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [match, setMatch] = useState<MatchRecord | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [legs, setLegs] = useState<LegRecord[]>([]);
  const [turns, setTurns] = useState<TurnRecord[]>([]); // for current leg only

  const ongoingTurnRef = useRef<{
    turnId: string;
    playerId: string;
    darts: { scored: number; label: string; kind: SegmentResult['kind'] }[];
    startScore: number;
  } | null>(null);

  const [localTurn, setLocalTurn] = useState<{
    playerId: string | null;
    darts: { scored: number; label: string; kind: SegmentResult['kind'] }[];
  }>({ playerId: null, darts: [] });

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabaseClient();
      const { data: m } = await supabase.from('matches').select('*').eq('id', matchId).single();
      setMatch(m as MatchRecord);

      const { data: mp } = await supabase
        .from('match_players')
        .select('*, players:player_id(*)')
        .eq('match_id', matchId)
        .order('play_order');
      const flatPlayers = ((mp as MatchPlayersRow[] | null) ?? []).map((r) => r.players);
      setPlayers(flatPlayers);

      const { data: lgs } = await supabase.from('legs').select('*').eq('match_id', matchId).order('leg_number');
      const legsTyped = (lgs ?? []) as LegRecord[];
      setLegs(legsTyped);

      const currentLeg = legsTyped.find((l) => !l.winner_player_id) || legsTyped[legsTyped.length - 1];
      if (currentLeg) {
        const { data: tns } = await supabase
          .from('turns')
          .select('*')
          .eq('leg_id', currentLeg.id)
          .order('turn_number');
        setTurns((tns ?? []) as TurnRecord[]);
      } else {
        setTurns([]);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const currentLeg = useMemo(() => (legs ?? []).find((l) => !l.winner_player_id) ?? legs[legs.length - 1], [legs]);

  const orderPlayers = useMemo(() => {
    if (!match || players.length === 0 || !currentLeg) return [] as Player[];
    const startIdx = players.findIndex((p) => p.id === currentLeg.starting_player_id);
    const rotated = [...players.slice(startIdx), ...players.slice(0, startIdx)];
    return rotated;
  }, [match, players, currentLeg]);

  const startScore: number = useMemo(() => (match?.start_score ? parseInt(match.start_score, 10) : 501), [match]);
  const finishRule: FinishRule = useMemo(() => (match?.finish ?? 'double_out'), [match]);

  const currentPlayer = useMemo(() => {
    if (!orderPlayers.length) return null as Player | null;
    if (localTurn.playerId) {
      return orderPlayers.find((p) => p.id === localTurn.playerId) ?? orderPlayers[0];
    }
    const idx = turns.length % orderPlayers.length;
    return orderPlayers[idx];
  }, [orderPlayers, turns.length, localTurn.playerId]);

  function getScoreForPlayer(playerId: string): number {
    const legTurns = turns.filter((t) => t.player_id === playerId && t.leg_id === currentLeg?.id);
    const scored = legTurns.reduce((sum, t) => (t.busted ? sum : sum + (t.total_scored || 0)), 0);
    const current = startScore - scored;
    if (localTurn.playerId === playerId) {
      const sub = localTurn.darts.reduce((s, d) => s + d.scored, 0);
      return Math.max(0, current - sub);
    }
    return current;
  }

  async function startTurnIfNeeded() {
    if (!currentLeg || !currentPlayer) return null as string | null;
    if (ongoingTurnRef.current) return ongoingTurnRef.current.turnId;
    const nextTurnNumber = turns.length + 1;
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('turns')
      .insert({ leg_id: currentLeg.id, player_id: currentPlayer.id, turn_number: nextTurnNumber, total_scored: 0, busted: false })
      .select('*')
      .single();
    if (error || !data) {
      alert(error?.message ?? 'Failed to start turn');
      return null;
    }
    ongoingTurnRef.current = { turnId: (data as TurnRecord).id, playerId: currentPlayer.id, darts: [], startScore: getScoreForPlayer(currentPlayer.id) };
    setLocalTurn({ playerId: currentPlayer.id, darts: [] });
    return (data as TurnRecord).id;
    }

  async function finishTurn(busted: boolean) {
    const ongoing = ongoingTurnRef.current;
    if (!ongoing) return;
    const total = ongoing.darts.reduce((s, d) => s + d.scored, 0);
    const supabase = getSupabaseClient();
    await supabase.from('turns').update({ total_scored: total, busted }).eq('id', ongoing.turnId);
    ongoingTurnRef.current = null;
    setLocalTurn({ playerId: null, darts: [] });
    await loadAll();
  }

  async function maybeFinishLegIfWon(playerId: string) {
    if (!currentLeg || !match) return;
    const score = getScoreForPlayer(playerId);
    if (score === 0) {
      const supabase = getSupabaseClient();
      await supabase.from('legs').update({ winner_player_id: playerId }).eq('id', currentLeg.id);
      const { data: allLegs } = await supabase.from('legs').select('*').eq('match_id', matchId);
      const wonCounts = ((allLegs as LegRecord[] | null) ?? []).reduce<Record<string, number>>((acc, l) => {
        if (l.winner_player_id) acc[l.winner_player_id] = (acc[l.winner_player_id] || 0) + 1;
        return acc;
      }, {});
      const target = match.legs_to_win;
      const someoneWonMatch = Object.values(wonCounts).some((c) => c >= target);
      if (!someoneWonMatch) {
        const nextLegNum = (allLegs ?? []).length + 1;
        await (getSupabaseClient()).from('legs').insert({ match_id: matchId, leg_number: nextLegNum, starting_player_id: playerId });
      }
      await loadAll();
    }
  }

  async function handleBoardClick(_x: number, _y: number, result: ReturnType<typeof computeHit>) {
    if (!currentLeg || !currentPlayer) return;
    const turnId = await startTurnIfNeeded();
    if (!turnId) return;

    const myScoreStart = ongoingTurnRef.current?.startScore ?? getScoreForPlayer(currentPlayer.id);
    const localSubtotal = localTurn.darts.reduce((s, d) => s + d.scored, 0);
    const outcome = applyThrow(myScoreStart - localSubtotal, result, finishRule);

    const newDartIndex = ongoingTurnRef.current!.darts.length + 1;
    const supabase = getSupabaseClient();
    await supabase
      .from('throws')
      .insert({ turn_id: turnId, dart_index: newDartIndex, segment: result.label, scored: result.scored });
    ongoingTurnRef.current!.darts.push({ scored: result.scored, label: result.label, kind: result.kind });
    setLocalTurn((prev) => ({ playerId: currentPlayer.id, darts: [...prev.darts, { scored: result.scored, label: result.label, kind: result.kind }] }));

    if (outcome.busted) {
      await finishTurn(true);
      return;
    }
    if (outcome.finished) {
      await finishTurn(false);
      await maybeFinishLegIfWon(currentPlayer.id);
      return;
    }
    if (newDartIndex >= 3) {
      await finishTurn(false);
      return;
    }
  }

  if (loading) return <div className="p-4">Loading…</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;
  if (!match || !currentLeg) return <div className="p-4">No leg available</div>;

  return (
    <div className="max-w-5xl mx-auto p-4 grid md:grid-cols-2 gap-6">
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Match</h1>
        <div className="text-sm text-gray-600">Start {match.start_score} • {match.finish.replace('_', ' ')}</div>
        <div className="grid grid-cols-1 gap-2">
          {orderPlayers.map((p) => {
            const score = getScoreForPlayer(p.id);
            const isCurrent = currentPlayer?.id === p.id;
            return (
              <div key={p.id} className={`flex items-center justify-between border rounded px-3 py-2 ${isCurrent ? 'bg-yellow-50 border-yellow-300' : ''}`}>
                <div className="font-medium">{p.display_name}</div>
                <div className="text-2xl font-mono">{score}</div>
              </div>
            );
          })}
        </div>
        <div className="mt-2">
          <div className="font-medium mb-1">Turns</div>
          <div className="max-h-64 overflow-auto border rounded">
            {(turns ?? []).map((t) => (
              <div key={t.id} className="px-3 py-2 border-b text-sm flex items-center justify-between">
                <div>{players.find((p) => p.id === t.player_id)?.display_name}</div>
                <div className="font-mono">{t.busted ? 'BUST' : t.total_scored}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-col items-center gap-3">
        <Dartboard onHit={handleBoardClick} />
        <div className="text-sm text-gray-600">Click the board to register throws</div>
      </div>
    </div>
  );
}
