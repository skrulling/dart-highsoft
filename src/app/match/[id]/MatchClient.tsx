"use client";

import { MatchScoringView } from '@/components/match/MatchScoringView';
import { RealtimeDebugPanel } from '@/components/match/RealtimeDebugPanel';
import { PerfDebugPanel } from '@/components/match/PerfDebugPanel';
import { SegmentResult } from '@/utils/dartboard';
import { FinishRule } from '@/utils/x01';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useCommentary } from '@/hooks/useCommentary';
import { useMatchData } from '@/hooks/useMatchData';
import { useMatchRealtime } from '@/hooks/useMatchRealtime';
import { useMatchActions } from '@/hooks/useMatchActions';
import { useMatchEloChanges } from '@/hooks/useMatchEloChanges';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRealtime } from '@/hooks/useRealtime';
import type { LegRecord, MatchRecord, Player, TurnRecord } from '@/lib/match/types';
import { PendingThrowBuffer } from '@/lib/match/realtime';
import { incrementRealtimeMetric } from '@/lib/match/realtimeMetrics';
import {
  selectCurrentLeg,
  selectOrderPlayers,
  selectMatchWinnerId,
  selectPlayerStats,
  selectCurrentPlayer,
  selectCurrentPlayerWithFairEnding,
  selectSpectatorCurrentPlayer,
  getScoreForPlayer as getScoreForPlayerSelector,
  getAvgForPlayer as getAvgForPlayerSelector,
  canEditPlayers as canEditPlayersSelector,
  canReorderPlayers as canReorderPlayersSelector,
} from '@/lib/match/selectors';
import { computeFairEndingState, type FairEndingState } from '@/utils/fairEnding';

const MatchSpectatorView = dynamic(
  () => import('@/components/match/MatchSpectatorView').then((module) => module.MatchSpectatorView),
  { loading: () => <div className="p-4">Loading spectator view…</div> }
);

