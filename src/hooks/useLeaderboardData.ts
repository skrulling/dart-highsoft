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

type PlayerLocationRow = {
  id: string;
  location: string | null;
};

type RecentFormRow = {
  player_id: string;
  last_10_results: number[] | null;
};

function buildRecentWinsByPlayer(rows: RecentFormRow[]): Map<string, number[]> {
  const recentWinsByPlayer = new Map<string, number[]>();

  for (const row of rows) {
    recentWinsByPlayer.set(row.player_id, row.last_10_results ?? []);
  }

  return recentWinsByPlayer;
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
        } else {
          const scopedRecentFormQuery = limit
            ? recentFormQuery.in('player_id', relevantPlayerIds)
            : recentFormQuery;
          const { data: recentFormData } = await scopedRecentFormQuery;
          setRecentWinsByPlayer(buildRecentWinsByPlayer((recentFormData as unknown as RecentFormRow[]) ?? []));
        }
      } catch {
        setLeaders([]);
        setAvgLeaders([]);
        setEloLeaders([]);
        setEloMultiLeaders([]);
        setRecentWinsByPlayer(new Map());
      } finally {
        setLoading(false);
      }
    })();
  }, [limit]);

  return { leaders, avgLeaders, eloLeaders, eloMultiLeaders, recentWinsByPlayer, playerLocations, loading };
}
