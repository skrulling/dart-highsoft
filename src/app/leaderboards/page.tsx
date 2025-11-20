"use client";

import { useEffect, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { getEloLeaderboard, getEloTier, type EloLeaderboardEntry } from '@/utils/eloRating';
import { getMultiEloLeaderboard, type MultiEloLeaderboardEntry } from '@/utils/eloRatingMultiplayer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
  const [leaders, setLeaders] = useState<{ player_id: string; display_name: string; wins: number; avg_per_turn: number }[]>([]);
  const [avgLeaders, setAvgLeaders] = useState<{ player_id: string; display_name: string; wins: number; avg_per_turn: number }[]>([]);
  const [eloLeaders, setEloLeaders] = useState<EloLeaderboardEntry[]>([]);
  const [eloMultiLeaders, setEloMultiLeaders] = useState<MultiEloLeaderboardEntry[]>([]);
  const [topRoundScores, setTopRoundScores] = useState<TopRoundScore[]>([]);
  const [highestCheckoutsSingle, setHighestCheckoutsSingle] = useState<{ player_id: string; display_name: string; score: number; date: string; darts_used: number }[]>([]);
  const [highestCheckoutsDouble, setHighestCheckoutsDouble] = useState<{ player_id: string; display_name: string; score: number; date: string; darts_used: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const supabase = await getSupabaseClient();
        const [{ data: winnersData }, eloData, eloMultiData, { data: avgData }, { data: topScoresData }] = await Promise.all([
          supabase
            .from('player_summary')
            .select('*')
            .not('display_name', 'ilike', '%test%')
            .order('wins', { ascending: false })
            .limit(10),
          getEloLeaderboard(10),
          getMultiEloLeaderboard(10),
          supabase
            .from('player_summary')
            .select('*')
            .not('display_name', 'ilike', '%test%')
            .order('avg_per_turn', { ascending: false })
            .limit(10),
          supabase
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
            .limit(10)
        ]);

        setLeaders(((winnersData as unknown) as { player_id: string; display_name: string; wins: number; avg_per_turn: number }[]) ?? []);
        setAvgLeaders(((avgData as unknown) as { player_id: string; display_name: string; wins: number; avg_per_turn: number }[]) ?? []);
        setEloLeaders(eloData);
        setEloMultiLeaders(eloMultiData);

        // Transform top scores data
        const mapTopRoundScore = (row: TopRoundScorePayload): TopRoundScore | null => {
          const playerRelation = Array.isArray(row.players) ? row.players[0] : row.players;
          const legRelation = Array.isArray(row.legs) ? row.legs[0] : row.legs;

          if (!playerRelation || !legRelation) {
            return null;
          }

          return {
            id: row.id,
            player_id: row.player_id,
            display_name: playerRelation.display_name,
            total_scored: row.total_scored,
            created_at: row.created_at,
            leg_id: row.leg_id,
            match_id: legRelation.match_id
          };
        };

        const rawTopScores = (topScoresData ?? []) as unknown[];

        const transformedTopScores = rawTopScores
          .map((row) => mapTopRoundScore(row as TopRoundScorePayload))
          .filter((row): row is TopRoundScore => row !== null);

        setTopRoundScores(transformedTopScores);
      } catch (error) {
        console.error('Error loading leaderboards:', error);
        setLeaders([]);
        setAvgLeaders([]);
        setEloLeaders([]);
        setEloMultiLeaders([]);
        setTopRoundScores([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setCheckoutLoading(true);
        const supabase = await getSupabaseClient();

        const [{ data: singleData }, { data: doubleData }] = await Promise.all([
          supabase
            .from('checkout_leaderboard_single_out')
            .select('*')
            .order('score', { ascending: false })
            .limit(10),
          supabase
            .from('checkout_leaderboard_double_out')
            .select('*')
            .order('score', { ascending: false })
            .limit(10)
        ]);

        setHighestCheckoutsSingle((singleData as { player_id: string; display_name: string; score: number; date: string; darts_used: number }[]) ?? []);
        setHighestCheckoutsDouble((doubleData as { player_id: string; display_name: string; score: number; date: string; darts_used: number }[]) ?? []);
      } catch (error) {
        console.error('Error loading highest checkouts:', error);
        setHighestCheckoutsSingle([]);
        setHighestCheckoutsDouble([]);
      } finally {
        setCheckoutLoading(false);
      }
    })();
  }, []);

  const medal = (index: number) => (index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

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
        {/* Top 10 Multiplayer ELO Ratings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-semibold">Top 10 Multiplayer ELO Ratings</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y border rounded bg-card">
              {eloMultiLeaders.map((entry, idx) => {
                const tier = getEloTier(entry.current_rating);
                return (
                  <li key={entry.player_id} className="flex items-center justify-between px-3 py-2">
                    <div className="flex items-center gap-3">
                      <span className="w-8 text-lg text-center">{medal(idx)}</span>
                      <div>
                        <div>{entry.display_name}</div>
                        <div className={`text-xs ${tier.color}`}>
                          {tier.icon} {tier.name}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="font-mono tabular-nums text-lg font-bold">{entry.current_rating}</div>
                      <div className="text-sm text-muted-foreground">{entry.win_percentage}% win</div>
                    </div>
                  </li>
                );
              })}
              {eloMultiLeaders.length === 0 && (
                <li className="px-3 py-4 text-sm text-muted-foreground">
                  <div>No multiplayer ELO ratings yet.</div>
                  <div className="text-xs mt-1">Complete some 3+ player matches to see rankings!</div>
                </li>
              )}
            </ul>
          </CardContent>
        </Card>

        {/* Top 10 Match Winners */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-semibold">Top 10 Match Winners</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y border rounded bg-card">
              {leaders.map((row, idx) => (
                <li key={row.player_id} className="flex items-center justify-between px-3 py-2">
                  <div className="flex items-center gap-3">
                    <span className="w-8 text-lg text-center">{medal(idx)}</span>
                    <span>{row.display_name}</span>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="font-mono tabular-nums">{row.wins}</div>
                    <div className="text-sm text-muted-foreground">{row.avg_per_turn.toFixed(2)} avg</div>
                  </div>
                </li>
              ))}
              {leaders.length === 0 && (
                <li className="px-3 py-4 text-sm text-muted-foreground">No matches recorded yet.</li>
              )}
            </ul>
          </CardContent>
        </Card>

        {/* Top 10 by Average Score */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-semibold">Top 10 by Average Score</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y border rounded bg-card">
              {avgLeaders.map((row, idx) => (
                <li key={row.player_id} className="flex items-center justify-between px-3 py-2">
                  <div className="flex items-center gap-3">
                    <span className="w-8 text-lg text-center">{medal(idx)}</span>
                    <span>{row.display_name}</span>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="font-mono tabular-nums text-lg font-bold">{row.avg_per_turn.toFixed(2)}</div>
                    <div className="text-sm text-muted-foreground">{row.wins} wins</div>
                  </div>
                </li>
              ))}
              {avgLeaders.length === 0 && (
                <li className="px-3 py-4 text-sm text-muted-foreground">No average scores to display yet.</li>
              )}
            </ul>
          </CardContent>
        </Card>

        {/* Top 10 ELO Ratings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-semibold">Top 10 ELO Ratings</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y border rounded bg-card">
              {eloLeaders.map((entry, idx) => {
                const tier = getEloTier(entry.current_rating);
                return (
                  <li key={entry.player_id} className="flex items-center justify-between px-3 py-2">
                    <div className="flex items-center gap-3">
                      <span className="w-8 text-lg text-center">{medal(idx)}</span>
                      <div>
                        <div>{entry.display_name}</div>
                        <div className={`text-xs ${tier.color}`}>
                          {tier.icon} {tier.name}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="font-mono tabular-nums text-lg font-bold">{entry.current_rating}</div>
                      <div className="text-sm text-muted-foreground">{entry.win_percentage}% win</div>
                    </div>
                  </li>
                );
              })}
              {eloLeaders.length === 0 && (
                <li className="px-3 py-4 text-sm text-muted-foreground">
                  <div>No ELO ratings yet.</div>
                  <div className="text-xs mt-1">Complete some 1v1 matches to see ELO rankings!</div>
                </li>
              )}
            </ul>
          </CardContent>
        </Card>

        {/* Top 10 Round Scores of All Time - NEW LEADERBOARD */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-semibold">Top 10 Round Scores of All Time</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y border rounded bg-card">
              {topRoundScores.map((score, idx) => (
                <li key={score.id} className="flex items-center justify-between px-3 py-2">
                  <div className="flex items-center gap-3">
                    <span className="w-8 text-lg text-center">{medal(idx)}</span>
                    <div>
                      <div className="font-medium">{score.display_name}</div>
                      <div className="text-xs text-muted-foreground">{formatDate(score.created_at)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="font-mono tabular-nums text-2xl font-bold text-primary">{score.total_scored}</div>
                    {score.total_scored === 180 && <span className="text-lg">🎯</span>}
                    {score.total_scored >= 140 && score.total_scored < 180 && <span className="text-lg">🔥</span>}
                  </div>
                </li>
              ))}
              {topRoundScores.length === 0 && (
                <li className="px-3 py-4 text-sm text-muted-foreground">No round scores recorded yet.</li>
              )}
            </ul>
          </CardContent>
        </Card>

        {/* Highest Checkouts - Single Out */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-semibold">Highest Checkouts (Single Out)</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y border rounded bg-card">
              {highestCheckoutsSingle.map((score, idx) => (
                <li key={`${score.player_id}-${score.date}-single`} className="flex items-center justify-between px-3 py-2">
                  <div className="flex items-center gap-3">
                    <span className="w-8 text-lg text-center">{medal(idx)}</span>
                    <div>
                      <div className="font-medium">{score.display_name}</div>
                      <div className="text-xs text-muted-foreground">{formatDate(score.date)}</div>
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
              {checkoutLoading && (
                <li className="px-3 py-4 text-sm text-muted-foreground">Loading checkouts...</li>
              )}
              {!checkoutLoading && highestCheckoutsSingle.length === 0 && (
                <li className="px-3 py-4 text-sm text-muted-foreground">No checkouts recorded yet.</li>
              )}
            </ul>
          </CardContent>
        </Card>

        {/* Highest Checkouts - Double Out */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-semibold">Highest Checkouts (Double Out)</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y border rounded bg-card">
              {highestCheckoutsDouble.map((score, idx) => (
                <li key={`${score.player_id}-${score.date}-double`} className="flex items-center justify-between px-3 py-2">
                  <div className="flex items-center gap-3">
                    <span className="w-8 text-lg text-center">{medal(idx)}</span>
                    <div>
                      <div className="font-medium">{score.display_name}</div>
                      <div className="text-xs text-muted-foreground">{formatDate(score.date)}</div>
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
              {checkoutLoading && (
                <li className="px-3 py-4 text-sm text-muted-foreground">Loading checkouts...</li>
              )}
              {!checkoutLoading && highestCheckoutsDouble.length === 0 && (
                <li className="px-3 py-4 text-sm text-muted-foreground">No checkouts recorded yet.</li>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