export default function MatchClient({ matchId }: { matchId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const spectatorParam = searchParams.get('spectator') === 'true';
  const [origin, setOrigin] = useState('');
  
  // Spectator mode state
  const [isSpectatorMode, setIsSpectatorMode] = useState(spectatorParam);
  const [celebration, setCelebration] = useState<{
    score: number;
    playerName: string;
    level: 'info' | 'good' | 'excellent' | 'godlike' | 'max' | 'bust';
    throws: { segment: string; scored: number; dart_index: number }[];
  } | null>(null);
  const celebratedTurns = useRef<Set<string>>(new Set());

  // Commentary state (persona-driven)
  const {
    commentaryEnabled,
    audioEnabled,
    voice,
    personaId,
    currentCommentary,
    commentaryLoading,
    commentaryPlaying,
    activePersona,
    commentaryDebouncer,
    ttsServiceRef,
    setCurrentCommentary,
    setCommentaryLoading,
    setCommentaryPlaying,
    setAudioEnabled,
    setVoice,
    handleCommentaryEnabledChange,
    handleAudioEnabledChange,
    handlePersonaChange,
  } = useCommentary();

  // Ref to hold latest state for event handlers (prevents stale closure bugs)
  const latestStateRef = useRef({
    isSpectatorMode: false,
    playerById: {} as Record<string, Player>,
    turnThrowCounts: {} as Record<string, number>,
    turns: [] as TurnRecord[],
    legs: [] as LegRecord[],
    players: [] as Player[],
    match: null as MatchRecord | null,
    knownLegIds: new Set<string>(),
    knownTurnIds: new Set<string>(),
  });
  const pendingThrowBufferRef = useRef(new PendingThrowBuffer());
  const pendingTurnReconcileRef = useRef(new Set<string>());

  const {
    loading,
    error,
    match,
    setMatch,
    players,
    legs,
    turns,
    setTurns,
    turnsByLeg,
    turnThrowCounts,
    setTurnThrowCounts,
    spectatorLoading,
    loadAll,
    loadAllSpectator,
    loadMatchOnly,
    loadLegsOnly,
    loadPlayersOnly,
    loadTurnsForLeg,
  } = useMatchData(matchId);

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


  // Real-time connection
  const realtime = useRealtime(matchId);
  const realtimeEnabled = true; // For now, always enabled
  const realtimeIsConnected = realtime.isConnected;
  const realtimeConnectionStatus = realtime.connectionStatus;
  const realtimeUpdatePresence = realtime.updatePresence;
  const debugRealtime =
    process.env.NODE_ENV !== 'production' &&
    (searchParams.get('debugRealtime') === '1' || searchParams.get('debug') === 'realtime');
  const debugPerf = process.env.NODE_ENV !== 'production';

  useEffect(() => {
    if (isSpectatorMode) {
      void loadAllSpectator();
      return;
    }
    void loadAll();
  }, [isSpectatorMode, loadAll, loadAllSpectator]);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // Compute playerById memo
  const playerById = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p])), [players]);

  // Sync latest state to ref (prevents stale closures in event handlers)
  useEffect(() => {
    const knownLegIds = new Set<string>(legs.map((leg) => leg.id));
    const knownTurnIds = new Set<string>();
    for (const turn of turns) {
      knownTurnIds.add(turn.id);
    }
    for (const legTurns of Object.values(turnsByLeg)) {
      for (const turn of legTurns) {
        knownTurnIds.add(turn.id);
      }
    }

    latestStateRef.current = {
      isSpectatorMode,
      playerById,
      turnThrowCounts,
      turns,
      legs,
      players,
      match,
      knownLegIds,
      knownTurnIds,
    };
  }, [isSpectatorMode, playerById, turnThrowCounts, turns, turnsByLeg, legs, players, match]);

  useMatchRealtime({
    matchId,
    realtime: {
      isConnected: realtimeIsConnected,
      connectionStatus: realtimeConnectionStatus,
      updatePresence: realtimeUpdatePresence,
    },
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
  });

  // Check for spectator mode from URL params
  useEffect(() => {
    setIsSpectatorMode(spectatorParam);
  }, [spectatorParam]);

  useEffect(() => {
    if (!isSpectatorMode) return;
    const handleRematch = (event: Event) => {
      const payload = (event as CustomEvent).detail as { newMatchId?: string } | undefined;
      if (payload?.newMatchId) {
        router.push(`/match/${payload.newMatchId}?spectator=true`);
      }
    };
    window.addEventListener('supabase-rematch-created', handleRematch as EventListener);
    return () => {
      window.removeEventListener('supabase-rematch-created', handleRematch as EventListener);
    };
  }, [isSpectatorMode, router]);

  // Auto-refresh in spectator mode (fallback when real-time is not available)
  useEffect(() => {
    if (!isSpectatorMode) return;
    
    // Only use polling if real-time is not connected or disabled
    if (realtimeIsConnected && realtimeEnabled) return;
    
    const interval = setInterval(() => {
      // Only reload if not currently loading to prevent flickering
      if (!spectatorLoading) {
        incrementRealtimeMetric(matchId, 'fallbackPollTicks');
        void loadAllSpectator();
      }
    }, 2000); // Refresh every 2 seconds as fallback
    
    return () => clearInterval(interval);
  }, [isSpectatorMode, loadAllSpectator, spectatorLoading, realtimeIsConnected, realtimeEnabled]);

  const currentLeg = useMemo(() => selectCurrentLeg(legs ?? []), [legs]);

  useEffect(() => {
    // Reset per-leg celebration tracking only when the active leg changes.
    celebratedTurns.current.clear();
  }, [currentLeg?.id]);

  const orderPlayers = useMemo(() => selectOrderPlayers(match, players, currentLeg), [match, players, currentLeg]);

  const startScore: number = useMemo(() => (match?.start_score ? parseInt(match.start_score, 10) : 501), [match?.start_score]);
  const finishRule: FinishRule = useMemo(() => (match?.finish ?? 'double_out'), [match]);

  // Determine if match has a winner already
  const matchWinnerId = useMemo(() => selectMatchWinnerId(match, legs), [match, legs]);

  // Fetch ELO rating changes for the completed match
  const { eloChanges, loading: eloChangesLoading } = useMatchEloChanges(matchId, matchWinnerId, players.length);

  // Check if first round is completed (all players have had at least one turn)
  const canEditPlayers = useMemo(
    () =>
      canEditPlayersSelector({
        currentLeg,
        players,
        turns,
        matchWinnerId,
      }),
    [currentLeg, players, turns, matchWinnerId]
  );

  // Check if game hasn't started yet (no turns/throws registered)
  const canReorderPlayers = useMemo(() => canReorderPlayersSelector(turns, matchWinnerId), [turns, matchWinnerId]);

  // Compute fair ending state
  const fairEndingState: FairEndingState = useMemo(() => {
    if (!match?.fair_ending) {
      return { phase: 'normal' as const, checkedOutPlayerIds: [], tiebreakRound: 0, tiebreakPlayerIds: [], tiebreakScores: {}, winnerId: null };
    }
    return computeFairEndingState(
      turns.map((t) => ({
        player_id: t.player_id,
        total_scored: t.total_scored,
        busted: t.busted,
        tiebreak_round: t.tiebreak_round,
      })),
      orderPlayers,
      startScore,
      true
    );
  }, [match?.fair_ending, turns, orderPlayers, startScore]);

  const standardCurrentPlayer = useMemo(
    () =>
      selectCurrentPlayer({
        orderPlayers,
        currentLeg,
        localTurn,
        turns,
        turnThrowCounts,
      }),
    [orderPlayers, currentLeg, localTurn, turns, turnThrowCounts]
  );

  const currentPlayer = useMemo(
    () =>
      match?.fair_ending
        ? selectCurrentPlayerWithFairEnding({
            fairEndingState,
            orderPlayers,
            turns,
            fallback: standardCurrentPlayer,
          })
        : standardCurrentPlayer,
    [match?.fair_ending, fairEndingState, orderPlayers, turns, standardCurrentPlayer]
  );

  // For spectator mode, determine current player based on incomplete turns
  const standardSpectatorCurrentPlayer = useMemo(
    () =>
      selectSpectatorCurrentPlayer({
        orderPlayers,
        currentLeg,
        turns,
        turnThrowCounts,
      }),
    [orderPlayers, currentLeg, turns, turnThrowCounts]
  );

  const spectatorCurrentPlayer = useMemo(
    () =>
      match?.fair_ending
        ? selectCurrentPlayerWithFairEnding({
            fairEndingState,
            orderPlayers,
            turns,
            fallback: standardSpectatorCurrentPlayer,
          })
        : standardSpectatorCurrentPlayer,
    [match?.fair_ending, fairEndingState, orderPlayers, turns, standardSpectatorCurrentPlayer]
  );

  const currentLegId = currentLeg?.id;

  // Memoized player stats in a single pass over turns
  const playerStats = useMemo(
    () => selectPlayerStats(players, turns, currentLegId, startScore),
    [players, turns, currentLegId, startScore]
  );

  function getScoreForPlayer(playerId: string): number {
    return getScoreForPlayerSelector({
      playerId,
      startScore,
      playerStats,
      localTurn,
      turnThrowCounts,
      ongoingTurnId: ongoingTurnRef.current?.turnId ?? null,
    });
  }

  function getAvgForPlayer(playerId: string): number {
    return getAvgForPlayerSelector(playerId, playerStats);
  }

  const {
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
    endLegAndMaybeMatch,
  } = useMatchActions({
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
    routerPush: router.push,
    getScoreForPlayer,
    canEditPlayers,
    canReorderPlayers,
    commentaryEnabled,
    personaId,
    setCurrentCommentary,
    setCommentaryLoading,
    setCommentaryPlaying,
    ttsServiceRef,
    broadcastRematch: realtime.broadcastRematch,
    fairEndingState,
    startScore,
  });

  // When fair ending resolves a winner, end the leg (with guard to prevent double-fire)
  const fairEndingWinnerId = fairEndingState.winnerId;
  const fairEndingResolvedRef = useRef<string | null>(null);
  useEffect(() => {
    if (fairEndingWinnerId && !matchWinnerId && fairEndingResolvedRef.current !== fairEndingWinnerId) {
      fairEndingResolvedRef.current = fairEndingWinnerId;
      void endLegAndMaybeMatch(fairEndingWinnerId);
    }
  }, [fairEndingWinnerId, matchWinnerId, endLegAndMaybeMatch]);

  // Toggle spectator mode
  const toggleSpectatorMode = useCallback(() => {
    const newSpectatorMode = !isSpectatorMode;
    setIsSpectatorMode(newSpectatorMode);
    
    // Update URL without page reload
    const url = new URL(window.location.href);
    if (newSpectatorMode) {
      url.searchParams.set('spectator', 'true');
    } else {
      url.searchParams.delete('spectator');
    }
    window.history.replaceState({}, '', url.toString());
  }, [isSpectatorMode]);


  if (loading) return <div className="p-4">Loading…</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;
  if (!match || !currentLeg) return <div className="p-4">No leg available</div>;
  const matchUrl = origin ? `${origin}/match/${matchId}` : '';

  // Spectator Mode View
  if (isSpectatorMode) {
    return (
      <>
        <MatchSpectatorView
          celebration={celebration}
          realtimeConnectionStatus={realtime.connectionStatus}
          realtimeIsConnected={realtime.isConnected}
          spectatorLoading={spectatorLoading}
          matchUrl={matchUrl}
          match={match}
          orderPlayers={orderPlayers}
          spectatorCurrentPlayer={spectatorCurrentPlayer}
          turns={turns}
          currentLegId={currentLeg?.id}
          startScore={startScore}
          finishRule={finishRule}
          turnThrowCounts={turnThrowCounts}
          getAvgForPlayer={getAvgForPlayer}
          legs={legs}
          players={players}
          playerById={playerById}
          matchWinnerId={matchWinnerId}
          onHome={() => router.push('/')}
          onToggleSpectatorMode={toggleSpectatorMode}
          commentaryEnabled={commentaryEnabled}
          audioEnabled={audioEnabled}
          voice={voice}
          personaId={personaId}
          onCommentaryEnabledChange={handleCommentaryEnabledChange}
          onAudioEnabledChange={handleAudioEnabledChange}
          onVoiceChange={setVoice}
          onPersonaChange={handlePersonaChange}
          currentCommentary={currentCommentary}
          commentaryLoading={commentaryLoading}
          commentaryPlaying={commentaryPlaying}
          onSkipCommentary={() => ttsServiceRef.current.skipCurrent()}
          onToggleMute={() => setAudioEnabled(!audioEnabled)}
          queueLength={ttsServiceRef.current.getQueueLength()}
          activePersona={activePersona}
          eloChanges={eloChanges}
          eloChangesLoading={eloChangesLoading}
          fairEndingState={fairEndingState}
        />
        <RealtimeDebugPanel
          matchId={matchId}
          connectionStatus={realtime.connectionStatus}
          isSpectatorMode={true}
          enabled={debugRealtime}
        />
        <PerfDebugPanel matchId={matchId} enabled={debugPerf} />
      </>
    );
  }

  return (
    <>
      <MatchScoringView
        realtimeConnectionStatus={realtime.connectionStatus}
        currentPlayer={currentPlayer}
        getScoreForPlayer={getScoreForPlayer}
        localTurn={localTurn}
        turns={turns}
        turnThrowCounts={turnThrowCounts}
        matchWinnerId={matchWinnerId}
        onBoardClick={handleBoardClick}
        onUndoLastThrow={undoLastThrow}
        onOpenEditModal={openEditModal}
        onOpenEditPlayersModal={openEditPlayersModal}
        onToggleSpectatorMode={toggleSpectatorMode}
        endGameDialogOpen={endGameDialogOpen}
        onEndGameDialogOpenChange={setEndGameDialogOpen}
        endGameLoading={endGameLoading}
        onEndGameEarly={endGameEarly}
        rematchLoading={rematchLoading}
        onStartRematch={startRematch}
        editOpen={editOpen}
        onEditOpenChange={setEditOpen}
        editingThrows={editingThrows}
        playerById={playerById}
        selectedThrowId={selectedThrowId}
        onSelectThrow={(throwId) => setSelectedThrowId(throwId)}
        onUpdateThrow={updateSelectedThrow}
        editPlayersOpen={editPlayersOpen}
        onEditPlayersOpenChange={setEditPlayersOpen}
        canEditPlayers={canEditPlayers}
        canReorderPlayers={canReorderPlayers}
        players={players}
        availablePlayers={availablePlayers}
        newPlayerName={newPlayerName}
        onNewPlayerNameChange={setNewPlayerName}
        onAddNewPlayer={addNewPlayer}
        onAddExistingPlayer={addPlayerToMatch}
        onRemovePlayer={removePlayerFromMatch}
        onMovePlayerUp={movePlayerUp}
        onMovePlayerDown={movePlayerDown}
        match={match}
        orderPlayers={orderPlayers}
        turnsByLeg={turnsByLeg}
        legs={legs}
        currentLeg={currentLeg}
        getAvgForPlayer={getAvgForPlayer}
        finishRule={finishRule}
        eloChanges={eloChanges}
        eloChangesLoading={eloChangesLoading}
        fairEndingState={fairEndingState}
      />
      <RealtimeDebugPanel
        matchId={matchId}
        connectionStatus={realtime.connectionStatus}
        isSpectatorMode={false}
        enabled={debugRealtime}
      />
      <PerfDebugPanel matchId={matchId} enabled={debugPerf} />
    </>
  );
}
