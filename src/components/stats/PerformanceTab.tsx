import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { computeHitDistribution, computeScoreDistributionChartData } from '@/lib/stats/computations';
import type { PlayerCoreStats, PlayerSegmentRow } from '@/lib/stats/types';

const Chart = dynamic(() => import('@/components/Chart'), { ssr: false });

interface PerformanceTabProps {
  selectedPlayer: string;
  playerSegments: PlayerSegmentRow[];
  playerCoreStats: PlayerCoreStats;
}

export function PerformanceTab({ selectedPlayer, playerSegments, playerCoreStats }: PerformanceTabProps) {
  const hitDistribution = useMemo(() => {
    return computeHitDistribution(selectedPlayer, playerSegments, playerCoreStats.playerThrows);
  }, [selectedPlayer, playerSegments, playerCoreStats.playerThrows]);

  const scoreDistributionData = useMemo(() => {
    return computeScoreDistributionChartData(playerCoreStats.scoreDistribution);
  }, [playerCoreStats.scoreDistribution]);

  return (
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
  );
}
