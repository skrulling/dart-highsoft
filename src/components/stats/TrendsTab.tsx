import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  computeTonBandsOverTime,
  computeAvgScoreTrend,
  computeFirstNineTrend,
  computeAccuracy20Trend,
  computeYBounds,
} from '@/lib/stats/computations';
import type { PlayerCoreStats } from '@/lib/stats/types';

const Chart = dynamic(() => import('@/components/Chart'), { ssr: false });

interface TrendsTabProps {
  playerCoreStats: PlayerCoreStats;
}

export function TrendsTab({ playerCoreStats }: TrendsTabProps) {
  const { playerTurns, playerThrows } = playerCoreStats;

  const tonBandsOverTimeData = useMemo(() => computeTonBandsOverTime(playerTurns), [playerTurns]);
  const avgScoreTrend = useMemo(() => computeAvgScoreTrend(playerTurns), [playerTurns]);
  const firstNineTrend = useMemo(() => computeFirstNineTrend(playerTurns, playerThrows), [playerTurns, playerThrows]);
  const accuracy20Trend = useMemo(() => computeAccuracy20Trend(playerTurns, playerThrows), [playerTurns, playerThrows]);

  const avgScoreYBounds = useMemo(() => {
    return computeYBounds([...avgScoreTrend.cumulative, ...avgScoreTrend.daily, ...avgScoreTrend.rolling]);
  }, [avgScoreTrend]);

  const firstNineYBounds = useMemo(() => {
    return computeYBounds([...firstNineTrend.daily, ...firstNineTrend.rolling]);
  }, [firstNineTrend]);

  const accuracy20YBounds = useMemo(() => {
    const values = [
      ...accuracy20Trend.hitPct,
      ...accuracy20Trend.missLeftPct,
      ...accuracy20Trend.missRightPct,
      ...accuracy20Trend.rollingHitPct,
    ];
    if (!values.length) return { min: 0, max: 100 };
    const minY = Math.min(...values, 0);
    const maxY = Math.max(...values, 100);
    return {
      min: Math.floor((minY - 5) / 5) * 5,
      max: Math.ceil((maxY + 5) / 5) * 5,
    };
  }, [accuracy20Trend]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Average Score Over Time</CardTitle>
          <CardDescription>Performance progression and consistency tracking</CardDescription>
        </CardHeader>
        <CardContent>
          <Chart options={{
            title: { text: null },
            chart: { height: 400 },
            xAxis: {
              type: 'category',
              categories: avgScoreTrend.categories,
              title: { text: 'Date' },
              tickInterval: undefined,
              tickmarkPlacement: 'on',
              labels: {
                step: Math.ceil(avgScoreTrend.categories.length / 8) || 1,
              },
            },
            yAxis: {
              title: { text: 'Average Score' },
              min: avgScoreYBounds.min,
              max: avgScoreYBounds.max,
            },
            series: [
              {
                type: 'spline',
                name: 'Cumulative Average',
                data: avgScoreTrend.cumulative,
                color: '#3b82f6',
                lineWidth: 3,
                marker: { radius: 4, symbol: 'circle' }
              },
              {
                type: 'spline',
                name: '7-day Rolling Average',
                data: avgScoreTrend.rolling,
                color: '#8b5cf6',
                dashStyle: 'Dot',
                lineWidth: 2,
                marker: { radius: 3, symbol: 'circle' }
              },
              {
                type: 'spline',
                name: 'Daily Average',
                data: avgScoreTrend.daily,
                color: '#f97316',
                dashStyle: 'ShortDash',
                lineWidth: 2,
                marker: { radius: 3, symbol: 'circle' }
              }
            ],
            legend: { enabled: true },
            tooltip: {
              shared: true,
              valueDecimals: 2,
              headerFormat: '<span style="font-size: 10px">{point.key}</span><br/>'
            },
            plotOptions: {
              spline: {
                marker: {
                  enabled: true,
                  states: { hover: { radiusPlus: 2 } }
                }
              }
            }
          }} />
        </CardContent>
      </Card>

      {/* First Nine Performance */}
      <Card>
        <CardHeader>
          <CardTitle>First Nine Average</CardTitle>
          <CardDescription>Opening three visits (first 9 darts) per day</CardDescription>
        </CardHeader>
        <CardContent>
          <Chart options={{
            title: { text: null },
            chart: { height: 360 },
            xAxis: {
              type: 'category',
              categories: firstNineTrend.categories,
              title: { text: 'Date' },
              tickmarkPlacement: 'on',
              labels: {
                step: Math.ceil((firstNineTrend.categories.length || 1) / 8),
              },
            },
            yAxis: {
              title: { text: 'First 9 Average (per 3 darts)' },
              min: firstNineYBounds.min,
              max: firstNineYBounds.max,
            },
            series: [
              {
                type: 'spline',
                name: '7-day Rolling Average',
                data: firstNineTrend.rolling,
                color: '#10b981',
                lineWidth: 3,
                marker: { radius: 4, symbol: 'circle' },
              },
              {
                type: 'spline',
                name: 'Daily Average',
                data: firstNineTrend.daily,
                color: '#0ea5e9',
                dashStyle: 'ShortDash',
                lineWidth: 2,
                marker: { radius: 3, symbol: 'circle' },
              },
            ],
            legend: { enabled: true },
            tooltip: {
              shared: true,
              valueDecimals: 2,
              headerFormat: '<span style="font-size: 10px">{point.key}</span><br/>',
            },
          }} />
        </CardContent>
      </Card>

      {/* 20 Bed Accuracy */}
      <Card>
        <CardHeader>
          <CardTitle>20 Bed Accuracy</CardTitle>
          <CardDescription>Hit rate vs. misses into 1 or 5 when aiming at 20</CardDescription>
        </CardHeader>
        <CardContent>
          <Chart options={{
            title: { text: null },
            chart: { height: 360 },
            xAxis: {
              type: 'category',
              categories: accuracy20Trend.categories,
              title: { text: 'Date' },
              tickmarkPlacement: 'on',
              labels: {
                step: Math.ceil((accuracy20Trend.categories.length || 1) / 8),
              },
            },
            yAxis: {
              title: { text: 'Percentage (%)' },
              min: accuracy20YBounds.min,
              max: accuracy20YBounds.max,
            },
            series: [
              {
                type: 'spline',
                name: '20 Hit %',
                data: accuracy20Trend.hitPct,
                color: '#f97316',
                lineWidth: 3,
                marker: { radius: 4, symbol: 'circle' },
              },
              {
                type: 'spline',
                name: 'Rolling Hit % (7d)',
                data: accuracy20Trend.rollingHitPct,
                color: '#fb923c',
                dashStyle: 'Dot',
                lineWidth: 2,
                marker: { radius: 3, symbol: 'circle' },
              },
              {
                type: 'spline',
                name: 'Miss Left (5) %',
                data: accuracy20Trend.missLeftPct,
                color: '#64748b',
                dashStyle: 'ShortDash',
                marker: { radius: 3, symbol: 'circle' },
              },
              {
                type: 'spline',
                name: 'Miss Right (1) %',
                data: accuracy20Trend.missRightPct,
                color: '#0f172a',
                dashStyle: 'ShortDashDot',
                marker: { radius: 3, symbol: 'circle' },
              },
            ],
            legend: { enabled: true },
            tooltip: {
              shared: true,
              valueSuffix: '%',
              valueDecimals: 1,
              headerFormat: '<span style="font-size: 10px">{point.key}</span><br/>',
            },
          }} />
        </CardContent>
      </Card>

      {/* Ton Bands Over Time */}
      <Card>
        <CardHeader>
          <CardTitle>Ton Bands Over Time</CardTitle>
          <CardDescription>Daily distribution of high-scoring turns</CardDescription>
        </CardHeader>
        <CardContent>
          <Chart options={{
            title: { text: null },
            chart: { type: 'column', height: 380 },
            xAxis: {
              categories: tonBandsOverTimeData.categories,
              type: 'category',
              title: { text: 'Date' },
              labels: {
                step: Math.ceil((tonBandsOverTimeData.categories.length || 1) / 8),
              },
            },
            yAxis: {
              min: 0,
              title: { text: 'Turns' },
            },
            legend: { enabled: true },
            tooltip: { shared: true },
            plotOptions: {
              column: {
                stacking: 'normal',
                borderRadius: 2,
              },
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            series: tonBandsOverTimeData.series as any,
          }} />
        </CardContent>
      </Card>
    </div>
  );
}
