"use client";

import { useEffect, useMemo, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { computePlayerCoreStats, computeGamesPerDay } from '@/lib/stats/computations';
import type {
  PlayerRow, SummaryRow, LegRow, TurnRow, ThrowRow, MatchRow,
  PlayerSegmentRow, PlayerAccuracyRow, PlayerAdjacencyRow,
  PlayerCoreStats, OverallStats, DataLimitWarnings
} from '@/lib/stats/types';

export function useStatsData() {
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [legs, setLegs] = useState<LegRow[]>([]);
  const [turns, setTurns] = useState<TurnRow[]>([]);
  const [throws, setThrows] = useState<ThrowRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [playerSegments, setPlayerSegments] = useState<PlayerSegmentRow[]>([]);
  const [, setPlayerAccuracy] = useState<PlayerAccuracyRow[]>([]);
  const [playerAdjacency, setPlayerAdjacency] = useState<PlayerAdjacencyRow[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [playerLoading, setPlayerLoading] = useState(false);
  const [globalStats, setGlobalStats] = useState({ turns: 0, throws: 0 });
  const [activeView, setActiveView] = useState<'traditional' | 'elo'>('traditional');
  const [warningDismissed, setWarningDismissed] = useState(false);

  // Initial data load
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const supabase = await getSupabaseClient();

        const [
          { data: s },
          { data: p },
          { data: l },
          { data: m },
          { count: turnsCount },
          { count: throwsCount },
          { data: segmentData },
          { data: accuracyData },
          { data: adjacencyData }
        ] = await Promise.all([
          supabase
            .from('player_summary')
            .select('*')
            .order('wins', { ascending: false }),
          supabase
            .from('players')
            .select('id, display_name')
            .eq('is_active', true)
            .order('display_name'),
          supabase
            .from('legs')
            .select('*, matches!inner(ended_early)')
            .eq('matches.ended_early', false)
            .order('created_at')
            .limit(100000),
          supabase
            .from('matches')
            .select('id, created_at, winner_player_id, start_score')
            .eq('ended_early', false)
            .order('created_at')
            .limit(100000),
          supabase
            .from('turns')
            .select('legs!inner(matches!inner(ended_early))', { count: 'exact', head: true })
            .eq('legs.matches.ended_early', false),
          supabase
            .from('throws')
            .select('turns!inner(legs!inner(matches!inner(ended_early)))', { count: 'exact', head: true })
            .eq('turns.legs.matches.ended_early', false),
          supabase.from('player_segment_summary').select('*').limit(100000),
          supabase.from('player_accuracy_stats').select('*').limit(100000),
          supabase.from('player_adjacency_stats').select('*').limit(100000)
        ]);

        setSummary(((s as unknown) as SummaryRow[]) ?? []);
        setPlayers(((p as unknown) as PlayerRow[]) ?? []);
        setLegs(((l as unknown) as LegRow[]) ?? []);
        setMatches(((m as unknown) as MatchRow[]) ?? []);
        setGlobalStats({ turns: turnsCount ?? 0, throws: throwsCount ?? 0 });
        setPlayerSegments(((segmentData as unknown) as PlayerSegmentRow[]) ?? []);
        setPlayerAccuracy(((accuracyData as unknown) as PlayerAccuracyRow[]) ?? []);
        setPlayerAdjacency(((adjacencyData as unknown) as PlayerAdjacencyRow[]) ?? []);
      } catch (error) {
        console.error('Error loading stats:', error);
        setSummary([]);
        setPlayers([]);
        setLegs([]);
        setMatches([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Lazy load player details when selected
  useEffect(() => {
    setWarningDismissed(false);

    if (!selectedPlayer) {
      setTurns([]);
      setThrows([]);
      return;
    }

    (async () => {
      try {
        setPlayerLoading(true);
        const supabase = await getSupabaseClient();

        const { data: t } = await supabase
          .from('turns')
          .select('id, leg_id, player_id, total_scored, busted, turn_number, created_at, legs!inner(matches!inner(ended_early))')
          .eq('player_id', selectedPlayer)
          .eq('legs.matches.ended_early', false)
          .order('created_at')
          .limit(100000);

        const playerTurns = ((t as unknown) as TurnRow[]) ?? [];
        setTurns(playerTurns);

        if (playerTurns.length > 0) {
          const turnIds = playerTurns.map(turn => turn.id);
          const batchSize = 200;
          const batches: string[][] = [];
          for (let i = 0; i < turnIds.length; i += batchSize) {
            batches.push(turnIds.slice(i, i + batchSize));
          }

          const batchResults = await Promise.all(
            batches.map((batch) =>
              supabase
                .from('throws')
                .select('id, turn_id, dart_index, segment, scored')
                .in('turn_id', batch)
            )
          );

          const allThrows: ThrowRow[] = batchResults.flatMap(
            ({ data }) => ((data as unknown) as ThrowRow[]) ?? []
          );
          setThrows(allThrows);
        } else {
          setThrows([]);
        }
      } catch (error) {
        console.error('Error loading player details:', error);
        setTurns([]);
        setThrows([]);
      } finally {
        setPlayerLoading(false);
      }
    })();
  }, [selectedPlayer]);

  const overallStats: OverallStats = useMemo(() => {
    const totalMatches = matches.length;
    const totalLegs = legs.length;
    const totalTurns = globalStats.turns;
    const totalThrows = globalStats.throws;
    const completedMatches = matches.filter(m => m.winner_player_id).length;
    const avgTurnsPerLeg = legs.length > 0 ? Math.round((totalTurns / legs.length) * 10) / 10 : 0;
    const avgThrowsPerTurn = totalTurns > 0 ? Math.round((totalThrows / totalTurns) * 10) / 10 : 0;

    return { totalMatches, totalLegs, totalTurns, totalThrows, completedMatches, avgTurnsPerLeg, avgThrowsPerTurn };
  }, [matches, legs, globalStats]);

  const gamesPerDay = useMemo(() => computeGamesPerDay(matches), [matches]);

  const dataLimitWarnings: DataLimitWarnings = useMemo(() => {
    const THRESHOLD = 95000;
    const legsWarning = legs.length >= THRESHOLD;
    const matchesWarning = matches.length >= THRESHOLD;
    const turnsWarning = selectedPlayer ? turns.length >= THRESHOLD : false;

    return {
      anyWarning: legsWarning || matchesWarning || turnsWarning,
      message: [
        legsWarning && 'leg data',
        matchesWarning && 'match data',
        turnsWarning && 'player turn data'
      ].filter(Boolean).join(', ')
    };
  }, [legs.length, matches.length, turns.length, selectedPlayer]);

  const topAvgPlayers = useMemo(() => {
    return [...summary]
      .sort((a, b) => b.avg_per_turn - a.avg_per_turn)
      .slice(0, 8);
  }, [summary]);

  const playerCoreStats: PlayerCoreStats | null = useMemo(() => {
    if (!selectedPlayer) return null;
    return computePlayerCoreStats(selectedPlayer, turns, throws, legs, matches);
  }, [selectedPlayer, turns, throws, legs, matches]);

  return {
    summary,
    players,
    legs,
    matches,
    playerSegments,
    playerAdjacency,
    selectedPlayer,
    setSelectedPlayer,
    loading,
    playerLoading,
    activeView,
    setActiveView,
    warningDismissed,
    setWarningDismissed,
    overallStats,
    gamesPerDay,
    dataLimitWarnings,
    topAvgPlayers,
    playerCoreStats,
  };
}
