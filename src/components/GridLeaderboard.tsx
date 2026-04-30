"use client";

import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Highcharts from 'highcharts';
import { Grid, type GridOptions } from '@highcharts/grid-pro-react';
import SparklineRenderer from '@highcharts/grid-pro/es-modules/Grid/Pro/CellRendering/Renderers/SparklineRenderer';
import '@highcharts/grid-pro/css/grid-pro.css';
import { useLeaderboardData } from '@/hooks/useLeaderboardData';
import { batchEloHistory, batchMultiEloHistory } from '@/utils/eloHistory';
import { LOCATIONS, type LocationValue } from '@/utils/locations';

SparklineRenderer['useHighcharts'](Highcharts);

const MEDALS = ['🥇', '🥈', '🥉'];
const TREND_UP_COLOR = '#2ff084';
const TREND_DOWN_COLOR = '#ff4d5f';

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

function renderRowRankHtml(rank: number): string {
  const top = rank <= 3 ? ' row-rank--top' : '';
  return `<span class="row-rank${top}">${rank}</span>`;
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

function renderLocationPillHtml(value: unknown): string {
  if (typeof value !== 'string' || value === '–') {
    return '<span class="location-pill-empty">–</span>';
  }

  const normalized = value.toLowerCase();
  const variant = normalized.includes('bergen')
    ? 'location-pill--blue'
    : normalized.includes('vik')
      ? 'location-pill--purple'
      : 'location-pill--neutral';

  return `<span class="location-pill ${variant}">${value}</span>`;
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
  const nums = parseSparkline(this.value);
  if (nums.length === 0) return {};

  const positive = nums.length > 1 && nums[nums.length - 1] >= nums[0];
  const lineColor = positive ? TREND_UP_COLOR : TREND_DOWN_COLOR;
  const areaColor: Highcharts.GradientColorObject = positive
    ? {
        linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
        stops: [
          [0, 'rgba(47, 240, 132, 0.28)'],
          [1, 'rgba(47, 240, 132, 0)'],
        ],
      }
    : {
        linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
        stops: [
          [0, 'rgba(255, 77, 95, 0.26)'],
          [1, 'rgba(255, 77, 95, 0)'],
        ],
      };

  return {
    colors: [lineColor],
    chart: {
      type: 'area',
      height: 34,
      margin: [2, 2, 2, 2],
      spacing: [0, 0, 0, 0],
      backgroundColor: 'transparent',
    },
    legend: { enabled: false },
    tooltip: { enabled: false },
    credits: { enabled: false },
    xAxis: { visible: false },
    yAxis: {
      visible: false,
      startOnTick: false,
      endOnTick: false,
    },
    plotOptions: {
      series: {
        animation: false,
        enableMouseTracking: false,
        marker: {
          enabled: false,
          radius: 1.8,
          states: {
            hover: { enabled: false },
          },
        },
        lineWidth: 2,
        states: {
          inactive: { opacity: 1 },
          hover: { enabled: false },
        },
      },
      area: {
        fillColor: areaColor,
        threshold: null,
      },
    },
    series: [
      {
        type: 'area',
        color: lineColor,
        fillColor: areaColor,
        data: nums,
        marker: {
          enabled: nums.length <= 1,
          fillColor: lineColor,
          lineColor,
        },
      } as Highcharts.SeriesAreaOptions,
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

function getCurrentWinStreak(points: number[]): number {
  let streak = 0;
  for (const point of points) {
    if (point <= 0) break;
    streak += 1;
  }
  return streak;
}

function buildLinePoints(values: number[] | undefined, width: number, height: number, padding: number): string {
  const safeValues = Array.isArray(values)
    ? values.filter((value) => Number.isFinite(value))
    : [];
  if (safeValues.length === 0) return '';
  if (safeValues.length === 1) return `${padding},${height - padding}`;

  const min = Math.min(...safeValues);
  const max = Math.max(...safeValues);
  const range = max - min || 1;
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;

  return safeValues
    .map((value, index) => {
      const x = padding + (index / (safeValues.length - 1)) * usableWidth;
      const y = height - padding - ((value - min) / range) * usableHeight;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

function buildLineArea(points: string, width: number, height: number, padding: number): string {
  if (!points) return '';
  const splitPoints = points.split(' ');
  const first = splitPoints[0];
  const last = splitPoints.at(-1);
  if (!first || !last) return '';
  const firstX = first.split(',')[0];
  const lastX = last.split(',')[0];
  return `${firstX},${height - padding} ${points} ${lastX},${height - padding}`;
}

function buildFormTrend(points: number[]): number[] {
  const chronological = points.slice().reverse();
  let score = 0;
  return [0, ...chronological.map((point) => {
    score += point > 0 ? 1 : -0.35;
    return score;
  })];
}

function normalizeCounts(counts: number[] | undefined, length: number): number[] {
  const normalized = Array.isArray(counts)
    ? counts.slice(0, length).map((count) => Number.isFinite(count) ? count : 0)
    : [];
  while (normalized.length < length) {
    normalized.push(0);
  }
  return normalized;
}

function renderGamesHtml(value: unknown): string {
  if (typeof value !== 'string' || !value) {
    return '<span class="games-summary-empty">–</span>';
  }

  const [winsPart, playedPart] = value.split('/');
  const wins = Number.parseInt(winsPart ?? '', 10);
  const played = Number.parseInt(playedPart ?? '', 10);
  if (!Number.isFinite(wins) || !Number.isFinite(played)) {
    return '<span class="games-summary-empty">–</span>';
  }

  return `
    <span class="games-summary">
      <span class="games-summary__wins">${wins}</span>
      <span class="games-summary__separator">/</span>
      <span class="games-summary__played">${played}</span>
    </span>
  `;
}

function compareGamesSummary(a: unknown, b: unknown): number {
  const parse = (value: unknown) => {
    if (typeof value !== 'string') return { wins: null as number | null, played: null as number | null };
    const [winsPart, playedPart] = value.split('/');
    const wins = Number.parseInt(winsPart ?? '', 10);
    const played = Number.parseInt(playedPart ?? '', 10);
    return {
      wins: Number.isFinite(wins) ? wins : null,
      played: Number.isFinite(played) ? played : null,
    };
  };

  const left = parse(a);
  const right = parse(b);
  if (left.played == null && right.played == null) return 0;
  if (left.played == null) return -1;
  if (right.played == null) return 1;
  if (left.played !== right.played) return left.played - right.played;
  return (left.wins ?? 0) - (right.wins ?? 0);
}

function renderWinRateHtml(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '<span class="win-rate-empty">–</span>';
  }

  const clamped = Math.max(0, Math.min(100, value));
  const isStrong = value >= 40;
  return `
    <span class="win-rate">
      <span class="win-rate__value ${isStrong ? 'win-rate__value--strong' : 'win-rate__value--muted'}">${value.toFixed(1)}%</span>
      <span class="win-rate__track">
        <span class="win-rate__bar ${isStrong ? 'win-rate__bar--strong' : 'win-rate__bar--muted'}" style="width: ${clamped}%;"></span>
      </span>
    </span>
  `;
}

function renderWinLossHtml(value: unknown): string {
  const points = parseSparkline(value);
  if (points.length === 0) {
    return '<span class="win-loss-empty">–</span>';
  }

  return `
    <span class="win-loss-strip" aria-label="${points.filter((point) => point > 0).length} wins in last ${points.length} games">
      ${points
        .map((point) => {
          const isWin = point > 0;
          return `<span class="win-loss-pill ${isWin ? 'win-loss-pill--win' : 'win-loss-pill--loss'}">${isWin ? 'W' : 'L'}</span>`;
        })
        .join('')}
    </span>
  `;
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
  games_played: number | null;
  game_win_rate: number | null;
  avg_per_turn: number | null;
  elo_1v1: number | null;
  elo_multi: number | null;
};

const LEADERBOARD_LOCATION_STORAGE_KEY = 'leaderboard-location-filter';
type LeaderboardLocationFilter = 'all' | LocationValue;
type MatchActivityRange = '7d' | '30d';

function loadLeaderboardLocationFilter(): LeaderboardLocationFilter {
  if (typeof window === 'undefined') return 'all';
  try {
    const stored = localStorage.getItem(LEADERBOARD_LOCATION_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as LeaderboardLocationFilter | LocationValue[];
      if (parsed === 'all') return parsed;
      if (typeof parsed === 'string' && LOCATIONS.some((loc) => loc.value === parsed)) return parsed;
      if (Array.isArray(parsed) && parsed.length === 1 && LOCATIONS.some((loc) => loc.value === parsed[0])) {
        return parsed[0];
      }
    }
  } catch { /* ignore */ }
  return 'all';
}

export function GridLeaderboard({ headerContent }: { headerContent?: React.ReactNode } = {}) {
  const {
    leaders,
    eloLeaders,
    eloMultiLeaders,
    recentWinsByPlayer,
    playerGameStats,
    playerLocations,
    matchActivity,
    weeklyEloClimber,
    loading,
  } = useLeaderboardData();
  const [locationFilter, setLocationFilter] = useState<LeaderboardLocationFilter>(loadLeaderboardLocationFilter);
  const [matchActivityRange, setMatchActivityRange] = useState<MatchActivityRange>('7d');

  useEffect(() => {
    localStorage.setItem(LEADERBOARD_LOCATION_STORAGE_KEY, JSON.stringify(locationFilter));
  }, [locationFilter]);

  const merged = useMemo(() => {
    const map = new Map<string, MergedPlayer>();

    const getOrCreate = (id: string, name: string): MergedPlayer => {
      if (!map.has(id)) {
        map.set(id, {
          player_id: id,
          display_name: name,
          location: playerLocations.get(id) ?? null,
          wins: null,
          games_played: null,
          game_win_rate: null,
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
      const gameStats = playerGameStats.get(row.player_id);
      p.games_played = gameStats?.games_played ?? null;
      p.game_win_rate = gameStats?.game_win_rate ?? null;
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
  }, [leaders, eloLeaders, eloMultiLeaders, playerGameStats, playerLocations]);

  const filteredMerged = useMemo(() => {
    if (locationFilter === 'all') return merged;
    return merged.filter((p) => p.location === locationFilter);
  }, [merged, locationFilter]);

  const hotStreak = useMemo(() => {
    let best: { playerId: string; player: string; streak: number; wins: number; recent: number[] } | null = null;

    for (const row of merged) {
      const recent = recentWinsByPlayer.get(row.player_id) ?? [];
      const streak = getCurrentWinStreak(recent);
      if (streak === 0) continue;

      const wins = recent.filter((point) => point > 0).length;
      if (
        !best ||
        streak > best.streak ||
        (streak === best.streak && wins > best.wins) ||
        (streak === best.streak && wins === best.wins && row.display_name.localeCompare(best.player) < 0)
      ) {
        best = {
          playerId: row.player_id,
          player: row.display_name,
          streak,
          wins,
          recent,
        };
      }
    }

    return best;
  }, [merged, recentWinsByPlayer]);

  // Stable player ID list for query key (avoids refetch on every render)
  const playerIds = useMemo(() => merged.map((p) => p.player_id).sort(), [merged]);

  const { data: eloHistoryData } = useQuery({
    queryKey: ['eloHistory', playerIds],
    queryFn: () => Promise.all([
      batchEloHistory(playerIds),
      batchMultiEloHistory(playerIds),
    ]).then(([elo, multi]) => ({ elo, multi })),
    enabled: playerIds.length > 0,
  });

  const eloHistory = eloHistoryData?.elo ?? new Map<string, number[]>();
  const multiEloHistory = eloHistoryData?.multi ?? new Map<string, number[]>();
  const hotStreakLinePoints = buildLinePoints(
    hotStreak ? buildFormTrend(hotStreak.recent) : [],
    150,
    42,
    3
  );
  const hotStreakAreaPoints = buildLineArea(hotStreakLinePoints, 150, 42, 3);
  const climberHistory = weeklyEloClimber
    ? weeklyEloClimber.rating_history ?? [0, weeklyEloClimber.rating_change]
    : [];
  const climberLinePoints = buildLinePoints(climberHistory, 150, 42, 3);
  const climberAreaPoints = buildLineArea(climberLinePoints, 150, 42, 3);
  const selectedMatchTotal = matchActivityRange === '7d'
    ? matchActivity.sevenDayTotal
    : matchActivity.thirtyDayTotal;
  const selectedMatchDelta = matchActivityRange === '7d'
    ? matchActivity.sevenDayDelta
    : matchActivity.thirtyDayDelta;
  const selectedMatchCounts = matchActivityRange === '7d'
    ? matchActivity.sevenDayCounts
    : matchActivity.thirtyDayCounts;
  const safeMatchCounts = normalizeCounts(selectedMatchCounts, matchActivityRange === '7d' ? 7 : 30);
  const maxMatchCount = Math.max(...safeMatchCounts, 1);

  const options = useMemo<GridOptions>(() => {
    const player: string[] = [];
    const location: string[] = [];
    const multiEloRaw: (number | null)[] = [];
    const multiEloTrend: string[] = [];
    const elo1v1Raw: (number | null)[] = [];
    const elo1v1Trend: string[] = [];
    const winsRecent: string[] = [];
    const gamesSummary: string[] = [];
    const gameWinRateRaw: (number | null)[] = [];
    const avgRaw: (number | null)[] = [];

    filteredMerged.forEach((row) => {
      player.push(row.display_name);
      const loc = LOCATIONS.find((l) => l.value === row.location);
      location.push(loc?.label ?? '–');
      multiEloRaw.push(row.elo_multi);
      multiEloTrend.push(multiEloHistory.get(row.player_id)?.join(',') ?? '');
      elo1v1Raw.push(row.elo_1v1);
      elo1v1Trend.push(eloHistory.get(row.player_id)?.join(',') ?? '');
      winsRecent.push((recentWinsByPlayer.get(row.player_id) ?? []).slice().reverse().join(','));
      gamesSummary.push(row.wins != null && row.games_played != null ? `${row.wins}/${row.games_played}` : '');
      gameWinRateRaw.push(row.game_win_rate);
      avgRaw.push(row.avg_per_turn);
    });

    // Pre-compute per-column medals
    const avgMedals = rankColumn(avgRaw);

    // Keep Elo raw numeric for stable sorting; render badges via formatter.
    const multiElo = multiEloRaw;
    const elo1v1 = elo1v1Raw;
    const avg = avgRaw.map((v, i) => formatWithMedal(v, avgMedals, i, 2));

    // Empty column — CSS counters fill in the row number
    const idx = filteredMerged.map(() => '');

    return {
      columnDefaults: {
        filtering: { enabled: true },
      },
      dataTable: {
        columns: {
          idx,
          player,
          location,
          multiElo,
          multiEloTrend,
          elo1v1,
          elo1v1Trend,
          winsRecent,
          gamesSummary,
          gameWinRate: gameWinRateRaw,
          avg,
        },
      },
      columns: [
        {
          id: 'idx',
          header: { format: '#' },
          width: 45,
          sorting: { enabled: false },
          filtering: { enabled: false },
          cells: {
            formatter: function () {
              const rowIndex = (this.row as unknown as { index: number }).index;
              return renderRowRankHtml(rowIndex + 1);
            },
          },
        },
        {
          id: 'player',
          header: { format: 'Player' },
        },
        {
          id: 'location',
          header: { format: 'Location' },
          width: 100,
          cells: {
            formatter: function () {
              return renderLocationPillHtml(this.value);
            },
          },
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
            orderSequence: ['desc', 'asc', null]
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
            orderSequence: ['desc', 'asc', null]
          },
          filtering: { enabled: false },
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
            orderSequence: ['desc', 'asc', null]
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
            orderSequence: ['desc', 'asc', null]
          },
          filtering: { enabled: false },
        },
        {
          id: 'winsRecent',
          header: { format: 'Last 10' },
          width: 160,
          cells: {
            formatter: function () {
              return renderWinLossHtml(this.value);
            },
          },
          sorting: {
            compare: compareWinsForm,
          },
          filtering: { enabled: false },
        },
        {
          id: 'gamesSummary',
          header: { format: 'Games' },
          width: 110,
          cells: {
            formatter: function () {
              return renderGamesHtml(this.value);
            },
          },
          sorting: {
            compare: compareGamesSummary,
            orderSequence: ['desc', 'asc', null]
          },
        },
        {
          id: 'gameWinRate',
          header: { format: 'Win Rate' },
          width: 130,
          cells: {
            formatter: function () {
              return renderWinRateHtml(this.value);
            },
          },
          sorting: {
            compare: compareNullableNumbers,
            orderSequence: ['desc', 'asc', null]
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
            orderSequence: ['desc', 'asc', null]
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
          format: 'Games',
          columns: [
            { columnId: 'gamesSummary' },
            { columnId: 'gameWinRate' },
            { columnId: 'winsRecent' },
          ],
        },
        { columnId: 'avg' },
      ],
      rendering: {
        rows: {
          minVisibleRows: 12,
        },
      },
      responsive: {
        rules: [{
          condition: {
            maxWidth: 800
          },
          gridOptions: {
            header: [
              { columnId: 'idx' },
              { columnId: 'player' },
              { columnId: 'multiElo' },
              { columnId: 'elo1v1' },
            ],
            columns: [
              {
                id: 'player',
                width: 110,
              },
            ],
          }
        }]
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
      <div className="leaderboard-header">
        <div className="leaderboard-heading">{headerContent}</div>
        <div className="leaderboard-kpis" aria-label="Leaderboard overview">
          <div className="leaderboard-kpi">
            <div className="leaderboard-kpi__topline">
              <span className="leaderboard-kpi__label">Hot streak</span>
              {hotStreak && <span className="leaderboard-kpi__badge leaderboard-kpi__badge--hot">🔥 On fire</span>}
            </div>
            <div className="leaderboard-kpi__headline">
              {hotStreak ? `${hotStreak.player} · ${hotStreak.streak}W` : '–'}
            </div>
            <svg className="leaderboard-kpi__chart" viewBox="0 0 150 42" aria-hidden="true">
              <defs>
                <linearGradient id="hot-streak-fill-compact" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ff7a18" stopOpacity="0.26" />
                  <stop offset="100%" stopColor="#ff7a18" stopOpacity="0" />
                </linearGradient>
              </defs>
              {hotStreakAreaPoints && <polygon points={hotStreakAreaPoints} fill="url(#hot-streak-fill-compact)" />}
              {hotStreakLinePoints && <polyline points={hotStreakLinePoints} fill="none" stroke="#ff7a18" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
              {hotStreakLinePoints && <circle cx={hotStreakLinePoints.split(' ').at(-1)?.split(',')[0]} cy={hotStreakLinePoints.split(' ').at(-1)?.split(',')[1]} r="2.2" fill="#ff7a18" />}
            </svg>
            <div className="leaderboard-kpi__axis">
              <span>Oldest</span>
              <span>Latest</span>
            </div>
          </div>
          <div className="leaderboard-kpi leaderboard-kpi--wide">
            <div className="leaderboard-kpi__topline">
              <span className="leaderboard-kpi__label">
                {matchActivityRange === '7d' ? 'Matches last 7 days' : 'Matches last 30 days'}
              </span>
              <span className="leaderboard-kpi__toggle" aria-label="Select match activity range" role="group">
                <button
                  type="button"
                  className={matchActivityRange === '7d' ? 'leaderboard-kpi__toggle-option leaderboard-kpi__toggle-option--active' : 'leaderboard-kpi__toggle-option'}
                  onClick={() => setMatchActivityRange('7d')}
                >
                  7d
                </button>
                <button
                  type="button"
                  className={matchActivityRange === '30d' ? 'leaderboard-kpi__toggle-option leaderboard-kpi__toggle-option--active' : 'leaderboard-kpi__toggle-option'}
                  onClick={() => setMatchActivityRange('30d')}
                >
                  30d
                </button>
              </span>
            </div>
            <div className="leaderboard-kpi__metric">
              <span>{selectedMatchTotal}</span>
              {selectedMatchDelta !== 0 && (
                <span className={selectedMatchDelta > 0 ? 'leaderboard-kpi__delta' : 'leaderboard-kpi__delta leaderboard-kpi__delta--down'}>
                  {selectedMatchDelta > 0 ? '+' : ''}{selectedMatchDelta} vs prev
                </span>
              )}
            </div>
            <div className={matchActivityRange === '30d' ? 'leaderboard-kpi__bars leaderboard-kpi__bars--dense' : 'leaderboard-kpi__bars'} aria-hidden="true">
              {safeMatchCounts.map((count, index) => (
                <span
                  key={`${matchActivityRange}-${index}`}
                  className={matchActivityRange === '7d' && index >= 5 ? 'leaderboard-kpi__bar leaderboard-kpi__bar--weekend' : 'leaderboard-kpi__bar'}
                  style={{ height: `${Math.max(8, (count / maxMatchCount) * 32)}px` }}
                />
              ))}
            </div>
          </div>
          <div className="leaderboard-kpi">
            <div className="leaderboard-kpi__topline">
              <span className="leaderboard-kpi__label">Biggest climber</span>
              {weeklyEloClimber && <span className="leaderboard-kpi__badge leaderboard-kpi__badge--climber">▲</span>}
            </div>
            <div className="leaderboard-kpi__headline">
              {weeklyEloClimber ? weeklyEloClimber.display_name : '–'}
            </div>
            <div className="leaderboard-kpi__subvalue leaderboard-kpi__subvalue--positive">
              {weeklyEloClimber ? `+${weeklyEloClimber.rating_change} Elo` : 'No gain yet'}
            </div>
            <svg className="leaderboard-kpi__chart" viewBox="0 0 150 42" aria-hidden="true">
              <defs>
                <linearGradient id="climber-fill-compact" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#35f58c" stopOpacity="0.24" />
                  <stop offset="100%" stopColor="#35f58c" stopOpacity="0" />
                </linearGradient>
              </defs>
              {climberAreaPoints && <polygon points={climberAreaPoints} fill="url(#climber-fill-compact)" />}
              {climberLinePoints && <polyline points={climberLinePoints} fill="none" stroke="#35f58c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
              {climberLinePoints && <circle cx={climberLinePoints.split(' ').at(-1)?.split(',')[0]} cy={climberLinePoints.split(' ').at(-1)?.split(',')[1]} r="2.2" fill="#35f58c" />}
            </svg>
            <div className="leaderboard-kpi__axis">
              <span>7d ago</span>
              <span>Now</span>
            </div>
          </div>
        </div>
      </div>

      <div className="leaderboard-toolbar">
        <div />
        <div className="leaderboard-actions">
          <div className="location-filter-tabs" aria-label="Filter leaderboard by location">
            <button
              type="button"
              className={locationFilter === 'all' ? 'location-filter-tab location-filter-tab--active' : 'location-filter-tab'}
              onClick={() => setLocationFilter('all')}
            >
              All
            </button>
            {LOCATIONS.map((loc) => (
              <button
                key={loc.value}
                type="button"
                className={locationFilter === loc.value ? 'location-filter-tab location-filter-tab--active' : 'location-filter-tab'}
                onClick={() => setLocationFilter(loc.value)}
              >
                {loc.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <style>{`
        .grid-leaderboard {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .leaderboard-header {
          display: grid;
          grid-template-columns: minmax(300px, 1fr) minmax(620px, 720px);
          gap: 28px;
          align-items: end;
        }
        .leaderboard-kpis {
          display: grid;
          grid-template-columns: 1fr 1.18fr 1fr;
          gap: 8px;
          justify-self: end;
          width: min(100%, 720px);
        }
        .leaderboard-kpi {
          position: relative;
          min-height: 132px;
          overflow: hidden;
          border: 1px solid rgba(148, 163, 184, 0.13);
          border-radius: 8px;
          background:
            linear-gradient(180deg, rgba(17, 24, 39, 0.92), rgba(10, 17, 27, 0.92)),
            rgba(15, 23, 42, 0.68);
          padding: 13px 14px;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
        }
        .leaderboard-kpi__topline {
          display: flex;
          min-height: 13px;
          align-items: flex-start;
          justify-content: space-between;
          gap: 8px;
        }
        .leaderboard-kpi__label {
          display: block;
          color: #858b94;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0;
          line-height: 1.15;
          text-transform: uppercase;
        }
        .leaderboard-kpi__badge {
          display: inline-flex;
          min-width: 0;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          padding: 4px 8px;
          font-size: 10px;
          font-weight: 900;
          line-height: 1;
          text-transform: uppercase;
          white-space: nowrap;
        }
        .leaderboard-kpi__badge--hot {
          color: #ff8b2b;
          background: rgba(255, 122, 24, 0.11);
          border: 1px solid rgba(255, 122, 24, 0.28);
          box-shadow: inset 0 0 16px rgba(255, 122, 24, 0.08);
        }
        .leaderboard-kpi__badge--climber {
          color: #35f58c;
          background: rgba(47, 240, 132, 0.1);
          border: 1px solid rgba(47, 240, 132, 0.26);
          box-shadow: inset 0 0 16px rgba(47, 240, 132, 0.08);
        }
        .leaderboard-kpi__headline {
          position: relative;
          z-index: 1;
          margin-top: 6px;
          overflow: hidden;
          color: #f8fafc;
          font-size: 18px;
          font-weight: 900;
          line-height: 1.08;
          letter-spacing: 0;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .leaderboard-kpi__metric {
          display: flex;
          min-width: 0;
          align-items: baseline;
          gap: 8px;
          margin-top: 6px;
          color: #f8fafc;
          font-size: 26px;
          font-weight: 900;
          line-height: 1;
          letter-spacing: 0;
        }
        .leaderboard-kpi__subvalue {
          margin-top: 3px;
          color: #94a3b8;
          font-size: 12px;
          font-weight: 800;
          line-height: 1.1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .leaderboard-kpi__subvalue--positive {
          color: #35f58c;
        }
        .leaderboard-kpi__delta {
          color: #35f58c;
          font-size: 11px;
          font-weight: 900;
        }
        .leaderboard-kpi__delta--down {
          color: #ff6b78;
        }
        .leaderboard-kpi__toggle {
          display: inline-flex;
          height: 21px;
          overflow: hidden;
          border: 1px solid rgba(148, 163, 184, 0.15);
          border-radius: 6px;
          background: rgba(15, 23, 42, 0.7);
        }
        .leaderboard-kpi__toggle-option {
          display: inline-flex;
          min-width: 31px;
          align-items: center;
          justify-content: center;
          border: 0;
          background: transparent;
          color: #7f8998;
          cursor: pointer;
          font-size: 11px;
          font-weight: 900;
          line-height: 1;
        }
        .leaderboard-kpi__toggle-option--active {
          color: #e5edf7;
          background: rgba(148, 163, 184, 0.13);
        }
        .leaderboard-kpi__chart {
          position: absolute;
          right: 14px;
          bottom: 20px;
          left: 14px;
          width: calc(100% - 28px);
          height: 42px;
          overflow: visible;
        }
        .leaderboard-kpi__axis {
          position: absolute;
          right: 14px;
          bottom: 9px;
          left: 14px;
          display: flex;
          justify-content: space-between;
          color: #6f7886;
          font-size: 9px;
          font-weight: 800;
          line-height: 1;
        }
        .leaderboard-kpi__bars {
          position: absolute;
          right: 14px;
          bottom: 18px;
          left: 14px;
          display: grid;
          height: 36px;
          grid-template-columns: repeat(7, minmax(0, 1fr));
          gap: 5px;
          align-items: end;
        }
        .leaderboard-kpi__bars--dense {
          grid-template-columns: repeat(30, minmax(0, 1fr));
          gap: 1px;
        }
        .leaderboard-kpi__bar {
          display: block;
          border-radius: 2px 2px 0 0;
          background: #315e84;
        }
        .leaderboard-kpi__bar--weekend {
          background: #5ab7ff;
        }
        .leaderboard-toolbar {
          display: flex;
          gap: 16px;
          align-items: center;
          justify-content: space-between;
        }
        .leaderboard-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: center;
          justify-content: flex-end;
        }
        .location-filter-tabs {
          display: inline-flex;
          overflow: hidden;
          border: 1px solid rgba(148, 163, 184, 0.13);
          border-radius: 8px;
          background: rgba(15, 23, 42, 0.48);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
        }
        .location-filter-tab {
          display: inline-flex;
          height: 34px;
          align-items: center;
          justify-content: center;
          border: 0;
          border-right: 1px solid rgba(148, 163, 184, 0.13);
          background: transparent;
          color: #a3aab5;
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0;
          line-height: 1;
          text-decoration: none;
          transition: background-color 140ms ease, color 140ms ease;
        }
        .location-filter-tab {
          min-width: 60px;
          padding: 0 14px;
          cursor: pointer;
        }
        .location-filter-tab:last-child {
          border-right: 0;
        }
        .location-filter-tab:hover {
          color: #e2e8f0;
          background: rgba(148, 163, 184, 0.08);
        }
        .location-filter-tab--active {
          color: #70bdff;
          background: rgba(56, 189, 248, 0.16);
        }
        @media (max-width: 1100px) {
          .leaderboard-header {
            grid-template-columns: 1fr;
          }
          .leaderboard-kpis {
            justify-self: stretch;
            width: 100%;
          }
        }
        @media (max-width: 800px) {
          .leaderboard-kpis {
            grid-template-columns: 1fr;
          }
          .leaderboard-toolbar {
            align-items: flex-start;
            flex-direction: column;
          }
          .leaderboard-actions {
            width: 100%;
            justify-content: flex-start;
          }
        }
        @media (max-width: 700px) {
          .leaderboard-kpis {
            gap: 8px;
          }
          .location-filter-tabs {
            width: 100%;
          }
          .location-filter-tab {
            flex: 1 1 0;
            min-width: 0;
            padding-right: 8px;
            padding-left: 8px;
          }
        }
        .grid-leaderboard .hcg-container {
          height: 800px;
          max-height: 800px;
          --hcg-vertical-padding: 6px;
        }
        .grid-leaderboard .hcg-table thead th {
          color: #858b94;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0;
          text-transform: uppercase;
        }
        .grid-leaderboard .hcg-table tbody td {
          color: #f1f5f9;
          font-size: 15px;
          font-weight: 800;
          letter-spacing: 0;
        }
        .grid-leaderboard .hcg-table tbody td:nth-child(2),
        .grid-leaderboard .hcg-table tbody td:last-child {
          color: #f8fafc !important;
          font-weight: 900 !important;
        }
        .grid-leaderboard .hcg-table tbody td:nth-child(2) *,
        .grid-leaderboard .hcg-table tbody td:last-child * {
          color: inherit !important;
          font-weight: inherit !important;
        }
        .grid-leaderboard .hcg-table tbody tr td:first-child {
          padding-right: 0 !important;
          padding-left: 0 !important;
          text-align: center !important;
          vertical-align: middle;
        }
        .grid-leaderboard .row-rank {
          display: inline-flex;
          width: 28px;
          height: 28px;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          color: #9aa4b2;
          background: rgba(30, 41, 59, 0.5);
          font-size: 13px;
          font-weight: 900;
          line-height: 1;
          margin: 0 auto;
        }
        .grid-leaderboard .row-rank--top {
          color: #f4c84a;
          background: rgba(245, 158, 11, 0.17);
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
        .grid-leaderboard .location-pill {
          display: inline-flex;
          min-width: 38px;
          height: 22px;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          padding: 0 10px;
          font-size: 12px;
          font-weight: 600;
          line-height: 1;
          letter-spacing: 0;
        }
        .grid-leaderboard .location-pill--purple {
          color: #c4a5ff;
          background: rgba(139, 92, 246, 0.14);
          border: 1px solid rgba(139, 92, 246, 0.36);
        }
        .grid-leaderboard .location-pill--blue {
          color: #60c7ff;
          background: rgba(14, 165, 233, 0.13);
          border: 1px solid rgba(14, 165, 233, 0.36);
        }
        .grid-leaderboard .location-pill--neutral {
          color: #cbd5e1;
          background: rgba(148, 163, 184, 0.12);
          border: 1px solid rgba(148, 163, 184, 0.28);
        }
        .grid-leaderboard .location-pill-empty {
          color: #94a3b8;
        }
        .grid-leaderboard .games-summary {
          display: inline-flex;
          width: 100%;
          align-items: baseline;
          justify-content: center;
          gap: 4px;
          font-weight: 800;
          letter-spacing: 0;
          color: #f8fafc;
        }
        .grid-leaderboard .games-summary__wins {
          min-width: 28px;
          text-align: right;
          font-size: 16px;
          line-height: 1;
        }
        .grid-leaderboard .games-summary__separator,
        .grid-leaderboard .games-summary__played {
          color: #8b95a5;
          font-size: 13px;
          font-weight: 700;
          line-height: 1;
        }
        .grid-leaderboard .games-summary__played {
          min-width: 30px;
          text-align: left;
        }
        .grid-leaderboard .games-summary-empty,
        .grid-leaderboard .win-rate-empty {
          color: #94a3b8;
        }
        .grid-leaderboard .win-rate {
          display: inline-flex;
          width: 100%;
          align-items: center;
          justify-content: center;
          gap: 10px;
        }
        .grid-leaderboard .win-rate__value {
          min-width: 48px;
          text-align: right;
          font-size: 13px;
          font-weight: 800;
          line-height: 1;
          letter-spacing: 0;
        }
        .grid-leaderboard .win-rate__value--strong {
          color: #35f58c;
        }
        .grid-leaderboard .win-rate__value--muted {
          color: #f8fafc;
        }
        .grid-leaderboard .win-rate__track {
          position: relative;
          display: inline-flex;
          width: 46px;
          height: 4px;
          overflow: hidden;
          border-radius: 999px;
          background: rgba(148, 163, 184, 0.12);
        }
        .grid-leaderboard .win-rate__bar {
          height: 100%;
          min-width: 3px;
          border-radius: inherit;
        }
        .grid-leaderboard .win-rate__bar--strong {
          background: #35f58c;
        }
        .grid-leaderboard .win-rate__bar--muted {
          background: #5db8ff;
        }
        .grid-leaderboard .win-loss-strip {
          display: inline-flex;
          width: 100%;
          align-items: center;
          justify-content: center;
          gap: 4px;
        }
        .grid-leaderboard .win-loss-pill {
          display: inline-flex;
          box-sizing: border-box;
          flex: 0 0 16px;
          width: 16px;
          min-width: 16px;
          max-width: 16px;
          height: 18px;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          border-radius: 4px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
          font-size: 9px;
          font-weight: 800;
          line-height: 1;
          letter-spacing: 0;
        }
        .grid-leaderboard .win-loss-pill--win {
          color: #35f58c;
          background: rgba(47, 240, 132, 0.14);
          border: 1px solid rgba(47, 240, 132, 0.24);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
        }
        .grid-leaderboard .win-loss-pill--loss {
          color: #ff6b78;
          background: rgba(255, 77, 95, 0.14);
          border: 1px solid rgba(255, 77, 95, 0.24);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
        }
        .grid-leaderboard .win-loss-empty {
          color: #94a3b8;
        }
      `}</style>
      <Grid options={options} />
    </div>
  );
}
