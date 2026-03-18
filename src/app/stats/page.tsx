"use client";

import { useStatsData } from '@/hooks/useStatsData';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EloLeaderboard } from '@/components/EloLeaderboard';
import { PlayerEloStats } from '@/components/PlayerEloStats';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Link from 'next/link';
import {
  GlobalStatsCards, DataLimitWarning, OverviewTab,
  PerformanceTab, TargetAnalysisTab, TrendsTab, OverallCharts
} from '@/components/stats';

export default function StatsPage() {
  const stats = useStatsData();

  if (stats.loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-lg">Loading statistics...</div>
      </div>
    );
  }

  const avgScore = stats.summary.length > 0
    ? Math.round(stats.summary.reduce((sum, p) => sum + p.avg_per_turn, 0) / stats.summary.length)
    : 0;

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Statistics Dashboard</h1>
          <p className="text-muted-foreground">Comprehensive dart game analytics and performance insights</p>
        </div>

        {/* View Toggle */}
        <div className="flex gap-2">
          <Button
            variant={stats.activeView === 'traditional' ? 'default' : 'outline'}
            onClick={() => stats.setActiveView('traditional')}
          >
            📊 Performance Stats
          </Button>
          <Button
            variant={stats.activeView === 'elo' ? 'default' : 'outline'}
            onClick={() => stats.setActiveView('elo')}
          >
            🏆 Elo Rankings
          </Button>
          <Button asChild variant="outline">
            <Link href="/elo-multi">👥 Multiplayer Elo</Link>
          </Button>
        </div>
      </div>

      {/* Elo View */}
      {stats.activeView === 'elo' && (
        <div className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <EloLeaderboard limit={20} showRecentChanges={true} />
            </div>

            <div>
              {stats.selectedPlayer ? (
                <PlayerEloStats
                  player={stats.players.find(p => p.id === stats.selectedPlayer) || { id: stats.selectedPlayer, display_name: 'Unknown' }}
                  showHistory={true}
                />
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle>Player Elo Stats</CardTitle>
                    <CardDescription>Select a player below to view their Elo rating and history</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Select value={stats.selectedPlayer} onValueChange={stats.setSelectedPlayer}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a player..." />
                      </SelectTrigger>
                      <SelectContent>
                        {stats.players.map(player => (
                          <SelectItem key={player.id} value={player.id}>
                            {player.display_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Performance Stats View */}
      {stats.activeView === 'traditional' && (
        <div className="space-y-6">
          <DataLimitWarning
            warnings={stats.dataLimitWarnings}
            dismissed={stats.warningDismissed}
            onDismiss={() => stats.setWarningDismissed(true)}
          />

          <GlobalStatsCards
            overallStats={stats.overallStats}
            playersCount={stats.players.length}
            avgScore={avgScore}
            gamesPerDay={stats.gamesPerDay}
          />

          {/* Player Selection */}
          <Card>
            <CardHeader>
              <CardTitle>Player Deep Dive</CardTitle>
              <CardDescription>Select a player to view comprehensive statistics, visualizations, and performance metrics</CardDescription>
            </CardHeader>
            <CardContent>
              <Select value={stats.selectedPlayer} onValueChange={stats.setSelectedPlayer}>
                <SelectTrigger className="w-full md:w-[300px]">
                  <SelectValue placeholder="Choose a player to analyze..." />
                </SelectTrigger>
                <SelectContent>
                  {stats.players.map(player => (
                    <SelectItem key={player.id} value={player.id}>
                      {player.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Player-Specific Content */}
          {stats.selectedPlayer && stats.playerCoreStats && (
            <Tabs defaultValue="overview" className="space-y-6">
              {stats.playerLoading && (
                <div className="absolute inset-0 bg-background/50 z-50 flex items-center justify-center">
                  <div className="text-lg font-semibold animate-pulse">Loading player data...</div>
                </div>
              )}
              <TabsList className="grid w-full grid-cols-4 h-14 p-1 bg-muted border rounded-lg shadow-sm">
                <TabsTrigger value="overview" className="text-sm font-medium rounded-md px-4 py-2 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-md data-[state=active]:border data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-muted/50 transition-all duration-200">Overview</TabsTrigger>
                <TabsTrigger value="performance" className="text-sm font-medium rounded-md px-4 py-2 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-md data-[state=active]:border data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-muted/50 transition-all duration-200">Performance</TabsTrigger>
                <TabsTrigger value="accuracy" className="text-sm font-medium rounded-md px-4 py-2 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-md data-[state=active]:border data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-muted/50 transition-all duration-200">Target Analysis</TabsTrigger>
                <TabsTrigger value="trends" className="text-sm font-medium rounded-md px-4 py-2 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-md data-[state=active]:border data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-muted/50 transition-all duration-200">Trends</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-6">
                <OverviewTab playerCoreStats={stats.playerCoreStats} />
              </TabsContent>

              <TabsContent value="performance" className="space-y-6">
                <PerformanceTab
                  selectedPlayer={stats.selectedPlayer}
                  playerSegments={stats.playerSegments}
                  playerCoreStats={stats.playerCoreStats}
                />
              </TabsContent>

              <TabsContent value="accuracy" className="space-y-6">
                <TargetAnalysisTab
                  playerCoreStats={stats.playerCoreStats}
                  selectedPlayer={stats.selectedPlayer}
                  playerSegments={stats.playerSegments}
                  playerAdjacency={stats.playerAdjacency}
                />
              </TabsContent>

              <TabsContent value="trends" className="space-y-6">
                <TrendsTab
                  playerCoreStats={stats.playerCoreStats}
                  legs={stats.legs}
                  matches={stats.matches}
                  selectedPlayer={stats.selectedPlayer}
                />
              </TabsContent>
            </Tabs>
          )}

          <OverallCharts summary={stats.summary} topAvgPlayers={stats.topAvgPlayers} />
        </div>
      )}
    </div>
  );
}
