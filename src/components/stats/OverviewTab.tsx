import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { PlayerCoreStats } from '@/lib/stats/types';

interface OverviewTabProps {
  playerCoreStats: PlayerCoreStats;
}

export function OverviewTab({ playerCoreStats }: OverviewTabProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Games Played</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{playerCoreStats.gamesPlayed}</div>
            <p className="text-xs text-muted-foreground">{playerCoreStats.matchesWon} wins</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Legs Played</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{playerCoreStats.legsPlayed}</div>
            <p className="text-xs text-muted-foreground">{playerCoreStats.legsWon} wins</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Game Win Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{playerCoreStats.gameWinRate}%</div>
            <p className="text-xs text-muted-foreground">match success</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Leg Win Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{playerCoreStats.legWinRate}%</div>
            <p className="text-xs text-muted-foreground">leg success</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Average Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{playerCoreStats.avgScore}</div>
            <p className="text-xs text-muted-foreground">per turn</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Turns</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{playerCoreStats.totalTurns}</div>
            <p className="text-xs text-muted-foreground">completed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Throws</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{playerCoreStats.totalThrows}</div>
            <p className="text-xs text-muted-foreground">darts thrown</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Checkout Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{playerCoreStats.checkoutRate}%</div>
            <p className="text-xs text-muted-foreground">finish success</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Highest Checkout</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{playerCoreStats.highestCheckout}</div>
            <p className="text-xs text-muted-foreground">
              {playerCoreStats.highestCheckout > 0
                ? `${playerCoreStats.highestCheckoutDarts} darts`
                : 'best finish'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Checkout Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Checkout Breakdown</CardTitle>
          <CardDescription>Percentage of checkouts by number of darts used</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bg-green-100 dark:bg-green-900/20 p-4 rounded-lg">
              <div className="text-3xl font-bold text-green-600 dark:text-green-400">{playerCoreStats.checkoutBreakdown[1]}%</div>
              <div className="text-sm font-medium mt-1 text-green-900 dark:text-green-100">1 Dart Used</div>
              <div className="text-xs text-green-700 dark:text-green-300/80">({playerCoreStats.checkoutCounts[1]} times)</div>
            </div>
            <div className="bg-blue-100 dark:bg-blue-900/20 p-4 rounded-lg">
              <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">{playerCoreStats.checkoutBreakdown[2]}%</div>
              <div className="text-sm font-medium mt-1 text-blue-900 dark:text-blue-100">2 Darts Used</div>
              <div className="text-xs text-blue-700 dark:text-blue-300/80">({playerCoreStats.checkoutCounts[2]} times)</div>
            </div>
            <div className="bg-purple-100 dark:bg-purple-900/20 p-4 rounded-lg">
              <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">{playerCoreStats.checkoutBreakdown[3]}%</div>
              <div className="text-sm font-medium mt-1 text-purple-900 dark:text-purple-100">3 Darts Used</div>
              <div className="text-xs text-purple-700 dark:text-purple-300/80">({playerCoreStats.checkoutCounts[3]} times)</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Top 3 Highest Rounds */}
      <Card>
        <CardHeader>
          <CardTitle>🏆 Top 3 Highest Rounds</CardTitle>
          <CardDescription>Best single-turn performances</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {playerCoreStats.topRounds.map((turn, index) => {
              const medals = ['🥇', '🥈', '🥉'];
              const colors = [
                'bg-yellow-100 text-yellow-800 border-yellow-300',
                'bg-gray-100 text-gray-800 border-gray-300',
                'bg-orange-100 text-orange-800 border-orange-300'
              ];

              return (
                <Badge
                  key={turn.id}
                  variant="outline"
                  className={`text-lg py-2 px-4 ${colors[index]}`}
                >
                  {medals[index]} {turn.total_scored}
                </Badge>
              );
            })}
            {playerCoreStats.topRounds.length === 0 && (
              <p className="text-muted-foreground">No valid rounds recorded</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
