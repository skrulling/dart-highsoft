"use client";

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  computePlayerCoreStats,
  computeAvgScoreTrend,
  computeFirstNineTrend,
  computeDartsPerLegTrend,
  computeCheckoutRateTrend,
  computeBustRateTrend,
  computeT20GroupingTrend,
} from '@/lib/stats/computations';
import { alignDailyTrends } from '@/lib/stats/alignTrends';
import { getPlayerColor } from '@/lib/stats/playerColors';
import type { LegRow, MatchRow, PlayerRow } from '@/lib/stats/types';
import type { PerPlayerStatsQuery } from '@/hooks/useMultiPlayerStats';

const Chart = dynamic(() => import('@/components/Chart'), { ssr: false });

type MetricKey = 'avgScore' | 'firstNine' | 'dartsPerLeg' | 'checkoutRate' | 'bustRate' | 't20Grouping';

const METRICS: Array<{ key: MetricKey; label: string; suffix?: string; decimals: number; lowerIsBetter?: boolean }> = [
  { key: 'avgScore', label: 'Average Score', decimals: 2 },
  { key: 'firstNine', label: 'First 9 Average', decimals: 2 },
  { key: 'dartsPerLeg', label: 'Darts per Leg (501-eq)', decimals: 1, lowerIsBetter: true },
  { key: 'checkoutRate', label: 'Checkout Rate', suffix: '%', decimals: 1 },
  { key: 'bustRate', label: 'Bust Rate', suffix: '%', decimals: 1, lowerIsBetter: true },
  { key: 't20Grouping', label: 'T20 Grouping (First 9)', suffix: '%', decimals: 1 },
];

interface CompareTrendChartProps {
  playerIds: string[];
  players: PlayerRow[];
  perPlayer: PerPlayerStatsQuery[];
  legs: LegRow[];
  matches: MatchRow[];
}

function computeMetricTrend(
  metric: MetricKey,
  playerId: string,
  turns: PerPlayerStatsQuery['turns'],
  throws: PerPlayerStatsQuery['throws'],
  legs: LegRow[],
  matches: MatchRow[]
): { categories: string[]; rolling: number[] } {
  const core = computePlayerCoreStats(playerId, turns, throws, legs, matches);
  switch (metric) {
    case 'avgScore': {
      const t = computeAvgScoreTrend(core.playerTurns);
      return { categories: t.categories, rolling: t.rolling };
    }
    case 'firstNine': {
      const t = computeFirstNineTrend(core.playerTurns, core.playerThrows);
      return { categories: t.categories, rolling: t.rolling };
    }
    case 'dartsPerLeg': {
      const t = computeDartsPerLegTrend(
        core.playerTurns, core.playerThrows, core.playerLegs, legs, matches, playerId, 'all'
      );
      return { categories: t.categories, rolling: t.rolling };
    }
    case 'checkoutRate': {
      const t = computeCheckoutRateTrend(core.playerTurns, core.playerLegs, legs, matches, playerId);
      return { categories: t.categories, rolling: t.rolling };
    }
    case 'bustRate': {
      const t = computeBustRateTrend(core.playerTurns);
      return { categories: t.categories, rolling: t.rolling };
    }
    case 't20Grouping': {
      const t = computeT20GroupingTrend(core.playerTurns, core.playerThrows);
      return { categories: t.categories, rolling: t.rolling };
    }
  }
}

export function CompareTrendChart({ playerIds, players, perPlayer, legs, matches }: CompareTrendChartProps) {
  const [metric, setMetric] = useState<MetricKey>('avgScore');
  const metricMeta = METRICS.find(m => m.key === metric)!;

  const playerById = useMemo(() => {
    const m = new Map<string, PlayerRow>();
    for (const p of players) m.set(p.id, p);
    return m;
  }, [players]);

  const series = useMemo(() => {
    const perPlayerTrend = perPlayer.map((q) => {
      if (q.status !== 'success') return { categories: [] as string[], rolling: [] as number[] };
      return computeMetricTrend(metric, q.playerId, q.turns, q.throws, legs, matches);
    });

    const aligned = alignDailyTrends(
      perPlayerTrend.map(t => ({ categories: t.categories, values: t.rolling }))
    );

    return aligned.seriesData.map((data, i) => {
      const id = playerIds[i];
      const name = playerById.get(id)?.display_name ?? 'Unknown';
      return {
        type: 'spline' as const,
        name,
        data,
        color: getPlayerColor(i),
        lineWidth: 2.5,
        marker: { enabled: false },
        connectNulls: false,
      };
    });
  }, [metric, perPlayer, legs, matches, playerIds, playerById]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <CardTitle>Trend Comparison</CardTitle>
            <CardDescription>
              7-day rolling average{metricMeta.lowerIsBetter ? ' (lower is better)' : ''}
            </CardDescription>
          </div>
          <Select value={metric} onValueChange={(v) => setMetric(v as MetricKey)}>
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {METRICS.map(m => (
                <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <Chart options={{
          title: { text: null },
          chart: { height: 420 },
          xAxis: {
            type: 'datetime',
            title: { text: 'Date' },
          },
          yAxis: {
            title: { text: metricMeta.label },
            ...(metric === 'checkoutRate' || metric === 'bustRate' || metric === 't20Grouping' ? { min: 0, max: 100 } : {}),
          },
          series,
          legend: { enabled: true },
          tooltip: {
            shared: true,
            valueDecimals: metricMeta.decimals,
            valueSuffix: metricMeta.suffix ?? '',
            xDateFormat: '%Y-%m-%d',
          },
        }} />
      </CardContent>
    </Card>
  );
}
