"use client";

import { useEffect, useMemo, useState } from 'react';
import Highcharts from 'highcharts';
import { Grid, type GridOptions } from '@highcharts/grid-pro-react';
import SparklineRenderer from '@highcharts/grid-pro/es-modules/Grid/Pro/CellRendering/Renderers/SparklineRenderer';
import '@highcharts/grid-pro/css/grid-pro.css';
import { useLeaderboardData } from '@/hooks/useLeaderboardData';
import { batchEloHistory, batchMultiEloHistory } from '@/utils/eloHistory';
import { LOCATIONS, type LocationValue } from '@/utils/locations';
import { Button } from '@/components/ui/button';

SparklineRenderer['useHighcharts'](Highcharts);

const MEDALS = ['🥇', '🥈', '🥉'];

const ELO_TIER_RANGES = [
  { max: 1124, tier: 1 },
  { max: 1174, tier: 2 },
  { max: 1224, tier: 3 },
  { max: 1274, tier: 4 },
  { max: 1324, tier: 5 },
  { max: 1374, tier: 6 },
  { max: 1449, tier: 7 },
] as const;

const ELO_TIER_TEXT_OFFSET_Y: Record<number, number> = {
  1: 1,
  2: 1,
  3: 1,
  4: 0,
  5: 0,
  6: 0,
  7: 0,
  8: 0,
};

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

function getEloTierBadgeNumber(rating: number): number {
  for (const range of ELO_TIER_RANGES) {
    if (rating <= range.max) return range.tier;
  }
  return 8;
}

function renderEloBadgeHtml(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '<span class="elo-badge-empty">–</span>';
  }

  const rating = Math.round(value);
  const tier = getEloTierBadgeNumber(rating);
  const textOffsetY = ELO_TIER_TEXT_OFFSET_Y[tier] ?? 0;

  return `
    <span class="elo-badge elo-badge--tier-${tier}" style="background-image: url('/elo-badges/tier-${tier}.png');">
      <span class="elo-badge__rating" style="transform: translateY(${textOffsetY}px);">${rating}</span>
    </span>
  `;
}

function compareNullableNumbers(a: unknown, b: unknown): number {
  const na = typeof a === 'number' && Number.isFinite(a) ? a : null;
  const nb = typeof b === 'number' && Number.isFinite(b) ? b : null;
  if (na == null && nb == null) return 0;
  if (na == null) return -1;
  if (nb == null) return 1;
  return na - nb;
}

function sparklineChartOptions(this: { value: unknown }) {
  const raw = String(this.value).trim();
  if (!raw) return {};
  const nums = raw.split(',').map(Number);
  const positive = nums.length > 1 && nums[nums.length - 1] >= nums[0];
  return {
    colors: [positive ? '#22c55e' : '#ef4444'],
  };
}

