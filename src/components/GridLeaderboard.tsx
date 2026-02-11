"use client";

import { useMemo } from 'react';
import { Grid, type GridOptions } from '@highcharts/grid-pro-react';
import '@highcharts/grid-pro/css/grid-pro.css';
import { useLeaderboardData } from '@/hooks/useLeaderboardData';
import { getEloTier } from '@/utils/eloRating';

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

type MergedPlayer = {
  display_name: string;
  wins: number | null;
  avg_per_turn: number | null;
  elo_1v1: number | null;
  elo_1v1_tier: string;
  elo_multi: number | null;
  elo_multi_tier: string;
};

export function GridLeaderboard() {
  const { leaders, eloLeaders, eloMultiLeaders, loading } = useLeaderboardData();

  const merged = useMemo(() => {
    const map = new Map<string, MergedPlayer>();

    const getOrCreate = (id: string, name: string): MergedPlayer => {
      if (!map.has(id)) {
        map.set(id, {
          display_name: name,
          wins: null,
          avg_per_turn: null,
          elo_1v1: null,
          elo_1v1_tier: '',
          elo_multi: null,
          elo_multi_tier: '',
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
      const tier = getEloTier(entry.current_rating);
      p.elo_1v1_tier = `${tier.icon} ${tier.name}`;
    }

    for (const entry of eloMultiLeaders) {
      const p = getOrCreate(entry.player_id, entry.display_name);
      p.elo_multi = entry.current_rating;
      const tier = getEloTier(entry.current_rating);
      p.elo_multi_tier = `${tier.icon} ${tier.name}`;
    }

    return Array.from(map.values());
  }, [leaders, eloLeaders, eloMultiLeaders]);

  const options = useMemo<GridOptions>(() => {
    const player: string[] = [];
    const multiEloRaw: (number | null)[] = [];
    const multiEloTier: string[] = [];
    const elo1v1Raw: (number | null)[] = [];
    const elo1v1Tier: string[] = [];
    const winsRaw: (number | null)[] = [];
    const avgRaw: (number | null)[] = [];

    merged.forEach((row) => {
      player.push(row.display_name);
      multiEloRaw.push(row.elo_multi);
      multiEloTier.push(row.elo_multi_tier || '–');
      elo1v1Raw.push(row.elo_1v1);
      elo1v1Tier.push(row.elo_1v1_tier || '–');
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
          multiEloTier,
          elo1v1,
          elo1v1Tier,
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
          id: 'multiEloTier',
          header: { format: 'Tier' },
          sorting: { enabled: false },
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
          id: 'elo1v1Tier',
          header: { format: 'Tier' },
          sorting: { enabled: false },
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
          columns: [{ columnId: 'multiElo' }, { columnId: 'multiEloTier' }],
        },
        {
          format: '1v1 ELO',
          columns: [{ columnId: 'elo1v1' }, { columnId: 'elo1v1Tier' }],
        },
        { columnId: 'wins' },
        { columnId: 'avg' },
      ],
      rendering: {
        rows: {
          strictHeights: true,
          minVisibleRows: 10,
        },
      },
      lang: {
        noData: 'No leaderboard data yet. Play some matches!',
      },
    };
  }, [merged]);

  if (loading) {
    return <div className="text-muted-foreground text-sm py-4">Loading leaderboard...</div>;
  }

  return (
    <div className="grid-leaderboard" style={{ maxHeight: 2000, overflow: 'auto' }}>
      <style>{`
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
      <Grid options={options} />
    </div>
  );
}
