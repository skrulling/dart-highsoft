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

type MatchPlayerRow = {
  player_id: string;
};

type RecentMatchRow = {
  winner_player_id: string | null;
  match_players: MatchPlayerRow[] | null;
};

function buildRecentWinsByPlayer(matches: RecentMatchRow[], limitPerPlayer = 10): Map<string, number[]> {
  const recentWinsByPlayer = new Map<string, number[]>();

  for (const match of matches) {
    if (!match.winner_player_id || !match.match_players) continue;

    for (const participant of match.match_players) {
      const results = recentWinsByPlayer.get(participant.player_id) ?? [];
      if (results.length >= limitPerPlayer) continue;

      results.push(participant.player_id === match.winner_player_id ? 1 : -1);
      recentWinsByPlayer.set(participant.player_id, results);
    }
  }

  return recentWinsByPlayer;
}

export function useLeaderboardData(limit?: number) {
  const [leaders, setLeaders] = useState<PlayerSummaryEntry[]>([]);
  const [avgLeaders, setAvgLeaders] = useState<PlayerSummaryEntry[]>([]);
  const [eloLeaders, setEloLeaders] = useState<EloLeaderboardEntry[]>([]);
  const [eloMultiLeaders, setEloMultiLeaders] = useState<MultiEloLeaderboardEntry[]>([]);
  const [recentWinsByPlayer, setRecentWinsByPlayer] = useState<Map<string, number[]>>(new Map());
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
        const recentMatchesQuery = supabase
          .from('matches')
          .select('winner_player_id, match_players!inner(player_id)')
          .eq('ended_early', false)
          .not('winner_player_id', 'is', null)
          .order('created_at', { ascending: false })
          .limit(1000);

        if (limit) {
          winnersQuery = winnersQuery.limit(limit);
          avgQuery = avgQuery.limit(limit);
        }

        const [{ data: winnersData }, eloData, eloMultiData, { data: avgData }, { data: recentMatchesData }] = await Promise.all([
          winnersQuery,
          getEloLeaderboard(limit),
          getMultiEloLeaderboard(limit),
          avgQuery,
          recentMatchesQuery,
        ]);
        setLeaders((winnersData as unknown as PlayerSummaryEntry[]) ?? []);
        setAvgLeaders((avgData as unknown as PlayerSummaryEntry[]) ?? []);
        setEloLeaders(eloData);
        setEloMultiLeaders(eloMultiData);
        setRecentWinsByPlayer(buildRecentWinsByPlayer((recentMatchesData as unknown as RecentMatchRow[]) ?? []));
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

  return { leaders, avgLeaders, eloLeaders, eloMultiLeaders, recentWinsByPlayer, loading };
}
