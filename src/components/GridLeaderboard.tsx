"use client";

import { useEffect, useMemo, useState } from 'react';
import Highcharts from 'highcharts';
import { Grid, type GridOptions } from '@highcharts/grid-pro-react';
import SparklineRenderer from '@highcharts/grid-pro/es-modules/Grid/Pro/CellRendering/Renderers/SparklineRenderer';
import '@highcharts/grid-pro/css/grid-pro.css';
import { useLeaderboardData } from '@/hooks/useLeaderboardData';
import { batchEloHistory, batchMultiEloHistory } from '@/utils/eloHistory';

SparklineRenderer.useHighcharts(Highcharts);

const MEDALS = ['🥇', '🥈', '🥉'];

/**
 * For an array of nullable numbers, return a Map from row-index to medal string
 * for the top 3 values (descending). Nulls are ignored.
 */
function rankColumn(values: (number | null)[]): Map<number, string> {
  const indexed = values
    .map((v, i) => ({ v, i }))
    .filter((x): x is { v: number; i: number } => x.v != null)
    .sort((a, b) => b.v - a.v);

  const map = new Map<number, string>();
  for (let r = 0; r < Math.min(3, indexed.length); r++) {
    map.set(indexed[r].i, MEDALS[r]);
  }
  return map;
}

function formatWithMedal(value: number | null, medals: Map<number, string>, idx: number, decimals?: number): string {
  if (value == null) return '–';
  const display = decimals != null ? value.toFixed(decimals) : String(value);
  const medal = medals.get(idx);
  return medal ? `${medal} ${display}` : display;
}

function sparklineChartOptions(this: { value: unknown }, _data: unknown) {
  const raw = String(this.value).trim();
  if (!raw) return {};
  const nums = raw.split(',').map(Number);
  const positive = nums.length > 1 && nums[nums.length - 1] >= nums[0];
  return {
    colors: [positive ? '#22c55e' : '#ef4444'],
  };
}

function parseSparkline(value: unknown): number[] {
  if (typeof value !== 'string') return [];
  return value
    .split(',')
    .map((part) => Number(part))
    .filter((num) => Number.isFinite(num));
}

function getTrendStrength(value: unknown): number | null {
  const points = parseSparkline(value);
  if (points.length < 2) return null;
  return points[points.length - 1] - points[0];
}

function compareTrendStrength(a: unknown, b: unknown): number {
  const aStrength = getTrendStrength(a);
  const bStrength = getTrendStrength(b);
  if (aStrength == null && bStrength == null) return 0;
  if (aStrength == null) return -1;
  if (bStrength == null) return 1;
  return bStrength - aStrength;
}

type MergedPlayer = {
  player_id: string;
  display_name: string;
  wins: number | null;
  avg_per_turn: number | null;
  elo_1v1: number | null;
  elo_multi: number | null;
};

