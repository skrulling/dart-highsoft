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

export function useLeaderboardData(limit?: number) {
  const [leaders, setLeaders] = useState<PlayerSummaryEntry[]>([]);
  const [avgLeaders, setAvgLeaders] = useState<PlayerSummaryEntry[]>([]);
  const [eloLeaders, setEloLeaders] = useState<EloLeaderboardEntry[]>([]);
  const [eloMultiLeaders, setEloMultiLeaders] = useState<MultiEloLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const supabase = await getSupabaseClient();
        let winnersQuery = supabase
          .from('player_summary')
          .select('*')
          .not('display_name', 'ilike', '%test%')
          .order('wins', { ascending: false });
        let avgQuery = supabase
          .from('player_summary')
          .select('*')
          .not('display_name', 'ilike', '%test%')
          .order('avg_per_turn', { ascending: false });

        if (limit) {
          winnersQuery = winnersQuery.limit(limit);
          avgQuery = avgQuery.limit(limit);
        }

        const [{ data: winnersData }, eloData, eloMultiData, { data: avgData }] = await Promise.all([
          winnersQuery,
          getEloLeaderboard(limit),
          getMultiEloLeaderboard(limit),
          avgQuery,
        ]);
        setLeaders((winnersData as unknown as PlayerSummaryEntry[]) ?? []);
        setAvgLeaders((avgData as unknown as PlayerSummaryEntry[]) ?? []);
        setEloLeaders(eloData);
        setEloMultiLeaders(eloMultiData);
      } catch {
        setLeaders([]);
        setAvgLeaders([]);
        setEloLeaders([]);
        setEloMultiLeaders([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [limit]);

  return { leaders, avgLeaders, eloLeaders, eloMultiLeaders, loading };
}
