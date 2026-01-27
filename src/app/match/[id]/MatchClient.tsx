"use client";

import Dartboard from '@/components/Dartboard';
import MobileKeypad from '@/components/MobileKeypad';
import { ScoreProgressChart } from '@/components/ScoreProgressChart';
import { TurnRow } from '@/components/TurnRow';
import { TurnsHistoryCard } from '@/components/TurnsHistoryCard';
import { computeCheckoutSuggestions } from '@/utils/checkoutSuggestions';
import { computeHit, SegmentResult } from '@/utils/dartboard';
import { computeRemainingScore, computeTurnTotal } from '@/lib/commentary/stats';
import { getExcitementLevel } from '@/lib/commentary/utils';
import { applyThrow, FinishRule } from '@/utils/x01';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { EditPlayersModal } from '@/components/match/EditPlayersModal';
import { EditThrowsModal, type EditableThrow } from '@/components/match/EditThrowsModal';
import { MatchPlayersCard } from '@/components/match/MatchPlayersCard';
import { SpectatorLiveMatchCard } from '@/components/match/SpectatorLiveMatchCard';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRealtime } from '@/hooks/useRealtime';
import { updateMatchEloRatings, shouldMatchBeRated } from '@/utils/eloRating';
import { updateMatchEloRatingsMultiplayer, shouldMatchBeRatedMultiplayer, type MultiplayerResult } from '@/utils/eloRatingMultiplayer';
import { Home } from 'lucide-react';
import CommentaryDisplay from '@/components/CommentaryDisplay';
import CommentarySettings from '@/components/CommentarySettings';
import { resolvePersona } from '@/lib/commentary/personas';
import type { CommentaryPersonaId, PlayerStats } from '@/lib/commentary/types';
import { generateCommentary, generateMatchRecap, type CommentaryContext, CommentaryDebouncer } from '@/services/commentaryService';
import { getTTSService, type VoiceOption } from '@/services/ttsService';
import type {
  LegRecord,
  MatchPlayersRow,
  MatchRecord,
  Player,
  ThrowRecord,
  TurnRecord,
  TurnWithThrows,
} from '@/lib/match/types';
import { loadMatchData } from '@/lib/match/loadMatchData';
import {
  PendingThrowBuffer,
  getRealtimePayloadLegId,
  getRealtimePayloadTurnId,
  shouldIgnoreRealtimePayload,
  type RealtimePayload,
} from '@/lib/match/realtime';

