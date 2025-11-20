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
  const [highestCheckouts, setHighestCheckouts] = useState<{ player_id: string; display_name: string; score: number; date: string; darts_used: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const supabase = await getSupabaseClient();
        const [{ data: winnersData }, eloData, eloMultiData, { data: avgData }, { data: topScoresData }, { data: playersData }] = await Promise.all([
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
            .limit(10),
          supabase
            .from('players')
            .select('id, display_name')
        ]);

        // Fetch data for Highest Checkouts
        const { data: winningLegs } = await supabase
          .from('legs')
          .select('id, winner_player_id, created_at, matches!inner(ended_early)')
          .not('winner_player_id', 'is', null)
          .eq('matches.ended_early', false)
          .order('created_at', { ascending: false });

        let checkoutLeaders: { player_id: string; display_name: string; score: number; date: string; darts_used: number }[] = [];

        if (winningLegs && winningLegs.length > 0) {
          const legIds = winningLegs.map(l => l.id);
          // Fetch turns for these legs to find the checkout turn (last turn)
          const { data: legTurns } = await supabase
            .from('turns')
            .select('id, leg_id, player_id, total_scored, turn_number')
            .in('leg_id', legIds);

          if (legTurns) {
            // Identify checkout turns to fetch throws count
            const checkoutTurnsMap = new Map<string, string>(); // leg_id -> turn_id
            const checkoutTurnsList: { leg_id: string; turn_id: string; total_scored: number }[] = [];
            
            winningLegs.forEach(leg => {
              const turns = legTurns.filter(t => t.leg_id === leg.id && t.player_id === leg.winner_player_id);
              if (turns.length > 0) {
                const lastTurn = turns.reduce((prev, current) => (prev.turn_number > current.turn_number) ? prev : current);
                checkoutTurnsMap.set(leg.id, lastTurn.id);
                checkoutTurnsList.push({ leg_id: leg.id, turn_id: lastTurn.id, total_scored: lastTurn.total_scored });
              }
            });

            const turnIds = checkoutTurnsList.map(t => t.turn_id);
            
            // Fetch throws for these turns to count darts
            const { data: turnThrows } = await supabase
              .from('throws')
              .select('turn_id')
              .in('turn_id', turnIds);

            const throwsCountMap = new Map<string, number>();
            if (turnThrows) {
              turnThrows.forEach(t => {
                throwsCountMap.set(t.turn_id, (throwsCountMap.get(t.turn_id) || 0) + 1);
              });
            }

            const checkouts = winningLegs.map(leg => {
              const turnId = checkoutTurnsMap.get(leg.id);
              if (!turnId) return null;
              
              const turnData = checkoutTurnsList.find(t => t.turn_id === turnId);
              if (!turnData) return null;

              const player = (playersData as { id: string; display_name: string }[] | null)?.find(p => p.id === leg.winner_player_id);
              
              if (!player || player.display_name.toLowerCase().includes('test')) return null;

              return {
                player_id: leg.winner_player_id!,
                display_name: player.display_name,
                score: turnData.total_scored,
                date: leg.created_at,
                darts_used: throwsCountMap.get(turnId) || 0
              };
            }).filter((c): c is { player_id: string; display_name: string; score: number; date: string; darts_used: number } => c !== null);

            // Sort by score desc
            checkoutLeaders = checkouts.sort((a, b) => b.score - a.score).slice(0, 10);
          }
        }

        setLeaders(((winnersData as unknown) as { player_id: string; display_name: string; wins: number; avg_per_turn: number }[]) ?? []);
        setAvgLeaders(((avgData as unknown) as { player_id: string; display_name: string; wins: number; avg_per_turn: number }[]) ?? []);
        setEloLeaders(eloData);
        setEloMultiLeaders(eloMultiData);
        setHighestCheckouts(checkoutLeaders);

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
        setHighestCheckouts([]);
      } finally {
        setLoading(false);
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

        {/* Highest Checkouts */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-semibold">Highest Checkouts</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y border rounded bg-card">
              {highestCheckouts.map((score, idx) => (
                <li key={`${score.player_id}-${score.date}`} className="flex items-center justify-between px-3 py-2">
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
              {highestCheckouts.length === 0 && (
                <li className="px-3 py-4 text-sm text-muted-foreground">No checkouts recorded yet.</li>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