export function GridLeaderboard() {
  const { leaders, eloLeaders, eloMultiLeaders, loading } = useLeaderboardData();
  const [eloHistory, setEloHistory] = useState<Map<string, number[]>>(new Map());
  const [multiEloHistory, setMultiEloHistory] = useState<Map<string, number[]>>(new Map());

  const merged = useMemo(() => {
    const map = new Map<string, MergedPlayer>();

    const getOrCreate = (id: string, name: string): MergedPlayer => {
      if (!map.has(id)) {
        map.set(id, {
          player_id: id,
          display_name: name,
          wins: null,
          avg_per_turn: null,
          elo_1v1: null,
          elo_multi: null,
        });
      }
      return map.get(id)!;
    };

    for (const row of leaders) {
      const p = getOrCreate(row.player_id, row.display_name);
      p.wins = row.wins;
      p.avg_per_turn = row.avg_per_turn;
    }

    for (const entry of eloLeaders) {
      const p = getOrCreate(entry.player_id, entry.display_name);
      p.elo_1v1 = entry.current_rating;
    }

    for (const entry of eloMultiLeaders) {
      const p = getOrCreate(entry.player_id, entry.display_name);
      p.elo_multi = entry.current_rating;
    }

    return Array.from(map.values());
  }, [leaders, eloLeaders, eloMultiLeaders]);

  useEffect(() => {
    const playerIds = merged.map((p) => p.player_id);
    if (playerIds.length === 0) return;

    Promise.all([
      batchEloHistory(playerIds),
      batchMultiEloHistory(playerIds),
    ]).then(([elo, multi]) => {
      setEloHistory(elo);
      setMultiEloHistory(multi);
    });
  }, [merged]);

  const options = useMemo<GridOptions>(() => {
    const player: string[] = [];
    const multiEloRaw: (number | null)[] = [];
    const multiEloTrend: string[] = [];
    const elo1v1Raw: (number | null)[] = [];
    const elo1v1Trend: string[] = [];
    const winsRaw: (number | null)[] = [];
    const avgRaw: (number | null)[] = [];

    merged.forEach((row) => {
      player.push(row.display_name);
      multiEloRaw.push(row.elo_multi);
      multiEloTrend.push(multiEloHistory.get(row.player_id)?.join(',') ?? '');
      elo1v1Raw.push(row.elo_1v1);
      elo1v1Trend.push(eloHistory.get(row.player_id)?.join(',') ?? '');
      winsRaw.push(row.wins);
      avgRaw.push(row.avg_per_turn);
    });

    // Pre-compute per-column medals
    const multiEloMedals = rankColumn(multiEloRaw);
    const elo1v1Medals = rankColumn(elo1v1Raw);
    const winsMedals = rankColumn(winsRaw);
    const avgMedals = rankColumn(avgRaw);

    // Build display strings with medals baked in
    const multiElo = multiEloRaw.map((v, i) => formatWithMedal(v, multiEloMedals, i));
    const elo1v1 = elo1v1Raw.map((v, i) => formatWithMedal(v, elo1v1Medals, i));
    const wins = winsRaw.map((v, i) => formatWithMedal(v, winsMedals, i));
    const avg = avgRaw.map((v, i) => formatWithMedal(v, avgMedals, i, 2));

    // Empty column — CSS counters fill in the row number
    const idx = merged.map(() => '');

    return {
      dataTable: {
        columns: {
          idx,
          player,
          multiElo,
          multiEloTrend,
          elo1v1,
          elo1v1Trend,
          wins,
          avg,
        },
      },
      columns: [
        {
          id: 'idx',
          header: { format: '#' },
          width: 45,
          sorting: { enabled: false },
        },
        {
          id: 'player',
          header: { format: 'Player' },
        },
        {
          id: 'multiElo',
          header: { format: 'Rating' },
          sorting: {
            order: 'desc',
            compare: (a, b) => {
              const na = typeof a === 'string' ? parseFloat(a.replace(/[^\d]/g, '')) : NaN;
              const nb = typeof b === 'string' ? parseFloat(b.replace(/[^\d]/g, '')) : NaN;
              if (isNaN(na) && isNaN(nb)) return 0;
              if (isNaN(na)) return -1;
              if (isNaN(nb)) return 1;
              return na - nb;
            },
          },
        },
        {
          id: 'multiEloTrend',
          header: { format: 'Trend' },
          cells: {
            renderer: {
              type: 'sparkline' as const,
              chartOptions: sparklineChartOptions,
            },
          },
          sorting: {
            compare: compareTrendStrength,
          },
        },
        {
          id: 'elo1v1',
          header: { format: 'Rating' },
          sorting: {
            compare: (a, b) => {
              const na = typeof a === 'string' ? parseFloat(a.replace(/[^\d]/g, '')) : NaN;
              const nb = typeof b === 'string' ? parseFloat(b.replace(/[^\d]/g, '')) : NaN;
              if (isNaN(na) && isNaN(nb)) return 0;
              if (isNaN(na)) return -1;
              if (isNaN(nb)) return 1;
              return na - nb;
            },
          },
        },
        {
          id: 'elo1v1Trend',
          header: { format: 'Trend' },
          cells: {
            renderer: {
              type: 'sparkline' as const,
              chartOptions: sparklineChartOptions,
            },
          },
          sorting: {
            compare: compareTrendStrength,
          },
        },
        {
          id: 'wins',
          header: { format: 'Wins' },
          sorting: {
            compare: (a, b) => {
              const na = typeof a === 'string' ? parseFloat(a.replace(/[^\d]/g, '')) : NaN;
              const nb = typeof b === 'string' ? parseFloat(b.replace(/[^\d]/g, '')) : NaN;
              if (isNaN(na) && isNaN(nb)) return 0;
              if (isNaN(na)) return -1;
              if (isNaN(nb)) return 1;
              return na - nb;
            },
          },
        },
        {
          id: 'avg',
          header: { format: 'Avg Score' },
          sorting: {
            compare: (a, b) => {
              const na = typeof a === 'string' ? parseFloat(a.replace(/[^\d.]/g, '')) : NaN;
              const nb = typeof b === 'string' ? parseFloat(b.replace(/[^\d.]/g, '')) : NaN;
              if (isNaN(na) && isNaN(nb)) return 0;
              if (isNaN(na)) return -1;
              if (isNaN(nb)) return 1;
              return na - nb;
            },
          },
        },
      ],
      header: [
        { columnId: 'idx' },
        { columnId: 'player' },
        {
          format: 'Multiplayer ELO',
          columns: [{ columnId: 'multiElo' }, { columnId: 'multiEloTrend' }],
        },
        {
          format: '1v1 ELO',
          columns: [{ columnId: 'elo1v1' }, { columnId: 'elo1v1Trend' }],
        },
        { columnId: 'wins' },
        { columnId: 'avg' },
      ],
      rendering: {
        rows: {
          minVisibleRows: 12,
        },
      },
      lang: {
        noData: 'No leaderboard data yet. Play some matches!',
      },
    };
  }, [merged, eloHistory, multiEloHistory]);

  if (loading) {
    return <div className="text-muted-foreground text-sm py-4">Loading leaderboard...</div>;
  }

  return (
    <div className="grid-leaderboard">
      <style>{`
        .grid-leaderboard .grid-leaderboard__viewport {
          height: 560px;
          overflow-y: auto;
        }
        .grid-leaderboard .hcg-table tbody {
          counter-reset: row-num;
        }
        .grid-leaderboard .hcg-table tbody tr {
          counter-increment: row-num;
        }
        .grid-leaderboard .hcg-table tbody tr td:first-child {
          text-align: center;
        }
        .grid-leaderboard .hcg-table tbody tr td:first-child::after {
          content: counter(row-num);
        }
      `}</style>
      <div className="grid-leaderboard__viewport">
        <Grid options={options} />
      </div>
    </div>
  );
}