export default function MatchClient({ matchId }: { matchId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Spectator mode state
  const [isSpectatorMode, setIsSpectatorMode] = useState(false);
  const [spectatorLoading, setSpectatorLoading] = useState(false);
  const [turnThrowCounts, setTurnThrowCounts] = useState<Record<string, number>>({});
  const [celebration, setCelebration] = useState<{
    score: number;
    playerName: string;
    level: 'info' | 'good' | 'excellent' | 'godlike' | 'max' | 'bust';
    throws: { segment: string; scored: number; dart_index: number }[];
  } | null>(null);
  const celebratedTurns = useRef<Set<string>>(new Set());
  const spectatorTurnsFetchRef = useRef<Promise<void> | null>(null);
  const spectatorTurnsFetchQueuedRef = useRef(false);

  // Commentary state (persona-driven)
  const [commentaryEnabled, setCommentaryEnabled] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [voice, setVoice] = useState<VoiceOption>('onyx'); // Match TTSService default - male voice
  const [personaId, setPersonaId] = useState<CommentaryPersonaId>('chad');
  const [currentCommentary, setCurrentCommentary] = useState<string | null>(null);
  const [commentaryLoading, setCommentaryLoading] = useState(false);
  const [commentaryPlaying, setCommentaryPlaying] = useState(false);
  const ttsServiceRef = useRef(getTTSService());
  const commentaryDebouncer = useRef(new CommentaryDebouncer(2000));
  const activePersona = useMemo(() => resolvePersona(personaId), [personaId]);

  const handleCommentaryEnabledChange = useCallback(
    (enabled: boolean) => {
      setCommentaryEnabled(enabled);
      if (enabled && audioEnabled) {
        void ttsServiceRef.current.unlock();
      }
    },
    [audioEnabled]
  );

  const handleAudioEnabledChange = useCallback(
    (enabled: boolean) => {
      setAudioEnabled(enabled);
      if (enabled && commentaryEnabled) {
        void ttsServiceRef.current.unlock();
      }
    },
    [commentaryEnabled]
  );

  const handlePersonaChange = useCallback((nextPersona: CommentaryPersonaId) => {
    setPersonaId(nextPersona);
  }, []);

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

  // Edit throws modal state
  const [editOpen, setEditOpen] = useState(false);
  const [editingThrows, setEditingThrows] = useState<EditableThrow[]>([]);
  const [selectedThrowId, setSelectedThrowId] = useState<string | null>(null);

  // Edit players modal state
  const [editPlayersOpen, setEditPlayersOpen] = useState(false);
  const [availablePlayers, setAvailablePlayers] = useState<Player[]>([]);
  const [newPlayerName, setNewPlayerName] = useState('');

  // End game early state
  const [endGameDialogOpen, setEndGameDialogOpen] = useState(false);
  const [endGameLoading, setEndGameLoading] = useState(false);

  // Real-time connection
  const realtime = useRealtime(matchId);
  const realtimeEnabled = true; // For now, always enabled
  const realtimeIsConnected = realtime.isConnected;
  const realtimeConnectionStatus = realtime.connectionStatus;
  const realtimeUpdatePresence = realtime.updatePresence;

  const loadAllRequestIdRef = useRef(0);
  const loadAllSpectatorRequestIdRef = useRef(0);

  const loadAll = useCallback(async () => {
    const requestId = ++loadAllRequestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const supabase = await getSupabaseClient();
      const result = await loadMatchData(supabase, matchId);

      if (requestId !== loadAllRequestIdRef.current) return;

      setMatch(result.match);
      setPlayers(result.players);
      setLegs(result.legs);
      setTurns(result.turns);
      setTurnThrowCounts(result.turnThrowCounts);
      setTurnsByLeg(result.turnsByLeg);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setError(msg);
    } finally {
      if (requestId === loadAllRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [matchId]);

  // Separate loading function for spectator mode that doesn't show loading screen
  const loadAllSpectator = useCallback(async () => {
    const requestId = ++loadAllSpectatorRequestIdRef.current;
    setSpectatorLoading(true);
    try {
      const supabase = await getSupabaseClient();
      const result = await loadMatchData(supabase, matchId);

      if (requestId !== loadAllSpectatorRequestIdRef.current) return;

      if (result.match) setMatch(result.match);
      setPlayers(result.players);
      setLegs(result.legs);
      setTurns(result.turns);
      setTurnThrowCounts(result.turnThrowCounts);
      setTurnsByLeg(result.turnsByLeg);

      // NOTE: throw counts are derived from the loaded turns above to avoid extra queries.
    } catch (e) {
      console.error('Spectator mode refresh error:', e);
      // Don't set error state in spectator mode to avoid disrupting the view
    } finally {
      if (requestId === loadAllSpectatorRequestIdRef.current) {
        setSpectatorLoading(false);
      }
    }
  }, [matchId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Load commentary settings from localStorage and TTSService
  useEffect(() => {
    try {
      const savedEnabled =
        localStorage.getItem('commentary-enabled') ?? localStorage.getItem('chad-enabled');
      if (savedEnabled !== null) {
        setCommentaryEnabled(savedEnabled === 'true');
      }

      const savedAudioEnabled =
        localStorage.getItem('commentary-audio-enabled') ?? localStorage.getItem('chad-audio-enabled');
      if (savedAudioEnabled !== null) {
        setAudioEnabled(savedAudioEnabled === 'true');
      }

      const savedPersona = localStorage.getItem('commentary-persona');
      if (savedPersona) {
        setPersonaId(resolvePersona(savedPersona).id as CommentaryPersonaId);
      }

      const ttsSettings = ttsServiceRef.current.getSettings();
      setVoice(ttsSettings.voice);
    } catch (error) {
      console.error('Failed to load commentary settings:', error);
    }
  }, []);

  // Save commentary enabled state
  useEffect(() => {
    try {
      localStorage.setItem('commentary-enabled', commentaryEnabled.toString());
      // legacy key support
      localStorage.setItem('chad-enabled', commentaryEnabled.toString());
    } catch (error) {
      console.error('Failed to save commentary enabled:', error);
    }
  }, [commentaryEnabled]);

  useEffect(() => {
    try {
      localStorage.setItem('commentary-audio-enabled', audioEnabled.toString());
      // legacy key support
      localStorage.setItem('chad-audio-enabled', audioEnabled.toString());
      ttsServiceRef.current.updateSettings({ enabled: audioEnabled });
    } catch (error) {
      console.error('Failed to save audio enabled:', error);
    }
  }, [audioEnabled]);

  useEffect(() => {
    try {
      localStorage.setItem('commentary-persona', personaId);
    } catch (error) {
      console.error('Failed to save commentary persona:', error);
    }
  }, [personaId]);

  useEffect(() => {
    if (!audioEnabled) {
      return;
    }

    const unlockOnFirstInteraction = () => {
      void ttsServiceRef.current.unlock();
    };

    window.addEventListener('pointerdown', unlockOnFirstInteraction, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlockOnFirstInteraction);
    };
  }, [audioEnabled]);

  useEffect(() => {
    try {
      // Update TTSService with new voice (TTSService handles localStorage)
      ttsServiceRef.current.updateSettings({ voice });
    } catch (error) {
      console.error('Failed to save voice:', error);
    }
  }, [voice]);

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

  // Set up real-time event listeners
  useEffect(() => {
    if (!realtimeIsConnected || !realtimeEnabled) {
      console.log('Real-time not ready:', { 
        connected: realtimeIsConnected, 
        enabled: realtimeEnabled,
        status: realtimeConnectionStatus 
      });
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
    const pendingThrowBuffer = new PendingThrowBuffer();

    const handleThrowChange = async (event: CustomEvent) => {
      const payload = event.detail as RealtimePayload;
      const legId = getRealtimePayloadLegId(payload);
      const turnId = getRealtimePayloadTurnId(payload);

      if (!legId && turnId) {
        const { knownTurnIds } = latestStateRef.current;
        if (knownTurnIds.size > 0 && !knownTurnIds.has(turnId)) {
          pendingThrowBuffer.set(turnId, payload);
          return;
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
        const pointsBehindLeader =
          !isLeading && nearestOpponent
            ? Math.max(remainingScore - nearestOpponent.remainingScore, 0)
            : 0;
        const pointsAheadOfChaser =
          isLeading && nearestOpponent
            ? Math.max(nearestOpponent.remainingScore - remainingScore, 0)
            : undefined;

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
            const excitement = getExcitementLevel(
              turnTotal,
              turn.busted,
              turnTotal === 180,
              turnTotal >= 100
            );
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
    const handleSpectatorThrowChange = async (event: CustomEvent) => {
      const payload = event.detail;
      if (shouldIgnoreRealtimePayload(payload as RealtimePayload, latestStateRef.current.knownLegIds, latestStateRef.current.knownTurnIds)) {
        return;
      }

      try {
        if (payload.eventType !== 'INSERT' && payload.eventType !== 'UPDATE') {
          return;
        }

        const runSpectatorTurnsFetch = async () => {
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

          if (!currentLeg) {
            return;
          }

          const { data: updatedTurns } = await supabase
            .from('turns')
            .select(`
                id, leg_id, player_id, turn_number, total_scored, busted, created_at,
                throws:throws(id, turn_id, dart_index, segment, scored)
              `)
            .eq('leg_id', currentLeg.id)
            .order('turn_number', { ascending: true });

          if (!updatedTurns) return;

          // Check for newly completed turns and trigger celebrations (spectator mode only)
          if (latestStateRef.current.isSpectatorMode) {
            const newThrowCounts: Record<string, number> = {};
            for (const turn of updatedTurns) {
              const throws = (turn as TurnWithThrows).throws || [];
              newThrowCounts[turn.id] = throws.length;
            }

            // Compare with previous counts to find completed turns (use ref for latest data)
            const prevCounts = latestStateRef.current.turnThrowCounts;
            for (const turn of updatedTurns) {
              const currentCount = newThrowCounts[turn.id] || 0;
              const previousCount = prevCounts[turn.id] || 0;

              // Check if turn just completed (became 3 throws or busted)
              // Only trigger for complete rounds, not individual high darts
              if (previousCount < 3 && (currentCount === 3 || turn.busted) && turn.total_scored > 0) {
                // Check if we've already celebrated this turn
                if (!celebratedTurns.current.has(turn.id)) {
                  const playerName = latestStateRef.current.playerById[turn.player_id]?.display_name || 'Player';
                  const turnWithThrows = turn as TurnWithThrows;
                  const throws = turnWithThrows.throws || [];
                  const sortedThrows = throws.sort((a, b) => a.dart_index - b.dart_index);

                  // Show all round scores with different levels of celebration
                  celebratedTurns.current.add(turn.id);

                  if (turn.busted) {
                    setCelebration({
                      score: turn.total_scored,
                      playerName,
                      level: 'bust',
                      throws: sortedThrows,
                    });
                    setTimeout(() => setCelebration(null), 3000); // 3 seconds for bust
                  } else if (turn.total_scored === 180) {
                    setCelebration({
                      score: turn.total_scored,
                      playerName,
                      level: 'max',
                      throws: sortedThrows,
                    });
                    setTimeout(() => setCelebration(null), 6000); // 6 seconds for 180
                  } else if (turn.total_scored >= 120) {
                    setCelebration({
                      score: turn.total_scored,
                      playerName,
                      level: 'godlike',
                      throws: sortedThrows,
                    });
                    setTimeout(() => setCelebration(null), 5500); // 5.5 seconds for godlike
                  } else if (turn.total_scored >= 70) {
                    setCelebration({
                      score: turn.total_scored,
                      playerName,
                      level: 'excellent',
                      throws: sortedThrows,
                    });
                    setTimeout(() => setCelebration(null), 5000); // 5 seconds
                  } else if (turn.total_scored >= 50) {
                    setCelebration({
                      score: turn.total_scored,
                      playerName,
                      level: 'good',
                      throws: sortedThrows,
                    });
                    setTimeout(() => setCelebration(null), 4000); // 4 seconds
                  } else {
                    setCelebration({
                      score: turn.total_scored,
                      playerName,
                      level: 'info',
                      throws: sortedThrows,
                    });
                    setTimeout(() => setCelebration(null), 2000); // 2 seconds for basic info
                  }

                  // Trigger commentary if enabled
                  if (commentaryEnabled && commentaryDebouncer.current.canCall()) {
                    commentaryDebouncer.current.markCalled();
                    const snapshot: CommentarySnapshot = {
                      turns: updatedTurns as TurnWithThrows[],
                      legs: legsSnapshot,
                      players: latestStateRef.current.players,
                      match: latestStateRef.current.match,
                    };
                    triggerCommentary(turnWithThrows, playerName, sortedThrows, snapshot);
                  }
                }
              }
            }
          }

          // Force React to re-render by using functional state updates
          setTurns((prev) => {
            const newTurns = updatedTurns as unknown as TurnRecord[];
            return JSON.stringify(prev) !== JSON.stringify(newTurns) ? newTurns : prev;
          });

          // Update throw counts for current turn visualization
          const throwCounts: Record<string, number> = {};
          for (const turn of updatedTurns) {
            const throws = (turn as TurnWithThrows).throws || [];
            throwCounts[turn.id] = throws.length;
          }

          setTurnThrowCounts((prev) => {
            return JSON.stringify(prev) !== JSON.stringify(throwCounts) ? throwCounts : prev;
          });
        };

        if (spectatorTurnsFetchRef.current) {
          spectatorTurnsFetchQueuedRef.current = true;
          return;
        }

        spectatorTurnsFetchRef.current = runSpectatorTurnsFetch();
        await spectatorTurnsFetchRef.current;
        spectatorTurnsFetchRef.current = null;

        if (spectatorTurnsFetchQueuedRef.current) {
          spectatorTurnsFetchQueuedRef.current = false;
          void runSpectatorTurnsFetch();
        }
      } catch {
        // Fallback to full reload only on error
        void loadAllSpectator();
      }
    };
    
    // Handle real-time updates for normal match UI (non-spectator)
    const handleMatchUIUpdate = async (event: CustomEvent) => {
      if (latestStateRef.current.isSpectatorMode) return; // Only for normal match UI
      
      const payload = event.detail;
      if (shouldIgnoreRealtimePayload(payload as RealtimePayload, latestStateRef.current.knownLegIds, latestStateRef.current.knownTurnIds)) {
        return;
      }
      
      try {
        const supabase = await getSupabaseClient();
        
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
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
              
              if (ongoing) {
                // Check if someone else finished this turn or if there's a newer turn
                const ourTurn = updatedTurns.find(t => t.id === ongoing.turnId);
                if (!ourTurn) {
                  // Our turn was deleted (probably by another client)
                  shouldClearOngoing = true;
                } else {
                  // Check if our turn was completed by another client
                  const throwCount = (ourTurn as TurnWithThrows).throws?.length || 0;
                  if (throwCount === 3 || ourTurn.busted) {
                    shouldClearOngoing = true;
                  }
                }
              }
              
              if (shouldClearOngoing) {
                ongoingTurnRef.current = null;
                setLocalTurn({ playerId: '', darts: [] });
              }
              
              // Update state with functional updates
              setTurns(prev => {
                const newTurns = updatedTurns as unknown as TurnRecord[];
                return JSON.stringify(prev) !== JSON.stringify(newTurns) ? newTurns : prev;
              });
              
              // Update throw counts
              const throwCounts: Record<string, number> = {};
              for (const turn of updatedTurns) {
                const throws = (turn as TurnWithThrows).throws || [];
                throwCounts[turn.id] = throws.length;
              }
              
              setTurnThrowCounts(prev => {
                return JSON.stringify(prev) !== JSON.stringify(throwCounts) ? throwCounts : prev;
              });
            }
          }
        }
      } catch {
        // Fallback to full reload
        void loadAll();
      }
    };

    // Handle turn changes - hot update
    const handleTurnChange = async (event: CustomEvent) => {
      // Race guard: throws can arrive immediately after a new turn is inserted.
      // Add this turn id to our known set early so subsequent throw events for the same turn
      // are not ignored before state catches up.
      const payload = event.detail as { new?: { id?: string; leg_id?: string }; old?: { id?: string; leg_id?: string } };
      const legId = payload?.new?.leg_id ?? payload?.old?.leg_id ?? null;
      if (legId) {
        const { knownLegIds, knownTurnIds } = latestStateRef.current;
        if (knownLegIds.size === 0 || knownLegIds.has(legId)) {
          const turnId = payload?.new?.id ?? payload?.old?.id ?? null;
          if (turnId) {
            knownTurnIds.add(turnId);
            const pending = pendingThrowBuffer.take(turnId);
            if (pending) await processThrowChange({ detail: pending } as unknown as CustomEvent);
          }
        }
      }

      // Use spectator logic for spectator mode, match UI logic for normal mode (use ref)
      if (latestStateRef.current.isSpectatorMode) {
        await handleThrowChange(event);
      } else {
        await handleMatchUIUpdate(event);
      }
    };

    // Handle leg changes - requires full reload for leg transitions
    const handleLegChange = () => {
      if (latestStateRef.current.isSpectatorMode) {
        void loadAllSpectator();
      } else {
        void loadAll();
      }
    };

    // Handle match changes - requires full reload
    const handleMatchChange = (event: CustomEvent) => {
      const payload = event.detail;
      if (payload?.new) {
        setMatch(payload.new as MatchRecord);
      }
      void loadAll();
    };

    // Handle match_players changes - reload to update player list and order
    const handleMatchPlayersChange = (event: CustomEvent) => {
      console.log('👥 Handling match players change event:', event.detail);
      if (latestStateRef.current.isSpectatorMode) {
        void loadAllSpectator();
      } else {
        void loadAll();
      }
    };

    // Add event listeners
    window.addEventListener('supabase-throws-change', handleThrowChange as unknown as EventListener);
    window.addEventListener('supabase-turns-change', handleTurnChange as unknown as EventListener);
    window.addEventListener('supabase-legs-change', handleLegChange as unknown as EventListener);
    window.addEventListener('supabase-matches-change', handleMatchChange as unknown as EventListener);
    window.addEventListener('supabase-match-players-change', handleMatchPlayersChange as unknown as EventListener);

    // Update presence to indicate we're viewing this match (use ref)
    realtimeUpdatePresence(latestStateRef.current.isSpectatorMode);

    // Cleanup function
    return () => {
      pendingThrowBuffer.clear();

      window.removeEventListener('supabase-throws-change', handleThrowChange as unknown as EventListener);
      window.removeEventListener('supabase-turns-change', handleTurnChange as unknown as EventListener);
      window.removeEventListener('supabase-legs-change', handleLegChange as unknown as EventListener);
      window.removeEventListener('supabase-matches-change', handleMatchChange as unknown as EventListener);
      window.removeEventListener('supabase-match-players-change', handleMatchPlayersChange as unknown as EventListener);
    };

  }, [
    realtimeIsConnected,
    realtimeEnabled,
    matchId,
    isSpectatorMode,
    loadAll,
    loadAllSpectator,
    commentaryEnabled,
    personaId,
    realtimeConnectionStatus,
    realtimeUpdatePresence,
  ]);

  // Check for spectator mode from URL params
  useEffect(() => {
    const spectatorParam = searchParams.get('spectator');
    if (spectatorParam === 'true') {
      setIsSpectatorMode(true);
    }
  }, [searchParams]);

  // Auto-refresh in spectator mode (fallback when real-time is not available)
  useEffect(() => {
    if (!isSpectatorMode) return;
    
    // Only use polling if real-time is not connected or disabled
    if (realtimeIsConnected && realtimeEnabled) return;
    
    const interval = setInterval(() => {
      // Only reload if not currently loading to prevent flickering
      if (!spectatorLoading) {
        void loadAllSpectator();
      }
    }, 2000); // Refresh every 2 seconds as fallback
    
    return () => clearInterval(interval);
  }, [isSpectatorMode, loadAllSpectator, spectatorLoading, realtimeIsConnected, realtimeEnabled]);

  const currentLeg = useMemo(
    () => (legs ?? []).find((l) => !l.winner_player_id) ?? legs[legs.length - 1],
    [legs]
  );

  useEffect(() => {
    // Reset per-leg celebration tracking only when the active leg changes.
    celebratedTurns.current.clear();
  }, [currentLeg?.id]);

  const orderPlayers = useMemo(() => {
    if (!match || players.length === 0 || !currentLeg) return [] as Player[];
    const startIdx = players.findIndex((p) => p.id === currentLeg.starting_player_id);
    if (startIdx < 0) return players;
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

  // Check if first round is completed (all players have had at least one turn)
  const canEditPlayers = useMemo(() => {
    if (!currentLeg || !players.length || matchWinnerId) return false;

    // If no turns yet, players can be edited
    if (turns.length === 0) return true;

    // Check if first round is completed (all players have had at least one turn)
    const playerTurnCounts = new Map<string, number>();
    for (const turn of turns) {
      playerTurnCounts.set(turn.player_id, (playerTurnCounts.get(turn.player_id) || 0) + 1);
    }

    // First round is completed if all players have at least 1 turn
    const firstRoundComplete = players.every(p => (playerTurnCounts.get(p.id) || 0) >= 1);
    return !firstRoundComplete;
  }, [currentLeg, players, turns, matchWinnerId]);

  // Check if game hasn't started yet (no turns/throws registered)
  const canReorderPlayers = useMemo(() => {
    return turns.length === 0 && !matchWinnerId;
  }, [turns, matchWinnerId]);

  const currentPlayer = useMemo(() => {
    if (!orderPlayers.length || !currentLeg) return null as Player | null;
    
    // If we have a local turn active, that player is current
    if (localTurn.playerId) {
      return orderPlayers.find((p) => p.id === localTurn.playerId) ?? orderPlayers[0];
    }
    
    // Check if the last turn is incomplete (has fewer than 3 throws and not busted)
    if (turns.length > 0) {
      const lastTurn = turns[turns.length - 1];
      const throwCount = turnThrowCounts[lastTurn.id] || 0;
      
      // If the last turn has fewer than 3 throws (and wasn't busted), that player is still playing
      if (throwCount < 3 && !lastTurn.busted) {
        return orderPlayers.find(p => p.id === lastTurn.player_id) || orderPlayers[0];
      }
    }
    
    // Otherwise, it's the next player's turn
    const idx = turns.length % orderPlayers.length;
    return orderPlayers[idx];
  }, [orderPlayers, turns, turnThrowCounts, currentLeg, localTurn.playerId]);

  // For spectator mode, determine current player based on incomplete turns
  const spectatorCurrentPlayer = useMemo(() => {
    if (!orderPlayers.length || !currentLeg) return null as Player | null;
    
    // Check if the last turn is incomplete (has fewer than 3 throws)
    if (turns.length > 0) {
      const lastTurn = turns[turns.length - 1];
      const throwCount = turnThrowCounts[lastTurn.id] || 0;
      
      // If the last turn has fewer than 3 throws (and wasn't busted), that player is still playing
      if (throwCount < 3 && !lastTurn.busted) {
        return orderPlayers.find(p => p.id === lastTurn.player_id) || orderPlayers[0];
      }
    }
    
    // Otherwise, it's the next player's turn
    const idx = turns.length % orderPlayers.length;
    return orderPlayers[idx];
  }, [orderPlayers, turns, turnThrowCounts, currentLeg]);

  const currentLegId = currentLeg?.id;

  // Memoized player stats in a single pass over turns
  const playerStats = useMemo(() => {
    const baseScores: Record<string, number> = {};
    const avgData: Record<string, { sum: number; count: number }> = {};
    const lastTurns: Record<string, TurnRecord | null> = {};
    const playerIdSet = new Set<string>();

    for (const player of players) {
      playerIdSet.add(player.id);
      baseScores[player.id] = startScore;
      avgData[player.id] = { sum: 0, count: 0 };
      lastTurns[player.id] = null;
    }

    for (const turn of turns) {
      const playerId = turn.player_id;
      if (!playerIdSet.has(playerId)) continue;

      const prev = lastTurns[playerId];
      if (!prev || turn.turn_number >= prev.turn_number) {
        lastTurns[playerId] = turn;
      }

      if (turn.leg_id === currentLegId && !turn.busted) {
        const scored = turn.total_scored || 0;
        baseScores[playerId] -= scored;
        avgData[playerId].sum += scored;
        avgData[playerId].count += 1;
      }
    }

    const averages: Record<string, number> = {};
    for (const player of players) {
      const data = avgData[player.id];
      averages[player.id] = data.count > 0 ? data.sum / data.count : 0;
    }

    return { baseScores, averages, lastTurns };
  }, [players, turns, currentLegId, startScore]);

  function getScoreForPlayer(playerId: string): number {
    let current = playerStats.baseScores[playerId] ?? startScore;

    // Check for local turn first (our client's active turn)
    if (localTurn.playerId === playerId) {
      const sub = localTurn.darts.reduce((s, d) => s + d.scored, 0);
      const lastTurn = playerStats.lastTurns[playerId];
      const throwCount = lastTurn ? turnThrowCounts[lastTurn.id] || 0 : 0;
      const isCurrentTurn = lastTurn && lastTurn.id === ongoingTurnRef.current?.turnId;
      const hasSubtotalInTurn =
        isCurrentTurn &&
        throwCount > 0 &&
        throwCount < 3 &&
        typeof lastTurn.total_scored === 'number' &&
        lastTurn.total_scored > 0;
      return Math.max(0, current - (hasSubtotalInTurn ? 0 : sub));
    }

    // Check for incomplete turns from other clients
    const lastTurn = playerStats.lastTurns[playerId];
    if (lastTurn && !lastTurn.busted) {
      const throwCount = turnThrowCounts[lastTurn.id] || 0;
      if (throwCount > 0 && throwCount < 3) {
        // This player has an incomplete turn with throws from another client
        const currentThrows = (lastTurn as TurnWithThrows).throws || [];
        const incompleteTotal = currentThrows.reduce((sum: number, thr: ThrowRecord) => sum + thr.scored, 0);
        // `playerStats.baseScores` already subtracts `turn.total_scored`. During undo/edit flows, we may
        // persist the partial subtotal on the turn row, so only subtract the delta to reach `sum(throws)`.
        const persistedSubtotal = typeof lastTurn.total_scored === 'number' ? lastTurn.total_scored : 0;
        current -= incompleteTotal - persistedSubtotal;
      }
    }

    return Math.max(0, current);
  }

  function getAvgForPlayer(playerId: string): number {
    return playerStats.averages[playerId] ?? 0;
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

  async function triggerMatchRecap(
    winnerId: string,
    allLegs: LegRecord[],
    allPlayers: Player[],
    allTurns: TurnWithThrows[]
  ) {
    try {
      setCommentaryLoading(true);

      const winner = allPlayers.find(p => p.id === winnerId);
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
      allPlayers.forEach(p => {
        playerStatsMap.set(p.id, { totalScore: 0, completedTurns: 0, totalScored: 0 });
      });

      // Single iteration through all turns
      for (const turn of allTurns) {
        const stats = playerStatsMap.get(turn.player_id);
        if (!stats) continue;

        if (!turn.busted) {
          const scored = typeof turn.total_scored === 'number'
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
      const winningLeg = allLegs.find(leg => leg.winner_player_id === winnerId && leg.leg_number === allLegs.length);
      const winningLegTurns = winningLeg
        ? allTurns.filter(t => t.leg_id === winningLeg.id).sort((a, b) => a.turn_number - b.turn_number)
        : [];
      const finalTurn = winningLegTurns[winningLegTurns.length - 1];
      const finalThrows = finalTurn?.throws?.map(t => ({
        segment: t.segment,
        scored: t.scored,
        dart_index: t.dart_index
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
            checkoutScore
          }
        }
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
            excitement: 'high' // Match end is always exciting
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
      // Determine next starter by rotating the initial player order, not by winner
      const nextStarterId = (() => {
        if (!currentLeg || players.length === 0) return winnerPlayerId; // fallback
        const currentIdx = players.findIndex((p) => p.id === currentLeg.starting_player_id);
        const nextIdx = currentIdx >= 0 ? (currentIdx + 1) % players.length : 0;
        return players[nextIdx]?.id ?? winnerPlayerId;
      })();
      const { error: insErr } = await supabase
        .from('legs')
        .insert({ match_id: matchId, leg_number: nextLegNum, starting_player_id: nextStarterId });
      if (insErr) {
        alert(`Failed to create next leg: ${insErr.message}`);
      }
    } else {
      const [winnerPid] = someoneWonMatch;
      const { error: setWinnerErr } = await supabase.from('matches').update({ 
        winner_player_id: winnerPid,
        completed_at: new Date().toISOString()
      }).eq('id', matchId);
      if (setWinnerErr) {
        alert(`Failed to set match winner: ${setWinnerErr.message}`);
      } else {
        // Update ELO ratings
        if (shouldMatchBeRated(players.length)) {
          const loserId = players.find(p => p.id !== winnerPid)?.id;
          if (loserId) {
            try {
              await updateMatchEloRatings(matchId, winnerPid, loserId);
            } catch (error) {
              console.error('Failed to update ELO ratings:', error);
              // Don't show error to user as match completion is more important
            }
          }
        } else if (shouldMatchBeRatedMultiplayer(players.length)) {
          // Multiplayer rating: winner rank 1, all others tied at rank 2
          const results: MultiplayerResult[] = players.map(p => ({
            playerId: p.id,
            rank: p.id === winnerPid ? 1 : 2,
          }));
          try {
            await updateMatchEloRatingsMultiplayer(matchId, results);
          } catch (error) {
            console.error('Failed to update multiplayer ELO ratings:', error);
          }
        }

        // Trigger match recap commentary
        if (commentaryEnabled && allLegs && allLegs.length > 0) {
          try {
            // Fetch all turns for match recap
            const { data: allTurns } = await supabase
              .from('turns')
              .select(`
                id, leg_id, player_id, turn_number, total_scored, busted, created_at,
                throws:throws(id, turn_id, dart_index, segment, scored)
              `)
              .in('leg_id', allLegs.map(l => l.id))
              .order('turn_number', { ascending: true });

            if (allTurns && allTurns.length > 0) {
              void triggerMatchRecap(winnerPid, allLegs, players, allTurns);
            }
          } catch (error) {
            console.error('Failed to trigger match recap:', error);
          }
        }
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
        const { error: delTurnErr } = await supabase.from('turns').delete().eq('id', emptyTurnId);
        if (delTurnErr) {
          alert(`Failed to remove empty turn: ${delTurnErr.message}`);
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
      const newTotal = ongoingTurnRef.current.darts.reduce((sum, dart) => sum + dart.scored, 0);
      await supabase.from('turns').update({ total_scored: newTotal, busted: false }).eq('id', turnId);
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
      | { id: string; turn_id: string; dart_index: number; segment: string; scored: number; turns: { leg_id: string; player_id: string; turn_number: number } }
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
      // If undoing the current player's only throw, keep the turn open with 0 darts
      if (currentPlayer?.id === last.turns.player_id) {
        await supabase.from('turns').update({ total_scored: 0, busted: false }).eq('id', last.turn_id);
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
      await supabase.from('turns').delete().eq('id', last.turn_id);
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

  // Open edit modal and load throws of current leg
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
    type ThrowRow = { id: string; turn_id: string; dart_index: number; segment: string; scored: number; turns: { leg_id: string; turn_number: number; player_id: string } };
    const rows = ((data ?? []) as unknown as ThrowRow[]).map((r) => ({
      id: r.id,
      turn_id: r.turn_id,
      dart_index: r.dart_index,
      segment: r.segment,
      scored: r.scored,
      player_id: r.turns.player_id,
      turn_number: r.turns.turn_number,
    } satisfies EditableThrow));
    setEditingThrows(rows);
    setSelectedThrowId(null);
    setEditOpen(true);
  }, [currentLeg]);

  // Recompute leg turns totals and busted flags after an edit
  const recomputeLegTurns = useCallback(async () => {
    if (!currentLeg || !match) return;
    const supabase = await getSupabaseClient();
    // Load turns for leg
    const { data: tData, error: tErr } = await supabase
      .from('turns')
      .select('id, player_id, turn_number, total_scored, busted')
      .eq('leg_id', currentLeg.id)
      .order('turn_number');
    if (tErr) {
      alert(tErr.message);
      return;
    }
    const turnIds = ((tData ?? []) as { id: string }[]).map((t) => t.id);
    // Load throws for those turns
    const { data: thrData, error: thrErr } = await supabase
      .from('throws')
      .select('id, turn_id, dart_index, segment, scored')
      .in('turn_id', turnIds)
      .order('dart_index');
    if (thrErr) {
      alert(thrErr.message);
      return;
    }

    const legTurns = (
      (tData ?? []) as { id: string; player_id: string; turn_number: number; total_scored: number | null; busted: boolean }[]
    ).sort((a, b) => a.turn_number - b.turn_number);
    const throwsByTurn = new Map<string, { segment: string; scored: number; dart_index: number }[]>();
    for (const thr of ((thrData ?? []) as { id: string; turn_id: string; dart_index: number; segment: string; scored: number }[])) {
      if (!throwsByTurn.has(thr.turn_id)) throwsByTurn.set(thr.turn_id, []);
      throwsByTurn.get(thr.turn_id)!.push({ segment: thr.segment, scored: thr.scored, dart_index: thr.dart_index });
    }
    for (const arr of throwsByTurn.values()) arr.sort((a, b) => a.dart_index - b.dart_index);

    // Initialize per-player current scores
    const perPlayerScore = new Map<string, number>();
    for (const p of players) perPlayerScore.set(p.id, parseInt(match.start_score, 10));

    const turnUpdates: { id: string; total_scored: number; busted: boolean }[] = [];
    for (const t of legTurns) {
      const start = perPlayerScore.get(t.player_id) ?? parseInt(match.start_score, 10);
      let current = start;
      let total = 0;
      let busted = false;
      let finished = false;
      const thrList = throwsByTurn.get(t.id) ?? [];
      // Helper to construct full SegmentResult from stored label
      const segmentResultFromLabel = (label: string): SegmentResult => {
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
      };

      for (const thr of thrList) {
        if (finished || busted) break;
        const seg = segmentResultFromLabel(thr.segment);
        const outcome = applyThrow(current, seg, finishRule);
        if (outcome.busted) {
          busted = true;
          total = 0;
          current = start; // revert
          break;
        }
        total += current - outcome.newScore;
        current = outcome.newScore;
        if (outcome.finished) finished = true;
      }
      // Apply end-of-turn score if not busted
      if (!busted) {
        perPlayerScore.set(t.player_id, current);
      }
      if (t.total_scored !== total || t.busted !== busted) {
        turnUpdates.push({ id: t.id, total_scored: total, busted });
      }
    }

    // Persist only changed values (can be many turns if editing historical throws).
    await Promise.all(
      turnUpdates.map((u) => supabase.from('turns').update({ total_scored: u.total_scored, busted: u.busted }).eq('id', u.id))
    );
  }, [currentLeg, finishRule, match, players]);

  // Open edit players modal and load all available players
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

  // Add new player to the database and match
  const addNewPlayer = useCallback(async () => {
    const name = newPlayerName.trim();
    if (!name) return;
    
    const supabase = await getSupabaseClient();
    
    // Create new player
    const { data: newPlayer, error: playerError } = await supabase
      .from('players')
      .insert({ display_name: name })
      .select('*')
      .single();
    
    if (playerError) {
      alert(playerError.message);
      return;
    }
    
    // Add to match with next play order
    const nextOrder = Math.max(...players.map((_, i) => i), -1) + 1;
    const { error: matchPlayerError } = await supabase
      .from('match_players')
      .insert({ 
        match_id: matchId, 
        player_id: (newPlayer as Player).id, 
        play_order: nextOrder 
      });
    
    if (matchPlayerError) {
      alert(matchPlayerError.message);
      return;
    }
    
    setNewPlayerName('');
    setAvailablePlayers(prev => [...prev, newPlayer as Player]);
    await loadAll(); // Reload match data
  }, [newPlayerName, matchId, players, loadAll]);

  // Add existing player to match
  const addPlayerToMatch = useCallback(async (playerId: string) => {
    const supabase = await getSupabaseClient();
    
    // Check if player is already in match
    if (players.some(p => p.id === playerId)) {
      alert('Player is already in this match');
      return;
    }
    
    const nextOrder = Math.max(...players.map((_, i) => i), -1) + 1;
    const { error } = await supabase
      .from('match_players')
      .insert({ 
        match_id: matchId, 
        player_id: playerId, 
        play_order: nextOrder 
      });
    
    if (error) {
      alert(error.message);
      return;
    }
    
    await loadAll(); // Reload match data
  }, [matchId, players, loadAll]);

  // Remove player from match
  const removePlayerFromMatch = useCallback(async (playerId: string) => {
    if (players.length <= 2) {
      alert('Cannot remove player - match needs at least 2 players');
      return;
    }
    
    try {
      const supabase = await getSupabaseClient();
      
      // First delete the player from match_players
      const { error } = await supabase
        .from('match_players')
        .delete()
        .eq('match_id', matchId)
        .eq('player_id', playerId);
      
      if (error) {
        console.error('Delete error:', error);
        alert(`Failed to remove player: ${error.message}. This might be a database permissions issue.`);
        return;
      }
      
      // Get remaining players and reorder them properly
      const { data: remainingPlayersData, error: fetchError } = await supabase
        .from('match_players')
        .select('*, players:player_id(*)')
        .eq('match_id', matchId)
        .order('play_order');
      
      if (fetchError) {
        console.error('Fetch error:', fetchError);
        alert(`Failed to fetch remaining players: ${fetchError.message}`);
        return;
      }
      
      // Update play orders to be sequential (0, 1, 2, ...)
      const remainingPlayers = ((remainingPlayersData as MatchPlayersRow[] | null) ?? []);
      for (let i = 0; i < remainingPlayers.length; i++) {
        const { error: updateError } = await supabase
          .from('match_players')
          .update({ play_order: i })
          .eq('match_id', matchId)
          .eq('player_id', remainingPlayers[i].player_id);
        
        if (updateError) {
          console.error('Update error:', updateError);
          alert(`Failed to reorder players: ${updateError.message}. This might be a database permissions issue.`);
          return;
        }
      }
      
      await loadAll(); // Reload match data
    } catch (err) {
      console.error('Unexpected error:', err);
      alert('An unexpected error occurred while removing the player.');
    }
  }, [matchId, players.length, loadAll]);

  // Move player up in play order
  const movePlayerUp = useCallback(async (index: number) => {
    if (index === 0 || !canReorderPlayers) return; // Can't move first player up

    const supabase = await getSupabaseClient();

    // Swap play orders using a temporary placeholder to avoid unique constraint violation
    const player = players[index];
    const prevPlayer = players[index - 1];
    const tempOrder = 9999; // Temporary placeholder

    // Step 1: Move player to temporary position
    const { error: error1 } = await supabase
      .from('match_players')
      .update({ play_order: tempOrder })
      .eq('match_id', matchId)
      .eq('player_id', player.id);

    if (error1) {
      alert(`Failed to reorder player: ${error1.message}`);
      return;
    }

    // Step 2: Move prevPlayer to player's original position
    const { error: error2 } = await supabase
      .from('match_players')
      .update({ play_order: index })
      .eq('match_id', matchId)
      .eq('player_id', prevPlayer.id);

    if (error2) {
      alert(`Failed to reorder player: ${error2.message}`);
      return;
    }

    // Step 3: Move player to final position
    const { error: error3 } = await supabase
      .from('match_players')
      .update({ play_order: index - 1 })
      .eq('match_id', matchId)
      .eq('player_id', player.id);

    if (error3) {
      alert(`Failed to reorder player: ${error3.message}`);
      return;
    }

    // Step 4: Update current leg's starting_player_id to maintain correct order
    // After swap, determine who should be first (if swapping position 0 and 1)
    if (currentLeg) {
      let newStartingPlayerId = currentLeg.starting_player_id;

      // If we're moving someone to position 0, they should be the starting player
      if (index === 1) {
        newStartingPlayerId = player.id;
      }

      const { error: legError } = await supabase
        .from('legs')
        .update({ starting_player_id: newStartingPlayerId })
        .eq('id', currentLeg.id);

      if (legError) {
        alert(`Failed to update leg starting player: ${legError.message}`);
        return;
      }
    }

    await loadAll();
  }, [players, matchId, canReorderPlayers, currentLeg, loadAll]);

  // Move player down in play order
  const movePlayerDown = useCallback(async (index: number) => {
    if (index === players.length - 1 || !canReorderPlayers) return; // Can't move last player down

    const supabase = await getSupabaseClient();

    // Swap play orders using a temporary placeholder to avoid unique constraint violation
    const player = players[index];
    const nextPlayer = players[index + 1];
    const tempOrder = 9999; // Temporary placeholder

    // Step 1: Move player to temporary position
    const { error: error1 } = await supabase
      .from('match_players')
      .update({ play_order: tempOrder })
      .eq('match_id', matchId)
      .eq('player_id', player.id);

    if (error1) {
      alert(`Failed to reorder player: ${error1.message}`);
      return;
    }

    // Step 2: Move nextPlayer to player's original position
    const { error: error2 } = await supabase
      .from('match_players')
      .update({ play_order: index })
      .eq('match_id', matchId)
      .eq('player_id', nextPlayer.id);

    if (error2) {
      alert(`Failed to reorder player: ${error2.message}`);
      return;
    }

    // Step 3: Move player to final position
    const { error: error3 } = await supabase
      .from('match_players')
      .update({ play_order: index + 1 })
      .eq('match_id', matchId)
      .eq('player_id', player.id);

    if (error3) {
      alert(`Failed to reorder player: ${error3.message}`);
      return;
    }

    // Step 4: Update current leg's starting_player_id to maintain correct order
    // After swap, determine who should be first (if swapping position 0 and 1)
    if (currentLeg) {
      let newStartingPlayerId = currentLeg.starting_player_id;

      // If we're moving the first player down, the next player becomes first
      if (index === 0) {
        newStartingPlayerId = nextPlayer.id;
      }

      const { error: legError } = await supabase
        .from('legs')
        .update({ starting_player_id: newStartingPlayerId })
        .eq('id', currentLeg.id);

      if (legError) {
        alert(`Failed to update leg starting player: ${legError.message}`);
        return;
      }
    }

    await loadAll();
  }, [players, matchId, canReorderPlayers, currentLeg, loadAll]);

  // Update a specific throw with a new segment
  const updateSelectedThrow = useCallback(
    async (seg: SegmentResult) => {
      if (!selectedThrowId) return;
      const supabase = await getSupabaseClient();
      const { error } = await supabase
        .from('throws')
        .update({ segment: seg.label, scored: seg.scored })
        .eq('id', selectedThrowId);
      if (error) {
        alert(error.message);
        return;
      }
      await recomputeLegTurns();
      await loadAll();
      await openEditModal(); // reload list
    },
    [selectedThrowId, recomputeLegTurns, loadAll, openEditModal]
  );

  const [rematchLoading, setRematchLoading] = useState(false);

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

  // End game early function
  async function endGameEarly() {
    if (!match) return;
    try {
      setEndGameLoading(true);
      const supabase = await getSupabaseClient();
      
      // Mark the match as ended early
      const { error } = await supabase
        .from('matches')
        .update({ ended_early: true })
        .eq('id', matchId);
      
      if (error) {
        alert(`Failed to end game early: ${error.message}`);
        return;
      }
      
      // Close the dialog and reload the match data
      setEndGameDialogOpen(false);
      await loadAll();
      
      // Redirect to home page
      router.push('/');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error ending game';
      alert(msg);
    } finally {
      setEndGameLoading(false);
    }
  }

  if (loading) return <div className="p-4">Loading…</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;
  if (!match || !currentLeg) return <div className="p-4">No leg available</div>;

  // Spectator Mode View
  if (isSpectatorMode) {
    return (
      <div className="fixed inset-0 overflow-y-auto bg-background">
        <div className="w-full space-y-3 md:space-y-6 px-4 md:px-6 xl:px-8 py-6 pb-24 md:pb-6 relative">
        {/* Round Score Modal */}
        <Dialog open={!!celebration} onOpenChange={() => {}}>
          <DialogContent className="sm:max-w-md [&>button]:hidden">
            <DialogTitle className="sr-only">
              {celebration?.level === 'bust' 
                ? `${celebration?.playerName} busted with ${celebration?.score} points`
                : `Round Score: ${celebration?.playerName} scored ${celebration?.score} points`}
            </DialogTitle>
            <div className="text-center space-y-4">
              <div
                className={`font-extrabold ${
                  celebration?.level === 'bust'
                    ? 'text-5xl md:text-6xl text-red-600 dark:text-red-400'
                    : celebration?.level === 'max'
                    ? 'text-6xl md:text-7xl bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-500 bg-clip-text text-transparent drop-shadow'
                    : celebration?.level === 'godlike'
                    ? 'text-5xl md:text-6xl bg-gradient-to-r from-fuchsia-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent'
                    : celebration?.level === 'excellent'
                    ? 'text-5xl md:text-6xl bg-gradient-to-r from-yellow-400 via-red-500 to-pink-500 bg-clip-text text-transparent'
                    : celebration?.level === 'good'
                    ? 'text-5xl md:text-6xl bg-gradient-to-r from-blue-500 to-green-500 bg-clip-text text-transparent'
                    : 'text-4xl md:text-5xl text-foreground'
                }`}
              >
                {celebration?.level === 'bust'
                  ? 'BUST'
                  : celebration?.level === 'max'
                  ? '180!'
                  : celebration?.score}
              </div>
              <div
                className={`font-bold text-xl md:text-2xl ${
                  celebration?.level === 'bust'
                    ? 'text-red-600 dark:text-red-400'
                    : celebration?.level === 'max'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : celebration?.level === 'godlike'
                    ? 'text-fuchsia-600 dark:text-fuchsia-400'
                    : celebration?.level === 'excellent'
                    ? 'text-yellow-600 dark:text-yellow-400'
                    : celebration?.level === 'good'
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-foreground'
                }`}
              >
                {celebration?.playerName}
              </div>
              {celebration?.level !== 'info' && (
                <div
                  className={`text-lg md:text-xl font-semibold ${
                    celebration?.level === 'bust'
                      ? 'text-red-600 dark:text-red-400'
                      : celebration?.level === 'max'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : celebration?.level === 'godlike'
                      ? 'text-fuchsia-600 dark:text-fuchsia-400'
                      : celebration?.level === 'excellent'
                      ? 'text-red-500 dark:text-red-400'
                      : 'text-green-600 dark:text-green-400'
                  }`}
                >
                  {celebration?.level === 'bust'
                    ? '💥 BUST! 💥'
                    : celebration?.level === 'max'
                    ? '🎯 180! 🎯'
                    : celebration?.level === 'godlike'
                    ? '🌟 GODLIKE 🌟'
                    : celebration?.level === 'excellent'
                    ? '🔥 EXCELLENT! 🔥'
                    : '⚡ GREAT ROUND! ⚡'}
                </div>
              )}
              
              {/* Individual Dart Throws */}
              {celebration?.throws && celebration.throws.length > 0 && (
                <div className="space-y-2">
                  <div className="text-sm font-medium text-muted-foreground">Darts Thrown</div>
                  <div className="flex justify-center items-center gap-3">
                    {celebration.throws.map((dart, index) => (
                      <div 
                        key={`${dart.dart_index}-${index}`}
                        className="bg-muted/50 rounded-lg px-3 py-2 font-mono text-lg font-semibold"
                      >
                        {dart.segment === 'MISS' || dart.segment === 'Miss' ? 'Miss' : dart.segment}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
        
        {/* Connection status and refresh indicator */}
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2">
          {/* Real-time connection status */}
          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-white/90 dark:bg-gray-800/90 shadow-sm text-xs">
            <div className={`w-2 h-2 rounded-full ${
              realtime.connectionStatus === 'connected' ? 'bg-green-500' :
              realtime.connectionStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' :
              realtime.connectionStatus === 'error' ? 'bg-red-500' :
              'bg-gray-500'
            }`} />
            <span className="font-medium">
              {realtime.connectionStatus === 'connected' ? 'Live' :
               realtime.connectionStatus === 'connecting' ? 'Connecting...' :
               realtime.connectionStatus === 'error' ? 'Error' :
               'Offline'}
            </span>
          </div>
          
          {/* Loading indicator for fallback polling */}
          {spectatorLoading && !realtime.isConnected && (
            <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
          )}
        </div>
        
        {/* Cards Row - responsive layout */}
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          <SpectatorLiveMatchCard
            match={match}
            orderPlayers={orderPlayers}
            spectatorCurrentPlayer={spectatorCurrentPlayer}
            turns={turns}
            currentLegId={currentLeg?.id}
            startScore={startScore}
            finishRule={finishRule}
            turnThrowCounts={turnThrowCounts}
            getAvgForPlayer={getAvgForPlayer}
          />

          {/* Legs Summary */}
          {legs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Legs Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {legs.map((leg) => {
                  const winner = players.find((p) => p.id === leg.winner_player_id);
                  return (
                    <div key={leg.id} className="flex items-center justify-between p-3 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors">
                      <span className="font-medium">Leg {leg.leg_number}</span>
                      {winner ? (
                        <span className="font-semibold text-green-600 dark:text-green-400">🏆 {winner.display_name}</span>
                      ) : (
                        <span className="text-muted-foreground">In Progress</span>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Round Statistics */}
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle>Round Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-[55vh] overflow-y-auto space-y-6 pr-1">
                {/* Top 3 Round Scores */}
                <div>
                  <h4 className="font-semibold mb-3">Top 3 Rounds</h4>
                  <div className="space-y-1">
                    {(() => {
                      const allTurns = turns
                        .filter((t) => t.leg_id === currentLeg?.id && !t.busted && t.total_scored > 0)
                        .sort((a, b) => b.total_scored - a.total_scored)
                        .slice(0, 3);

                      return allTurns.length > 0 ? allTurns.map((turn, index) => {
                        const medal = ['🥇', '🥈', '🥉'][index] || '🏆';
                        return (
                          <TurnRow
                            key={turn.id}
                            turn={turn}
                            playerName={playerById[turn.player_id]?.display_name}
                            playersCount={players.length}
                            leading={<span className="text-xl">{medal}</span>}
                            placeholder="—"
                            className="p-3 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors"
                            totalClassName="text-primary text-lg"
                            throwBadgeClassName="text-[10px]"
                          />
                        );
                      }) : (
                        <div className="text-center py-4 text-muted-foreground">
                          <div className="text-sm">No completed rounds yet</div>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Last 3 Rounds */}
                <div>
                  <h4 className="font-semibold mb-3">Recent Rounds</h4>
                  <div className="space-y-1">
                    {(() => {
                    const recentTurns = turns
                      .filter((t) => t.leg_id === currentLeg?.id && !t.busted)
                      .sort((a, b) => b.turn_number - a.turn_number);

                      return recentTurns.length > 0 ? recentTurns.map((turn) => (
                        <TurnRow
                          key={turn.id}
                          turn={turn}
                          playerName={playerById[turn.player_id]?.display_name}
                          playersCount={players.length}
                          placeholder="—"
                          className="p-3 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors"
                          throwBadgeClassName="text-[10px]"
                        />
                      )) : (
                        <div className="text-center py-4 text-muted-foreground">
                          <div className="text-sm">No recent rounds yet</div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Score Progress Chart - Second Row */}
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Score Progress</CardTitle>
            <CardDescription>
              Player scores by round - showing the remaining points for each player over time
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScoreProgressChart
              players={orderPlayers}
              turns={turns}
              startScore={parseInt(match.start_score)}
              currentLegId={currentLeg?.id}
            />
          </CardContent>
        </Card>

        {/* Match winner */}
        {matchWinnerId && (
          <Card className="border-2 border-green-500 bg-green-50 dark:bg-green-900/20">
            <CardContent className="py-6 text-center">
              <div className="text-4xl animate-bounce mb-2">🏆</div>
              <div className="text-2xl font-bold">
                {players.find((p) => p.id === matchWinnerId)?.display_name} Wins!
              </div>
            </CardContent>
          </Card>
        )}

        
        {/* Navigation Buttons */}
        <div className="flex justify-center gap-3 pt-6 pb-20 md:pb-6">
          <Button 
            variant="outline" 
            onClick={() => router.push('/')}
            className="flex items-center gap-2 flex-1 max-w-xs"
          >
            <Home size={16} />
            Home
          </Button>
          <Button
            variant="outline"
            onClick={toggleSpectatorMode}
            className="flex-1 max-w-xs"
          >
            Exit Spectator Mode
          </Button>
          <CommentarySettings
            enabled={commentaryEnabled}
            audioEnabled={audioEnabled}
            voice={voice}
            personaId={personaId}
            onEnabledChange={handleCommentaryEnabledChange}
            onAudioEnabledChange={handleAudioEnabledChange}
            onVoiceChange={setVoice}
            onPersonaChange={handlePersonaChange}
          />
        </div>

        {/* Commentary Display */}
        {commentaryEnabled && (
          <CommentaryDisplay
            commentary={currentCommentary}
            isLoading={commentaryLoading}
            isPlaying={commentaryPlaying}
            onSkip={() => ttsServiceRef.current.skipCurrent()}
            onToggleMute={() => setAudioEnabled(!audioEnabled)}
            isMuted={!audioEnabled}
            queueLength={ttsServiceRef.current.getQueueLength()}
            speakerName={activePersona.label}
            speakerAvatar={activePersona.avatar}
            thinkingLabel={activePersona.thinkingLabel}
          />
        )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-3 md:space-y-6 md:-ml-[calc(50vw-50%)] md:-mr-6 md:pl-4 md:pr-4 lg:pr-6 md:max-w-none relative">
      {/* Connection status indicator */}
      <div className="fixed bottom-4 right-4 z-50">
        <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-white/90 dark:bg-gray-800/90 shadow-sm text-xs">
          <div className={`w-2 h-2 rounded-full ${
            realtime.connectionStatus === 'connected' ? 'bg-green-500' :
            realtime.connectionStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' :
            realtime.connectionStatus === 'error' ? 'bg-red-500' :
            'bg-gray-500'
          }`} />
          <span className="font-medium">
            {realtime.connectionStatus === 'connected' ? 'Live' :
             realtime.connectionStatus === 'connecting' ? 'Connecting...' :
             realtime.connectionStatus === 'error' ? 'Error' :
             'Offline'}
          </span>
        </div>
      </div>
      {/* Scoring input at top (mobile keypad or desktop board) */}
      <div className="w-full space-y-6 md:space-y-0 md:grid md:grid-cols-[minmax(320px,25%)_1fr] md:gap-4 lg:gap-6 md:items-start">
        <div className="space-y-3 md:col-start-2 md:row-start-1">
          {/* Mobile: player indicator + keypad at top */}
          <div className="md:hidden space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="font-medium">{currentPlayer?.display_name ?? '—'}</div>
                {currentPlayer && (
                  <span className="rounded-full border border-yellow-400/60 bg-yellow-50 px-3 py-1 text-sm font-mono text-yellow-700 shadow-sm dark:border-yellow-700/60 dark:bg-yellow-900/30 dark:text-yellow-200">
                    {getScoreForPlayer(currentPlayer.id)} pts
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                {(() => {
                  // Show throws from current player (could be local or remote)
                  if (currentPlayer && localTurn.playerId === currentPlayer.id) {
                    // Local turn - show local darts
                    return (
                      <>
                        {localTurn.darts.map((d, idx) => (
                          <Badge key={idx} variant="secondary">{d.label}</Badge>
                        ))}
                        {Array.from({ length: 3 - localTurn.darts.length }).map((_, idx) => (
                          <Badge key={`m${idx}`} variant="outline">–</Badge>
                        ))}
                      </>
                    );
                  } else if (currentPlayer) {
                    // Remote turn - show remote throws
                    const playerTurns = turns.filter(turn => turn.player_id === currentPlayer.id);
                    const lastTurn = playerTurns.length > 0 ? playerTurns[playerTurns.length - 1] : null;
                    if (lastTurn && !lastTurn.busted) {
                      const throwCount = turnThrowCounts[lastTurn.id] || 0;
                      if (throwCount > 0 && throwCount < 3) {
                        const currentThrows = (lastTurn as TurnWithThrows).throws || [];
                        currentThrows.sort((a, b) => a.dart_index - b.dart_index);
                        return (
                          <>
                            {currentThrows.map((thr, idx) => (
                              <Badge key={idx} variant="default" className="bg-blue-500">{thr.scored}</Badge>
                            ))}
                            {Array.from({ length: 3 - currentThrows.length }).map((_, idx) => (
                              <Badge key={`r${idx}`} variant="outline">–</Badge>
                            ))}
                          </>
                        );
                      }
                    }
                    // No active turn - show empty darts
                    return (
                      <>
                        {Array.from({ length: 3 }).map((_, idx) => (
                          <Badge key={`e${idx}`} variant="outline">–</Badge>
                        ))}
                      </>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>
          </div>
          {/* Checkout suggestions */}
          <div className="text-xs text-muted-foreground">
            {(() => {
              const rem = currentPlayer ? getScoreForPlayer(currentPlayer.id) : 0;

              // Calculate darts left - could be from local or remote turn
              let dartsLeft = 3;
              if (currentPlayer && localTurn.playerId === currentPlayer.id) {
                dartsLeft = 3 - localTurn.darts.length;
              } else if (currentPlayer) {
                const playerTurns = turns.filter(turn => turn.player_id === currentPlayer.id);
                const lastTurn = playerTurns.length > 0 ? playerTurns[playerTurns.length - 1] : null;
                if (lastTurn && !lastTurn.busted) {
                  const throwCount = turnThrowCounts[lastTurn.id] || 0;
                  if (throwCount > 0 && throwCount < 3) {
                    dartsLeft = 3 - throwCount;
                  }
                }
              }

              const paths = computeCheckoutSuggestions(rem, dartsLeft, finishRule);
              return (
                <div className="flex flex-wrap items-center gap-2 min-h-6">
                  {paths.length > 0 && rem !== 0
                    ? paths.map((p, i) => (
                        <Badge key={i} variant="outline">{p.join(', ')}</Badge>
                      ))
                    : (
                        <Badge variant="outline" className="invisible" aria-hidden>
                          –
                        </Badge>
                      )}
                </div>
              );
            })()}
          </div>
          <div className={`${matchWinnerId ? 'pointer-events-none opacity-50' : ''} md:hidden`}>
            <MobileKeypad onHit={(seg) => handleBoardClick(0, 0, seg as unknown as ReturnType<typeof computeHit>)} />
          </div>
          {/* Desktop: board with buttons on the right */}
          <div className="hidden md:flex items-start gap-4">
            <div className={`flex-1 flex justify-center ${matchWinnerId ? 'pointer-events-none opacity-50' : ''}`}>
              <Dartboard onHit={handleBoardClick} />
            </div>
            <div className="flex flex-col gap-2 pt-4">
              <Button variant="outline" size="sm" onClick={undoLastThrow} disabled={!!matchWinnerId} className="text-xs whitespace-nowrap">
                Undo dart
              </Button>
              <Button variant="outline" size="sm" onClick={openEditModal} disabled={!currentLeg} className="text-xs whitespace-nowrap">
                Edit throws
              </Button>
              <Button variant="outline" size="sm" onClick={openEditPlayersModal} disabled={!canEditPlayers} className="text-xs whitespace-nowrap">
                Edit players
              </Button>
              <Button variant="outline" size="sm" onClick={toggleSpectatorMode} className="text-xs whitespace-nowrap">
                Spectator
              </Button>
              {!matchWinnerId && (
                <Dialog open={endGameDialogOpen} onOpenChange={setEndGameDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="destructive" size="sm" className="text-xs whitespace-nowrap">
                      End Game
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>End Game Early?</DialogTitle>
                      <DialogDescription>
                        Are you sure you want to end this game early? This action cannot be undone.
                        <br /><br />
                        <strong>Warning:</strong> This match and all its statistics will not count towards player records.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setEndGameDialogOpen(false)} disabled={endGameLoading}>
                        Cancel
                      </Button>
                      <Button variant="destructive" onClick={endGameEarly} disabled={endGameLoading}>
                        {endGameLoading ? 'Ending...' : 'End Game'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
              {matchWinnerId && (
                <Button onClick={startRematch} disabled={rematchLoading} size="sm" className="text-xs whitespace-nowrap">
                  {rematchLoading ? 'Starting…' : 'Rematch'}
                </Button>
              )}
            </div>
          </div>
          {/* Mobile: buttons below keypad */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-2 md:hidden">
            <Button variant="outline" size="sm" onClick={undoLastThrow} disabled={!!matchWinnerId} className="text-xs sm:text-sm">
              Undo dart
            </Button>
            <Button variant="outline" size="sm" onClick={openEditModal} disabled={!currentLeg} className="text-xs sm:text-sm">
              Edit throws
            </Button>
            <Button variant="outline" size="sm" onClick={openEditPlayersModal} disabled={!canEditPlayers} className="text-xs sm:text-sm">
              Edit players
            </Button>
          </div>
          {matchWinnerId && (
            <Card className="mt-4 overflow-hidden border-2 border-green-500/80 shadow-md ring-2 ring-green-400/30 bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/10 md:hidden">
              <CardContent className="py-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl animate-bounce">🏆</span>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-green-700 dark:text-green-300">Winner</div>
                      <div className="text-2xl font-extrabold">
                        {players.find((p) => p.id === matchWinnerId)?.display_name}
                      </div>
                      <div className="text-sm text-green-700/80 dark:text-green-200/80">wins the match!</div>
                    </div>
                  </div>
                  <Button onClick={startRematch} disabled={rematchLoading}>
                    {rematchLoading ? 'Starting…' : 'Rematch'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4 md:col-start-1 md:row-start-1">
          {/* Desktop: current player header - above sidebar */}
          <div className="hidden md:flex items-center gap-3 mb-2">
            <div className="text-lg font-medium">{currentPlayer?.display_name ?? '—'}</div>
            {currentPlayer && (
              <span className="rounded-full border border-yellow-400/60 bg-yellow-50 px-3 py-1 text-sm font-mono text-yellow-700 shadow-sm dark:border-yellow-700/60 dark:bg-yellow-900/30 dark:text-yellow-200">
                {getScoreForPlayer(currentPlayer.id)} pts
              </span>
            )}
          </div>
          {/* Match info and summaries */}
        <EditThrowsModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          throws={editingThrows}
          playerById={playerById}
          selectedThrowId={selectedThrowId}
          onSelectThrow={(throwId) => setSelectedThrowId(throwId)}
          onUpdateThrow={updateSelectedThrow}
        />
        
        <EditPlayersModal
          open={editPlayersOpen}
          onClose={() => setEditPlayersOpen(false)}
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
        />
        
        <MatchPlayersCard
          match={match}
          orderPlayers={orderPlayers}
          currentPlayerId={currentPlayer?.id ?? null}
          matchWinnerId={matchWinnerId}
          localTurn={localTurn}
          turns={turns}
          turnThrowCounts={turnThrowCounts}
          getScoreForPlayer={getScoreForPlayer}
          getAvgForPlayer={getAvgForPlayer}
        />
        {match && match.legs_to_win > 1 && legs.length > 0 && (
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
        {false && matchWinnerId && null}
        <TurnsHistoryCard
          turns={turns}
          playerById={playerById}
          playersCount={players.length}
          placeholder="—"
        />
      </div>
      </div>
      {/* Action Buttons - Mobile only */}
      <div className="flex flex-col sm:flex-row gap-2 pt-4 md:hidden">
        {!matchWinnerId && (
          <Dialog open={endGameDialogOpen} onOpenChange={setEndGameDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive" className="flex-1 sm:max-w-xs">
                End Game Early
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>End Game Early?</DialogTitle>
                <DialogDescription>
                  Are you sure you want to end this game early? This action cannot be undone.
                  <br /><br />
                  <strong>Warning:</strong> This match and all its statistics will not count towards player records.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEndGameDialogOpen(false)} disabled={endGameLoading}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={endGameEarly} disabled={endGameLoading}>
                  {endGameLoading ? 'Ending...' : 'End Game'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
        <Button variant="outline" onClick={toggleSpectatorMode} className="flex-1 sm:max-w-xs">
          Enter Spectator Mode
        </Button>
      </div>
    </div>
  );
}
