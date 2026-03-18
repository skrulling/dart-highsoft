import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  computeHitDistribution,
  computeScoreDistributionChartData,
  computeBustAnalysis,
  computeDartsPerLeg,
  computeScoreConsistency,
  computePerDartStats,
  computeTonCounts,
} from '@/lib/stats/computations';
import type { PlayerCoreStats, PlayerSegmentRow } from '@/lib/stats/types';

const Chart = dynamic(() => import('@/components/Chart'), { ssr: false });

interface PerformanceTabProps {
  selectedPlayer: string;
  playerSegments: PlayerSegmentRow[];
  playerCoreStats: PlayerCoreStats;
}

export function PerformanceTab({ selectedPlayer, playerSegments, playerCoreStats }: PerformanceTabProps) {
  const { playerTurns, playerThrows, playerLegs } = playerCoreStats;

  const hitDistribution = useMemo(() => {
    return computeHitDistribution(selectedPlayer, playerSegments, playerThrows);
  }, [selectedPlayer, playerSegments, playerThrows]);

  const scoreDistributionData = useMemo(() => {
    return computeScoreDistributionChartData(playerCoreStats.scoreDistribution);
  }, [playerCoreStats.scoreDistribution]);

  const bustAnalysis = useMemo(() => computeBustAnalysis(playerTurns), [playerTurns]);
  const dartsPerLeg = useMemo(() => computeDartsPerLeg(playerTurns, playerThrows, playerLegs, selectedPlayer), [playerTurns, playerThrows, playerLegs, selectedPlayer]);
  const consistency = useMemo(() => computeScoreConsistency(playerTurns), [playerTurns]);
  const perDart = useMemo(() => computePerDartStats(playerThrows), [playerThrows]);
  const tonCounts = useMemo(() => computeTonCounts(playerTurns), [playerTurns]);

  return (
    <div className="space-y-6">
      {/* Headline Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">180s</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tonCounts.ton180}</div>
            <p className="text-xs text-muted-foreground">perfect turns</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Ton+ (100+)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tonCounts.tonPlus}</div>
            <p className="text-xs text-muted-foreground">{tonCounts.ton100} ton, {tonCounts.ton140} ton-80, {tonCounts.ton180} max</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Bust Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{bustAnalysis.bustRate}%</div>
            <p className="text-xs text-muted-foreground">{bustAnalysis.totalBusts} of {bustAnalysis.totalTurns} turns</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Consistency</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">&plusmn;{consistency.stdDev}</div>
            <p className="text-xs text-muted-foreground">std dev (median {consistency.median})</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Best Leg</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dartsPerLeg.bestLeg || '–'}</div>
            <p className="text-xs text-muted-foreground">{dartsPerLeg.bestLeg ? `darts (avg ${dartsPerLeg.avgDarts})` : 'no legs won'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Per-Dart Performance */}
      <Card>
        <CardHeader>
          <CardTitle>Per-Dart Performance</CardTitle>
          <CardDescription>Average score by dart position within a turn</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            {([0, 1, 2] as const).map(i => {
              const labels = ['1st Dart', '2nd Dart', '3rd Dart'];
              const colors = [
                'bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
                'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400',
                'bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
              ];
              const best = Math.max(...perDart.avgByDart);
              return (
                <div key={i} className={`p-4 rounded-lg ${colors[i].split(' ').slice(0, 2).join(' ')}`}>
                  <div className={`text-3xl font-bold ${colors[i].split(' ').slice(2).join(' ')}`}>
                    {perDart.avgByDart[i]}
                    {perDart.avgByDart[i] === best && perDart.avgByDart[i] > 0 && (
                      <span className="text-sm ml-1">*</span>
                    )}
                  </div>
                  <div className="text-sm font-medium mt-1">{labels[i]}</div>
                  <div className="text-xs text-muted-foreground">({perDart.countByDart[i].toLocaleString()} darts)</div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Score Distribution + Hit Segments */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Score Distribution</CardTitle>
            <CardDescription>Turn score frequency breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            <Chart options={{
              title: { text: null },
              chart: { type: 'column', height: 300 },
              xAxis: {
                categories: scoreDistributionData.categories,
                title: { text: 'Score Range' }
              },
              yAxis: {
                title: { text: 'Frequency' },
                min: 0
              },
              series: [{
                name: 'Turns',
                data: scoreDistributionData.data,
                color: '#3b82f6'
              }],
              legend: { enabled: false },
              plotOptions: {
                column: {
                  borderRadius: 2,
                  dataLabels: { enabled: true }
                }
              }
            }} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Most Hit Segments</CardTitle>
            <CardDescription>Top dartboard areas targeted</CardDescription>
          </CardHeader>
          <CardContent>
            <Chart options={{
              title: { text: null },
              chart: { type: 'column', height: 300 },
              xAxis: {
                categories: hitDistribution.categories,
                labels: { rotation: -45 },
                title: { text: 'Dartboard Segment' }
              },
              yAxis: {
                title: { text: 'Hit Count' },
                min: 0
              },
              series: [{
                name: 'Hits',
                data: hitDistribution.data,
                color: '#8b5cf6'
              }],
              legend: { enabled: false },
              plotOptions: {
                column: {
                  borderRadius: 2,
                  dataLabels: { enabled: true }
                }
              }
            }} />
          </CardContent>
        </Card>
      </div>

      {/* Darts Per Leg + Bust Analysis */}
      <div className="grid md:grid-cols-2 gap-6">
        {dartsPerLeg.categories.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Darts Per Leg</CardTitle>
              <CardDescription>Distribution of darts needed to win a leg (avg: {dartsPerLeg.avgDarts})</CardDescription>
            </CardHeader>
            <CardContent>
              <Chart options={{
                title: { text: null },
                chart: { type: 'column', height: 300 },
                xAxis: {
                  categories: dartsPerLeg.categories,
                  title: { text: 'Darts' }
                },
                yAxis: {
                  title: { text: 'Legs' },
                  min: 0
                },
                series: [{
                  name: 'Legs Won',
                  data: dartsPerLeg.data,
                  color: '#10b981'
                }],
                legend: { enabled: false },
                plotOptions: {
                  column: {
                    borderRadius: 2,
                    dataLabels: { enabled: true }
                  }
                }
              }} />
            </CardContent>
          </Card>
        )}

        {bustAnalysis.bustScoreDistribution.categories.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Bust Score Distribution</CardTitle>
              <CardDescription>Score attempted when busting ({bustAnalysis.bustRate}% bust rate)</CardDescription>
            </CardHeader>
            <CardContent>
              <Chart options={{
                title: { text: null },
                chart: { type: 'column', height: 300 },
                xAxis: {
                  categories: bustAnalysis.bustScoreDistribution.categories,
                  title: { text: 'Score Attempted' }
                },
                yAxis: {
                  title: { text: 'Busts' },
                  min: 0
                },
                series: [{
                  name: 'Busts',
                  data: bustAnalysis.bustScoreDistribution.data,
                  color: '#ef4444'
                }],
                legend: { enabled: false },
                plotOptions: {
                  column: {
                    borderRadius: 2,
                    dataLabels: { enabled: true }
                  }
                }
              }} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
