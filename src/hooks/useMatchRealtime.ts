"use client";

import { useEffect, useRef } from 'react';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { computeRemainingScore, computeTurnTotal } from '@/lib/commentary/stats';
import { getExcitementLevel } from '@/lib/commentary/utils';
import { generateCommentary, type CommentaryContext } from '@/services/commentaryService';
import type { VoiceOption } from '@/services/ttsService';
import type {
  LegRecord,
  MatchRecord,
  Player,
  ThrowRecord,
  TurnRecord,
  TurnWithThrows,
} from '@/lib/match/types';
import {
  PendingThrowBuffer,
  getRealtimePayloadLegId,
  getRealtimePayloadTurnId,
  shouldIgnoreRealtimePayload,
  type RealtimePayload,
} from '@/lib/match/realtime';
import {
  applyThrowChange as applySpectatorThrowChange,
  applyTurnChange as applySpectatorTurnChange,
} from '@/lib/match/spectatorRealtimeReducer';
import { incrementRealtimeMetric } from '@/lib/match/realtimeMetrics';
import type { CommentaryDebouncer } from '@/services/commentaryService';
import type { CommentaryPersonaId } from '@/lib/commentary/types';
import type { SegmentResult } from '@/utils/dartboard';

function segmentLabelToKind(label: string): SegmentResult['kind'] {
  if (label === 'Miss') return 'Miss';
  if (label === 'SB') return 'OuterBull';
  if (label === 'DB') return 'InnerBull';
  if (label.startsWith('D')) return 'Double';
  if (label.startsWith('T')) return 'Triple';
  return 'Single';
}

