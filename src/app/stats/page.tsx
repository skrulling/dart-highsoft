"use client";

import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import { useEffect, useMemo, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';


type PlayerRow = { id: string; display_name: string };
type SummaryRow = { player_id: string; display_name: string; wins: number; avg_per_turn: number };
type LegRow = { id: string; match_id: string; leg_number: number; created_at: string; winner_player_id: string | null };
type TurnRow = { id: string; leg_id: string; player_id: string; total_scored: number; busted: boolean; turn_number: number; created_at: string };
type ThrowRow = { id: string; turn_id: string; dart_index: number; segment: string; scored: number };
type MatchRow = { id: string; created_at: string; winner_player_id: string | null };

export default function StatsPage() {
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [legs, setLegs] = useState<LegRow[]>([]);
  const [turns, setTurns] = useState<TurnRow[]>([]);
  const [throws, setThrows] = useState<ThrowRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<string>('');
  const [loading, setLoading] = useState(true);


  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const supabase = await getSupabaseClient();
        
        const [
          { data: s }, 
          { data: p }, 
          { data: l }, 
          { data: m }
        ] = await Promise.all([
          supabase
            .from('player_summary')
            .select('*')
            .not('display_name', 'ilike', '%test%')
            .order('wins', { ascending: false }),
          supabase
            .from('players')
            .select('id, display_name')
            .not('display_name', 'ilike', '%test%')
            .order('display_name'),
          supabase.from('legs').select('*').order('created_at'),
          supabase.from('matches').select('id, created_at, winner_player_id').order('created_at')
        ]);
        
        setSummary(((s as unknown) as SummaryRow[]) ?? []);
        const pl = ((p as unknown) as PlayerRow[]) ?? [];
        setPlayers(pl);
        const lg = ((l as unknown) as LegRow[]) ?? [];
        setLegs(lg);
        const mt = ((m as unknown) as MatchRow[]) ?? [];
        setMatches(mt);
        
        if (lg.length) {
          const { data: t } = await supabase
            .from('turns')
            .select('id, leg_id, player_id, total_scored, busted, turn_number, created_at')
            .in('leg_id', lg.map((x) => x.id))
            .order('created_at');
          
          const turnData = ((t as unknown) as TurnRow[]) ?? [];
          setTurns(turnData);
          
          if (turnData.length) {
            const { data: throwData } = await supabase
              .from('throws')
              .select('id, turn_id, dart_index, segment, scored')
              .in('turn_id', turnData.map(t => t.id));
            setThrows(((throwData as unknown) as ThrowRow[]) ?? []);
          }
        } else {
          setTurns([]);
          setThrows([]);
        }
      } catch (error) {
        console.error('Error loading stats:', error);
        setSummary([]);
        setPlayers([]);
        setLegs([]);
        setTurns([]);
        setThrows([]);
        setMatches([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Overall statistics
  const overallStats = useMemo(() => {
    const totalMatches = matches.length;
    const totalLegs = legs.length;
    const totalTurns = turns.length;
    const totalThrows = throws.length;
    const completedMatches = matches.filter(m => m.winner_player_id).length;
    const avgTurnsPerLeg = legs.length > 0 ? Math.round((turns.length / legs.length) * 10) / 10 : 0;
    
    return {
      totalMatches,
      totalLegs,
      totalTurns,
      totalThrows,
      completedMatches,
      avgTurnsPerLeg
    };
  }, [matches, legs, turns, throws]);

  // Player-specific data
  const selectedPlayerData = useMemo(() => {
    if (!selectedPlayer) return null;
    
    const playerTurns = turns.filter(t => t.player_id === selectedPlayer);
    const playerThrows = throws.filter(th => 
      playerTurns.some(t => t.id === th.turn_id)
    );
    
    // Calculate stats
    const totalScore = playerTurns.reduce((sum, t) => sum + (t.busted ? 0 : t.total_scored), 0);
    const validTurns = playerTurns.filter(t => !t.busted);
    const avgScore = validTurns.length > 0 ? Math.round((totalScore / validTurns.length) * 100) / 100 : 0;
    const legsWon = legs.filter(l => l.winner_player_id === selectedPlayer).length;
    const matchesWon = matches.filter(m => m.winner_player_id === selectedPlayer).length;
    
    // Top 3 highest rounds
    const topRounds = playerTurns
      .filter(t => !t.busted)
      .sort((a, b) => b.total_scored - a.total_scored)
      .slice(0, 3);
    
    return {
      totalTurns: playerTurns.length,
      totalThrows: playerThrows.length,
      avgScore,
      legsWon,
      matchesWon,
      topRounds,
      throws: playerThrows,
      turns: playerTurns
    };
  }, [selectedPlayer, turns, throws, legs, matches]);


  // Average score over time
  const avgScoreOverTime = useMemo(() => {
    if (!selectedPlayerData) return [];
    
    const sortedTurns = selectedPlayerData.turns
      .filter(t => !t.busted)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    
    let cumulativeScore = 0;
    let count = 0;
    
    return sortedTurns.map(turn => {
      cumulativeScore += turn.total_scored;
      count++;
      return [
        new Date(turn.created_at).getTime(),
        Math.round((cumulativeScore / count) * 100) / 100
      ];
    });
  }, [selectedPlayerData]);

  // Legs played over time
  const legsOverTime = useMemo(() => {
    if (!selectedPlayer) return [];
    
    const playerLegs = legs.filter(l => 
      turns.some(t => t.leg_id === l.id && t.player_id === selectedPlayer)
    ).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    
    return playerLegs.map((leg, index) => [
      new Date(leg.created_at).getTime(),
      index + 1
    ]);
  }, [selectedPlayer, legs, turns]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-lg">Loading statistics...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Statistics</h1>
        <p className="text-muted-foreground">Comprehensive dart game analytics and insights</p>
      </div>

      {/* Overall Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Matches</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overallStats.totalMatches}</div>
            <p className="text-xs text-muted-foreground">
              {overallStats.completedMatches} completed
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Legs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overallStats.totalLegs}</div>
            <p className="text-xs text-muted-foreground">
              ~{overallStats.avgTurnsPerLeg} turns/leg
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Turns</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overallStats.totalTurns}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Throws</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overallStats.totalThrows}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Players</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{players.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Avg Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary.length > 0 ? Math.round(summary.reduce((sum, p) => sum + p.avg_per_turn, 0) / summary.length) : 0}
            </div>
            <p className="text-xs text-muted-foreground">per turn</p>
          </CardContent>
        </Card>
      </div>

      {/* Player Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Player Analysis</CardTitle>
          <CardDescription>Select a player to view detailed statistics and visualizations</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={selectedPlayer} onValueChange={setSelectedPlayer}>
            <SelectTrigger className="w-full md:w-[300px]">
              <SelectValue placeholder="Select a player..." />
            </SelectTrigger>
            <SelectContent>
              {players.map(player => (
                <SelectItem key={player.id} value={player.id}>
                  {player.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Player-Specific Content */}
      {selectedPlayer && selectedPlayerData && (
        <div className="space-y-6">
          {/* Player Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Matches Won</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{selectedPlayerData.matchesWon}</div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Legs Won</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{selectedPlayerData.legsWon}</div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Average Score</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{selectedPlayerData.avgScore}</div>
                <p className="text-xs text-muted-foreground">per turn</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Turns</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{selectedPlayerData.totalTurns}</div>
              </CardContent>
            </Card>
          </div>

          {/* Top 3 Highest Rounds */}
          <Card>
            <CardHeader>
              <CardTitle>Top 3 Highest Rounds</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {selectedPlayerData.topRounds.map((turn, index) => {
                  const getTrophyStyle = (position: number) => {
                    switch (position) {
                      case 0:
                        return {
                          emoji: '🏆',
                          className: 'bg-yellow-100 text-yellow-800 border-yellow-300 hover:bg-yellow-200'
                        };
                      case 1:
                        return {
                          emoji: '🥈',
                          className: 'bg-gray-100 text-gray-800 border-gray-300 hover:bg-gray-200'
                        };
                      case 2:
                        return {
                          emoji: '🥉',
                          className: 'bg-orange-100 text-orange-800 border-orange-300 hover:bg-orange-200'
                        };
                      default:
                        return {
                          emoji: '',
                          className: 'bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200'
                        };
                    }
                  };
                  
                  const { emoji, className } = getTrophyStyle(index);
                  
                  return (
                    <Badge 
                      key={turn.id} 
                      variant="outline" 
                      className={`text-lg py-2 px-4 ${className}`}
                    >
                      {emoji} {turn.total_scored}
                    </Badge>
                  );
                })}
                {selectedPlayerData.topRounds.length === 0 && (
                  <p className="text-muted-foreground">No valid rounds recorded</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Charts */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Average Score Over Time */}
            <Card>
              <CardHeader>
                <CardTitle>Average Score Over Time</CardTitle>
                <CardDescription>Cumulative average performance</CardDescription>
              </CardHeader>
              <CardContent>
                <HighchartsReact
                  highcharts={Highcharts}
                  options={{
                    title: { text: null },
                    chart: { height: 300 },
                    xAxis: { type: 'datetime' },
                    yAxis: { 
                      title: { text: 'Average Score' },
                      min: 0
                    },
                    series: [{
                      type: 'line',
                      name: 'Cumulative Average',
                      data: avgScoreOverTime,
                      color: '#3b82f6'
                    }],
                    legend: { enabled: false },
                    tooltip: {
                      xDateFormat: '%Y-%m-%d %H:%M'
                    }
                  }}
                />
              </CardContent>
            </Card>

            {/* Legs Played Over Time */}
            <Card>
              <CardHeader>
                <CardTitle>Legs Played Over Time</CardTitle>
                <CardDescription>Cumulative legs participation</CardDescription>
              </CardHeader>
              <CardContent>
                <HighchartsReact
                  highcharts={Highcharts}
                  options={{
                    title: { text: null },
                    chart: { height: 300 },
                    xAxis: { type: 'datetime' },
                    yAxis: { 
                      title: { text: 'Total Legs' },
                      min: 0
                    },
                    series: [{
                      type: 'line',
                      name: 'Legs Played',
                      data: legsOverTime,
                      color: '#10b981'
                    }],
                    legend: { enabled: false },
                    tooltip: {
                      xDateFormat: '%Y-%m-%d %H:%M'
                    }
                  }}
                />
              </CardContent>
            </Card>
          </div>

          {/* Hit Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Hit Distribution</CardTitle>
              <CardDescription>Most frequently hit segments</CardDescription>
            </CardHeader>
            <CardContent>
              <HighchartsReact
                highcharts={Highcharts}
                options={{
                  title: { text: null },
                  chart: { height: 400 },
                  xAxis: {
                    categories: Object.keys(
                      selectedPlayerData.throws.reduce((acc, th) => {
                        acc[th.segment] = (acc[th.segment] || 0) + 1;
                        return acc;
                      }, {} as Record<string, number>)
                    ).sort((a, b) => {
                      const countA = selectedPlayerData.throws.filter(th => th.segment === a).length;
                      const countB = selectedPlayerData.throws.filter(th => th.segment === b).length;
                      return countB - countA;
                    }).slice(0, 20),
                    labels: { rotation: -45 }
                  },
                  yAxis: { title: { text: 'Hit Count' } },
                  series: [{
                    type: 'column',
                    name: 'Hits',
                    data: Object.entries(
                      selectedPlayerData.throws.reduce((acc, th) => {
                        acc[th.segment] = (acc[th.segment] || 0) + 1;
                        return acc;
                      }, {} as Record<string, number>)
                    ).sort(([,a], [,b]) => b - a).slice(0, 20).map(([,count]) => count),
                    color: '#8b5cf6'
                  }],
                  legend: { enabled: false }
                }}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Overall Charts */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Match Wins by Player</CardTitle>
          </CardHeader>
          <CardContent>
            <HighchartsReact
              highcharts={Highcharts}
              options={{
                title: { text: null },
                chart: { height: 300 },
                xAxis: { 
                  categories: summary.map(d => d.display_name),
                  labels: {
                    rotation: -45
                  }
                },
                yAxis: { title: { text: 'Wins' } },
                series: [{
                  type: 'column',
                  name: 'Wins',
                  data: summary.map(d => d.wins),
                  color: '#3b82f6'
                }],
                legend: { enabled: false }
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Average Score by Player</CardTitle>
          </CardHeader>
          <CardContent>
            <HighchartsReact
              highcharts={Highcharts}
              options={{
                title: { text: null },
                chart: { height: 300 },
                xAxis: { 
                  categories: summary.map(d => d.display_name),
                  labels: {
                    rotation: -45
                  }
                },
                yAxis: { title: { text: 'Average Score' } },
                series: [{
                  type: 'column',
                  name: 'Avg Score',
                  data: summary.map(d => Number(d.avg_per_turn.toFixed?.(2) ?? d.avg_per_turn)),
                  color: '#10b981'
                }],
                legend: { enabled: false }
              }}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}