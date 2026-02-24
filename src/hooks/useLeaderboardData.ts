"use client";

import { useEffect, useState } from 'react';
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

function collectRelevantPlayerIds(
  leaders: PlayerSummaryEntry[],
  avgLeaders: PlayerSummaryEntry[],
  eloLeaders: EloLeaderboardEntry[],
  eloMultiLeaders: MultiEloLeaderboardEntry[]
): string[] {
  const ids = new Set<string>();
  for (const row of leaders) ids.add(row.player_id);
  for (const row of avgLeaders) ids.add(row.player_id);
  for (const row of eloLeaders) ids.add(row.player_id);
  for (const row of eloMultiLeaders) ids.add(row.player_id);
  return [...ids];
}

export function useLeaderboardData(limit?: number) {
  const [leaders, setLeaders] = useState<PlayerSummaryEntry[]>([]);
  const [avgLeaders, setAvgLeaders] = useState<PlayerSummaryEntry[]>([]);
  const [eloLeaders, setEloLeaders] = useState<EloLeaderboardEntry[]>([]);
  const [eloMultiLeaders, setEloMultiLeaders] = useState<MultiEloLeaderboardEntry[]>([]);
  const [recentWinsByPlayer, setRecentWinsByPlayer] = useState<Map<string, number[]>>(new Map());
  const [playerGameStats, setPlayerGameStats] = useState<Map<string, PlayerGameStats>>(new Map());
  const [playerLocations, setPlayerLocations] = useState<Map<string, string | null>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const supabase = await getSupabaseClient();
        let winnersQuery = supabase
          .from('player_summary')
          .select('*')
          .order('wins', { ascending: false });
        let avgQuery = supabase
          .from('player_summary')
          .select('*')
          .order('avg_per_turn', { ascending: false });
        const recentFormQuery = supabase
          .from('player_recent_form')
          .select('player_id, last_10_results');
        const gameStatsQuery = supabase
          .from('match_players')
          .select('player_id, matches!inner(ended_early, winner_player_id)')
          .eq('matches.ended_early', false);
        const locationsQuery = supabase
          .from('players')
          .select('id, location');

        if (limit) {
          winnersQuery = winnersQuery.limit(limit);
          avgQuery = avgQuery.limit(limit);
        }

        const [{ data: winnersData }, eloData, eloMultiData, { data: avgData }, { data: locData }] = await Promise.all([
          winnersQuery,
          getEloLeaderboard(limit),
          getMultiEloLeaderboard(limit),
          avgQuery,
          locationsQuery,
        ]);

        const locMap = new Map<string, string | null>();
        for (const row of (locData as unknown as PlayerLocationRow[]) ?? []) {
          locMap.set(row.id, row.location);
        }
        setPlayerLocations(locMap);

        const winnerRows = (winnersData as unknown as PlayerSummaryEntry[]) ?? [];
        const avgRows = (avgData as unknown as PlayerSummaryEntry[]) ?? [];
        setLeaders(winnerRows);
        setAvgLeaders(avgRows);
        setEloLeaders(eloData);
        setEloMultiLeaders(eloMultiData);

        const relevantPlayerIds = limit
          ? collectRelevantPlayerIds(winnerRows, avgRows, eloData, eloMultiData)
          : [];
        if (limit && relevantPlayerIds.length === 0) {
          setRecentWinsByPlayer(new Map());
          setPlayerGameStats(new Map());
        } else {
          const scopedRecentFormQuery = limit
            ? recentFormQuery.in('player_id', relevantPlayerIds)
            : recentFormQuery;
          const scopedGameStatsQuery = limit
            ? gameStatsQuery.in('player_id', relevantPlayerIds)
            : gameStatsQuery;
          const [{ data: recentFormData }, { data: gameStatsData }] = await Promise.all([
            scopedRecentFormQuery,
            scopedGameStatsQuery,
          ]);
          setRecentWinsByPlayer(buildRecentWinsByPlayer((recentFormData as unknown as RecentFormRow[]) ?? []));
          setPlayerGameStats(buildGameStatsByPlayer((gameStatsData as unknown as MatchParticipationRow[]) ?? []));
        }
      } catch {
        setLeaders([]);
        setAvgLeaders([]);
        setEloLeaders([]);
        setEloMultiLeaders([]);
        setRecentWinsByPlayer(new Map());
        setPlayerGameStats(new Map());
      } finally {
        setLoading(false);
      }
    })();
  }, [limit]);

  return {
    leaders,
    avgLeaders,
    eloLeaders,
    eloMultiLeaders,
    recentWinsByPlayer,
    playerGameStats,
    playerLocations,
    loading,
  };
}
