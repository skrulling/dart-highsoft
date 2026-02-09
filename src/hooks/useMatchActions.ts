"use client";

import { useCallback, useRef, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { apiRequest } from '@/lib/apiClient';
import { applyThrow, type FinishRule } from '@/utils/x01';
import { recordPerfMetric } from '@/lib/match/perfMetrics';
import type { SegmentResult } from '@/utils/dartboard';
import type { LegRecord, MatchRecord, Player, TurnRecord, TurnWithThrows } from '@/lib/match/types';
import type { EditableThrow } from '@/components/match/EditThrowsModal';
import { generateMatchRecap } from '@/services/commentaryService';
import type { CommentaryPersonaId, PlayerStats } from '@/lib/commentary/types';

type LocalTurn = {
  playerId: string | null;
  darts: { scored: number; label: string; kind: SegmentResult['kind'] }[];
};

function segmentLabelToKind(label: string): SegmentResult['kind'] {
  if (label === 'Miss') return 'Miss';
  if (label === 'SB') return 'OuterBull';
  if (label === 'DB') return 'InnerBull';
  if (label.startsWith('D')) return 'Double';
  if (label.startsWith('T')) return 'Triple';
  return 'Single';
}

type UseMatchActionsArgs = {
  matchId: string;
  match: MatchRecord | null;
  players: Player[];
  legs: LegRecord[];
  turns: TurnRecord[];
  turnThrowCounts: Record<string, number>;
  currentLeg: LegRecord | undefined;
  currentPlayer: Player | null;
  orderPlayers: Player[];
  finishRule: FinishRule;
  matchWinnerId: string | null;
  localTurn: LocalTurn;
  ongoingTurnRef: React.MutableRefObject<{
    turnId: string;
    playerId: string;
    darts: { scored: number; label: string; kind: SegmentResult['kind'] }[];
    startScore: number;
  } | null>;
  setLocalTurn: React.Dispatch<React.SetStateAction<LocalTurn>>;
  loadAll: () => Promise<void>;
  loadTurnsForLeg: (legId: string) => Promise<TurnRecord[]>;
  routerPush: (href: string) => void;
  getScoreForPlayer: (playerId: string) => number;
  canEditPlayers: boolean;
  canReorderPlayers: boolean;
  commentaryEnabled: boolean;
  personaId: CommentaryPersonaId;
  setCurrentCommentary: (value: string | null) => void;
  setCommentaryLoading: (value: boolean) => void;
  setCommentaryPlaying: (value: boolean) => void;
  ttsServiceRef: React.MutableRefObject<{
    getSettings: () => { enabled: boolean };
    queueCommentary: (input: { text: string; personaId: CommentaryPersonaId; excitement: 'high' }) => Promise<void>;
    getIsPlaying: () => boolean;
  }>;
  broadcastRematch?: (newMatchId: string) => Promise<void>;
};

type UseMatchActionsResult = {
  editOpen: boolean;
  setEditOpen: (open: boolean) => void;
  editingThrows: EditableThrow[];
  selectedThrowId: string | null;
  setSelectedThrowId: (id: string | null) => void;
  editPlayersOpen: boolean;
  setEditPlayersOpen: (open: boolean) => void;
  availablePlayers: Player[];
  newPlayerName: string;
  setNewPlayerName: (value: string) => void;
  endGameDialogOpen: boolean;
  setEndGameDialogOpen: (open: boolean) => void;
  endGameLoading: boolean;
  rematchLoading: boolean;
  handleBoardClick: (_x: number, _y: number, result: SegmentResult) => Promise<void>;
  undoLastThrow: () => Promise<void>;
  openEditModal: () => Promise<void>;
  updateSelectedThrow: (seg: SegmentResult) => Promise<void>;
  openEditPlayersModal: () => Promise<void>;
  addNewPlayer: () => Promise<void>;
  addPlayerToMatch: (playerId: string) => Promise<void>;
  removePlayerFromMatch: (playerId: string) => Promise<void>;
  movePlayerUp: (index: number) => Promise<void>;
  movePlayerDown: (index: number) => Promise<void>;
  startRematch: () => Promise<void>;
  endGameEarly: () => Promise<void>;
};

export function useMatchActions(args: UseMatchActionsArgs): UseMatchActionsResult {
  const {
    matchId,
    match,
    players,
    legs,
    turns,
    turnThrowCounts,
    currentLeg,
    currentPlayer,
    orderPlayers,
    finishRule,
    matchWinnerId,
    localTurn,
    ongoingTurnRef,
    setLocalTurn,
    loadAll,
    loadTurnsForLeg,
    routerPush,
    getScoreForPlayer,
    canEditPlayers,
    canReorderPlayers,
    commentaryEnabled,
    personaId,
    setCurrentCommentary,
    setCommentaryLoading,
    setCommentaryPlaying,
    ttsServiceRef,
    broadcastRematch,
  } = args;

  const [editOpen, setEditOpen] = useState(false);
  const [editingThrows, setEditingThrows] = useState<EditableThrow[]>([]);
  const [selectedThrowId, setSelectedThrowId] = useState<string | null>(null);
  const [editPlayersOpen, setEditPlayersOpen] = useState(false);
  const [availablePlayers, setAvailablePlayers] = useState<Player[]>([]);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [endGameDialogOpen, setEndGameDialogOpen] = useState(false);
  const [endGameLoading, setEndGameLoading] = useState(false);
  const [rematchLoading, setRematchLoading] = useState(false);
  const scoringQueueRef = useRef<Promise<void>>(Promise.resolve());

  const syncTurnFromStateIfNeeded = useCallback(() => {
    if (!currentLeg || !currentPlayer) return null as string | null;
    if (ongoingTurnRef.current) return ongoingTurnRef.current.turnId;

    // After a refresh we lose in-memory refs; resume the latest incomplete turn instead of creating a new one.
    let latestCurrentLegTurn: TurnWithThrows | null = null;
    for (let i = turns.length - 1; i >= 0; i--) {
      const turn = turns[i] as TurnWithThrows;
      if (turn.leg_id === currentLeg.id) {
        latestCurrentLegTurn = turn;
        break;
      }
    }

    if (
      latestCurrentLegTurn &&
      latestCurrentLegTurn.player_id === currentPlayer.id &&
      !latestCurrentLegTurn.busted
    ) {
      const persistedThrows = (latestCurrentLegTurn.throws ?? []).slice().sort((a, b) => a.dart_index - b.dart_index);
      const throwCount = turnThrowCounts[latestCurrentLegTurn.id] ?? persistedThrows.length;

      if (throwCount < 3) {
        const persistedDarts = persistedThrows.map((thr) => ({
          scored: thr.scored,
          label: thr.segment,
          kind: segmentLabelToKind(thr.segment),
        }));
        const persistedSubtotal = persistedDarts.reduce((sum, dart) => sum + dart.scored, 0);
        const remainingScore = getScoreForPlayer(currentPlayer.id);
        const ongoingDarts = persistedDarts.map((dart) => ({ ...dart }));
        const localDarts = persistedDarts.map((dart) => ({ ...dart }));

        ongoingTurnRef.current = {
          turnId: latestCurrentLegTurn.id,
          playerId: currentPlayer.id,
          darts: ongoingDarts,
          startScore: remainingScore + persistedSubtotal,
        };
        setLocalTurn({ playerId: currentPlayer.id, darts: localDarts });
        return latestCurrentLegTurn.id;
      }
    }
    return null;
  }, [currentLeg, currentPlayer, ongoingTurnRef, getScoreForPlayer, setLocalTurn, turns, turnThrowCounts]);

  const finishTurn = useCallback(
    async (busted: boolean, opts?: { skipReload?: boolean }) => {
      const ongoing = ongoingTurnRef.current;
      if (!ongoing) return;
      const total = ongoing.darts.reduce((s, d) => s + d.scored, 0);
      try {
        await apiRequest(`/api/matches/${matchId}/turns/${ongoing.turnId}`, {
          method: 'PATCH',
          body: { totalScored: total, busted },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update turn';
        alert(message);
        await loadAll();
        return;
      }
      ongoingTurnRef.current = null;
      setLocalTurn({ playerId: null, darts: [] });
      if (!opts?.skipReload) {
        if (currentLeg?.id) {
          await loadTurnsForLeg(currentLeg.id);
        } else {
          await loadAll();
        }
      }
    },
    [ongoingTurnRef, setLocalTurn, loadAll, loadTurnsForLeg, matchId, currentLeg?.id]
  );

  const triggerMatchRecap = useCallback(
    async (winnerId: string, allLegs: LegRecord[], allPlayers: Player[], allTurns: TurnWithThrows[]) => {
      try {
        setCommentaryLoading(true);

        const winner = allPlayers.find((p) => p.id === winnerId);
        if (!winner) return;

        // Compute legs won by each player
        const legsWonByPlayer = allLegs.reduce<Record<string, number>>((acc, leg) => {
          if (leg.winner_player_id) {
            acc[leg.winner_player_id] = (acc[leg.winner_player_id] || 0) + 1;
          }
          return acc;
        }, {});

        const winnerLegsWon = legsWonByPlayer[winnerId] || 0;

        // Compute player stats - optimized single-pass algorithm
        const startScoreValue = match?.start_score ? parseInt(match.start_score, 10) : 501;

        // Single pass through all turns to compute stats for all players
        const playerStatsMap = new Map<string, { totalScore: number; completedTurns: number; totalScored: number }>();

        // Initialize map for all players
        allPlayers.forEach((p) => {
          playerStatsMap.set(p.id, { totalScore: 0, completedTurns: 0, totalScored: 0 });
        });

        // Single iteration through all turns
        for (const turn of allTurns) {
          const stats = playerStatsMap.get(turn.player_id);
          if (!stats) continue;

          if (!turn.busted) {
            const scored =
              typeof turn.total_scored === 'number'
                ? turn.total_scored
                : (turn.throws?.reduce((sum, thr) => sum + thr.scored, 0) ?? 0);

            stats.totalScored += scored;

            // Only count for average if it's a valid completed turn with a score
            if (typeof turn.total_scored === 'number') {
              stats.totalScore += turn.total_scored;
              stats.completedTurns++;
            }
          }
        }

        const allPlayersStats: PlayerStats[] = allPlayers.map((p) => {
          const stats = playerStatsMap.get(p.id) ?? { totalScore: 0, completedTurns: 0, totalScored: 0 };
          return {
            name: p.display_name,
            id: p.id,
            remainingScore: Math.max(startScoreValue - stats.totalScored, 0),
            average: stats.completedTurns > 0 ? stats.totalScore / stats.completedTurns : 0,
            legsWon: legsWonByPlayer[p.id] || 0,
            isCurrentPlayer: false,
          };
        });

        // Get winning leg details
        const winningLeg = allLegs.find(
          (leg) => leg.winner_player_id === winnerId && leg.leg_number === allLegs.length
        );
        const winningLegTurns = winningLeg
          ? allTurns.filter((t) => t.leg_id === winningLeg.id).sort((a, b) => a.turn_number - b.turn_number)
          : [];
        const finalTurn = winningLegTurns[winningLegTurns.length - 1];
        const finalThrows =
          finalTurn?.throws?.map((t) => ({
            segment: t.segment,
            scored: t.scored,
            dart_index: t.dart_index,
          })) || [];
        const checkoutScore = finalTurn?.total_scored;

        const payload = {
          type: 'match_end' as const,
          context: {
            winnerName: winner.display_name,
            winnerId: winner.id,
            winnerLegsWon,
            totalLegs: allLegs.length,
            allPlayers: allPlayersStats,
            startScore: startScoreValue,
            legsToWin: match?.legs_to_win ?? 3,
            winningLeg: {
              finalThrows,
              checkoutScore,
            },
          },
        };

        const response = await generateMatchRecap(payload, personaId);

        if (response.commentary) {
          setCurrentCommentary(response.commentary);

          const tts = ttsServiceRef.current;
          if (tts.getSettings().enabled) {
            setCommentaryPlaying(true);
            await tts.queueCommentary({
              text: response.commentary,
              personaId: personaId,
              excitement: 'high', // Match end is always exciting
            });

            const checkPlaying = setInterval(() => {
              if (!tts.getIsPlaying()) {
                setCommentaryPlaying(false);
                clearInterval(checkPlaying);
              }
            }, 500);
          }
        }
      } catch (error) {
        console.error('Failed to generate match recap:', error);
      } finally {
        setCommentaryLoading(false);
      }
    },
    [match?.start_score, match?.legs_to_win, personaId, setCommentaryLoading, setCommentaryPlaying, setCurrentCommentary, ttsServiceRef]
  );

  const endLegAndMaybeMatch = useCallback(
    async (winnerPlayerId: string) => {
      if (!currentLeg || !match) return;
      let matchCompleted = false;
      try {
        const result = await apiRequest<{ matchCompleted: boolean }>(
          `/api/matches/${matchId}/legs/${currentLeg.id}/complete`,
          { body: { winnerPlayerId } }
        );
        matchCompleted = result.matchCompleted;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to complete leg';
        alert(message);
        await loadAll();
        return;
      }
      await loadAll();

      if (matchCompleted && commentaryEnabled) {
        try {
          const supabase = await getSupabaseClient();
          const { data: allLegs } = await supabase.from('legs').select('*').eq('match_id', matchId);
          if (!allLegs || allLegs.length === 0) return;
          const { data: allTurns } = await supabase
            .from('turns')
            .select(`
              id, leg_id, player_id, turn_number, total_scored, busted, created_at,
              throws:throws(id, turn_id, dart_index, segment, scored)
            `)
            .in('leg_id', allLegs.map((l) => l.id))
            .order('turn_number', { ascending: true });
          if (allTurns && allTurns.length > 0) {
            void triggerMatchRecap(winnerPlayerId, allLegs, players, allTurns);
          }
        } catch (error) {
          console.error('Failed to trigger match recap:', error);
        }
      }
    },
    [currentLeg, match, matchId, players, loadAll, commentaryEnabled, triggerMatchRecap]
  );

  const processBoardClick = useCallback(
    async (_x: number, _y: number, result: SegmentResult) => {
      if (matchWinnerId) return; // match over
      if (!currentLeg || !currentPlayer) return;
      const clickStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      let turnId = syncTurnFromStateIfNeeded();
      if (!turnId) {
        turnId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        ongoingTurnRef.current = {
          turnId,
          playerId: currentPlayer.id,
          darts: [],
          startScore: getScoreForPlayer(currentPlayer.id),
        };
        setLocalTurn({ playerId: currentPlayer.id, darts: [] });
      }

      const myScoreStart = ongoingTurnRef.current?.startScore ?? getScoreForPlayer(currentPlayer.id);
      const localSubtotal = localTurn.darts.reduce((s, d) => s + d.scored, 0);
      const outcome = applyThrow(myScoreStart - localSubtotal, result, finishRule);
      const hadPersistedTurnId = !turnId.startsWith('pending-');

      const newDartIndex = ongoingTurnRef.current!.darts.length + 1;
      const optimisticDart = { scored: result.scored, label: result.label, kind: result.kind as SegmentResult['kind'] };
      ongoingTurnRef.current!.darts.push(optimisticDart);
      setLocalTurn((prev) => ({
        playerId: currentPlayer.id,
        darts: [...prev.darts, optimisticDart],
      }));
      if (process.env.NODE_ENV !== 'production') {
        const optimisticAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const durationMs = Math.round(optimisticAt - clickStartedAt);
        console.debug(`[perf] click-to-optimistic-paint ${durationMs}ms`);
        recordPerfMetric(matchId, 'clickToOptimisticPaintMs', durationMs);
      }

      try {
        const throwResult = await apiRequest<{ turnId?: string }>(`/api/matches/${matchId}/throws`, {
          body: hadPersistedTurnId
            ? { turnId, dartIndex: newDartIndex, segment: result.label, scored: result.scored }
            : {
                legId: currentLeg.id,
                playerId: currentPlayer.id,
                dartIndex: newDartIndex,
                segment: result.label,
                scored: result.scored,
              },
        });
        if (throwResult.turnId && ongoingTurnRef.current && ongoingTurnRef.current.turnId === turnId) {
          ongoingTurnRef.current = {
            ...ongoingTurnRef.current,
            turnId: throwResult.turnId,
          };
          turnId = throwResult.turnId;
        }
        if (process.env.NODE_ENV !== 'production') {
          const ackAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
          const durationMs = Math.round(ackAt - clickStartedAt);
          console.debug(`[perf] click-to-server-ack ${durationMs}ms`);
          recordPerfMetric(matchId, 'clickToServerAckMs', durationMs);
        }
      } catch (error) {
        // Roll back optimistic local dart if persistence failed.
        const current = ongoingTurnRef.current;
        if (current && current.turnId === turnId && current.darts.length > 0) {
          current.darts.pop();
          if (current.darts.length === 0 && !hadPersistedTurnId) {
            ongoingTurnRef.current = null;
          }
        }
        setLocalTurn((prev) => {
          const nextDarts = prev.darts.slice(0, -1);
          if (nextDarts.length === 0 && !hadPersistedTurnId) {
            return { playerId: null, darts: [] };
          }
          return {
            playerId: prev.playerId,
            darts: nextDarts,
          };
        });
        const message = error instanceof Error ? error.message : 'Failed to save throw';
        alert(message);
        return;
      }

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
    },
    [
      matchWinnerId,
      currentLeg,
      currentPlayer,
      syncTurnFromStateIfNeeded,
      ongoingTurnRef,
      getScoreForPlayer,
      localTurn.darts,
      finishRule,
      setLocalTurn,
      finishTurn,
      endLegAndMaybeMatch,
      matchId,
    ]
  );

  const handleBoardClick = useCallback(
    async (_x: number, _y: number, result: SegmentResult) => {
      const run = async () => {
        await processBoardClick(_x, _y, result);
      };
      const next = scoringQueueRef.current.then(run, run);
      scoringQueueRef.current = next.catch(() => {});
      await next;
    },
    [processBoardClick]
  );

  const undoLastThrow = useCallback(async () => {
    if (!currentLeg) return;
    const supabase = await getSupabaseClient();
    // If we have an empty local turn (no darts), remove it before undoing previous throws
    if (ongoingTurnRef.current && ongoingTurnRef.current.darts.length === 0) {
      const emptyTurnId = ongoingTurnRef.current.turnId;
      const { data: existingThrows, error: emptyErr } = await supabase
        .from('throws')
        .select('id')
        .eq('turn_id', emptyTurnId)
        .limit(1);
      if (emptyErr) {
        alert(`Failed to check empty turn: ${emptyErr.message}`);
        return;
      }
      if (!existingThrows || existingThrows.length === 0) {
        try {
          await apiRequest(`/api/matches/${matchId}/turns/${emptyTurnId}`, { method: 'DELETE' });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to remove empty turn';
          alert(message);
          return;
        }
        ongoingTurnRef.current = null;
        setLocalTurn({ playerId: null, darts: [] });
      }
    }
    // If we have local darts in the ongoing turn, remove last one
    if (ongoingTurnRef.current && ongoingTurnRef.current.darts.length > 0) {
      const turnId = ongoingTurnRef.current.turnId;
      const lastIndex = ongoingTurnRef.current.darts.length; // 1-based
      try {
        await apiRequest(`/api/matches/${matchId}/throws`, {
          method: 'DELETE',
          body: { turnId, dartIndex: lastIndex },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to undo throw';
        alert(message);
        return;
      }
      ongoingTurnRef.current.darts.pop();
      setLocalTurn((prev) => ({ playerId: prev.playerId, darts: prev.darts.slice(0, -1) }));
      const newTotal = ongoingTurnRef.current.darts.reduce((sum, dart) => sum + dart.scored, 0);
      await apiRequest(`/api/matches/${matchId}/turns/${turnId}`, {
        method: 'PATCH',
        body: { totalScored: newTotal, busted: false },
      });
      await loadAll();
      return;
    }

    // Otherwise, remove the last persisted throw in the current leg
    const { data: legTurns, error: turnsErr } = await supabase
      .from('turns')
      .select('id, player_id, turn_number')
      .eq('leg_id', currentLeg.id)
      .order('turn_number', { ascending: false });
    if (turnsErr) {
      alert(`Failed to query turns: ${turnsErr.message}`);
      return;
    }
    let last:
      | {
          id: string;
          turn_id: string;
          dart_index: number;
          segment: string;
          scored: number;
          turns: { leg_id: string; player_id: string; turn_number: number };
        }
      | undefined;
    for (const t of legTurns ?? []) {
      const { data: thrRows, error: thrErr } = await supabase
        .from('throws')
        .select('id, turn_id, dart_index, segment, scored')
        .eq('turn_id', t.id)
        .order('dart_index', { ascending: false })
        .limit(1);
      if (thrErr) {
        alert(`Failed to query last throw: ${thrErr.message}`);
        return;
      }
      if (thrRows && thrRows.length > 0) {
        const thr = thrRows[0];
        last = {
          ...thr,
          turns: { leg_id: currentLeg.id, player_id: t.player_id, turn_number: t.turn_number },
        };
        break;
      }
    }
    if (!last) return; // nothing to undo

    try {
      await apiRequest(`/api/matches/${matchId}/throws/${last.id}`, { method: 'DELETE' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to undo throw';
      alert(message);
      return;
    }

    // Check remaining throws in that turn
    const { data: remaining } = await supabase
      .from('throws')
      .select('dart_index, segment, scored')
      .eq('turn_id', last.turn_id)
      .order('dart_index');
    const darts = ((remaining as { dart_index: number; segment: string; scored: number }[] | null) ?? []).map(
      (r) => ({
        scored: r.scored,
        label: r.segment,
        kind: 'Single' as SegmentResult['kind'], // kind not needed for local subtotal
      })
    );

    if (darts.length === 0) {
      // If undoing the current player's only throw, keep the turn open with 0 darts
      if (currentPlayer?.id === last.turns.player_id) {
        await apiRequest(`/api/matches/${matchId}/turns/${last.turn_id}`, {
          method: 'PATCH',
          body: { totalScored: 0, busted: false },
        });
        ongoingTurnRef.current = {
          turnId: last.turn_id,
          playerId: last.turns.player_id,
          darts: [],
          startScore: getScoreForPlayer(last.turns.player_id),
        };
        setLocalTurn({ playerId: last.turns.player_id, darts: [] });
        await loadAll();
        return;
      }

      // Otherwise delete empty turn and reopen previous player's turn
      await apiRequest(`/api/matches/${matchId}/turns/${last.turn_id}`, { method: 'DELETE' });
      await loadAll();
      const prevLeg = (legs ?? []).find((l) => !l.winner_player_id) ?? legs[legs.length - 1];
      if (!prevLeg) return;
      const turnCount = turns.filter((t) => t.leg_id === prevLeg.id).length;
      const prevPlayer = orderPlayers[(turnCount + orderPlayers.length - 1) % orderPlayers.length];
      ongoingTurnRef.current = {
        turnId: last.turn_id,
        playerId: prevPlayer.id,
        darts: [],
        startScore: getScoreForPlayer(prevPlayer.id),
      };
      setLocalTurn({ playerId: prevPlayer.id, darts: [] });
      return;
    } else {
      // Update turn total to current subtotal and mark not busted
      const newTotal = darts.reduce((s, d) => s + d.scored, 0);
      await apiRequest(`/api/matches/${matchId}/turns/${last.turn_id}`, {
        method: 'PATCH',
        body: { totalScored: newTotal, busted: false },
      });
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
  }, [currentLeg, ongoingTurnRef, setLocalTurn, currentPlayer, getScoreForPlayer, loadAll, legs, turns, orderPlayers, matchId]);

  const openEditModal = useCallback(async () => {
    if (!currentLeg) return;
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('throws')
      .select('id, turn_id, dart_index, segment, scored, turns:turn_id!inner(leg_id, turn_number, player_id)')
      .eq('turns.leg_id', currentLeg.id)
      .order('turn_number', { foreignTable: 'turns' })
      .order('dart_index');
    if (error) {
      alert(error.message);
      return;
    }
    type ThrowRow = {
      id: string;
      turn_id: string;
      dart_index: number;
      segment: string;
      scored: number;
      turns: { leg_id: string; turn_number: number; player_id: string };
    };
    const rows = ((data ?? []) as unknown as ThrowRow[]).map(
      (r) =>
        ({
          id: r.id,
          turn_id: r.turn_id,
          dart_index: r.dart_index,
          segment: r.segment,
          scored: r.scored,
          player_id: r.turns.player_id,
          turn_number: r.turns.turn_number,
        }) satisfies EditableThrow
    );
    setEditingThrows(rows);
    setSelectedThrowId(null);
    setEditOpen(true);
  }, [currentLeg]);

  const updateSelectedThrow = useCallback(
    async (seg: SegmentResult) => {
      if (!selectedThrowId) return;
      try {
        await apiRequest(`/api/matches/${matchId}/throws/${selectedThrowId}`, {
          method: 'PATCH',
          body: { segment: seg.label, scored: seg.scored },
        });
        await loadAll();
        await openEditModal(); // reload list
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update throw';
        alert(message);
      }
    },
    [selectedThrowId, loadAll, openEditModal, matchId]
  );

  const openEditPlayersModal = useCallback(async () => {
    if (!canEditPlayers) return;
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('players').select('*').order('display_name');
    if (error) {
      alert(error.message);
      return;
    }
    setAvailablePlayers((data as Player[]) ?? []);
    setEditPlayersOpen(true);
  }, [canEditPlayers]);

  const addNewPlayer = useCallback(async () => {
    const name = newPlayerName.trim();
    if (!name) return;

    try {
      const result = await apiRequest<{ player: Player }>(`/api/matches/${matchId}/players/new`, {
        body: { displayName: name },
      });
      setNewPlayerName('');
      setAvailablePlayers((prev) => [...prev, result.player]);
      await loadAll();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add player';
      alert(message);
    }
  }, [newPlayerName, matchId, loadAll]);

  const addPlayerToMatch = useCallback(
    async (playerId: string) => {
      // Check if player is already in match
      if (players.some((p) => p.id === playerId)) {
        alert('Player is already in this match');
        return;
      }
      try {
        await apiRequest(`/api/matches/${matchId}/players`, { body: { playerId } });
        await loadAll();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to add player';
        alert(message);
      }
    },
    [matchId, players, loadAll]
  );

  const removePlayerFromMatch = useCallback(
    async (playerId: string) => {
      if (players.length <= 2) {
        alert('Cannot remove player - match needs at least 2 players');
        return;
      }

      try {
        await apiRequest(`/api/matches/${matchId}/players/${playerId}`, { method: 'DELETE' });
        await loadAll();
      } catch (err) {
        console.error('Unexpected error:', err);
        const message = err instanceof Error ? err.message : 'An unexpected error occurred while removing the player.';
        alert(message);
      }
    },
    [matchId, players.length, loadAll]
  );

  const movePlayerUp = useCallback(
    async (index: number) => {
      if (index === 0 || !canReorderPlayers) return; // Can't move first player up
      const orderedPlayerIds = players.map((p) => p.id);
      [orderedPlayerIds[index - 1], orderedPlayerIds[index]] = [orderedPlayerIds[index], orderedPlayerIds[index - 1]];
      try {
        await apiRequest(`/api/matches/${matchId}/players/reorder`, {
          method: 'PATCH',
          body: { orderedPlayerIds },
        });
        await loadAll();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to reorder player';
        alert(message);
      }
    },
    [players, matchId, loadAll, canReorderPlayers]
  );

  const movePlayerDown = useCallback(
    async (index: number) => {
      if (index === players.length - 1 || !canReorderPlayers) return; // Can't move last player down
      const orderedPlayerIds = players.map((p) => p.id);
      [orderedPlayerIds[index], orderedPlayerIds[index + 1]] = [orderedPlayerIds[index + 1], orderedPlayerIds[index]];
      try {
        await apiRequest(`/api/matches/${matchId}/players/reorder`, {
          method: 'PATCH',
          body: { orderedPlayerIds },
        });
        await loadAll();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to reorder player';
        alert(message);
      }
    },
    [players, matchId, loadAll, canReorderPlayers]
  );

  const startRematch = useCallback(async () => {
    if (!match) return;
    try {
      setRematchLoading(true);
      const result = await apiRequest<{ newMatchId: string }>(`/api/matches/${matchId}/rematch`);
      if (broadcastRematch) {
        await broadcastRematch(result.newMatchId);
      }
      routerPush(`/match/${result.newMatchId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error creating rematch';
      alert(msg);
    } finally {
      setRematchLoading(false);
    }
  }, [match, matchId, routerPush, broadcastRematch]);

  const endGameEarly = useCallback(async () => {
    if (!match) return;
    try {
      setEndGameLoading(true);
      await apiRequest(`/api/matches/${matchId}/end`, { method: 'PATCH' });

      // Close the dialog and reload the match data
      setEndGameDialogOpen(false);
      await loadAll();

      // Redirect to home page
      routerPush('/');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error ending game';
      alert(msg);
    } finally {
      setEndGameLoading(false);
    }
  }, [match, matchId, loadAll, routerPush]);

  return {
    editOpen,
    setEditOpen,
    editingThrows,
    selectedThrowId,
    setSelectedThrowId,
    editPlayersOpen,
    setEditPlayersOpen,
    availablePlayers,
    newPlayerName,
    setNewPlayerName,
    endGameDialogOpen,
    setEndGameDialogOpen,
    endGameLoading,
    rematchLoading,
    handleBoardClick,
    undoLastThrow,
    openEditModal,
    updateSelectedThrow,
    openEditPlayersModal,
    addNewPlayer,
    addPlayerToMatch,
    removePlayerFromMatch,
    movePlayerUp,
    movePlayerDown,
    startRematch,
    endGameEarly,
  };
}
