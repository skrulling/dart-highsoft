"use client";

import { useEffect, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { useLeaderboardData } from '@/hooks/useLeaderboardData';
import { LeaderboardSection, EloLeaderboardItem, PlayerSummaryItem } from '@/components/leaderboard';
import { medal, formatLeaderboardDate } from '@/utils/leaderboard';

type TopRoundScore = {
  id: string;
  player_id: string;
  display_name: string;
  total_scored: number;
  created_at: string;
  leg_id: string;
  match_id: string;
};

type TopRoundScorePayload = {
  id: string;
  player_id: string;
  total_scored: number;
  created_at: string;
  leg_id: string;
  legs:
    | {
        id: string;
        match_id: string;
        matches: {
          id: string;
          ended_early: boolean;
        };
      }
    | {
        id: string;
        match_id: string;
        matches: {
          id: string;
          ended_early: boolean;
        };
      }[]
    | null;
  players:
    | {
        id: string;
        display_name: string;
      }
    | {
        id: string;
        display_name: string;
      }[]
    | null;
};

export default function LeaderboardsPage() {
  const { leaders, avgLeaders, eloLeaders, eloMultiLeaders, loading } = useLeaderboardData(10);
  const [topRoundScores, setTopRoundScores] = useState<TopRoundScore[]>([]);
  const [highestCheckouts, setHighestCheckouts] = useState<{ player_id: string; display_name: string; score: number; date: string; darts_used: number }[]>([]);
  const [quickestLegsDouble, setQuickestLegsDouble] = useState<{ player_id: string; display_name: string; dart_count: number; date: string; start_score: string }[]>([]);
  const [quickestLegsSingle, setQuickestLegsSingle] = useState<{ player_id: string; display_name: string; dart_count: number; date: string; start_score: string }[]>([]);
  const [topScoresLoading, setTopScoresLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(true);
  const [quickestLegsLoading, setQuickestLegsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const supabase = await getSupabaseClient();
        const { data: topScoresData } = await supabase
          .from('turns')
          .select(`
            id,
            player_id,
            total_scored,
            created_at,
            leg_id,
            legs!inner (
              id,
              match_id,
              matches!inner (
                id,
                ended_early
              )
            ),
            players!inner (
              id,
              display_name
            )
          `)
          .eq('busted', false)
          .eq('legs.matches.ended_early', false)
          .not('players.display_name', 'ilike', '%test%')
          .order('total_scored', { ascending: false })
          .limit(10);

        const mapTopRoundScore = (row: TopRoundScorePayload): TopRoundScore | null => {
          const playerRelation = Array.isArray(row.players) ? row.players[0] : row.players;
          const legRelation = Array.isArray(row.legs) ? row.legs[0] : row.legs;
          if (!playerRelation || !legRelation) return null;
          return {
            id: row.id,
            player_id: row.player_id,
            display_name: playerRelation.display_name,
            total_scored: row.total_scored,
            created_at: row.created_at,
            leg_id: row.leg_id,
            match_id: legRelation.match_id,
          };
        };

        const transformedTopScores = ((topScoresData ?? []) as unknown[])
          .map((row) => mapTopRoundScore(row as TopRoundScorePayload))
          .filter((row): row is TopRoundScore => row !== null);

        setTopRoundScores(transformedTopScores);
      } catch (error) {
        console.error('Error loading top round scores:', error);
        setTopRoundScores([]);
      } finally {
        setTopScoresLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setCheckoutLoading(true);
        const supabase = await getSupabaseClient();
        const { data: checkoutData } = await supabase
          .from('checkout_leaderboard')
          .select('*')
          .order('score', { ascending: false })
          .limit(10);

        setHighestCheckouts(
          (checkoutData as { player_id: string; display_name: string; score: number; date: string; darts_used: number }[]) ?? []
        );
      } catch (error) {
        console.error('Error loading highest checkouts:', error);
        setHighestCheckouts([]);
      } finally {
        setCheckoutLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setQuickestLegsLoading(true);
        const supabase = await getSupabaseClient();

        const [{ data: doubleData }, { data: singleData }] = await Promise.all([
          supabase
            .from('quickest_legs_leaderboard')
            .select('*')
            .eq('finish_rule', 'double_out')
            .order('dart_count', { ascending: true })
            .limit(10),
          supabase
            .from('quickest_legs_leaderboard')
            .select('*')
            .eq('finish_rule', 'single_out')
            .order('dart_count', { ascending: true })
            .limit(10),
        ]);

        if (doubleData) setQuickestLegsDouble(doubleData);
        if (singleData) setQuickestLegsSingle(singleData);
      } catch (error) {
        console.error('Error loading quickest legs:', error);
      } finally {
        setQuickestLegsLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-lg">Loading leaderboards...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Leaderboards</h1>
        <p className="text-muted-foreground">Comprehensive rankings and achievements across all game modes</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <LeaderboardSection
          title="Top 10 Multiplayer ELO Ratings"
          emptyMessage="No multiplayer ELO ratings yet."
          emptySubMessage="Complete some 3+ player matches to see rankings!"
          isEmpty={eloMultiLeaders.length === 0}
        >
          {eloMultiLeaders.map((entry, idx) => (
            <EloLeaderboardItem key={entry.player_id} entry={entry} index={idx} />
          ))}
        </LeaderboardSection>

        <LeaderboardSection
          title="Top 10 Match Winners"
          emptyMessage="No matches recorded yet."
          isEmpty={leaders.length === 0}
        >
          {leaders.map((row, idx) => (
            <PlayerSummaryItem key={row.player_id} entry={row} index={idx} primaryMetric="wins" />
          ))}
        </LeaderboardSection>

        <LeaderboardSection
          title="Top 10 by Average Score"
          emptyMessage="No average scores to display yet."
          isEmpty={avgLeaders.length === 0}
        >
          {avgLeaders.map((row, idx) => (
            <PlayerSummaryItem key={row.player_id} entry={row} index={idx} primaryMetric="avg" />
          ))}
        </LeaderboardSection>

        <LeaderboardSection
          title="Top 10 ELO Ratings"
          emptyMessage="No ELO ratings yet."
          emptySubMessage="Complete some 1v1 matches to see ELO rankings!"
          isEmpty={eloLeaders.length === 0}
        >
          {eloLeaders.map((entry, idx) => (
            <EloLeaderboardItem key={entry.player_id} entry={entry} index={idx} />
          ))}
        </LeaderboardSection>

        {/* Top 10 Round Scores of All Time */}
        <LeaderboardSection
          title="Top 10 Round Scores of All Time"
          emptyMessage={topScoresLoading ? 'Loading top scores...' : 'No round scores recorded yet.'}
          isEmpty={topRoundScores.length === 0}
        >
          {topRoundScores.map((score, idx) => (
            <li key={score.id} className="flex items-center justify-between px-3 py-2">
              <div className="flex items-center gap-3">
                <span className="w-8 text-lg text-center">{medal(idx)}</span>
                <div>
                  <div className="font-medium">{score.display_name}</div>
                  <div className="text-xs text-muted-foreground">{formatLeaderboardDate(score.created_at)}</div>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="font-mono tabular-nums text-2xl font-bold text-primary">{score.total_scored}</div>
                {score.total_scored === 180 && <span className="text-lg">🎯</span>}
                {score.total_scored >= 140 && score.total_scored < 180 && <span className="text-lg">🔥</span>}
              </div>
            </li>
          ))}
        </LeaderboardSection>

        {/* Highest Checkouts */}
        <LeaderboardSection
          title="Highest Checkouts"
          emptyMessage={checkoutLoading ? 'Loading checkouts...' : 'No checkouts recorded yet.'}
          isEmpty={highestCheckouts.length === 0}
        >
          {highestCheckouts.map((score, idx) => (
            <li key={`${score.player_id}-${score.date}`} className="flex items-center justify-between px-3 py-2">
              <div className="flex items-center gap-3">
                <span className="w-8 text-lg text-center">{medal(idx)}</span>
                <div>
                  <div className="font-medium">{score.display_name}</div>
                  <div className="text-xs text-muted-foreground">{formatLeaderboardDate(score.date)}</div>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <div className="font-mono tabular-nums text-2xl font-bold">{score.score}</div>
                  <div className="text-xs text-muted-foreground">{score.darts_used} darts</div>
                </div>
                {score.score >= 100 && <span className="text-lg">🚀</span>}
              </div>
            </li>
          ))}
        </LeaderboardSection>

        {/* Quickest Legs (Double Out) */}
        <LeaderboardSection
          title="Quickest Legs (Double Out)"
          emptyMessage={quickestLegsLoading ? 'Loading quickest legs...' : 'No double-out legs recorded yet.'}
          isEmpty={quickestLegsDouble.length === 0}
        >
          {quickestLegsDouble.map((leg, idx) => (
            <li key={`${leg.player_id}-${leg.date}`} className="flex items-center justify-between px-3 py-2">
              <div className="flex items-center gap-3">
                <span className="w-8 text-lg text-center">{medal(idx)}</span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{leg.display_name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-medium ${
                      leg.start_score === '501' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                      leg.start_score === '301' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
                      'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                    }`}>
                      {leg.start_score}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">{formatLeaderboardDate(leg.date)}</div>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <div className="font-mono tabular-nums text-2xl font-bold text-blue-600 dark:text-blue-400">{leg.dart_count}</div>
                  <div className="text-xs text-muted-foreground">darts</div>
                </div>
              </div>
            </li>
          ))}
        </LeaderboardSection>

        {/* Quickest Legs (Single Out) */}
        <LeaderboardSection
          title="Quickest Legs (Single Out)"
          emptyMessage={quickestLegsLoading ? 'Loading quickest legs...' : 'No single-out legs recorded yet.'}
          isEmpty={quickestLegsSingle.length === 0}
        >
          {quickestLegsSingle.map((leg, idx) => (
            <li key={`${leg.player_id}-${leg.date}`} className="flex items-center justify-between px-3 py-2">
              <div className="flex items-center gap-3">
                <span className="w-8 text-lg text-center">{medal(idx)}</span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{leg.display_name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-medium ${
                      leg.start_score === '501' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                      leg.start_score === '301' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
                      'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                    }`}>
                      {leg.start_score}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">{formatLeaderboardDate(leg.date)}</div>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <div className="font-mono tabular-nums text-2xl font-bold text-green-600 dark:text-green-400">{leg.dart_count}</div>
                  <div className="text-xs text-muted-foreground">darts</div>
                </div>
              </div>
            </li>
          ))}
        </LeaderboardSection>
      </div>
    </div>
  );
}
