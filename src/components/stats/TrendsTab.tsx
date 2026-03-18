import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  computeAvgScoreTrend,
  computeFirstNineTrend,
  computeAccuracy20Trend,
  computeCheckoutRateTrend,
  computeBustRateTrend,
  computeTonRateOverTime,
  computePeriodComparison,
  computeDartsPerLegTrend,
  computeTrendLine,
  computeYBounds,
} from '@/lib/stats/computations';
import type { PlayerCoreStats, LegRow, MatchRow } from '@/lib/stats/types';
import type { TrendLine } from '@/lib/stats/computations';

const Chart = dynamic(() => import('@/components/Chart'), { ssr: false });

interface TrendsTabProps {
  playerCoreStats: PlayerCoreStats;
  legs: LegRow[];
  matches: MatchRow[];
  selectedPlayer: string;
}

function DeltaIndicator({ value, suffix = '', inverted = false }: { value: number; suffix?: string; inverted?: boolean }) {
  if (value === 0) return <span className="text-muted-foreground text-sm">no change</span>;
  const isPositive = inverted ? value < 0 : value > 0;
  const arrow = value > 0 ? '↑' : '↓';
  const color = isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400';
  return (
    <span className={`text-sm font-semibold ${color}`}>
      {arrow} {Math.abs(value)}{suffix}
    </span>
  );
}

function trendDescription(trend: TrendLine, unit: string, inverted: boolean = false): string {
  if (trend.direction === 'stable') return 'Stable trend';
  const sign = trend.slopePerMonth > 0 ? '+' : '';
  const label = inverted
    ? (trend.direction === 'improving' ? 'Improving' : 'Worsening')
    : (trend.direction === 'improving' ? 'Improving' : 'Declining');
  return `${label}: ${sign}${trend.slopePerMonth} ${unit}/month`;
}