function winsSparklineChartOptions(this: { value: unknown }) {
  const points = parseSparkline(this.value).map((value) => (value >= 0 ? 1 : -1));
  if (points.length === 0) return {};

  return {
    chart: {
      type: 'column',
      height: 24,
      margin: [1, 1, 1, 1],
      spacing: [0, 0, 0, 0],
    },
    legend: { enabled: false },
    tooltip: { enabled: false },
    credits: { enabled: false },
    xAxis: { visible: false },
    yAxis: {
      visible: false,
      min: -1,
      max: 1,
      startOnTick: false,
      endOnTick: false,
    },
    plotOptions: {
      series: {
        animation: false,
        enableMouseTracking: false,
      },
      column: {
        borderWidth: 0,
        pointPadding: 0.06,
        groupPadding: 0,
        threshold: 0,
      },
    },
    series: [
      {
        type: 'column',
        data: points,
        zones: [
          { value: 0, color: '#ef4444' },
          { color: '#22c55e' },
        ],
      } as Highcharts.SeriesColumnOptions,
    ],
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
  return aStrength - bStrength;
}

function getWinsFormScore(value: unknown): number | null {
  const points = parseSparkline(value);
  if (points.length === 0) return null;
  return points.reduce((sum, point) => sum + (point > 0 ? 1 : -1), 0);
}

function getWinsCount(value: unknown): number | null {
  const points = parseSparkline(value);
  if (points.length === 0) return null;
  return points.filter((point) => point > 0).length;
}

function compareWinsForm(a: unknown, b: unknown): number {
  const aScore = getWinsFormScore(a);
  const bScore = getWinsFormScore(b);
  if (aScore == null && bScore == null) return 0;
  if (aScore == null) return -1;
  if (bScore == null) return 1;
  if (aScore !== bScore) return aScore - bScore;

  const aWins = getWinsCount(a) ?? 0;
  const bWins = getWinsCount(b) ?? 0;
  return aWins - bWins;
}

type MergedPlayer = {
  player_id: string;
  display_name: string;
  location: string | null;
  wins: number | null;
  avg_per_turn: number | null;
  elo_1v1: number | null;
  elo_multi: number | null;
};

const LEADERBOARD_LOCATION_STORAGE_KEY = 'leaderboard-location-filter';

function loadLeaderboardLocations(): LocationValue[] {
  if (typeof window === 'undefined') return LOCATIONS.map((l) => l.value);
  try {
    const stored = localStorage.getItem(LEADERBOARD_LOCATION_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as LocationValue[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  return LOCATIONS.map((l) => l.value);
}

export function GridLeaderboard() {
  const { leaders, eloLeaders, eloMultiLeaders, recentWinsByPlayer, playerLocations, loading } = useLeaderboardData();
  const [eloHistory, setEloHistory] = useState<Map<string, number[]>>(new Map());
  const [multiEloHistory, setMultiEloHistory] = useState<Map<string, number[]>>(new Map());
  const [enabledLocations, setEnabledLocations] = useState<LocationValue[]>(loadLeaderboardLocations);

  useEffect(() => {
    localStorage.setItem(LEADERBOARD_LOCATION_STORAGE_KEY, JSON.stringify(enabledLocations));
  }, [enabledLocations]);

  function toggleLocation(loc: LocationValue) {
    setEnabledLocations((prev) =>
      prev.includes(loc) ? prev.filter((l) => l !== loc) : [...prev, loc]
    );
  }

  const merged = useMemo(() => {
    const map = new Map<string, MergedPlayer>();

    const getOrCreate = (id: string, name: string): MergedPlayer => {
      if (!map.has(id)) {
        map.set(id, {
          player_id: id,
          display_name: name,
          location: playerLocations.get(id) ?? null,
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
  }, [leaders, eloLeaders, eloMultiLeaders, playerLocations]);

  const filteredMerged = useMemo(() => {
    return merged.filter(
      (p) => p.location === null || enabledLocations.includes(p.location as LocationValue)
    );
  }, [merged, enabledLocations]);

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
    const location: string[] = [];
    const multiEloRaw: (number | null)[] = [];
    const multiEloTrend: string[] = [];
    const elo1v1Raw: (number | null)[] = [];
    const elo1v1Trend: string[] = [];
    const winsRaw: (number | null)[] = [];
    const winsRecent: string[] = [];
    const avgRaw: (number | null)[] = [];

    filteredMerged.forEach((row) => {
      player.push(row.display_name);
      const loc = LOCATIONS.find((l) => l.value === row.location);
      location.push(loc?.label ?? '–');
      multiEloRaw.push(row.elo_multi);
      multiEloTrend.push(multiEloHistory.get(row.player_id)?.join(',') ?? '');
      elo1v1Raw.push(row.elo_1v1);
      elo1v1Trend.push(eloHistory.get(row.player_id)?.join(',') ?? '');
      winsRaw.push(row.wins);
      winsRecent.push((recentWinsByPlayer.get(row.player_id) ?? []).slice().reverse().join(','));
      avgRaw.push(row.avg_per_turn);
    });

    // Pre-compute per-column medals
    const winsMedals = rankColumn(winsRaw);
    const avgMedals = rankColumn(avgRaw);

    // Keep Elo raw numeric for stable sorting; render badges via formatter.
    const multiElo = multiEloRaw;
    const elo1v1 = elo1v1Raw;
    const wins = winsRaw.map((v, i) => formatWithMedal(v, winsMedals, i));
    const avg = avgRaw.map((v, i) => formatWithMedal(v, avgMedals, i, 2));

    // Empty column — CSS counters fill in the row number
    const idx = filteredMerged.map(() => '');

    return {
      dataTable: {
        columns: {
          idx,
          player,
          location,
          multiElo,
          multiEloTrend,
          elo1v1,
          elo1v1Trend,
          wins,
          winsRecent,
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
          id: 'location',
          header: { format: 'Location' },
          width: 100,
        },
        {
          id: 'multiElo',
          header: { format: 'Rating' },
          width: 170,
          cells: {
            formatter: function () {
              return renderEloBadgeHtml(this.value);
            },
          },
          sorting: {
            order: 'desc',
            compare: compareNullableNumbers,
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
          width: 170,
          cells: {
            formatter: function () {
              return renderEloBadgeHtml(this.value);
            },
          },
          sorting: {
            compare: compareNullableNumbers,
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
          header: { format: 'Total' },
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
          id: 'winsRecent',
          header: { format: 'Last 10' },
          width: 140,
          cells: {
            renderer: {
              type: 'sparkline' as const,
              chartOptions: winsSparklineChartOptions,
            },
          },
          sorting: {
            compare: compareWinsForm,
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
        { columnId: 'location' },
        {
          format: 'Multiplayer Elo',
          columns: [{ columnId: 'multiElo' }, { columnId: 'multiEloTrend' }],
        },
        {
          format: '1v1 Elo',
          columns: [{ columnId: 'elo1v1' }, { columnId: 'elo1v1Trend' }],
        },
        {
          format: 'Wins',
          columns: [{ columnId: 'wins' }, { columnId: 'winsRecent' }],
        },
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
  }, [filteredMerged, eloHistory, multiEloHistory, recentWinsByPlayer]);

  if (loading) {
    return <div className="text-muted-foreground text-sm py-4">Loading leaderboard...</div>;
  }

  return (
    <div className="grid-leaderboard">
      <div className="flex gap-1 mb-3">
        {LOCATIONS.map((loc) => (
          <Button
            key={loc.value}
            type="button"
            size="sm"
            variant={enabledLocations.includes(loc.value) ? 'default' : 'outline'}
            onClick={() => toggleLocation(loc.value)}
          >
            {loc.label}
          </Button>
        ))}
      </div>
      <style>{`
        .grid-leaderboard .hcg-container {
          height: 800px;
          max-height: 800px;
          --hcg-vertical-padding: 6px;
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
        .grid-leaderboard .elo-badge {
          display: flex;
          position: relative;
          width: 132px;
          height: 32px;
          margin: 0 auto;
          align-items: center;
          justify-content: center;
          background-size: contain;
          background-repeat: no-repeat;
          background-position: center;
        }
        .grid-leaderboard .elo-badge__rating {
          display: inline-block;
          min-width: 58px;
          text-align: center;
          font-weight: 800;
          font-size: 18px;
          line-height: 1;
          letter-spacing: 0.02em;
          color: #ffffff;
          text-shadow:
            0 1px 2px rgba(0, 0, 0, 0.85),
            0 0 8px rgba(0, 0, 0, 0.45);
        }
        .grid-leaderboard .elo-badge-empty {
          color: #94a3b8;
        }
      `}</style>
      <Grid options={options} />
    </div>
  );
}
