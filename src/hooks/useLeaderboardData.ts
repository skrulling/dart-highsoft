"use client";

import { useQuery } from '@tanstack/react-query';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { getEloLeaderboard, type EloLeaderboardEntry } from '@/utils/eloRating';
import { getMultiEloLeaderboard, type MultiEloLeaderboardEntry } from '@/utils/eloRatingMultiplayer';

export type PlayerSummaryEntry = {
  player_id: string;
  display_name: string;
  wins: number;
  avg_per_turn: number;
};

export type PlayerGameStats = {
  games_played: number;
  game_win_rate: number;
};

type PlayerLocationRow = {
  id: string;
  location: string | null;
};

type RecentFormRow = {
  player_id: string;
  last_10_results: number[] | null;
};

type MatchParticipationRow = {
  player_id: string;
  matches:
    | {
        ended_early: boolean | null;
        winner_player_id: string | null;
      }
    | Array<{
        ended_early: boolean | null;
        winner_player_id: string | null;
      }>
    | null;
};

function buildRecentWinsByPlayer(rows: RecentFormRow[]): Map<string, number[]> {
  const recentWinsByPlayer = new Map<string, number[]>();
  for (const row of rows) {
    recentWinsByPlayer.set(row.player_id, row.last_10_results ?? []);
  }
  return recentWinsByPlayer;
}

function buildGameStatsByPlayer(rows: MatchParticipationRow[]): Map<string, PlayerGameStats> {
  const counts = new Map<string, { games_played: number; wins: number }>();

  for (const row of rows) {
    const match = Array.isArray(row.matches) ? row.matches[0] : row.matches;
    if (!match || match.ended_early) continue;

    const current = counts.get(row.player_id) ?? { games_played: 0, wins: 0 };
    current.games_played += 1;
    if (match.winner_player_id === row.player_id) {
      current.wins += 1;
    }
    counts.set(row.player_id, current);
  }

  const stats = new Map<string, PlayerGameStats>();
  for (const [playerId, value] of counts) {
    const game_win_rate = value.games_played > 0
      ? Number(((value.wins / value.games_played) * 100).toFixed(1))
      : 0;
    stats.set(playerId, {
      games_played: value.games_played,
      game_win_rate,
    });
  }

  return stats;
}

type LeaderboardData = {
  leaders: PlayerSummaryEntry[];
  avgLeaders: PlayerSummaryEntry[];
  eloLeaders: EloLeaderboardEntry[];
  eloMultiLeaders: MultiEloLeaderboardEntry[];
  recentWinsByPlayer: Map<string, number[]>;
  playerGameStats: Map<string, PlayerGameStats>;
  playerLocations: Map<string, string | null>;
};

async function fetchLeaderboardData(limit?: number): Promise<LeaderboardData> {
  const supabase = await getSupabaseClient();

  const [
    { data: summaryData },
    eloData,
    eloMultiData,
    { data: locData },
    { data: recentFormData },
    { data: gameStatsData },
  ] = await Promise.all([
    supabase
      .from('player_summary')
      .select('*')
      .order('wins', { ascending: false }),
    getEloLeaderboard(limit),
    getMultiEloLeaderboard(limit),
    supabase
      .from('players')
      .select('id, location'),
    supabase
      .from('player_recent_form')
      .select('player_id, last_10_results'),
    supabase
      .from('match_players')
      .select('player_id, matches!inner(ended_early, winner_player_id)')
      .eq('matches.ended_early', false),
  ]);

  const locMap = new Map<string, string | null>();
  for (const row of (locData as unknown as PlayerLocationRow[]) ?? []) {
    locMap.set(row.id, row.location);
  }

  const allSummary = (summaryData as unknown as PlayerSummaryEntry[]) ?? [];
  const leaders = limit ? allSummary.slice(0, limit) : allSummary;
  const avgLeaders = [...allSummary]
    .sort((a, b) => b.avg_per_turn - a.avg_per_turn);
  const avgLeadersLimited = limit ? avgLeaders.slice(0, limit) : avgLeaders;

  return {
    leaders,
    avgLeaders: avgLeadersLimited,
    eloLeaders: eloData,
    eloMultiLeaders: eloMultiData,
    recentWinsByPlayer: buildRecentWinsByPlayer((recentFormData as unknown as RecentFormRow[]) ?? []),
    playerGameStats: buildGameStatsByPlayer((gameStatsData as unknown as MatchParticipationRow[]) ?? []),
    playerLocations: locMap,
  };
}

const emptyMap = new Map();

export function useLeaderboardData(limit?: number) {
  const { data, isLoading } = useQuery({
    queryKey: ['leaderboard', limit],
    queryFn: () => fetchLeaderboardData(limit),
  });

  return {
    leaders: data?.leaders ?? [],
    avgLeaders: data?.avgLeaders ?? [],
    eloLeaders: data?.eloLeaders ?? [],
    eloMultiLeaders: data?.eloMultiLeaders ?? [],
    recentWinsByPlayer: data?.recentWinsByPlayer ?? emptyMap,
    playerGameStats: data?.playerGameStats ?? emptyMap,
    playerLocations: data?.playerLocations ?? emptyMap,
    loading: isLoading,
  };
}
