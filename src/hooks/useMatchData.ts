"use client";

import { useCallback, useRef, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { loadMatchData } from '@/lib/match/loadMatchData';
import { recordPerfMetric } from '@/lib/match/perfMetrics';
import type { LegRecord, MatchRecord, Player, TurnRecord, TurnWithThrows, MatchPlayersRow } from '@/lib/match/types';

type UseMatchDataResult = {
  loading: boolean;
  setLoading: (value: boolean) => void;
  error: string | null;
  setError: (value: string | null) => void;
  match: MatchRecord | null;
  setMatch: (value: MatchRecord | null) => void;
  players: Player[];
  setPlayers: (value: Player[]) => void;
  legs: LegRecord[];
  setLegs: (value: LegRecord[]) => void;
  turns: TurnRecord[];
  setTurns: (value: TurnRecord[] | ((prev: TurnRecord[]) => TurnRecord[])) => void;
  turnsByLeg: Record<string, TurnRecord[]>;
  setTurnsByLeg: (value: Record<string, TurnRecord[]>) => void;
  turnThrowCounts: Record<string, number>;
  setTurnThrowCounts: (value: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => void;
  spectatorLoading: boolean;
  setSpectatorLoading: (value: boolean) => void;
  loadAll: () => Promise<void>;
  loadAllSpectator: () => Promise<void>;
  loadMatchOnly: () => Promise<MatchRecord | null>;
  loadLegsOnly: () => Promise<LegRecord[]>;
  loadPlayersOnly: () => Promise<Player[]>;
  loadTurnsForLeg: (legId: string) => Promise<TurnRecord[]>;
};

export function useMatchData(matchId: string): UseMatchDataResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [match, setMatch] = useState<MatchRecord | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [legs, setLegs] = useState<LegRecord[]>([]);
  const [turns, setTurns] = useState<TurnRecord[]>([]);
  const [turnsByLeg, setTurnsByLeg] = useState<Record<string, TurnRecord[]>>({});
  const [turnThrowCounts, setTurnThrowCounts] = useState<Record<string, number>>({});
  const [spectatorLoading, setSpectatorLoading] = useState(false);

  const loadAllRequestIdRef = useRef(0);
  const loadAllSpectatorRequestIdRef = useRef(0);

  const loadAll = useCallback(async () => {
    const requestId = ++loadAllRequestIdRef.current;
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    setLoading(true);
    setError(null);
    try {
      const supabase = await getSupabaseClient();
      const result = await loadMatchData(supabase, matchId, { includeTurnsByLegSummary: true });

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
      if (process.env.NODE_ENV !== 'production') {
        const endedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const durationMs = Math.round(endedAt - startedAt);
        console.debug(`[perf] match loadAll took ${durationMs}ms`);
        recordPerfMetric(matchId, 'matchLoadAllMs', durationMs);
      }
      if (requestId === loadAllRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [matchId]);

  // Separate loading function for spectator mode that doesn't show loading screen
  const loadAllSpectator = useCallback(async () => {
    const requestId = ++loadAllSpectatorRequestIdRef.current;
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    setSpectatorLoading(true);
    setError(null);
    try {
      const supabase = await getSupabaseClient();
      const result = await loadMatchData(supabase, matchId, { includeTurnsByLegSummary: false });

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
      if (process.env.NODE_ENV !== 'production') {
        const endedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const durationMs = Math.round(endedAt - startedAt);
        console.debug(`[perf] spectator loadAll took ${durationMs}ms`);
        recordPerfMetric(matchId, 'spectatorLoadAllMs', durationMs);
      }
      if (requestId === loadAllSpectatorRequestIdRef.current) {
        setSpectatorLoading(false);
        setLoading(false);
      }
    }
  }, [matchId]);

  const loadMatchOnly = useCallback(async () => {
    try {
      const supabase = await getSupabaseClient();
      const { data, error: matchError } = await supabase.from('matches').select('*').eq('id', matchId).single();
      if (matchError) throw matchError;
      const nextMatch = (data ?? null) as MatchRecord | null;
      setMatch(nextMatch);
      return nextMatch;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setError(msg);
      return null;
    }
  }, [matchId]);

  const loadLegsOnly = useCallback(async () => {
    try {
      const supabase = await getSupabaseClient();
      const { data, error: legsError } = await supabase
        .from('legs')
        .select('*')
        .eq('match_id', matchId)
        .order('leg_number');
      if (legsError) throw legsError;
      const nextLegs = ((data ?? []) as LegRecord[]) ?? [];
      setLegs(nextLegs);
      return nextLegs;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setError(msg);
      return [];
    }
  }, [matchId]);

  const loadPlayersOnly = useCallback(async () => {
    try {
      const supabase = await getSupabaseClient();
      const { data, error: matchPlayersError } = await supabase
        .from('match_players')
        .select('*, players:player_id(*)')
        .eq('match_id', matchId)
        .order('play_order');
      if (matchPlayersError) throw matchPlayersError;
      const nextPlayers = (((data as MatchPlayersRow[] | null) ?? []).map((r) => r.players) ?? []) as Player[];
      setPlayers(nextPlayers);
      return nextPlayers;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setError(msg);
      return [];
    }
  }, [matchId]);

  const loadTurnsForLeg = useCallback(async (legId: string) => {
    try {
      const supabase = await getSupabaseClient();
      const { data: updatedTurns, error } = await supabase
        .from('turns')
        .select(
          `
            *,
            throws:throws(id, turn_id, dart_index, segment, scored)
          `
        )
        .eq('leg_id', legId)
        .order('turn_number');
      if (error) throw error;

      const nextTurns =
        ((updatedTurns ?? []) as TurnWithThrows[]).sort((a, b) => a.turn_number - b.turn_number) as unknown as TurnRecord[];
      const throwCounts: Record<string, number> = {};
      for (const turn of (updatedTurns ?? []) as TurnWithThrows[]) {
        throwCounts[turn.id] = (turn.throws ?? []).length;
      }

      setTurns(nextTurns);
      setTurnThrowCounts(throwCounts);
      setTurnsByLeg((prev) => ({ ...prev, [legId]: nextTurns }));
      return nextTurns;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setError(msg);
      return [];
    }
  }, []);

  return {
    loading,
    setLoading,
    error,
    setError,
    match,
    setMatch,
    players,
    setPlayers,
    legs,
    setLegs,
    turns,
    setTurns,
    turnsByLeg,
    setTurnsByLeg,
    turnThrowCounts,
    setTurnThrowCounts,
    spectatorLoading,
    setSpectatorLoading,
    loadAll,
    loadAllSpectator,
    loadMatchOnly,
    loadLegsOnly,
    loadPlayersOnly,
    loadTurnsForLeg,
  };
}
