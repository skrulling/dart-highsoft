import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { OverallStats } from '@/lib/stats/types';

interface GlobalStatsCardsProps {
  overallStats: OverallStats;
  playersCount: number;
  avgScore: number;
  gamesPerDay: number;
}

export function GlobalStatsCards({ overallStats, playersCount, avgScore, gamesPerDay }: GlobalStatsCardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4">
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
          <p className="text-xs text-muted-foreground">
            ~{overallStats.avgThrowsPerTurn} throws/turn
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Total Throws</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{overallStats.totalThrows}</div>
          <p className="text-xs text-muted-foreground">darts thrown</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Active Players</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{playersCount}</div>
          <p className="text-xs text-muted-foreground">registered</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Avg Score</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{avgScore}</div>
          <p className="text-xs text-muted-foreground">per turn</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Games/Day</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{gamesPerDay}</div>
          <p className="text-xs text-muted-foreground">average</p>
        </CardContent>
      </Card>
    </div>
  );
}