function trendColor(trend: TrendLine): string {
  if (trend.direction === 'improving') return '#22c55e';
  if (trend.direction === 'declining') return '#ef4444';
  return '#a1a1aa';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeTrendSeries(trend: TrendLine, name: string = 'Trend'): any {
  if (!trend.data.length) return null;
  return {
    type: 'line',
    name,
    data: trend.data,
    color: trendColor(trend),
    lineWidth: 2,
    dashStyle: 'LongDash',
    marker: { enabled: false },
    enableMouseTracking: false,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeAvgPlotLine(value: number, label: string): any {
  return {
    value,
    color: '#a1a1aa',
    width: 1,
    dashStyle: 'Dash',
    label: {
      text: `${label}: ${value}`,
      align: 'right',
      style: { color: '#a1a1aa', fontSize: '10px' },
    },
    zIndex: 3,
  };
}

export function TrendsTab({ playerCoreStats, legs, matches, selectedPlayer }: TrendsTabProps) {
  const { playerTurns, playerThrows, playerLegs } = playerCoreStats;
  const [ppdFinishFilter, setPpdFinishFilter] = useState<'all' | 'single_out' | 'double_out'>('all');

  const comparison = useMemo(
    () => computePeriodComparison(playerTurns, playerThrows, playerLegs, legs, matches, selectedPlayer),
    [playerTurns, playerThrows, playerLegs, legs, matches, selectedPlayer]
  );

  const avgScoreTrend = useMemo(() => computeAvgScoreTrend(playerTurns), [playerTurns]);
  const firstNineTrend = useMemo(() => computeFirstNineTrend(playerTurns, playerThrows), [playerTurns, playerThrows]);
  const accuracy20Trend = useMemo(() => computeAccuracy20Trend(playerTurns, playerThrows), [playerTurns, playerThrows]);
  const checkoutTrend = useMemo(
    () => computeCheckoutRateTrend(playerTurns, playerLegs, legs, matches, selectedPlayer),
    [playerTurns, playerLegs, legs, matches, selectedPlayer]
  );
  const bustTrend = useMemo(() => computeBustRateTrend(playerTurns), [playerTurns]);
  const tonRateData = useMemo(() => computeTonRateOverTime(playerTurns), [playerTurns]);
  const dplTrend = useMemo(
    () => computeDartsPerLegTrend(playerTurns, playerThrows, playerLegs, legs, matches, selectedPlayer, ppdFinishFilter),
    [playerTurns, playerThrows, playerLegs, legs, matches, selectedPlayer, ppdFinishFilter]
  );

  // Trendlines
  const avgScoreTrendLine = useMemo(() => computeTrendLine(avgScoreTrend.rolling), [avgScoreTrend.rolling]);
  const firstNineTrendLine = useMemo(() => computeTrendLine(firstNineTrend.rolling), [firstNineTrend.rolling]);
  const checkoutTrendLine = useMemo(() => computeTrendLine(checkoutTrend.rolling), [checkoutTrend.rolling]);
  const bustTrendLine = useMemo(() => computeTrendLine(bustTrend.rolling, true), [bustTrend.rolling]);
  const accuracy20TrendLine = useMemo(() => computeTrendLine(accuracy20Trend.rollingHitPct), [accuracy20Trend.rollingHitPct]);
  const dplTrendLine = useMemo(() => computeTrendLine(dplTrend.rolling, true), [dplTrend.rolling]);

  const avgScoreYBounds = useMemo(() => {
    return computeYBounds([...avgScoreTrend.cumulative, ...avgScoreTrend.daily, ...avgScoreTrend.rolling, ...avgScoreTrendLine.data]);
  }, [avgScoreTrend, avgScoreTrendLine]);

  const firstNineYBounds = useMemo(() => {
    return computeYBounds([...firstNineTrend.daily, ...firstNineTrend.rolling, ...firstNineTrendLine.data]);
  }, [firstNineTrend, firstNineTrendLine]);

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

  const hasPreviousData = comparison.previousAvg > 0;

  return (
    <div className="space-y-6">
      {/* Period Comparison Summary */}
      <Card>
        <CardHeader>
          <CardTitle>30-Day Progress</CardTitle>
          <CardDescription>
            {hasPreviousData
              ? 'Last 30 days compared to previous 30 days'
              : 'Last 30 days (not enough history for comparison)'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold">{comparison.recentAvg}</div>
              <div className="text-xs text-muted-foreground mb-1">Avg Score</div>
              {hasPreviousData && <DeltaIndicator value={comparison.delta} />}
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold">{comparison.recentFirst9}</div>
              <div className="text-xs text-muted-foreground mb-1">First 9 Avg</div>
              {hasPreviousData && <DeltaIndicator value={comparison.deltaFirst9} />}
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold">{comparison.recentCheckoutRate}%</div>
              <div className="text-xs text-muted-foreground mb-1">Checkout Rate</div>
              {hasPreviousData && <DeltaIndicator value={comparison.deltaCheckout} suffix="pp" />}
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold">{comparison.recentBustRate}%</div>
              <div className="text-xs text-muted-foreground mb-1">Bust Rate</div>
              {hasPreviousData && <DeltaIndicator value={comparison.deltaBust} suffix="pp" inverted />}
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold">{comparison.recentTonRate}%</div>
              <div className="text-xs text-muted-foreground mb-1">Ton+ Rate</div>
              {hasPreviousData && <DeltaIndicator value={comparison.deltaTonRate} suffix="pp" />}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Average Score Over Time */}
      <Card>
        <CardHeader>
          <CardTitle>Average Score Over Time</CardTitle>
          <CardDescription>{trendDescription(avgScoreTrendLine, 'pts')}</CardDescription>
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
              plotLines: [makeAvgPlotLine(comparison.allTimeAvg, 'All-time avg')],
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
              },
              makeTrendSeries(avgScoreTrendLine),
            ].filter(Boolean),
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
          <CardDescription>{trendDescription(firstNineTrendLine, 'pts')}</CardDescription>
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
              makeTrendSeries(firstNineTrendLine),
            ].filter(Boolean),
            legend: { enabled: true },
            tooltip: {
              shared: true,
              valueDecimals: 2,
              headerFormat: '<span style="font-size: 10px">{point.key}</span><br/>',
            },
          }} />
        </CardContent>
      </Card>

      {/* Darts Per Leg (Efficiency) */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle>Darts Per Leg</CardTitle>
              <CardDescription>
                {dplTrend.categories.length > 0
                  ? trendDescription(dplTrendLine, 'darts', true)
                  : 'Normalized to 501-equivalent (lower = better)'}
              </CardDescription>
            </div>
            <Select value={ppdFinishFilter} onValueChange={(v) => setPpdFinishFilter(v as typeof ppdFinishFilter)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All finishes</SelectItem>
                <SelectItem value="single_out">Single Out</SelectItem>
                <SelectItem value="double_out">Double Out</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {dplTrend.categories.length > 0 ? (
            <Chart options={{
              title: { text: null },
              chart: { height: 360 },
              xAxis: {
                type: 'category',
                categories: dplTrend.categories,
                title: { text: 'Date' },
                tickmarkPlacement: 'on',
                labels: {
                  step: Math.ceil((dplTrend.categories.length || 1) / 8),
                },
              },
              yAxis: {
                title: { text: 'Darts (501-equivalent)' },
                min: computeYBounds([...dplTrend.daily, ...dplTrend.rolling, ...dplTrendLine.data]).min,
                max: computeYBounds([...dplTrend.daily, ...dplTrend.rolling, ...dplTrendLine.data]).max,
                plotLines: [makeAvgPlotLine(dplTrend.allTimeAvg, 'Avg')],
                reversed: false,
              },
              series: [
                {
                  type: 'spline',
                  name: '7-day Rolling',
                  data: dplTrend.rolling,
                  color: '#8b5cf6',
                  lineWidth: 3,
                  marker: { radius: 4, symbol: 'circle' },
                },
                {
                  type: 'spline',
                  name: 'Daily',
                  data: dplTrend.daily,
                  color: '#c4b5fd',
                  dashStyle: 'ShortDash',
                  lineWidth: 1,
                  marker: { radius: 2, symbol: 'circle' },
                },
                makeTrendSeries(dplTrendLine),
              ].filter(Boolean),
              legend: { enabled: true },
              tooltip: {
                shared: true,
                valueDecimals: 1,
                valueSuffix: ' darts',
                headerFormat: '<span style="font-size: 10px">{point.key}</span><br/>',
              },
            }} />
          ) : (
            <p className="text-muted-foreground text-center py-8">No won legs found for this finish rule</p>
          )}
        </CardContent>
      </Card>

      {/* Checkout Rate Trend + Bust Rate Trend */}
      <div className="grid md:grid-cols-2 gap-6">
        {checkoutTrend.categories.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Checkout Rate Over Time</CardTitle>
              <CardDescription>{trendDescription(checkoutTrendLine, 'pp')}</CardDescription>
            </CardHeader>
            <CardContent>
              <Chart options={{
                title: { text: null },
                chart: { height: 320 },
                xAxis: {
                  type: 'category',
                  categories: checkoutTrend.categories,
                  title: { text: 'Date' },
                  tickmarkPlacement: 'on',
                  labels: {
                    step: Math.ceil((checkoutTrend.categories.length || 1) / 8),
                  },
                },
                yAxis: {
                  title: { text: 'Checkout Rate (%)' },
                  min: 0,
                  max: 100,
                },
                series: [
                  {
                    type: 'spline',
                    name: '7-day Rolling',
                    data: checkoutTrend.rolling,
                    color: '#10b981',
                    lineWidth: 3,
                    marker: { radius: 4, symbol: 'circle' },
                  },
                  {
                    type: 'spline',
                    name: 'Daily',
                    data: checkoutTrend.daily,
                    color: '#6ee7b7',
                    dashStyle: 'ShortDash',
                    lineWidth: 1,
                    marker: { radius: 2, symbol: 'circle' },
                  },
                  makeTrendSeries(checkoutTrendLine),
                ].filter(Boolean),
                legend: { enabled: true },
                tooltip: { shared: true, valueSuffix: '%', valueDecimals: 1 },
              }} />
            </CardContent>
          </Card>
        )}

        {bustTrend.categories.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Bust Rate Over Time</CardTitle>
              <CardDescription>{trendDescription(bustTrendLine, 'pp', true)}</CardDescription>
            </CardHeader>
            <CardContent>
              <Chart options={{
                title: { text: null },
                chart: { height: 320 },
                xAxis: {
                  type: 'category',
                  categories: bustTrend.categories,
                  title: { text: 'Date' },
                  tickmarkPlacement: 'on',
                  labels: {
                    step: Math.ceil((bustTrend.categories.length || 1) / 8),
                  },
                },
                yAxis: {
                  title: { text: 'Bust Rate (%)' },
                  min: 0,
                },
                series: [
                  {
                    type: 'spline',
                    name: '7-day Rolling',
                    data: bustTrend.rolling,
                    color: '#ef4444',
                    lineWidth: 3,
                    marker: { radius: 4, symbol: 'circle' },
                  },
                  {
                    type: 'spline',
                    name: 'Daily',
                    data: bustTrend.daily,
                    color: '#fca5a5',
                    dashStyle: 'ShortDash',
                    lineWidth: 1,
                    marker: { radius: 2, symbol: 'circle' },
                  },
                  makeTrendSeries(bustTrendLine),
                ].filter(Boolean),
                legend: { enabled: true },
                tooltip: { shared: true, valueSuffix: '%', valueDecimals: 1 },
              }} />
            </CardContent>
          </Card>
        )}
      </div>

      {/* 20 Bed Accuracy */}
      <Card>
        <CardHeader>
          <CardTitle>20 Bed Accuracy</CardTitle>
          <CardDescription>{trendDescription(accuracy20TrendLine, 'pp')}</CardDescription>
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
              makeTrendSeries(accuracy20TrendLine),
            ].filter(Boolean),
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

      {/* Ton Rate Over Time (normalized) */}
      <Card>
        <CardHeader>
          <CardTitle>Ton Rate Over Time</CardTitle>
          <CardDescription>Percentage of valid turns in each scoring band (normalized for volume)</CardDescription>
        </CardHeader>
        <CardContent>
          <Chart options={{
            title: { text: null },
            chart: { type: 'column', height: 380 },
            xAxis: {
              categories: tonRateData.categories,
              type: 'category',
              title: { text: 'Date' },
              labels: {
                step: Math.ceil((tonRateData.categories.length || 1) / 8),
              },
            },
            yAxis: {
              min: 0,
              title: { text: 'Rate (%)' },
            },
            legend: { enabled: true },
            tooltip: { shared: true, valueSuffix: '%' },
            plotOptions: {
              column: {
                stacking: 'normal',
                borderRadius: 2,
              },
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            series: tonRateData.series as any,
          }} />
        </CardContent>
      </Card>
    </div>
  );
}
