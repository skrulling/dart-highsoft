"use client";

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { computePlayerCoreStats, computeGamesPerDay } from '@/lib/stats/computations';
import type {
  PlayerRow, SummaryRow, LegRow, TurnRow, ThrowRow, MatchRow,
  PlayerSegmentRow, PlayerAccuracyRow, PlayerAdjacencyRow,
  PlayerCoreStats, OverallStats, DataLimitWarnings
} from '@/lib/stats/types';

// --- Fetch functions ---

type StatsGlobalData = {
  summary: SummaryRow[];
  players: PlayerRow[];
  legs: LegRow[];
  matches: MatchRow[];
  globalStats: { turns: number; throws: number };
  playerSegments: PlayerSegmentRow[];
  playerAdjacency: PlayerAdjacencyRow[];
};

async function fetchStatsGlobalData(): Promise<StatsGlobalData> {
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
      .select('id, created_at, winner_player_id, start_score, finish')
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

  return {
    summary: ((s as unknown) as SummaryRow[]) ?? [],
    players: ((p as unknown) as PlayerRow[]) ?? [],
    legs: ((l as unknown) as LegRow[]) ?? [],
    matches: ((m as unknown) as MatchRow[]) ?? [],
    globalStats: { turns: turnsCount ?? 0, throws: throwsCount ?? 0 },
    playerSegments: ((segmentData as unknown) as PlayerSegmentRow[]) ?? [],
    playerAdjacency: ((adjacencyData as unknown) as PlayerAdjacencyRow[]) ?? [],
  };
  // playerAccuracy fetched but unused — kept in query to avoid schema drift, discarded here
  void accuracyData;
}

export type PlayerDetailData = {
  turns: TurnRow[];
  throws: ThrowRow[];
};

export async function fetchPlayerDetailData(playerId: string): Promise<PlayerDetailData> {
  const supabase = await getSupabaseClient();

  const { data: t } = await supabase
    .from('turns')
    .select('id, leg_id, player_id, total_scored, busted, turn_number, created_at, legs!inner(matches!inner(ended_early))')
    .eq('player_id', playerId)
    .eq('legs.matches.ended_early', false)
    .order('created_at')
    .limit(100000);

  const playerTurns = ((t as unknown) as TurnRow[]) ?? [];

  if (playerTurns.length === 0) {
    return { turns: [], throws: [] };
  }

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

  return { turns: playerTurns, throws: allThrows };
}

// --- Hook ---

export function useStatsData() {
  const [selectedPlayer, setSelectedPlayer] = useState<string>('');
  const [activeView, setActiveView] = useState<'traditional' | 'elo' | 'compare'>('traditional');
  const [warningDismissed, setWarningDismissed] = useState(false);

  // Global stats data — cached across navigations
  const globalQuery = useQuery({
    queryKey: ['stats', 'global'],
    queryFn: fetchStatsGlobalData,
  });

  // Player detail data — cached per player
  const playerQuery = useQuery({
    queryKey: ['stats', 'player', selectedPlayer],
    queryFn: () => fetchPlayerDetailData(selectedPlayer),
    enabled: !!selectedPlayer,
    staleTime: 5 * 60_000,
  });

  const summary = globalQuery.data?.summary ?? [];
  const players = globalQuery.data?.players ?? [];
  const legs = globalQuery.data?.legs ?? [];
  const matches = globalQuery.data?.matches ?? [];
  const globalStats = globalQuery.data?.globalStats ?? { turns: 0, throws: 0 };
  const playerSegments = globalQuery.data?.playerSegments ?? [];
  const playerAdjacency = globalQuery.data?.playerAdjacency ?? [];

  const turns = playerQuery.data?.turns ?? [];
  const throws = playerQuery.data?.throws ?? [];

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

  // Reset warning when player changes
  const handleSelectPlayer = (playerId: string) => {
    setWarningDismissed(false);
    setSelectedPlayer(playerId);
  };

  return {
    summary,
    players,
    legs,
    matches,
    playerSegments,
    playerAdjacency,
    selectedPlayer,
    setSelectedPlayer: handleSelectPlayer,
    loading: globalQuery.isLoading,
    playerLoading: playerQuery.isFetching && !!selectedPlayer,
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
