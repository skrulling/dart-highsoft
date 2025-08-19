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
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRealtime } from '@/hooks/useRealtime';

type Player = { id: string; display_name: string };

type MatchRecord = {
  id: string;
  mode: 'x01';
  start_score: '201' | '301' | '501';
  finish: FinishRule;
  legs_to_win: number;
  ended_early?: boolean;
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

type ThrowRecord = {
  id: string;
  turn_id: string;
  dart_index: number;
  segment: string;
  scored: number;
};

type TurnWithThrows = TurnRecord & {
  throws: ThrowRecord[];
};

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
    level: 'info' | 'good' | 'excellent' | 'bust';
  } | null>(null);
  const celebratedTurns = useRef<Set<string>>(new Set());

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
  type EditableThrow = { id: string; turn_id: string; dart_index: number; segment: string; scored: number; player_id: string; turn_number: number };
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

  // Separate loading function for spectator mode that doesn't show loading screen
  const loadAllSpectator = useCallback(async () => {
    setSpectatorLoading(true);
    try {
      const supabase = await getSupabaseClient();
      const { data: m } = await supabase.from('matches').select('*').eq('id', matchId).single();
      if (m) setMatch(m as MatchRecord);

      const { data: mp } = await supabase
        .from('match_players')
        .select('*, players:player_id(*)')
        .eq('match_id', matchId)
        .order('play_order');
      if (mp) {
        const flatPlayers = ((mp as MatchPlayersRow[] | null) ?? []).map((r) => r.players);
        setPlayers(flatPlayers);
      }

      const { data: lgs } = await supabase.from('legs').select('*').eq('match_id', matchId).order('leg_number');
      const legsTyped = (lgs ?? []) as LegRecord[];
      if (lgs) setLegs(legsTyped);

      const currentLeg = legsTyped.find((l) => !l.winner_player_id) || legsTyped[legsTyped.length - 1];
      if (currentLeg) {
        const { data: tns } = await supabase
          .from('turns')
          .select('*')
          .eq('leg_id', currentLeg.id)
          .order('turn_number');
        if (tns) setTurns(((tns ?? []) as TurnRecord[]).sort((a, b) => a.turn_number - b.turn_number));
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

      // Count throws per turn to determine current player correctly
      const { data: allCurrentLegThrows } = await supabase
          .from('throws')
          .select(`
            turn_id,
            turns!inner (
              id,
              player_id,
              turn_number,
              leg_id
            )
          `)
          .eq('turns.leg_id', currentLeg.id)
          .order('turn_number', { foreignTable: 'turns' });

        if (allCurrentLegThrows) {
          const throwCountsByTurn: Record<string, number> = {};
          for (const throwData of allCurrentLegThrows as unknown as { turn_id: string; turns: { id: string; player_id: string; turn_number: number; leg_id: string; } }[]) {
            const turnId = throwData.turns.id;
            throwCountsByTurn[turnId] = (throwCountsByTurn[turnId] || 0) + 1;
          }
          setTurnThrowCounts(throwCountsByTurn);
        }
    } catch (e) {
      console.error('Spectator mode refresh error:', e);
      // Don't set error state in spectator mode to avoid disrupting the view
    } finally {
      setSpectatorLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Set up real-time event listeners
  useEffect(() => {
    if (!realtime.isConnected || !realtimeEnabled) {
      console.log('Real-time not ready:', { 
        connected: realtime.isConnected, 
        enabled: realtimeEnabled,
        status: realtime.connectionStatus 
      });
      return;
    }


    // Handle throw changes - hot update without full reload
    const handleThrowChange = async (event: CustomEvent) => {
      // Route to appropriate handler based on mode
      if (isSpectatorMode) {
        await handleSpectatorThrowChange(event);
      } else {
        await handleMatchUIUpdate(event);
      }
    };
    
    // Spectator-specific throw change handler
    const handleSpectatorThrowChange = async (event: CustomEvent) => {
      const payload = event.detail;

      try {
        const supabase = await getSupabaseClient();
        
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          // Hot update: fetch latest legs to avoid stale closure
          const { data: currentLegs } = await supabase
            .from('legs')
            .select('*')
            .eq('match_id', matchId)
            .order('leg_number', { ascending: true });
            
          const currentLeg = currentLegs?.find(l => !l.winner_player_id);
          
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
              // Check for newly completed turns and trigger celebrations (spectator mode only)
              if (isSpectatorMode) {
                const newThrowCounts: Record<string, number> = {};
                for (const turn of updatedTurns) {
                  const throws = (turn as TurnWithThrows).throws || [];
                  newThrowCounts[turn.id] = throws.length;
                }
                
                // Compare with previous counts to find completed turns
                const prevCounts = turnThrowCounts;
                for (const turn of updatedTurns) {
                  const currentCount = newThrowCounts[turn.id] || 0;
                  const previousCount = prevCounts[turn.id] || 0;
                  
                  // Check if turn just completed (became 3 throws or busted)
                  // Only trigger for complete rounds, not individual high darts
                  if (previousCount < 3 && (currentCount === 3 || turn.busted) && turn.total_scored > 0) {
                    // Check if we've already celebrated this turn
                    if (!celebratedTurns.current.has(turn.id)) {
                      const playerName = playerById[turn.player_id]?.display_name || 'Player';
                      
                      // Show all round scores with different levels of celebration
                      celebratedTurns.current.add(turn.id);
                      
                      if (turn.busted) {
                        setCelebration({
                          score: turn.total_scored,
                          playerName,
                          level: 'bust'
                        });
                        setTimeout(() => setCelebration(null), 3000); // 3 seconds for bust
                      } else if (turn.total_scored >= 70) {
                        setCelebration({
                          score: turn.total_scored,
                          playerName,
                          level: 'excellent'
                        });
                        setTimeout(() => setCelebration(null), 5000); // 5 seconds
                      } else if (turn.total_scored >= 50) {
                        setCelebration({
                          score: turn.total_scored,
                          playerName,
                          level: 'good'
                        });
                        setTimeout(() => setCelebration(null), 4000); // 4 seconds
                      } else {
                        setCelebration({
                          score: turn.total_scored,
                          playerName,
                          level: 'info'
                        });
                        setTimeout(() => setCelebration(null), 2000); // 2 seconds for basic info
                      }
                    }
                  }
                }
              }
              
              // Force React to re-render by using functional state updates
              setTurns(prev => {
                const newTurns = updatedTurns as unknown as TurnRecord[];
                return JSON.stringify(prev) !== JSON.stringify(newTurns) ? newTurns : prev;
              });
              
              // Update throw counts for current turn visualization
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
        // Fallback to full reload only on error
        void loadAllSpectator();
      }
    };
    
    // Handle real-time updates for normal match UI (non-spectator)
    const handleMatchUIUpdate = async (event: CustomEvent) => {
      if (isSpectatorMode) return; // Only for normal match UI
      
      const payload = event.detail;
      
      try {
        const supabase = await getSupabaseClient();
        
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          // Get fresh data for current leg
          const { data: currentLegs } = await supabase
            .from('legs')
            .select('*')
            .eq('match_id', matchId)
            .order('leg_number', { ascending: true });
            
          const currentLeg = currentLegs?.find(l => !l.winner_player_id);
          
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
      // Use spectator logic for spectator mode, match UI logic for normal mode
      if (isSpectatorMode) {
        await handleThrowChange(event);
      } else {
        await handleMatchUIUpdate(event);
      }
    };

    // Handle leg changes - requires full reload for leg transitions
    const handleLegChange = () => {
      if (isSpectatorMode) {
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

    // Add event listeners
    window.addEventListener('supabase-throws-change', handleThrowChange as unknown as EventListener);
    window.addEventListener('supabase-turns-change', handleTurnChange as unknown as EventListener);
    window.addEventListener('supabase-legs-change', handleLegChange as unknown as EventListener);
    window.addEventListener('supabase-matches-change', handleMatchChange as unknown as EventListener);

    // Update presence to indicate we're viewing this match
    realtime.updatePresence(isSpectatorMode);

    // Cleanup function
    return () => {
      window.removeEventListener('supabase-throws-change', handleThrowChange as unknown as EventListener);
      window.removeEventListener('supabase-turns-change', handleTurnChange as unknown as EventListener);
      window.removeEventListener('supabase-legs-change', handleLegChange as unknown as EventListener);
      window.removeEventListener('supabase-matches-change', handleMatchChange as unknown as EventListener);
    };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realtime.isConnected, realtimeEnabled, matchId]);

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
    if (realtime.isConnected && realtimeEnabled) return;
    
    const interval = setInterval(() => {
      // Only reload if not currently loading to prevent flickering
      if (!spectatorLoading) {
        void loadAllSpectator();
      }
    }, 2000); // Refresh every 2 seconds as fallback
    
    return () => clearInterval(interval);
  }, [isSpectatorMode, loadAllSpectator, spectatorLoading, realtime.isConnected, realtimeEnabled]);

  const playerById = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p])), [players]);

  const currentLeg = useMemo(() => {
    const newCurrentLeg = (legs ?? []).find((l) => !l.winner_player_id) ?? legs[legs.length - 1];
    // Clear celebrated turns when moving to a new leg
    if (newCurrentLeg && celebratedTurns.current.size > 0) {
      celebratedTurns.current.clear();
    }
    return newCurrentLeg;
  }, [legs]);

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

  function getScoreForPlayer(playerId: string): number {
    const legTurns = turns.filter((t) => t.player_id === playerId && t.leg_id === currentLeg?.id);
    const scored = legTurns.reduce((sum, t) => (t.busted ? sum : sum + (t.total_scored || 0)), 0);
    let current = startScore - scored;
    
    // Check for local turn first (our client's active turn)
    if (localTurn.playerId === playerId) {
      const sub = localTurn.darts.reduce((s, d) => s + d.scored, 0);
      return Math.max(0, current - sub);
    }
    
    // Check for incomplete turns from other clients
    const playerTurns = turns.filter(turn => turn.player_id === playerId);
    const lastTurn = playerTurns.length > 0 ? playerTurns[playerTurns.length - 1] : null;
    if (lastTurn && !lastTurn.busted) {
      const throwCount = turnThrowCounts[lastTurn.id] || 0;
      if (throwCount > 0 && throwCount < 3) {
        // This player has an incomplete turn with throws from another client
        const currentThrows = (lastTurn as TurnWithThrows).throws || [];
        const incompleteTotal = currentThrows.reduce((sum: number, thr: ThrowRecord) => sum + thr.scored, 0);
        current -= incompleteTotal;
      }
    }
    
    return Math.max(0, current);
  }

  function getAvgForPlayer(playerId: string): number {
    const legTurns = turns.filter((t) => t.player_id === playerId && t.leg_id === currentLeg?.id);
    const valid = legTurns.filter((t) => !t.busted);
    if (valid.length === 0) return 0;
    const sum = valid.reduce((s, t) => s + (t.total_scored || 0), 0);
    return sum / valid.length;
  }

  function decorateAvg(avg: number): { cls: string; emoji: string } {
    if (avg > 60) return { cls: 'text-purple-600', emoji: '👑' };
    if (avg >= 40) return { cls: 'text-green-600', emoji: '🙂' };
    if (avg >= 32) return { cls: 'text-muted-foreground', emoji: '😐' };
    return { cls: 'text-red-600', emoji: '🙁' };
  }

  function computeCheckoutSuggestions(remainingScore: number, dartsLeft: number, finish: FinishRule): string[][] {
    const finalSuggestions: string[][] = [];
    if (dartsLeft <= 0) return finalSuggestions;
    if (remainingScore <= 0) return finalSuggestions;
    if (remainingScore > dartsLeft * 60) return finalSuggestions; // impossible in remaining darts

    type Option = { label: string; scored: number; isDouble: boolean };

    const singles: Option[] = [];
    for (let n = 1; n <= 20; n++) singles.push({ label: `S${n}`, scored: n, isDouble: false });
    singles.push({ label: 'SB', scored: 25, isDouble: false });

    const doubles: Option[] = [];
    for (let n = 1; n <= 20; n++) doubles.push({ label: `D${n}`, scored: n * 2, isDouble: true });
    doubles.push({ label: 'DB', scored: 50, isDouble: true });

    const triples: Option[] = [];
    for (let n = 1; n <= 20; n++) triples.push({ label: `T${n}`, scored: n * 3, isDouble: false });

    const orderedTriples = [20, 19, 18, 17, 16, 15, 14, 13, 12, 11];
    const orderedSingles = [20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 25];
    const preferredDoublesPoints = [32, 40, 36, 24, 20, 16, 12, 8, 4, 50]; // favor D16/D20 lines, include DB

    function doubleLabelFromPoints(points: number): string | null {
      if (points === 50) return 'DB';
      if (points % 2 !== 0) return null;
      const n = points / 2;
      if (n >= 1 && n <= 20) return `D${n}`;
      return null;
    }

    function addUnique(path: string[]) {
      const key = path.join('>');
      if (!finalSuggestions.some((p) => p.join('>') === key)) {
        finalSuggestions.push(path);
      }
    }

    // Pro-style heuristics for double out
    function twoDartPlanDoubleOut(rem: number): string[] | null {
      // Direct finish if already on an ideal double
      const direct = doubleLabelFromPoints(rem);
      if (direct && rem <= 50) return [direct];

      // Try single to leave preferred double
      for (const s of orderedSingles) {
        const toLeave = rem - s;
        if (toLeave <= 0) continue;
        if (!preferredDoublesPoints.includes(toLeave)) continue;
        const dbl = doubleLabelFromPoints(toLeave);
        if (!dbl) continue;
        return [s === 25 ? 'SB' : `S${s}`, dbl];
      }

      // Try triple to leave preferred double
      for (const t of orderedTriples) {
        const toLeave = rem - t * 3;
        if (toLeave <= 0) continue;
        if (!preferredDoublesPoints.includes(toLeave)) continue;
        const dbl = doubleLabelFromPoints(toLeave);
        if (!dbl) continue;
        return [`T${t}`, dbl];
      }
      return null;
    }

    function threeDartPlanDoubleOut(rem: number): string[] | null {
      // Try a triple first to set up a two-dart finish
      for (const t of orderedTriples) {
        const afterT = rem - t * 3;
        if (afterT <= 1) continue;
        const plan2 = twoDartPlanDoubleOut(afterT);
        if (plan2) return [`T${t}`, ...plan2];
      }
      // Try a single first as a safe setup then two-dart finish
      for (const s of orderedSingles) {
        const afterS = rem - s;
        if (afterS <= 1) continue;
        const plan2 = twoDartPlanDoubleOut(afterS);
        if (plan2) return [s === 25 ? 'SB' : `S${s}`, ...plan2];
      }
      return null;
    }

    // Build pro suggestions first
    if (finish === 'double_out') {
      if (dartsLeft >= 1) {
        const direct = doubleLabelFromPoints(remainingScore);
        if (direct) addUnique([direct]);
      }
      if (dartsLeft >= 2) {
        const plan2 = twoDartPlanDoubleOut(remainingScore);
        if (plan2) addUnique(plan2);
      }
      if (dartsLeft >= 3) {
        const plan3 = threeDartPlanDoubleOut(remainingScore);
        if (plan3) addUnique(plan3);
      }
    }

    // Fallback DFS to fill remaining options or for single-out mode
    const dfsSuggestions: string[][] = [];
    const orderedOptions: Option[] = [...triples, ...singles, ...doubles].sort((a, b) => b.scored - a.scored);

    function dfs(rem: number, dartsRemaining: number, path: string[]) {
      if (dfsSuggestions.length >= 5) return; // gather more to merge later
      if (rem < 0) return;
      if (rem === 0) {
        if (path.length > 0) dfsSuggestions.push([...path]);
        return;
      }
      if (dartsRemaining === 0) return;

      for (const opt of orderedOptions) {
        if (opt.scored > rem) continue;
        const newRem = rem - opt.scored;
        if (newRem === 0) {
          if (finish === 'double_out' && !opt.isDouble) continue;
          dfsSuggestions.push([...path, opt.label]);
          if (dfsSuggestions.length >= 5) return;
          continue;
        }
        if (dartsRemaining > 1 && finish === 'double_out' && newRem === 1) continue;
        if (dartsRemaining === 1) continue;
        dfs(newRem, dartsRemaining - 1, [...path, opt.label]);
        if (dfsSuggestions.length >= 5) return;
      }
    }

    dfs(remainingScore, dartsLeft, []);

    // Merge pro + dfs, unique, then sort by fewest darts
    for (const p of dfsSuggestions) addUnique(p);
    finalSuggestions.sort((a, b) => a.length - b.length);

    return finalSuggestions.slice(0, 3);
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
      .order('turn_number', { ascending: false, foreignTable: 'turns' })
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
      .select('id, player_id, turn_number')
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

    const legTurns = ((tData ?? []) as { id: string; player_id: string; turn_number: number }[]).sort(
      (a, b) => a.turn_number - b.turn_number
    );
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
      turnUpdates.push({ id: t.id, total_scored: total, busted });
    }

    // Persist only changed values
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
      <div className="w-full space-y-3 md:space-y-6 md:max-w-6xl md:mx-auto relative">
        {/* Round Score Modal */}
        <Dialog open={!!celebration} onOpenChange={() => {}}>
          <DialogContent className="sm:max-w-md" hideCloseButton>
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
                    : celebration?.level === 'excellent'
                    ? 'text-5xl md:text-6xl bg-gradient-to-r from-yellow-400 via-red-500 to-pink-500 bg-clip-text text-transparent'
                    : celebration?.level === 'good'
                    ? 'text-5xl md:text-6xl bg-gradient-to-r from-blue-500 to-green-500 bg-clip-text text-transparent'
                    : 'text-4xl md:text-5xl text-foreground'
                }`}
              >
                {celebration?.level === 'bust' ? 'BUST' : celebration?.score}
              </div>
              <div
                className={`font-bold text-xl md:text-2xl ${
                  celebration?.level === 'bust'
                    ? 'text-red-600 dark:text-red-400'
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
                      : celebration?.level === 'excellent'
                      ? 'text-red-500 dark:text-red-400'
                      : 'text-green-600 dark:text-green-400'
                  }`}
                >
                  {celebration?.level === 'bust' 
                    ? '💥 BUST! 💥'
                    : celebration?.level === 'excellent' 
                    ? '🔥 EXCELLENT! 🔥' 
                    : '⚡ GREAT ROUND! ⚡'}
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
        
        {/* Live Match Card */}
        <Card>
          <CardHeader>
            <CardTitle>Live Match</CardTitle>
            <CardDescription>
              {match.start_score} • {match.finish.replace('_', ' ')} • Legs to win {match.legs_to_win}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Current player indicator */}
              {spectatorCurrentPlayer && (
                <div className="text-center">
                  <div className="text-lg font-semibold text-muted-foreground">Current Turn</div>
                  <div className="text-3xl font-bold text-primary">{spectatorCurrentPlayer.display_name}</div>
                </div>
              )}
              
              {/* Checkout suggestions - with space reservation */}
              <div className="min-h-8 flex justify-center">
                {(() => {
                  if (!spectatorCurrentPlayer) return <div className="invisible">-</div>;
                  
                  // Calculate current score including incomplete throws
                  const getSpectatorScore = (playerId: string): number => {
                    const legTurns = turns.filter((t) => t.player_id === playerId && t.leg_id === currentLeg?.id);
                    const scored = legTurns.reduce((sum, t) => (t.busted ? sum : sum + (t.total_scored || 0)), 0);
                    let current = startScore - scored;
                    
                    // Add incomplete throws from current turn
                    const playerTurns = turns.filter(turn => turn.player_id === playerId);
                    const lastTurn = playerTurns.length > 0 ? playerTurns[playerTurns.length - 1] : null;
                    if (lastTurn && !lastTurn.busted) {
                      const throwCount = turnThrowCounts[lastTurn.id] || 0;
                      if (throwCount > 0 && throwCount < 3) {
                        const currentThrows = (lastTurn as TurnWithThrows).throws || [];
                        const incompleteTotal = currentThrows.reduce((sum: number, thr: ThrowRecord) => sum + thr.scored, 0);
                        current -= incompleteTotal;
                      }
                    }
                    
                    return Math.max(0, current);
                  };
                  
                  const currentScore = getSpectatorScore(spectatorCurrentPlayer.id);
                  const playerTurns = turns.filter(turn => turn.player_id === spectatorCurrentPlayer.id);
                  const lastTurn = playerTurns.length > 0 ? playerTurns[playerTurns.length - 1] : null;
                  const throwCount = lastTurn ? turnThrowCounts[lastTurn.id] || 0 : 0;
                  
                  // Determine if this is a new turn starting or continuing an incomplete turn
                  // New turn if: no turns yet, last turn was busted, or last turn completed (3 throws)
                  const isNewTurnStarting = !lastTurn || lastTurn.busted || throwCount === 3;
                  const dartsLeft = isNewTurnStarting ? 3 : Math.max(0, 3 - throwCount);
                  
                  const paths = computeCheckoutSuggestions(currentScore, dartsLeft, finishRule);
                  
                  // Only show checkout suggestions if we're actually in a checkout scenario
                  const shouldShowCheckout = currentScore > 0 && currentScore <= 170 && dartsLeft > 0;
                  
                  return (
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      {shouldShowCheckout && paths.length > 0
                        ? paths.map((p, i) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              {p.join(', ')}
                            </Badge>
                          ))
                        : shouldShowCheckout ? (
                            <Badge variant="outline" className="text-xs text-muted-foreground">
                              No checkout available
                            </Badge>
                          ) : (
                            <div className="invisible">-</div>
                          )}
                    </div>
                  );
                })()}
              </div>
              
              {/* Player scores with inline throw indicators */}
              <div className="grid gap-3">
                {orderPlayers.map((player) => {
                  // Use live score calculation for spectator mode
                  const getSpectatorScore = (playerId: string): number => {
                    const legTurns = turns.filter((t) => t.player_id === playerId && t.leg_id === currentLeg?.id);
                    const scored = legTurns.reduce((sum, t) => (t.busted ? sum : sum + (t.total_scored || 0)), 0);
                    let current = startScore - scored;
                    
                    // Add incomplete throws from current turn
                    const playerTurns = turns.filter(turn => turn.player_id === playerId);
                    const lastTurn = playerTurns.length > 0 ? playerTurns[playerTurns.length - 1] : null;
                    if (lastTurn && !lastTurn.busted) {
                      const throwCount = turnThrowCounts[lastTurn.id] || 0;
                      if (throwCount > 0 && throwCount < 3) {
                        const currentThrows = (lastTurn as TurnWithThrows).throws || [];
                        const incompleteTotal = currentThrows.reduce((sum: number, thr: ThrowRecord) => sum + thr.scored, 0);
                        current -= incompleteTotal;
                      }
                    }
                    
                    return Math.max(0, current);
                  };
                  
                  const score = getSpectatorScore(player.id);
                  const avg = getAvgForPlayer(player.id);
                  const deco = decorateAvg(avg);
                  const isCurrent = spectatorCurrentPlayer?.id === player.id;
                  
                  // Get throws to display for this player
                  let displayThrows: ThrowRecord[] = [];
                  const playerTurns = turns.filter(turn => turn.player_id === player.id);
                  const lastTurn = playerTurns.length > 0 ? playerTurns[playerTurns.length - 1] : null;
                  
                  if (lastTurn) {
                    const throwCount = turnThrowCounts[lastTurn.id] || 0;
                    const isPlayerNewTurnStarting = lastTurn.busted || throwCount === 3;
                    
                    if (isCurrent && isPlayerNewTurnStarting) {
                      // Current player starting new turn - don't show any throws yet
                      displayThrows = [];
                    } else if (isCurrent && throwCount > 0 && throwCount < 3) {
                      // Current player with incomplete turn - show current throws
                      displayThrows = (lastTurn as TurnWithThrows).throws || [];
                    } else if (!isCurrent && (throwCount === 3 || lastTurn.busted)) {
                      // Show last completed turn for non-current players
                      displayThrows = (lastTurn as TurnWithThrows).throws || [];
                    }
                    
                    displayThrows.sort((a, b) => a.dart_index - b.dart_index);
                  }
                  
                  return (
                    <div
                      key={player.id}
                      className={`p-4 rounded-lg transition-all duration-500 ease-in-out ${
                        isCurrent 
                          ? 'border-2 border-primary bg-primary/5 shadow-lg scale-[1.02]' 
                          : 'border bg-card hover:bg-accent/30'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {isCurrent && <Badge variant="default">Playing</Badge>}
                          <div className="font-semibold text-lg">{player.display_name}</div>
                          
                          {/* Inline throw indicators */}
                          {displayThrows.length > 0 && (
                            <div className="flex items-center gap-1 ml-2">
                              {Array.from({ length: 3 }, (_, index) => {
                                const throwData = displayThrows[index];
                                const hasThrow = index < displayThrows.length;
                                const isIncomplete = isCurrent && hasThrow && displayThrows.length < 3;
                                return (
                                  <div
                                    key={index}
                                    className={`min-w-[20px] h-5 px-1 rounded border flex items-center justify-center text-xs font-medium transition-all duration-300 ${
                                      hasThrow 
                                        ? isIncomplete
                                          ? 'border-primary bg-primary/10 text-primary' 
                                          : 'border-muted-foreground bg-muted-foreground/10 text-muted-foreground'
                                        : 'border-dashed border-muted-foreground/40 text-muted-foreground/40'
                                    }`}
                                  >
                                    {hasThrow ? throwData.segment : '—'}
                                  </div>
                                );
                              })}
                              <span className="text-xs text-muted-foreground ml-1">
                                {displayThrows.length}/3
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-3xl font-mono font-bold">{score}</div>
                          <div className="flex flex-col items-end gap-1">
                            <div className={`text-sm font-medium ${deco.cls}`}>
                              {deco.emoji} {avg.toFixed(1)} avg
                            </div>
                            {(() => {
                              // Get player's turn data for this leg
                              const legTurns = turns.filter((t) => t.player_id === player.id && t.leg_id === currentLeg?.id && !t.busted);
                              
                              // Last round score (most recent completed turn)
                              const lastRoundScore = legTurns.length > 0 ? legTurns[legTurns.length - 1].total_scored : 0;
                              
                              // Best round score (highest score in this leg)
                              const bestRoundScore = legTurns.length > 0 ? Math.max(...legTurns.map(t => t.total_scored)) : 0;
                              
                              return (
                                <div className="space-y-0.5">
                                  <div className="text-xs text-muted-foreground">
                                    Last: {lastRoundScore}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    Best: {bestRoundScore}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Statistics Cards Row - responsive layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
          <Card>
            <CardHeader>
              <CardTitle>Round Statistics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Top 3 Round Scores */}
              <div>
                <h4 className="font-semibold mb-3">Top 3 Rounds</h4>
                <div className="space-y-1">
                  {(() => {
                    // Get all completed turns from current leg, sorted by score
                    const allTurns = turns
                      .filter((t) => t.leg_id === currentLeg?.id && !t.busted && t.total_scored > 0)
                      .sort((a, b) => b.total_scored - a.total_scored)
                      .slice(0, 3);

                    return allTurns.length > 0 ? allTurns.map((turn, index) => {
                      const player = players.find((p) => p.id === turn.player_id);
                      const medal = ['🥇', '🥈', '🥉'][index] || '🏆';
                      
                      return (
                        <div key={turn.id} className="flex items-center justify-between p-3 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors">
                          <div className="flex items-center gap-3">
                            <span className="text-xl">{medal}</span>
                            <span className="font-medium">{player?.display_name || 'Unknown'}</span>
                          </div>
                          <span className="text-lg font-bold text-primary">{turn.total_scored}</span>
                        </div>
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
                    // Get last 3 completed turns from current leg, sorted by turn number
                    const recentTurns = turns
                      .filter((t) => t.leg_id === currentLeg?.id && !t.busted)
                      .sort((a, b) => b.turn_number - a.turn_number)
                      .slice(0, 3)
                      .reverse(); // Show oldest to newest

                    return recentTurns.length > 0 ? recentTurns.map((turn) => {
                      const player = players.find((p) => p.id === turn.player_id);
                      
                      return (
                        <div key={turn.id} className="flex items-center justify-between p-3 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors">
                          <span className="font-medium">{player?.display_name || 'Unknown'}</span>
                          <span className="font-mono font-semibold">{turn.total_scored}</span>
                        </div>
                      );
                    }) : (
                      <div className="text-center py-4 text-muted-foreground">
                        <div className="text-sm">No recent rounds yet</div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

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

        
        {/* Exit Spectator Mode Button */}
        <div className="flex justify-center pt-4">
          <Button variant="outline" onClick={toggleSpectatorMode} className="w-full max-w-xs">
            Exit Spectator Mode
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-3 md:space-y-6 md:max-w-6xl md:mx-auto relative">
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
      <div className="w-full">
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
          <div className={`${matchWinnerId ? 'pointer-events-none opacity-50' : ''}`}>
            <MobileKeypad onHit={(seg) => handleBoardClick(0, 0, seg as unknown as ReturnType<typeof computeHit>)} />
          </div>
        </div>
        {/* Desktop: current player header */}
        <div className="hidden md:flex items-center justify-center mt-2">
          <div className="flex items-center gap-3">
            <div className="text-lg font-medium">{currentPlayer?.display_name ?? '—'}</div>
            {currentPlayer && (
              <span className="rounded-full border border-yellow-400/60 bg-yellow-50 px-3 py-1 text-sm font-mono text-yellow-700 shadow-sm dark:border-yellow-700/60 dark:bg-yellow-900/30 dark:text-yellow-200">
                {getScoreForPlayer(currentPlayer.id)} pts
              </span>
            )}
          </div>
        </div>
        {/* Desktop: board */}
        <div className={`hidden md:flex justify-center ${matchWinnerId ? 'pointer-events-none opacity-50' : ''}`}>
          <Dartboard onHit={handleBoardClick} />
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-2">
          <Button variant="outline" size="sm" onClick={undoLastThrow} disabled={!!matchWinnerId} className="text-xs sm:text-sm">
            Undo dart
          </Button>
          <Button variant="outline" size="sm" onClick={openEditModal} disabled={!currentLeg} className="text-xs sm:text-sm">
            Edit throws
          </Button>
          <Button variant="outline" size="sm" onClick={openEditPlayersModal} disabled={!canEditPlayers} className="text-xs sm:text-sm">
            Edit players
          </Button>
          <div className="text-sm text-gray-600 hidden md:block">Click the board to register throws</div>
        </div>
        {matchWinnerId && (
          <Card className="mt-4 overflow-hidden border-2 border-green-500/80 shadow-md ring-2 ring-green-400/30 bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/10">
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

      {/* Match info and summaries */}
      <div className="space-y-4">
        {/* Edit throws modal */}
        {editOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={() => setEditOpen(false)} />
            <div className="relative w-[min(700px,95vw)] max-h-[90vh] overflow-auto rounded-lg border bg-background p-4 shadow-xl">
              <div className="flex items-center justify-between mb-3">
                <div className="text-lg font-semibold">Edit throws</div>
                <Button variant="ghost" onClick={() => setEditOpen(false)}>Close</Button>
              </div>
              <div className="space-y-3">
                <div className="text-sm text-muted-foreground">Tap a throw, then use the keypad to set a new value.</div>
                <div className="max-h-64 overflow-auto rounded border divide-y">
                  {(() => {
                    const byTurn = new Map<number, EditableThrow[]>();
                    for (const r of editingThrows) {
                      if (!byTurn.has(r.turn_number)) byTurn.set(r.turn_number, [] as EditableThrow[]);
                      byTurn.get(r.turn_number)!.push(r);
                    }
                    const ordered = Array.from(byTurn.entries()).sort((a, b) => a[0] - b[0]);
                    return ordered.length > 0 ? (
                      <div>
                        {ordered.map(([tn, list]) => (
                          <div key={tn} className="p-2">
                            <div className="mb-2 flex items-center justify-between text-sm">
                              <div className="font-medium">Turn {tn}</div>
                              <div className="text-muted-foreground">
                                {playerById[list[0].player_id]?.display_name ?? 'Player'}
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              {list
                                .sort((a, b) => a.dart_index - b.dart_index)
                                .map((thr) => {
                                  const isSel = selectedThrowId === thr.id;
                                  return (
                                    <button
                                      key={thr.id}
                                      className={`rounded border px-3 py-2 text-left ${
                                        isSel ? 'bg-primary/10 border-primary' : 'hover:bg-accent'
                                      }`}
                                      onClick={() => setSelectedThrowId(thr.id)}
                                    >
                                      <div className="text-xs text-muted-foreground">Dart {thr.dart_index}</div>
                                      <div className="font-mono">{thr.segment}</div>
                                    </button>
                                  );
                                })}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 text-center text-sm text-muted-foreground">No throws yet.</div>
                    );
                  })()}
                </div>
                <div className="mt-3">
                  {selectedThrowId ? (
                    <div className="space-y-2">
                      <div className="text-sm text-muted-foreground">Select a new segment:</div>
                      <MobileKeypad onHit={(seg) => { void updateSelectedThrow(seg); }} />
                    </div>
                  ) : (
                    <div className="rounded border p-4 text-center text-sm text-muted-foreground">Select a throw above to edit</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Edit players modal */}
        {editPlayersOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setEditPlayersOpen(false)} />
            <div className="relative w-full max-w-[600px] max-h-[90vh] overflow-auto rounded-lg border bg-background p-4 shadow-xl">
              <div className="flex items-center justify-between mb-3">
                <div className="text-lg font-semibold">Edit Players</div>
                <Button variant="ghost" onClick={() => setEditPlayersOpen(false)}>Close</Button>
              </div>
              
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  {canEditPlayers 
                    ? 'You can add or remove players before the first round is completed.' 
                    : 'Players cannot be edited after the first round is completed.'}
                </div>
                
                {/* Current players */}
                <div>
                  <div className="font-medium mb-2">Current Players ({players.length})</div>
                  <div className="space-y-2 max-h-48 overflow-auto border rounded p-2">
                    {players.map((player, index) => (
                      <div key={player.id} className="flex items-center gap-2 py-2 px-3 bg-accent/30 rounded">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-sm text-muted-foreground">#{index + 1}</span>
                          <span className="truncate">{player.display_name}</span>
                        </div>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => removePlayerFromMatch(player.id)}
                          disabled={players.length <= 2}
                          className="shrink-0 min-w-[70px]"
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Add new player */}
                <div>
                  <div className="font-medium mb-2">Add New Player</div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Player name"
                      value={newPlayerName}
                      onChange={(e) => setNewPlayerName(e.target.value)}
                    />
                    <Button onClick={addNewPlayer} disabled={!newPlayerName.trim()}>
                      Add New
                    </Button>
                  </div>
                </div>
                
                {/* Add existing players */}
                <div>
                  <div className="font-medium mb-2">Add Existing Player</div>
                  <div className="space-y-2 max-h-48 overflow-auto border rounded p-2">
                    {availablePlayers
                      .filter(player => !players.some(p => p.id === player.id))
                      .map(player => (
                        <div key={player.id} className="flex items-center gap-2 py-2 px-3 hover:bg-accent/30 rounded">
                          <span className="flex-1 min-w-0 truncate">{player.display_name}</span>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => addPlayerToMatch(player.id)}
                            className="shrink-0 min-w-[50px]"
                          >
                            Add
                          </Button>
                        </div>
                      ))}
                    {availablePlayers.filter(player => !players.some(p => p.id === player.id)).length === 0 && (
                      <div className="text-center text-sm text-muted-foreground py-4">
                        No additional players available
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        
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
                const avg = getAvgForPlayer(p.id);
                const deco = decorateAvg(avg);
                const isCurrent = currentPlayer?.id === p.id;
                const isLocalActiveTurn = localTurn.playerId === p.id && localTurn.darts.length > 0;
                
                // Check for throws from any client (including other clients)
                let currentThrows: ThrowRecord[] = [];
                let isRemoteActiveTurn = false;
                const playerTurns = turns.filter(turn => turn.player_id === p.id);
                const lastTurn = playerTurns.length > 0 ? playerTurns[playerTurns.length - 1] : null;
                if (lastTurn && !lastTurn.busted && localTurn.playerId !== p.id) {
                  const throwCount = turnThrowCounts[lastTurn.id] || 0;
                  if (throwCount > 0 && throwCount < 3) {
                    isRemoteActiveTurn = true;
                    currentThrows = (lastTurn as TurnWithThrows).throws || [];
                    currentThrows.sort((a, b) => a.dart_index - b.dart_index);
                  }
                }
                
                const isActiveTurn = isLocalActiveTurn || isRemoteActiveTurn;
                return (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between rounded px-3 py-2 transition-colors ${
                      isCurrent ? 'border-2 border-yellow-500 bg-yellow-500/10' : 'border'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {isCurrent && !matchWinnerId && <Badge>Up</Badge>}
                      <div className="font-medium">{p.display_name}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      {isActiveTurn && (
                        <div className="flex gap-1">
                          {isLocalActiveTurn ? (
                            // Show local client's throws
                            <>
                              {localTurn.darts.map((d, idx) => (
                                <Badge key={idx} variant="secondary">{d.label}</Badge>
                              ))}
                              {Array.from({ length: 3 - localTurn.darts.length }).map((_, idx) => (
                                <Badge key={`p${idx}`} variant="outline">–</Badge>
                              ))}
                            </>
                          ) : (
                            // Show remote client's throws
                            <>
                              {currentThrows.map((thr, idx) => (
                                <Badge key={idx} variant="default" className="bg-blue-500">{thr.segment}</Badge>
                              ))}
                              {Array.from({ length: 3 - currentThrows.length }).map((_, idx) => (
                                <Badge key={`r${idx}`} variant="outline">–</Badge>
                              ))}
                            </>
                          )}
                        </div>
                      )}
                      <div className="flex flex-col items-end">
                        <div className="text-2xl font-mono min-w-[3ch] text-right">{score}</div>
                        <div className={`text-xs ${deco.cls}`}>{deco.emoji} {avg.toFixed(2)} avg</div>
                      </div>
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
        {false && matchWinnerId && null}
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
        
        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-2 pt-4">
          {/* End Game Early Button - Show when match is ongoing */}
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

          {/* Spectator Mode Button */}
          <Button variant="outline" onClick={toggleSpectatorMode} className="flex-1 sm:max-w-xs">
            Enter Spectator Mode
          </Button>
        </div>
      </div>
    </div>
  );
}
