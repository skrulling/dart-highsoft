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
  created_at: string;
  is_active: boolean;
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

type WeeklyEloChangeRow = {
  created_at: string;
  player_id: string;
  rating_before: number | null;
  rating_after: number | null;
  rating_change: number | null;
};

type MatchCreatedRow = {
  created_at: string;
};

export type WeeklyEloClimber = {
  player_id: string;
  display_name: string;
  rating_change: number;
  rating_history: number[];
};

export type MatchActivity = {
  sevenDayCounts: number[];
  sevenDayTotal: number;
  sevenDayDelta: number;
  thirtyDayCounts: number[];
  thirtyDayTotal: number;
  thirtyDayDelta: number;
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

function buildWeeklyEloClimber(
  rows: WeeklyEloChangeRow[],
  playerNames: Map<string, string>
): WeeklyEloClimber | null {
  const changes = new Map<string, { ratingChange: number; rows: WeeklyEloChangeRow[] }>();
  for (const row of rows) {
    if (typeof row.rating_change !== 'number' || !Number.isFinite(row.rating_change)) continue;
    const current = changes.get(row.player_id) ?? { ratingChange: 0, rows: [] };
    current.ratingChange += row.rating_change;
    current.rows.push(row);
    changes.set(row.player_id, current);
  }

  let best: WeeklyEloClimber | null = null;
  for (const [playerId, value] of changes) {
    const ratingChange = Math.round(value.ratingChange);
    if (ratingChange <= 0) continue;
    const displayName = playerNames.get(playerId);
    if (!displayName) continue;

    const sortedRows = value.rows
      .slice()
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const firstBefore = sortedRows[0]?.rating_before;
    const ratingHistory = [
      typeof firstBefore === 'number' && Number.isFinite(firstBefore) ? firstBefore : 0,
      ...sortedRows
        .map((row) => row.rating_after)
        .filter((rating): rating is number => typeof rating === 'number' && Number.isFinite(rating)),
    ];

    if (!best || ratingChange > best.rating_change) {
      best = {
        player_id: playerId,
        display_name: displayName,
        rating_change: ratingChange,
        rating_history: ratingHistory.length > 1 ? ratingHistory : [0, ratingChange],
      };
    }
  }

  return best;
}

function startOfLocalDay(date: Date): Date {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function buildRollingMatchCounts(rows: MatchCreatedRow[], rangeDays: number, now: Date): number[] {
  const counts = Array.from({ length: rangeDays }, () => 0);
  const today = startOfLocalDay(now);
  const rangeStart = addDays(today, -(rangeDays - 1));
  for (const row of rows) {
    const createdAt = new Date(row.created_at);
    if (Number.isNaN(createdAt.getTime())) continue;

    const diffMs = createdAt.getTime() - rangeStart.getTime();
    const dayIndex = Math.floor(diffMs / 86_400_000);
    if (dayIndex >= 0 && dayIndex < counts.length) {
      counts[dayIndex] += 1;
    }
  }
  return counts;
}

function countMatchesInWindow(rows: MatchCreatedRow[], start: Date, end: Date): number {
  let count = 0;
  for (const row of rows) {
    const createdAt = new Date(row.created_at);
    if (Number.isNaN(createdAt.getTime())) continue;
    if (createdAt >= start && createdAt < end) {
      count += 1;
    }
  }
  return count;
}

function buildMatchActivity(rows: MatchCreatedRow[], now: Date): MatchActivity {
  const today = startOfLocalDay(now);
  const sevenDayStart = addDays(today, -6);
  const previousSevenDayStart = addDays(sevenDayStart, -7);
  const thirtyDayStart = addDays(today, -29);
  const previousThirtyDayStart = addDays(thirtyDayStart, -30);

  const sevenDayCounts = buildRollingMatchCounts(rows, 7, now);
  const thirtyDayCounts = buildRollingMatchCounts(rows, 30, now);
  const sevenDayTotal = sevenDayCounts.reduce((sum, count) => sum + count, 0);
  const thirtyDayTotal = thirtyDayCounts.reduce((sum, count) => sum + count, 0);

  return {
    sevenDayCounts,
    sevenDayTotal,
    sevenDayDelta: sevenDayTotal - countMatchesInWindow(rows, previousSevenDayStart, sevenDayStart),
    thirtyDayCounts,
    thirtyDayTotal,
    thirtyDayDelta: thirtyDayTotal - countMatchesInWindow(rows, previousThirtyDayStart, thirtyDayStart),
  };
}

type LeaderboardData = {
  leaders: PlayerSummaryEntry[];
  avgLeaders: PlayerSummaryEntry[];
  eloLeaders: EloLeaderboardEntry[];
  eloMultiLeaders: MultiEloLeaderboardEntry[];
  recentWinsByPlayer: Map<string, number[]>;
  playerGameStats: Map<string, PlayerGameStats>;
  playerLocations: Map<string, string | null>;
  activePlayerCount: number;
  newPlayersThisWeek: number;
  matchesThisWeek: number;
  matchesThisWeekDelta: number;
  weeklyMatchCounts: number[];
  matchActivity: MatchActivity;
  weeklyEloClimber: WeeklyEloClimber | null;
};

async function fetchLeaderboardData(limit?: number): Promise<LeaderboardData> {
  const supabase = await getSupabaseClient();
  const now = new Date();
  const startOfThisWeek = new Date(now);
  const daysSinceMonday = (startOfThisWeek.getDay() + 6) % 7;
  startOfThisWeek.setDate(startOfThisWeek.getDate() - daysSinceMonday);
  startOfThisWeek.setHours(0, 0, 0, 0);

  const startOfPreviousWeek = new Date(startOfThisWeek);
  startOfPreviousWeek.setDate(startOfPreviousWeek.getDate() - 7);
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sixtyDaysAgo = addDays(startOfLocalDay(now), -59);

  const [
    { data: summaryData },
    eloData,
    eloMultiData,
    { data: locData },
    { data: recentFormData },
    { data: gameStatsData },
    { data: matchActivityData },
    { data: weeklyEloChangeData },
  ] = await Promise.all([
    supabase
      .from('player_summary')
      .select('*')
      .order('wins', { ascending: false }),
    getEloLeaderboard(limit),
    getMultiEloLeaderboard(limit),
    supabase
      .from('players')
      .select('id, location, created_at, is_active'),
    supabase
      .from('player_recent_form')
      .select('player_id, last_10_results'),
    supabase
      .from('match_players')
      .select('player_id, matches!inner(ended_early, winner_player_id)')
      .eq('matches.ended_early', false),
    supabase
      .from('matches')
      .select('created_at')
      .eq('ended_early', false)
      .gte('created_at', sixtyDaysAgo.toISOString()),
    supabase
      .from('elo_ratings_multi')
      .select('created_at, player_id, rating_before, rating_after, rating_change')
      .gte('created_at', sevenDaysAgo.toISOString()),
  ]);

  const locMap = new Map<string, string | null>();
  const players = (locData as unknown as PlayerLocationRow[]) ?? [];
  for (const row of players) {
    locMap.set(row.id, row.location);
  }
  const activePlayers = players.filter((row) => row.is_active);
  const newPlayersThisWeek = activePlayers.filter((row) =>
    new Date(row.created_at).getTime() >= startOfThisWeek.getTime()
  ).length;

  const allSummary = (summaryData as unknown as PlayerSummaryEntry[]) ?? [];
  const playerNames = new Map<string, string>();
  for (const row of allSummary) {
    playerNames.set(row.player_id, row.display_name);
  }
  for (const row of eloData) {
    playerNames.set(row.player_id, row.display_name);
  }
  for (const row of eloMultiData) {
    playerNames.set(row.player_id, row.display_name);
  }
  const leaders = limit ? allSummary.slice(0, limit) : allSummary;
  const avgLeaders = [...allSummary]
    .sort((a, b) => b.avg_per_turn - a.avg_per_turn);
  const avgLeadersLimited = limit ? avgLeaders.slice(0, limit) : avgLeaders;
  const matchActivity = buildMatchActivity(
    (matchActivityData as unknown as MatchCreatedRow[]) ?? [],
    now
  );

  return {
    leaders,
    avgLeaders: avgLeadersLimited,
    eloLeaders: eloData,
    eloMultiLeaders: eloMultiData,
    recentWinsByPlayer: buildRecentWinsByPlayer((recentFormData as unknown as RecentFormRow[]) ?? []),
    playerGameStats: buildGameStatsByPlayer((gameStatsData as unknown as MatchParticipationRow[]) ?? []),
    playerLocations: locMap,
    activePlayerCount: activePlayers.length,
    newPlayersThisWeek,
    matchesThisWeek: matchActivity.sevenDayTotal,
    matchesThisWeekDelta: matchActivity.sevenDayDelta,
    weeklyMatchCounts: matchActivity.sevenDayCounts,
    matchActivity,
    weeklyEloClimber: buildWeeklyEloClimber(
      (weeklyEloChangeData as unknown as WeeklyEloChangeRow[]) ?? [],
      playerNames
    ),
  };
}

const emptyRecentWinsByPlayer = new Map<string, number[]>();
const emptyPlayerGameStats = new Map<string, PlayerGameStats>();
const emptyPlayerLocations = new Map<string, string | null>();
const emptyMatchActivity: MatchActivity = {
  sevenDayCounts: [0, 0, 0, 0, 0, 0, 0],
  sevenDayTotal: 0,
  sevenDayDelta: 0,
  thirtyDayCounts: Array.from({ length: 30 }, () => 0),
  thirtyDayTotal: 0,
  thirtyDayDelta: 0,
};

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
    recentWinsByPlayer: data?.recentWinsByPlayer ?? emptyRecentWinsByPlayer,
    playerGameStats: data?.playerGameStats ?? emptyPlayerGameStats,
    playerLocations: data?.playerLocations ?? emptyPlayerLocations,
    activePlayerCount: data?.activePlayerCount ?? 0,
    newPlayersThisWeek: data?.newPlayersThisWeek ?? 0,
    matchesThisWeek: data?.matchesThisWeek ?? 0,
    matchesThisWeekDelta: data?.matchesThisWeekDelta ?? 0,
    weeklyMatchCounts: data?.weeklyMatchCounts ?? [0, 0, 0, 0, 0, 0, 0],
    matchActivity: data?.matchActivity ?? emptyMatchActivity,
    weeklyEloClimber: data?.weeklyEloClimber ?? null,
    loading: isLoading,
  };
}