function areThrowCountsEqual(a: Record<string, number>, b: Record<string, number>): boolean {
  if (a === b) return true;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

function areTurnsEqual(a: TurnRecord[], b: TurnRecord[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i++) {
    const left = a[i] as TurnWithThrows;
    const right = b[i] as TurnWithThrows;
    if (
      left.id !== right.id ||
      left.leg_id !== right.leg_id ||
      left.player_id !== right.player_id ||
      left.turn_number !== right.turn_number ||
      left.total_scored !== right.total_scored ||
      left.busted !== right.busted
    ) {
      return false;
    }

    const leftThrows = left.throws ?? [];
    const rightThrows = right.throws ?? [];
    if (leftThrows.length !== rightThrows.length) return false;

    for (let j = 0; j < leftThrows.length; j++) {
      const leftThrow = leftThrows[j];
      const rightThrow = rightThrows[j];
      if (
        leftThrow.id !== rightThrow.id ||
        leftThrow.turn_id !== rightThrow.turn_id ||
        leftThrow.dart_index !== rightThrow.dart_index ||
        leftThrow.segment !== rightThrow.segment ||
        leftThrow.scored !== rightThrow.scored
      ) {
        return false;
      }
    }
  }

  return true;
}

type CelebrationState = {
  score: number;
  playerName: string;
  level: 'info' | 'good' | 'excellent' | 'godlike' | 'max' | 'bust';
  throws: { segment: string; scored: number; dart_index: number }[];
} | null;

type RealtimeApi = {
  isConnected: boolean;
  connectionStatus: string;
  updatePresence: (isSpectatorMode: boolean) => void;
};

type UseMatchRealtimeArgs = {
  matchId: string;
  realtime: RealtimeApi;
  realtimeEnabled: boolean;
  isSpectatorMode: boolean;
  loadAll: () => Promise<void>;
  loadAllSpectator: () => Promise<void>;
  loadMatchOnly: () => Promise<MatchRecord | null>;
  loadLegsOnly: () => Promise<LegRecord[]>;
  loadPlayersOnly: () => Promise<Player[]>;
  loadTurnsForLeg: (legId: string) => Promise<TurnRecord[]>;
  latestStateRef: React.MutableRefObject<{
    isSpectatorMode: boolean;
    playerById: Record<string, Player>;
    turnThrowCounts: Record<string, number>;
    turns: TurnRecord[];
    legs: LegRecord[];
    players: Player[];
    match: MatchRecord | null;
    knownLegIds: Set<string>;
    knownTurnIds: Set<string>;
  }>;
  pendingThrowBufferRef: React.MutableRefObject<PendingThrowBuffer>;
  pendingTurnReconcileRef: React.MutableRefObject<Set<string>>;
  setTurns: (value: TurnRecord[] | ((prev: TurnRecord[]) => TurnRecord[])) => void;
  setTurnThrowCounts: (value: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => void;
  setMatch: (value: MatchRecord | null) => void;
  ongoingTurnRef: React.MutableRefObject<{
    turnId: string;
    playerId: string;
    darts: { scored: number; label: string; kind: SegmentResult['kind'] }[];
    startScore: number;
  } | null>;
  setLocalTurn: (value: { playerId: string | null; darts: { scored: number; label: string; kind: SegmentResult['kind'] }[] }) => void;
  setCelebration: (value: CelebrationState) => void;
  celebratedTurns: React.MutableRefObject<Set<string>>;
  commentaryEnabled: boolean;
  personaId: CommentaryPersonaId;
  commentaryDebouncer: React.MutableRefObject<CommentaryDebouncer>;
  setCommentaryLoading: (value: boolean) => void;
  setCommentaryPlaying: (value: boolean) => void;
  setCurrentCommentary: (value: string | null) => void;
  ttsServiceRef: React.MutableRefObject<{
    getSettings: () => { enabled: boolean; voice: VoiceOption };
    queueCommentary: (input: { text: string; personaId: CommentaryPersonaId; excitement: ReturnType<typeof getExcitementLevel> }) => Promise<void>;
    getIsPlaying: () => boolean;
  }>;
};

export function useMatchRealtime({
  matchId,
  realtime,
  realtimeEnabled,
  isSpectatorMode,
  loadAll,
  loadAllSpectator,
  loadMatchOnly,
  loadLegsOnly,
  loadPlayersOnly,
  loadTurnsForLeg,
  latestStateRef,
  pendingThrowBufferRef,
  pendingTurnReconcileRef,
  setTurns,
  setTurnThrowCounts,
  setMatch,
  ongoingTurnRef,
  setLocalTurn,
  setCelebration,
  celebratedTurns,
  commentaryEnabled,
  personaId,
  commentaryDebouncer,
  setCommentaryLoading,
  setCommentaryPlaying,
  setCurrentCommentary,
  ttsServiceRef,
}: UseMatchRealtimeArgs) {
  const spectatorTurnsFetchRef = useRef<Promise<void> | null>(null);
  const spectatorTurnsFetchQueuedRef = useRef(false);
  const matchTurnsFetchRef = useRef<Promise<void> | null>(null);
  const matchTurnsFetchQueuedRef = useRef(false);
  const matchTurnsDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!realtime.isConnected || !realtimeEnabled) return;
    realtime.updatePresence(latestStateRef.current.isSpectatorMode);
  }, [realtime.isConnected, realtime.updatePresence, realtimeEnabled, isSpectatorMode, latestStateRef]);

  useEffect(() => {
    if (!realtime.isConnected || !realtimeEnabled) {
      return;
    }

    // Handle throw changes - hot update without full reload
    const processThrowChange = async (event: CustomEvent) => {
      // Route to appropriate handler based on mode (use ref to avoid stale closure)
      if (latestStateRef.current.isSpectatorMode) {
        await handleSpectatorThrowChange(event);
      } else {
        await handleMatchUIUpdate(event);
      }
    };

    // Realtime can deliver a throw for a freshly inserted turn before we observe the matching
    // turn insert. We filter throw events by known turn IDs to avoid cross-match noise, so we
    // buffer unknown turn_ids and flush once the corresponding turn becomes known.
    const pendingThrowBuffer = pendingThrowBufferRef.current;

    const handleThrowChange = async (event: CustomEvent) => {
      const payload = event.detail as RealtimePayload;
      const legId = getRealtimePayloadLegId(payload);
      const turnId = getRealtimePayloadTurnId(payload);
      const { knownLegIds } = latestStateRef.current;

      // Until initial match state is loaded, ignore throw events entirely.
      // This prevents cross-match contamination when multiple matches are active.
      if (knownLegIds.size === 0) {
        return;
      }

      if (!legId && turnId) {
        const { knownTurnIds, turns } = latestStateRef.current;
        const hasTurnInState = turns.some((turn) => turn.id === turnId);
        const hasKnownTurns = knownTurnIds.size > 0;
        const isKnownTurn = hasKnownTurns && knownTurnIds.has(turnId);
        if (!hasTurnInState && isKnownTurn && latestStateRef.current.isSpectatorMode) {
          void reconcileSpectatorTurn(turnId);
          return;
        }
        if (!hasTurnInState && hasKnownTurns && !knownTurnIds.has(turnId)) {
          pendingThrowBuffer.set(turnId, payload);
          if (latestStateRef.current.isSpectatorMode && !pendingTurnReconcileRef.current.has(turnId)) {
            pendingTurnReconcileRef.current.add(turnId);
            setTimeout(() => {
              pendingTurnReconcileRef.current.delete(turnId);
              void reconcileSpectatorTurn(turnId);
            }, 200);
          }
          return;
        }
        if (!hasTurnInState && !hasKnownTurns) {
          pendingThrowBuffer.set(turnId, payload);
          if (latestStateRef.current.isSpectatorMode && !pendingTurnReconcileRef.current.has(turnId)) {
            pendingTurnReconcileRef.current.add(turnId);
            setTimeout(() => {
              pendingTurnReconcileRef.current.delete(turnId);
              void reconcileSpectatorTurn(turnId);
            }, 200);
          }
        }
      }

      await processThrowChange(event);
    };

    // Trigger Chad commentary for a completed turn
    type CommentarySnapshot = {
      turns: TurnWithThrows[];
      legs: LegRecord[];
      players: Player[];
      match: MatchRecord | null;
    };

    const triggerCommentary = async (
      turn: TurnWithThrows,
      playerName: string,
      throws: { segment: string; scored: number; dart_index: number }[],
      snapshot: CommentarySnapshot
    ) => {
      try {
        setCommentaryLoading(true);

        const { turns: turnsSnapshot, legs: legsSnapshot, players: playersSnapshot, match: matchSnapshot } = snapshot;

        const startScoreValue = matchSnapshot?.start_score ? parseInt(matchSnapshot.start_score, 10) : 501;
        const legsToWinValue = matchSnapshot?.legs_to_win ?? 3;

        const computeAverage = (playerId: string): number => {
          const completedTurns = turnsSnapshot.filter(
            (t) => t.player_id === playerId && !t.busted && typeof t.total_scored === 'number'
          );

          if (completedTurns.length === 0) {
            return 0;
          }

          const total = completedTurns.reduce((sum, t) => sum + (t.total_scored ?? 0), 0);
          return total / completedTurns.length;
        };

        const remainingScore = computeRemainingScore(turnsSnapshot, turn.player_id, startScoreValue);
        const playerAverage = computeAverage(turn.player_id);

        const legsWonByPlayer = legsSnapshot.reduce<Record<string, number>>((acc, leg) => {
          if (leg.winner_player_id) {
            acc[leg.winner_player_id] = (acc[leg.winner_player_id] || 0) + 1;
          }
          return acc;
        }, {});

        const allPlayersStats = playersSnapshot.map((p) => ({
          name: p.display_name,
          id: p.id,
          remainingScore: computeRemainingScore(turnsSnapshot, p.id, startScoreValue),
          average: computeAverage(p.id),
          legsWon: legsWonByPlayer[p.id] || 0,
          isCurrentPlayer: p.id === turn.player_id,
        }));

        const sortedByScore = [...allPlayersStats].sort((a, b) => a.remainingScore - b.remainingScore);
        const currentPlayerIndex = sortedByScore.findIndex((p) => p.id === turn.player_id);
        const currentPlayerPos = currentPlayerIndex >= 0 ? currentPlayerIndex + 1 : Math.max(sortedByScore.length, 1);
        const leader = sortedByScore[0];
        const isLeading = currentPlayerIndex === 0 || sortedByScore.length <= 1;
        const nearestOpponent = isLeading ? sortedByScore[1] : leader;
        const pointsBehindLeader = !isLeading && nearestOpponent ? Math.max(remainingScore - nearestOpponent.remainingScore, 0) : 0;
        const pointsAheadOfChaser =
          isLeading && nearestOpponent ? Math.max(nearestOpponent.remainingScore - remainingScore, 0) : undefined;

        const playerTurns = turnsSnapshot
          .filter((t) => t.player_id === turn.player_id)
          .sort((a, b) => a.turn_number - b.turn_number);
        const recentTurns = playerTurns.slice(-5).map((t) => ({
          score: computeTurnTotal(t),
          busted: t.busted,
        }));

        let consecutiveHighScores = 0;
        let consecutiveLowScores = 0;
        for (let i = playerTurns.length - 1; i >= 0; i--) {
          const t = playerTurns[i];
          if (t.busted) {
            break;
          }
          if (computeTurnTotal(t) >= 60) {
            consecutiveHighScores++;
          } else {
            break;
          }
        }
        for (let i = playerTurns.length - 1; i >= 0; i--) {
          const t = playerTurns[i];
          if (t.busted || computeTurnTotal(t) >= 30) {
            break;
          }
          consecutiveLowScores++;
        }

        const highStreak = consecutiveHighScores >= 2 ? consecutiveHighScores : undefined;
        const lowStreak = consecutiveLowScores >= 2 ? consecutiveLowScores : undefined;

        const currentLeg = legsSnapshot.find((leg) => leg.id === turn.leg_id);
        const currentLegNumber = currentLeg?.leg_number ?? legsSnapshot.length;
        const playerTurnNumber = playerTurns.length;
        const overallTurnNumber = turn.turn_number;
        const dartsUsedThisTurn = throws.length;
        const turnTotal = computeTurnTotal(turn);

        const context: CommentaryContext = {
          playerName,
          playerId: turn.player_id,
          totalScore: turnTotal,
          remainingScore,
          throws: throws.map((t) => ({
            segment: t.segment,
            scored: t.scored,
            dart_index: t.dart_index,
          })),
          busted: turn.busted,
          isHighScore: turnTotal >= 100,
          is180: turnTotal === 180,
          gameContext: {
            startScore: startScoreValue,
            legsToWin: legsToWinValue,
            currentLegNumber,
            overallTurnNumber,
            playerTurnNumber,
            dartsUsedThisTurn,
            playerAverage,
            playerLegsWon: legsWonByPlayer[turn.player_id] || 0,
            playerRecentTurns: recentTurns,
            allPlayers: allPlayersStats,
            isLeading,
            positionInMatch: currentPlayerPos,
            pointsBehindLeader,
            pointsAheadOfChaser,
            consecutiveHighScores: highStreak,
            consecutiveLowScores: lowStreak,
          },
        };

        const response = await generateCommentary(context, personaId);

        if (response.commentary) {
          setCurrentCommentary(response.commentary);

          const tts = ttsServiceRef.current;
          if (tts.getSettings().enabled) {
            setCommentaryPlaying(true);
            const excitement = getExcitementLevel(turnTotal, turn.busted, turnTotal === 180, turnTotal >= 100);
            await tts.queueCommentary({
              text: response.commentary,
              personaId,
              excitement,
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
        console.error('Failed to generate commentary:', error);
      } finally {
        setCommentaryLoading(false);
      }
    };

    // Spectator-specific throw change handler
    const reconcileSpectatorCurrentLeg = async () => {
      incrementRealtimeMetric(matchId, 'reconcileCurrentLegCalls');
      if (spectatorTurnsFetchRef.current) {
        spectatorTurnsFetchQueuedRef.current = true;
        return;
      }

      const runFetch = async () => {
        const supabase = await getSupabaseClient();
        let legsSnapshot = latestStateRef.current.legs;
        let currentLeg = legsSnapshot.find((l) => !l.winner_player_id) ?? legsSnapshot[legsSnapshot.length - 1];

        if (!currentLeg) {
          const { data: fetchedLegs } = await supabase
            .from('legs')
            .select('*')
            .eq('match_id', matchId)
            .order('leg_number', { ascending: true });
          legsSnapshot = (fetchedLegs as LegRecord[] | null) ?? legsSnapshot;
          currentLeg = legsSnapshot.find((l) => !l.winner_player_id) ?? legsSnapshot[legsSnapshot.length - 1];
        }

        if (!currentLeg) return;

        const { data: updatedTurns } = await supabase
          .from('turns')
          .select(`
                id, leg_id, player_id, turn_number, total_scored, busted, created_at,
                throws:throws(id, turn_id, dart_index, segment, scored)
              `)
          .eq('leg_id', currentLeg.id)
          .order('turn_number', { ascending: true });

        if (!updatedTurns) return;

        setTurns((prev) => {
          const next = updatedTurns as unknown as TurnRecord[];
          return areTurnsEqual(prev, next) ? prev : next;
        });

        const throwCounts: Record<string, number> = {};
        for (const turn of updatedTurns as TurnWithThrows[]) {
          throwCounts[turn.id] = (turn.throws ?? []).length;
        }

        setTurnThrowCounts((prev) => {
          return areThrowCountsEqual(prev, throwCounts) ? prev : throwCounts;
        });
        latestStateRef.current = {
          ...latestStateRef.current,
          turns: updatedTurns as unknown as TurnRecord[],
          turnThrowCounts: throwCounts,
        };
      };

      spectatorTurnsFetchRef.current = runFetch();
      await spectatorTurnsFetchRef.current;
      spectatorTurnsFetchRef.current = null;

      if (spectatorTurnsFetchQueuedRef.current) {
        spectatorTurnsFetchQueuedRef.current = false;
        void runFetch();
      }
    };

    const reconcileSpectatorTurn = async (turnId: string) => {
      incrementRealtimeMetric(matchId, 'reconcileTurnCalls');
      try {
        const supabase = await getSupabaseClient();
        const { data: fetchedTurns } = await supabase
          .from('turns')
          .select(
            `
            id, leg_id, player_id, turn_number, total_scored, busted, created_at,
            throws:throws(id, turn_id, dart_index, segment, scored)
          `
          )
          .eq('id', turnId)
          .limit(1);
        const turn = (fetchedTurns as TurnWithThrows[] | null)?.[0];
        if (!turn) {
          await reconcileSpectatorCurrentLeg();
          return;
        }

        const legsSnapshot = latestStateRef.current.legs;
        const currentLeg = legsSnapshot.find((l) => !l.winner_player_id) ?? legsSnapshot[legsSnapshot.length - 1];
        if (currentLeg && turn.leg_id !== currentLeg.id) return;

        const existingTurns = latestStateRef.current.turns as TurnWithThrows[];
        const existing = existingTurns.filter((t) => t.id !== turn.id);
        let nextTurns = [...existing, turn].sort((a, b) => a.turn_number - b.turn_number);
        let nextCounts: Record<string, number> = {
          ...latestStateRef.current.turnThrowCounts,
          [turn.id]: (turn.throws ?? []).length,
        };

        const pending = pendingThrowBufferRef.current.take(turnId);
        if (pending) {
          const result = applySpectatorThrowChange(
            pending as {
              eventType?: 'INSERT' | 'UPDATE' | 'DELETE';
              new?: Partial<ThrowRecord>;
              old?: Partial<ThrowRecord>;
            },
            {
              currentLegId: currentLeg?.id,
              turns: nextTurns as TurnWithThrows[],
              turnThrowCounts: nextCounts,
            }
          );
          nextTurns = result.turns as TurnWithThrows[];
          nextCounts = result.turnThrowCounts;
        }

        setTurns((prev) => {
          return areTurnsEqual(prev, nextTurns as unknown as TurnRecord[]) ? prev : (nextTurns as unknown as TurnRecord[]);
        });

        setTurnThrowCounts((prev) => {
          return areThrowCountsEqual(prev, nextCounts) ? prev : nextCounts;
        });
        latestStateRef.current = {
          ...latestStateRef.current,
          turns: nextTurns as unknown as TurnRecord[],
          turnThrowCounts: nextCounts,
        };
      } catch {
        void reconcileSpectatorCurrentLeg();
      }
    };

    const handleSpectatorThrowChange = async (event: CustomEvent) => {
      const payload = event.detail;
      const payloadTurnId =
        (payload as { new?: { turn_id?: string }; old?: { turn_id?: string } })?.new?.turn_id ??
        (payload as { new?: { turn_id?: string }; old?: { turn_id?: string } })?.old?.turn_id;
      const hasTurnInState =
        payloadTurnId != null && latestStateRef.current.turns.some((turn) => turn.id === payloadTurnId);
      if (
        shouldIgnoreRealtimePayload(
          payload as RealtimePayload,
          latestStateRef.current.knownLegIds,
          latestStateRef.current.knownTurnIds
        ) &&
        !hasTurnInState
      ) {
        if (payloadTurnId) {
          pendingThrowBufferRef.current.set(payloadTurnId, payload);
          if (latestStateRef.current.knownTurnIds.has(payloadTurnId)) {
            await reconcileSpectatorTurn(payloadTurnId);
          } else if (!pendingTurnReconcileRef.current.has(payloadTurnId)) {
            pendingTurnReconcileRef.current.add(payloadTurnId);
            setTimeout(() => {
              pendingTurnReconcileRef.current.delete(payloadTurnId);
              void reconcileSpectatorTurn(payloadTurnId);
            }, 200);
          }
        }
        return;
      }

      try {
        const legsSnapshot = latestStateRef.current.legs;
        const currentLeg = legsSnapshot.find((l) => !l.winner_player_id) ?? legsSnapshot[legsSnapshot.length - 1];
        const currentLegId = currentLeg?.id;

        const result = applySpectatorThrowChange(
          payload as {
            eventType?: 'INSERT' | 'UPDATE' | 'DELETE';
            new?: Partial<ThrowRecord>;
            old?: Partial<ThrowRecord>;
          },
          {
            currentLegId,
            turns: latestStateRef.current.turns as TurnWithThrows[],
            turnThrowCounts: latestStateRef.current.turnThrowCounts,
          }
        );

        if (result.effects.needsReconcile) {
          if (payloadTurnId) {
            pendingThrowBufferRef.current.set(payloadTurnId, payload);
            if (latestStateRef.current.knownTurnIds.has(payloadTurnId)) {
              await reconcileSpectatorTurn(payloadTurnId);
            } else if (!pendingTurnReconcileRef.current.has(payloadTurnId)) {
              pendingTurnReconcileRef.current.add(payloadTurnId);
              setTimeout(() => {
                pendingTurnReconcileRef.current.delete(payloadTurnId);
                void reconcileSpectatorTurn(payloadTurnId);
              }, 200);
            }
          }
          return;
        }

        const prevTurns = latestStateRef.current.turns as TurnWithThrows[];
        const prevCounts = latestStateRef.current.turnThrowCounts;
        const turnsChanged = !areTurnsEqual(prevTurns, result.turns as unknown as TurnRecord[]);
        const countsChanged = !areThrowCountsEqual(prevCounts, result.turnThrowCounts);

        setTurns((prev) => {
          const next = result.turns as unknown as TurnRecord[];
          return areTurnsEqual(prev, next) ? prev : next;
        });
        setTurnThrowCounts((prev) => {
          return areThrowCountsEqual(prev, result.turnThrowCounts) ? prev : result.turnThrowCounts;
        });
        latestStateRef.current = {
          ...latestStateRef.current,
          turns: result.turns as unknown as TurnRecord[],
          turnThrowCounts: result.turnThrowCounts,
        };
        if (!turnsChanged && !countsChanged && payloadTurnId && latestStateRef.current.knownTurnIds.has(payloadTurnId)) {
          await reconcileSpectatorTurn(payloadTurnId);
        }

        if (result.effects.completedTurnId) {
          const completed = result.turns.find((t) => t.id === result.effects.completedTurnId) as TurnWithThrows | undefined;
          if (completed && !celebratedTurns.current.has(completed.id)) {
            const playerName = latestStateRef.current.playerById[completed.player_id]?.display_name || 'Player';
            const throws = (completed.throws || []).slice().sort((a, b) => a.dart_index - b.dart_index);
            const computedTotal = throws.reduce((sum, thr) => sum + thr.scored, 0);
            const total = completed.total_scored > 0 ? completed.total_scored : computedTotal;

            celebratedTurns.current.add(completed.id);

            if (completed.busted) {
              setCelebration({
                score: total,
                playerName,
                level: 'bust',
                throws,
              });
              setTimeout(() => setCelebration(null), 3000);
            } else if (total === 180) {
              setCelebration({
                score: total,
                playerName,
                level: 'max',
                throws,
              });
              setTimeout(() => setCelebration(null), 6000);
            } else if (total >= 120) {
              setCelebration({
                score: total,
                playerName,
                level: 'godlike',
                throws,
              });
              setTimeout(() => setCelebration(null), 5500);
            } else if (total >= 70) {
              setCelebration({
                score: total,
                playerName,
                level: 'excellent',
                throws,
              });
              setTimeout(() => setCelebration(null), 5000);
            } else if (total >= 50) {
              setCelebration({
                score: total,
                playerName,
                level: 'good',
                throws,
              });
              setTimeout(() => setCelebration(null), 4000);
            } else if (total > 0) {
              setCelebration({
                score: total,
                playerName,
                level: 'info',
                throws,
              });
              setTimeout(() => setCelebration(null), 2000);
            }

            if (commentaryEnabled && commentaryDebouncer.current.canCall()) {
              commentaryDebouncer.current.markCalled();
              const snapshot: CommentarySnapshot = {
                turns: result.turns as TurnWithThrows[],
                legs: latestStateRef.current.legs,
                players: latestStateRef.current.players,
                match: latestStateRef.current.match,
              };
              triggerCommentary(completed, playerName, throws, snapshot);
            }
          }
        }
      } catch {
        // Fallback to full reload only on error
        void loadAllSpectator();
      }
    };

    const runMatchUIRefresh = async () => {
      try {
        if (latestStateRef.current.isSpectatorMode) return;

        const supabase = await getSupabaseClient();
        // Prefer local state (ref) to avoid extra round-trips on every throw.
        let legsSnapshot = latestStateRef.current.legs;
        let currentLeg = legsSnapshot.find((l) => !l.winner_player_id) ?? legsSnapshot[legsSnapshot.length - 1];

        // Fallback if we don't have legs yet.
        if (!currentLeg) {
          const { data: fetchedLegs } = await supabase
            .from('legs')
            .select('*')
            .eq('match_id', matchId)
            .order('leg_number', { ascending: true });
          legsSnapshot = (fetchedLegs as LegRecord[] | null) ?? legsSnapshot;
          currentLeg = legsSnapshot.find((l) => !l.winner_player_id) ?? legsSnapshot[legsSnapshot.length - 1];
        }

        if (currentLeg) {
          const { data: updatedTurns } = await supabase
            .from('turns')
            .select(`
                id, leg_id, player_id, turn_number, total_scored, busted, created_at,
                throws:throws(id, turn_id, dart_index, segment, scored)
              `)
            .eq('leg_id', currentLeg.id)
            .order('turn_number', { ascending: true });

          if (updatedTurns) {
            // Check if our ongoing turn is still valid/current
            const ongoing = ongoingTurnRef.current;
            let shouldClearOngoing = false;
            let nextLocalTurn:
              | { playerId: string | null; darts: { scored: number; label: string; kind: SegmentResult['kind'] }[] }
              | null = null;

            if (ongoing) {
              // Check if someone else finished this turn or if there's a newer turn
              const ourTurn = updatedTurns.find((t) => t.id === ongoing.turnId) as TurnWithThrows | undefined;
              if (!ourTurn) {
                // Our turn was deleted (probably by another client)
                shouldClearOngoing = true;
              } else {
                // Check if our turn was completed by another client
                const persistedThrows = (ourTurn.throws ?? []).slice().sort((a, b) => a.dart_index - b.dart_index);
                const throwCount = persistedThrows.length;
                if (throwCount >= 3 || ourTurn.busted) {
                  shouldClearOngoing = true;
                } else {
                  const persistedDarts = persistedThrows.map((thr) => ({
                    scored: thr.scored,
                    label: thr.segment,
                    kind: segmentLabelToKind(thr.segment),
                  }));
                  // Avoid regressing local optimistic darts while a throw request is in flight.
                  // Reconcile only when server has at least as many darts as local.
                  const canReconcileFromServer = persistedDarts.length >= ongoing.darts.length;
                  const drifted =
                    canReconcileFromServer &&
                    (persistedDarts.length !== ongoing.darts.length ||
                      persistedDarts.some((dart, idx) => {
                        const local = ongoing.darts[idx];
                        return !local || local.scored !== dart.scored || local.label !== dart.label;
                      }));

                  // Keep local in-memory turn fully aligned with server throws so score math stays consistent.
                  if (drifted) {
                    const syncedOngoingDarts = persistedDarts.map((dart) => ({ ...dart }));
                    const syncedLocalDarts = persistedDarts.map((dart) => ({ ...dart }));
                    ongoingTurnRef.current = {
                      ...ongoing,
                      darts: syncedOngoingDarts,
                    };
                    nextLocalTurn = {
                      playerId: ongoing.playerId,
                      darts: syncedLocalDarts,
                    };
                  }
                }
              }
            }

            if (shouldClearOngoing) {
              ongoingTurnRef.current = null;
              nextLocalTurn = { playerId: null, darts: [] };
            }

            if (nextLocalTurn) {
              setLocalTurn(nextLocalTurn);
            }

            // Update state with functional updates
            setTurns((prev) => {
              const newTurns = updatedTurns as unknown as TurnRecord[];
              return areTurnsEqual(prev, newTurns) ? prev : newTurns;
            });

            // Update throw counts
            const throwCounts: Record<string, number> = {};
            for (const turn of updatedTurns) {
              const throws = (turn as TurnWithThrows).throws || [];
              throwCounts[turn.id] = throws.length;
            }

            setTurnThrowCounts((prev) => {
              return areThrowCountsEqual(prev, throwCounts) ? prev : throwCounts;
            });
          }
        }
      } catch {
        // Fallback to full reload
        void loadAll();
      }
    };

    const scheduleMatchUIRefresh = () => {
      if (matchTurnsDebounceTimerRef.current) {
        matchTurnsFetchQueuedRef.current = true;
        return;
      }

      matchTurnsDebounceTimerRef.current = setTimeout(() => {
        matchTurnsDebounceTimerRef.current = null;

        if (matchTurnsFetchRef.current) {
          matchTurnsFetchQueuedRef.current = true;
          return;
        }

        const run = async () => {
          let remaining = 6;
          do {
            matchTurnsFetchQueuedRef.current = false;
            await runMatchUIRefresh();
            remaining -= 1;
          } while (matchTurnsFetchQueuedRef.current && remaining > 0);
        };

        matchTurnsFetchRef.current = run().finally(() => {
          matchTurnsFetchRef.current = null;
        });
      }, 60);
    };

    // Handle real-time updates for normal match UI (non-spectator)
    const handleMatchUIUpdate = (event: CustomEvent) => {
      if (latestStateRef.current.isSpectatorMode) return; // Only for normal match UI

      const payload = event.detail;
      if (
        shouldIgnoreRealtimePayload(
          payload as RealtimePayload,
          latestStateRef.current.knownLegIds,
          latestStateRef.current.knownTurnIds
        )
      ) {
        return;
      }

      scheduleMatchUIRefresh();
    };

    // Handle turn changes - hot update
    const handleTurnChange = async (event: CustomEvent) => {
      // Race guard: throws can arrive immediately after a new turn is inserted.
      // Add this turn id to our known set early so subsequent throw events for the same turn
      // are not ignored before state catches up.
      const payload = event.detail as {
        eventType?: 'INSERT' | 'UPDATE' | 'DELETE';
        new?: Partial<TurnRecord>;
        old?: Partial<TurnRecord>;
      };
      const legId = payload?.new?.leg_id ?? payload?.old?.leg_id ?? null;
      const turnId = payload?.new?.id ?? payload?.old?.id ?? null;
      const { knownLegIds, knownTurnIds } = latestStateRef.current;
      if (legId) {
        // Until initial match state is loaded, ignore turn events entirely.
        // This prevents unknown turns from other matches being added as known.
        if (knownLegIds.size === 0) {
          return;
        }
        if (!knownLegIds.has(legId)) {
          return;
        }
        if (turnId) {
          knownTurnIds.add(turnId);
        }
      }

      // Use spectator logic for spectator mode, match UI logic for normal mode (use ref)
      if (latestStateRef.current.isSpectatorMode) {
        const legsSnapshot = latestStateRef.current.legs;
        const currentLeg = legsSnapshot.find((l) => !l.winner_player_id) ?? legsSnapshot[legsSnapshot.length - 1];
        const currentLegId = currentLeg?.id;

        let result = applySpectatorTurnChange(payload, {
          currentLegId,
          turns: latestStateRef.current.turns as TurnWithThrows[],
          turnThrowCounts: latestStateRef.current.turnThrowCounts,
        });

        if (turnId && (!currentLegId || (legId && legId === currentLegId))) {
          const pending = pendingThrowBuffer.take(turnId);
          if (pending) {
            result = applySpectatorThrowChange(
              pending as {
                eventType?: 'INSERT' | 'UPDATE' | 'DELETE';
                new?: Partial<ThrowRecord>;
                old?: Partial<ThrowRecord>;
              },
              {
                currentLegId,
                turns: result.turns as TurnWithThrows[],
                turnThrowCounts: result.turnThrowCounts,
              }
            );
          }
        }

        if (result.effects.needsReconcile) {
          await reconcileSpectatorCurrentLeg();
          return;
        }

        setTurns((prev) => {
          const next = result.turns as unknown as TurnRecord[];
          return areTurnsEqual(prev, next) ? prev : next;
        });
        setTurnThrowCounts((prev) => {
          return areThrowCountsEqual(prev, result.turnThrowCounts) ? prev : result.turnThrowCounts;
        });
        latestStateRef.current = {
          ...latestStateRef.current,
          turns: result.turns as unknown as TurnRecord[],
          turnThrowCounts: result.turnThrowCounts,
        };

        if (result.effects.completedTurnId) {
          const completed = result.turns.find((t) => t.id === result.effects.completedTurnId) as TurnWithThrows | undefined;
          if (completed && !celebratedTurns.current.has(completed.id)) {
            const playerName = latestStateRef.current.playerById[completed.player_id]?.display_name || 'Player';
            const throws = (completed.throws || []).slice().sort((a, b) => a.dart_index - b.dart_index);
            const total = completed.total_scored > 0 ? completed.total_scored : throws.reduce((sum, thr) => sum + thr.scored, 0);

            celebratedTurns.current.add(completed.id);

            if (completed.busted) {
              setCelebration({
                score: total,
                playerName,
                level: 'bust',
                throws,
              });
              setTimeout(() => setCelebration(null), 3000);
            } else if (total === 180) {
              setCelebration({
                score: total,
                playerName,
                level: 'max',
                throws,
              });
              setTimeout(() => setCelebration(null), 6000);
            } else if (total >= 120) {
              setCelebration({
                score: total,
                playerName,
                level: 'godlike',
                throws,
              });
              setTimeout(() => setCelebration(null), 5500);
            } else if (total >= 70) {
              setCelebration({
                score: total,
                playerName,
                level: 'excellent',
                throws,
              });
              setTimeout(() => setCelebration(null), 5000);
            } else if (total >= 50) {
              setCelebration({
                score: total,
                playerName,
                level: 'good',
                throws,
              });
              setTimeout(() => setCelebration(null), 4000);
            } else if (total > 0) {
              setCelebration({
                score: total,
                playerName,
                level: 'info',
                throws,
              });
              setTimeout(() => setCelebration(null), 2000);
            }

            if (commentaryEnabled && commentaryDebouncer.current.canCall()) {
              commentaryDebouncer.current.markCalled();
              const snapshot: CommentarySnapshot = {
                turns: result.turns as TurnWithThrows[],
                legs: latestStateRef.current.legs,
                players: latestStateRef.current.players,
                match: latestStateRef.current.match,
              };
              triggerCommentary(completed, playerName, throws, snapshot);
            }
          }
        }
      } else {
        if (turnId) {
          const pending = pendingThrowBuffer.take(turnId);
          if (pending) {
            await processThrowChange({ detail: pending } as unknown as CustomEvent);
          }
        }
        handleMatchUIUpdate(event);
      }
    };

    // Handle leg changes - requires full reload for leg transitions
    const handleLegChange = async () => {
      try {
        const nextLegs = await loadLegsOnly();
        const currentLeg = nextLegs.find((l) => !l.winner_player_id) ?? nextLegs[nextLegs.length - 1];
        if (currentLeg?.id) {
          await loadTurnsForLeg(currentLeg.id);
        } else {
          throw new Error('No current leg after legs reload');
        }
      } catch {
        if (latestStateRef.current.isSpectatorMode) {
          void loadAllSpectator();
        } else {
          void loadAll();
        }
      }
    };

    // Handle match changes - requires full reload
    const handleMatchChange = async (event: CustomEvent) => {
      const payload = event.detail;
      if (payload?.new) {
        setMatch(payload.new as MatchRecord);
      }
      try {
        await loadMatchOnly();
      } catch {
        void loadAll();
      }
    };

    // Handle match_players changes - reload to update player list and order
    const handleMatchPlayersChange = async (event: CustomEvent) => {
      console.log('👥 Handling match players change event:', event.detail);
      try {
        await loadPlayersOnly();
      } catch {
        if (latestStateRef.current.isSpectatorMode) {
          void loadAllSpectator();
        } else {
          void loadAll();
        }
      }
    };

    // Add event listeners
    window.addEventListener('supabase-throws-change', handleThrowChange as unknown as EventListener);
    window.addEventListener('supabase-turns-change', handleTurnChange as unknown as EventListener);
    window.addEventListener('supabase-legs-change', handleLegChange as unknown as EventListener);
    window.addEventListener('supabase-matches-change', handleMatchChange as unknown as EventListener);
    window.addEventListener('supabase-match-players-change', handleMatchPlayersChange as unknown as EventListener);

    // Update presence to indicate we're viewing this match (use ref)
    realtime.updatePresence(latestStateRef.current.isSpectatorMode);

    // Cleanup function
    return () => {
      pendingThrowBuffer.clear();
      pendingTurnReconcileRef.current.clear();
      if (matchTurnsDebounceTimerRef.current) {
        clearTimeout(matchTurnsDebounceTimerRef.current);
        matchTurnsDebounceTimerRef.current = null;
      }

      window.removeEventListener('supabase-throws-change', handleThrowChange as unknown as EventListener);
      window.removeEventListener('supabase-turns-change', handleTurnChange as unknown as EventListener);
      window.removeEventListener('supabase-legs-change', handleLegChange as unknown as EventListener);
      window.removeEventListener('supabase-matches-change', handleMatchChange as unknown as EventListener);
      window.removeEventListener('supabase-match-players-change', handleMatchPlayersChange as unknown as EventListener);
    };
  }, [
    realtime.isConnected,
    realtimeEnabled,
    matchId,
    loadAll,
    loadAllSpectator,
    loadMatchOnly,
    loadLegsOnly,
    loadPlayersOnly,
    loadTurnsForLeg,
    latestStateRef,
    pendingThrowBufferRef,
    pendingTurnReconcileRef,
    setTurns,
    setTurnThrowCounts,
    setMatch,
    ongoingTurnRef,
    setLocalTurn,
    setCelebration,
    celebratedTurns,
    commentaryEnabled,
    personaId,
    commentaryDebouncer,
    setCommentaryLoading,
    setCommentaryPlaying,
    setCurrentCommentary,
    ttsServiceRef,
  ]);
}
