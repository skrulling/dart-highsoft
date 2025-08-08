"use client";

import Dartboard from '@/components/Dartboard';
import MobileKeypad from '@/components/MobileKeypad';
import { computeHit, SegmentResult } from '@/utils/dartboard';
import { applyThrow, FinishRule } from '@/utils/x01';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

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
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [match, setMatch] = useState<MatchRecord | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [legs, setLegs] = useState<LegRecord[]>([]);
  const [turns, setTurns] = useState<TurnRecord[]>([]); // for current leg only
  const [turnsByLeg, setTurnsByLeg] = useState<Record<string, TurnRecord[]>>({});

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
      const supabase = await getSupabaseClient();
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
        setTurns(((tns ?? []) as TurnRecord[]).sort((a, b) => a.turn_number - b.turn_number));
      } else {
        setTurns([]);
      }

      // Load turns for all legs to compute per-leg averages
      if (legsTyped.length > 0) {
        const legIds = legsTyped.map((l) => l.id);
        const { data: allTurns } = await supabase
          .from('turns')
          .select('*')
          .in('leg_id', legIds)
          .order('turn_number');
        const grouped: Record<string, TurnRecord[]> = {};
        for (const t of ((allTurns ?? []) as TurnRecord[])) {
          if (!grouped[t.leg_id]) grouped[t.leg_id] = [];
          grouped[t.leg_id].push(t);
        }
        setTurnsByLeg(grouped);
      } else {
        setTurnsByLeg({});
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

  const startScore: number = useMemo(() => (match?.start_score ? parseInt(match.start_score, 10) : 501), [match?.start_score]);
  const finishRule: FinishRule = useMemo(() => (match?.finish ?? 'double_out'), [match]);

  // Determine if match has a winner already
  const matchWinnerId = useMemo(() => {
    if (!match) return null as string | null;
    const counts = legs.reduce<Record<string, number>>((acc, l) => {
      if (l.winner_player_id) acc[l.winner_player_id] = (acc[l.winner_player_id] || 0) + 1;
      return acc;
    }, {});
    const winner = Object.entries(counts).find(([, c]) => c >= match.legs_to_win)?.[0] ?? null;
    return winner;
  }, [legs, match]);

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
    const supabase = await getSupabaseClient();
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

  async function finishTurn(busted: boolean, opts?: { skipReload?: boolean }) {
    const ongoing = ongoingTurnRef.current;
    if (!ongoing) return;
    const total = ongoing.darts.reduce((s, d) => s + d.scored, 0);
    const supabase = await getSupabaseClient();
    const { error: updErr } = await supabase.from('turns').update({ total_scored: total, busted }).eq('id', ongoing.turnId);
    if (updErr) {
      alert(`Failed to update turn: ${updErr.message}`);
    }
    ongoingTurnRef.current = null;
    setLocalTurn({ playerId: null, darts: [] });
    if (!opts?.skipReload) {
      await loadAll();
    }
  }

  async function endLegAndMaybeMatch(winnerPlayerId: string) {
    if (!currentLeg || !match) return;
    const supabase = await getSupabaseClient();
    // Set leg winner if not already set
    const { error: legErr } = await supabase
      .from('legs')
      .update({ winner_player_id: winnerPlayerId })
      .eq('id', currentLeg.id)
      .is('winner_player_id', null);
    if (legErr) {
      alert(`Failed to set leg winner: ${legErr.message}`);
      await loadAll();
      return;
    }
    // Compute match winner
    const { data: allLegs, error: listErr } = await supabase.from('legs').select('*').eq('match_id', matchId);
    if (listErr) {
      alert(`Failed to load legs: ${listErr.message}`);
      await loadAll();
      return;
    }
    const wonCounts = ((allLegs as LegRecord[] | null) ?? []).reduce<Record<string, number>>((acc, l) => {
      if (l.winner_player_id) acc[l.winner_player_id] = (acc[l.winner_player_id] || 0) + 1;
      return acc;
    }, {});
    const target = match.legs_to_win;
    const someoneWonMatch = Object.entries(wonCounts).find(([, c]) => c >= target);
    if (!someoneWonMatch) {
      const nextLegNum = (allLegs ?? []).length + 1;
      const { error: insErr } = await supabase.from('legs').insert({ match_id: matchId, leg_number: nextLegNum, starting_player_id: winnerPlayerId });
      if (insErr) {
        alert(`Failed to create next leg: ${insErr.message}`);
      }
    } else {
      const [winnerPid] = someoneWonMatch;
      const { error: setWinnerErr } = await supabase.from('matches').update({ winner_player_id: winnerPid }).eq('id', matchId);
      if (setWinnerErr) {
        alert(`Failed to set match winner: ${setWinnerErr.message}`);
      }
    }
    await loadAll();
  }

  async function handleBoardClick(_x: number, _y: number, result: ReturnType<typeof computeHit>) {
    if (matchWinnerId) return; // match over
    if (!currentLeg || !currentPlayer) return;
    const turnId = await startTurnIfNeeded();
    if (!turnId) return;

    const myScoreStart = ongoingTurnRef.current?.startScore ?? getScoreForPlayer(currentPlayer.id);
    const localSubtotal = localTurn.darts.reduce((s, d) => s + d.scored, 0);
    const outcome = applyThrow(myScoreStart - localSubtotal, result, finishRule);

    const newDartIndex = ongoingTurnRef.current!.darts.length + 1;
    const supabase = await getSupabaseClient();
    const { error: thrErr } = await supabase
      .from('throws')
      .insert({ turn_id: turnId, dart_index: newDartIndex, segment: result.label, scored: result.scored });
    if (thrErr) {
      alert(`Failed to save throw: ${thrErr.message}`);
      return;
    }
    ongoingTurnRef.current!.darts.push({ scored: result.scored, label: result.label, kind: result.kind });
    setLocalTurn((prev) => ({ playerId: currentPlayer.id, darts: [...prev.darts, { scored: result.scored, label: result.label, kind: result.kind }] }));

    if (outcome.busted) {
      await finishTurn(true);
      return;
    }
    if (outcome.finished) {
      // Persist the partial turn and finish the leg immediately without waiting for state
      await finishTurn(false, { skipReload: true });
      await endLegAndMaybeMatch(currentPlayer.id);
      return;
    }
    if (newDartIndex >= 3) {
      await finishTurn(false);
      return;
    }
  }

  async function undoLastThrow() {
    if (!currentLeg) return;
    const supabase = await getSupabaseClient();
    // If we have local darts in the ongoing turn, remove last one
    if (ongoingTurnRef.current && ongoingTurnRef.current.darts.length > 0) {
      const turnId = ongoingTurnRef.current.turnId;
      const lastIndex = ongoingTurnRef.current.darts.length; // 1-based
      const { error: delErr } = await supabase
        .from('throws')
        .delete()
        .eq('turn_id', turnId)
        .eq('dart_index', lastIndex);
      if (delErr) {
        alert(`Failed to undo throw: ${delErr.message}`);
        return;
      }
      ongoingTurnRef.current.darts.pop();
      setLocalTurn((prev) => ({ playerId: prev.playerId, darts: prev.darts.slice(0, -1) }));
      return;
    }

    // Otherwise, remove the last persisted throw in the current leg
    const { data: lastList, error: qErr } = await supabase
      .from('throws')
      .select('id, turn_id, dart_index, segment, scored, turns:turn_id!inner(leg_id, player_id, turn_number)')
      .eq('turns.leg_id', currentLeg.id)
      .order('turns.turn_number', { ascending: false })
      .order('dart_index', { ascending: false })
      .limit(1);
    if (qErr) {
      alert(`Failed to query last throw: ${qErr.message}`);
      return;
    }
    const last = ((lastList ?? [])[0] as unknown) as
      | { id: string; turn_id: string; dart_index: number; segment: string; scored: number; turns: { leg_id: string; player_id: string; turn_number: number } }
      | undefined;
    if (!last) return; // nothing to undo

    const { error: delErr2 } = await supabase.from('throws').delete().eq('id', last.id);
    if (delErr2) {
      alert(`Failed to undo throw: ${delErr2.message}`);
      return;
    }

    // Check remaining throws in that turn
    const { data: remaining } = await supabase
      .from('throws')
      .select('dart_index, segment, scored')
      .eq('turn_id', last.turn_id)
      .order('dart_index');
    const darts = ((remaining as { dart_index: number; segment: string; scored: number }[] | null) ?? []).map((r) => ({
      scored: r.scored,
      label: r.segment,
      kind: 'Single' as SegmentResult['kind'], // kind not needed for local subtotal
    }));

    if (darts.length === 0) {
      // Delete empty turn
      await supabase.from('turns').delete().eq('id', last.turn_id);
      // After removing an entire turn, compute whose turn it should be and reopen if it's the previous player's turn
      await loadAll();
      const prevLeg = (legs ?? []).find((l) => !l.winner_player_id) ?? legs[legs.length - 1];
      if (!prevLeg) return;
      const turnCount = turns.filter((t) => t.leg_id === prevLeg.id).length;
      const prevPlayer = orderPlayers[(turnCount + orderPlayers.length - 1) % orderPlayers.length];
      ongoingTurnRef.current = { turnId: last.turn_id, playerId: prevPlayer.id, darts: [], startScore: getScoreForPlayer(prevPlayer.id) };
      setLocalTurn({ playerId: prevPlayer.id, darts: [] });
      return;
    } else {
      // Update turn total to current subtotal and mark not busted
      const newTotal = darts.reduce((s, d) => s + d.scored, 0);
      await supabase.from('turns').update({ total_scored: newTotal, busted: false }).eq('id', last.turn_id);
      // Reopen local turn for that player
      ongoingTurnRef.current = {
        turnId: last.turn_id,
        playerId: last.turns.player_id,
        darts,
        startScore: getScoreForPlayer(last.turns.player_id) + newTotal, // reverse the subtotal to original start
      };
      setLocalTurn({ playerId: last.turns.player_id, darts });
      await loadAll();
      return;
    }
  }

  const [rematchLoading, setRematchLoading] = useState(false);

  async function startRematch() {
    if (!match) return;
    try {
      setRematchLoading(true);
      const supabase = await getSupabaseClient();
      // Load players from DB to avoid race conditions
      const { data: mpData, error: mpLoadErr } = await supabase
        .from('match_players')
        .select('player_id, play_order')
        .eq('match_id', matchId)
        .order('play_order');
      if (mpLoadErr) {
        alert(mpLoadErr.message);
        setRematchLoading(false);
        return;
      }
      const playerIds = ((mpData ?? []) as { player_id: string; play_order: number }[]).map((r) => r.player_id);
      if (playerIds.length < 2) {
        alert('Need at least 2 players to start a rematch');
        setRematchLoading(false);
        return;
      }
      const order = [...playerIds].sort(() => Math.random() - 0.5);
      const { data: newMatch, error: mErr } = await supabase
        .from('matches')
        .insert({ mode: 'x01', start_score: match.start_score, finish: match.finish, legs_to_win: match.legs_to_win })
        .select('*')
        .single();
      if (mErr || !newMatch) {
        alert(mErr?.message ?? 'Failed to create rematch');
        setRematchLoading(false);
        return;
      }
      const mp = order.map((id, idx) => ({ match_id: (newMatch as MatchRecord).id, player_id: id, play_order: idx }));
      const { error: mpErr } = await supabase.from('match_players').insert(mp);
      if (mpErr) {
        alert(mpErr.message);
        setRematchLoading(false);
        return;
      }
      const { error: lErr } = await supabase
        .from('legs')
        .insert({ match_id: (newMatch as MatchRecord).id, leg_number: 1, starting_player_id: order[0] });
      if (lErr) {
        alert(lErr.message);
        setRematchLoading(false);
        return;
      }
      // Redirect to new match page
      router.push(`/match/${(newMatch as MatchRecord).id}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error creating rematch';
      alert(msg);
    } finally {
      setRematchLoading(false);
    }
  }

  if (loading) return <div className="p-4">Loading…</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;
  if (!match || !currentLeg) return <div className="p-4">No leg available</div>;

  return (
    <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-6">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Match</CardTitle>
            <CardDescription>
              Start {match.start_score} • {match.finish.replace('_', ' ')} • Legs to win {match.legs_to_win}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-2">
              {orderPlayers.map((p) => {
                const score = getScoreForPlayer(p.id);
                const isCurrent = currentPlayer?.id === p.id;
                const isActiveTurn = localTurn.playerId === p.id && localTurn.darts.length > 0;
                return (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between rounded px-3 py-2 ${
                      isCurrent ? 'border border-accent bg-accent/30' : 'border'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {isCurrent && !matchWinnerId && <Badge>Up</Badge>}
                      <div className="font-medium">{p.display_name}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      {isActiveTurn && (
                        <div className="flex gap-1">
                          {localTurn.darts.map((d, idx) => (
                            <Badge key={idx} variant="secondary">{d.label}</Badge>
                          ))}
                          {Array.from({ length: 3 - localTurn.darts.length }).map((_, idx) => (
                            <Badge key={`p${idx}`} variant="outline">–</Badge>
                          ))}
                        </div>
                      )}
                      <div className="text-2xl font-mono min-w-[3ch] text-right">{score}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
        {legs.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Legs</CardTitle>
              <CardDescription>Winners and averages</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2">
                {legs.map((l) => {
                  const winner = players.find((p) => p.id === l.winner_player_id);
                  const turns = turnsByLeg[l.id] ?? [];
                  const byPlayer: Record<string, { total: number; turns: number }> = {};
                  for (const t of turns) {
                    if (!byPlayer[t.player_id]) byPlayer[t.player_id] = { total: 0, turns: 0 };
                    byPlayer[t.player_id].turns += 1;
                    if (!t.busted) byPlayer[t.player_id].total += t.total_scored;
                  }
                  return (
                    <div key={l.id} className="flex items-center justify-between rounded border px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">Leg {l.leg_number}</span>
                        {winner && <span>🏆 {winner.display_name}</span>}
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        {orderPlayers.map((p) => {
                          const s = byPlayer[p.id] ?? { total: 0, turns: 0 };
                          const avg = s.turns > 0 ? (s.total / s.turns).toFixed(2) : '0.00';
                          return (
                            <span key={p.id} className="text-muted-foreground">
                              {p.display_name}: {avg}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
        {matchWinnerId && (
          <Card>
            <CardHeader>
              <CardTitle>Winner</CardTitle>
              <CardDescription>
                {players.find((p) => p.id === matchWinnerId)?.display_name} wins the match
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                <Button onClick={startRematch} disabled={rematchLoading}>{rematchLoading ? 'Starting…' : 'Rematch'}</Button>
              </div>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Turns</CardTitle>
            <CardDescription>History of this leg</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-72 overflow-auto divide-y">
              {(turns ?? []).map((t) => (
                <div key={t.id} className="py-2 text-sm flex items-center justify-between">
                  <div>{players.find((p) => p.id === t.player_id)?.display_name}</div>
                  <div className="font-mono">{t.busted ? 'BUST' : t.total_scored}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
      <div className="flex flex-col items-center gap-3">
        <div className="w-full">
          {/* Mobile: player indicator + keypad at top */}
          <div className="md:hidden space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-medium">{currentPlayer?.display_name ?? '—'}</div>
              <div className="flex gap-2">
                {localTurn.darts.map((d, idx) => (
                  <Badge key={idx} variant="secondary">{d.label}</Badge>
                ))}
                {Array.from({ length: 3 - localTurn.darts.length }).map((_, idx) => (
                  <Badge key={`m${idx}`} variant="outline">–</Badge>
                ))}
              </div>
            </div>
            <div className={`${matchWinnerId ? 'pointer-events-none opacity-50' : ''}`}>
              <MobileKeypad onHit={(seg) => handleBoardClick(0, 0, seg as unknown as ReturnType<typeof computeHit>)} />
            </div>
          </div>
          {/* Desktop: board */}
          <div className={`hidden md:flex justify-center ${matchWinnerId ? 'pointer-events-none opacity-50' : ''}`}>
            <Dartboard onHit={handleBoardClick} />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={undoLastThrow} disabled={!!matchWinnerId}>Undo dart</Button>
          <div className="text-sm text-gray-600 hidden md:block">Click the board to register throws</div>
        </div>
      </div>
    </div>
  );
}
