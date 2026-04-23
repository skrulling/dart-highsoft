"use client";

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  computePlayerCoreStats,
  computeDartsPerLegTrend,
  computeTonCounts,
} from '@/lib/stats/computations';
import { getPlayerColor } from '@/lib/stats/playerColors';
import type { LegRow, MatchRow, PlayerRow, TurnRow, ThrowRow } from '@/lib/stats/types';
import type { PerPlayerStatsQuery } from '@/hooks/useMultiPlayerStats';

interface CompareKpiTableProps {
  playerIds: string[];
  players: PlayerRow[];
  perPlayer: PerPlayerStatsQuery[];
  legs: LegRow[];
  matches: MatchRow[];
}

type Row = {
  gamesPlayed: number;
  gameWinRate: number;
  legWinRate: number;
  avgScore: number;
  avgScore30: number;
  first9: number;
  first9_30: number;
  t20Grouping: number;
  t20Grouping30: number;
  checkoutRate: number;
  bustRate: number;
  dartsPerLeg: number;
  count180: number;
  highestCheckout: number;
};

const T20_GROUP_SEGMENTS = new Set([
  '20', 'S20', 'D20', 'T20',
  '1',  'S1',  'D1',  'T1',
  '5',  'S5',  'D5',  'T5',
]);

function computeT20GroupingAllTime(turns: TurnRow[], throws: ThrowRow[]): number {
  const turnsByLeg = new Map<string, TurnRow[]>();
  for (const t of turns) {
    let arr = turnsByLeg.get(t.leg_id);
    if (!arr) { arr = []; turnsByLeg.set(t.leg_id, arr); }
    arr.push(t);
  }

  const firstNineTurnIds = new Set<string>();
  for (const legTurns of turnsByLeg.values()) {
    const sorted = [...legTurns].sort((a, b) => a.turn_number - b.turn_number).slice(0, 3);
    for (const t of sorted) firstNineTurnIds.add(t.id);
  }

  let hits = 0, total = 0;
  for (const th of throws) {
    if (!firstNineTurnIds.has(th.turn_id)) continue;
    if (!th.segment) continue;
    total++;
    if (T20_GROUP_SEGMENTS.has(th.segment)) hits++;
  }
  return total > 0 ? Math.round((hits / total) * 1000) / 10 : 0;
}

function computeFirst9(turns: TurnRow[], throws: ThrowRow[]): number {
  const throwsByTurn = new Map<string, number>();
  for (const th of throws) throwsByTurn.set(th.turn_id, (throwsByTurn.get(th.turn_id) ?? 0) + 1);

  const turnsByLeg = new Map<string, TurnRow[]>();
  for (const t of turns) {
    let arr = turnsByLeg.get(t.leg_id);
    if (!arr) { arr = []; turnsByLeg.set(t.leg_id, arr); }
    arr.push(t);
  }

  let totalF9 = 0, countF9 = 0;
  for (const legTurns of turnsByLeg.values()) {
    const sorted = [...legTurns].sort((a, b) => a.turn_number - b.turn_number).slice(0, 3);
    let pts = 0, darts = 0;
    for (const t of sorted) {
      darts += throwsByTurn.get(t.id) ?? 3;
      pts += t.busted ? 0 : t.total_scored;
    }
    if (darts > 0) {
      totalF9 += (pts / darts) * 3;
      countF9++;
    }
  }
  return countF9 > 0 ? Math.round((totalF9 / countF9) * 100) / 100 : 0;
}

function computeRow(
  playerId: string,
  turns: TurnRow[],
  throws: ThrowRow[],
  legs: LegRow[],
  matches: MatchRow[]
): Row {
  const core = computePlayerCoreStats(playerId, turns, throws, legs, matches);
  const dplTrend = computeDartsPerLegTrend(
    core.playerTurns, core.playerThrows, core.playerLegs, legs, matches, playerId, 'all'
  );
  const tons = computeTonCounts(core.playerTurns);
  const bustRate = core.playerTurns.length > 0
    ? Math.round((core.playerTurns.filter(t => t.busted).length / core.playerTurns.length) * 1000) / 10
    : 0;
  const first9 = computeFirst9(core.playerTurns, core.playerThrows);
  const t20Grouping = computeT20GroupingAllTime(core.playerTurns, core.playerThrows);

  // Last-30-days slice
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recentTurns = core.playerTurns.filter(t => new Date(t.created_at).getTime() >= cutoff);
  const recentTurnIds = new Set(recentTurns.map(t => t.id));
  const recentThrows = core.playerThrows.filter(th => recentTurnIds.has(th.turn_id));
  const validRecent = recentTurns.filter(t => !t.busted);
  const avgScore30 = validRecent.length > 0
    ? Math.round((validRecent.reduce((s, t) => s + t.total_scored, 0) / validRecent.length) * 100) / 100
    : 0;
  const first9_30 = computeFirst9(recentTurns, recentThrows);
  const t20Grouping30 = computeT20GroupingAllTime(recentTurns, recentThrows);

  return {
    gamesPlayed: core.gamesPlayed,
    gameWinRate: core.gameWinRate,
    legWinRate: core.legWinRate,
    avgScore: core.avgScore,
    avgScore30,
    first9,
    first9_30,
    t20Grouping,
    t20Grouping30,
    checkoutRate: core.checkoutRate,
    bustRate,
    dartsPerLeg: dplTrend.allTimeAvg,
    count180: tons.ton180,
    highestCheckout: core.highestCheckout,
  };
}

const COLUMNS: Array<{ key: keyof Row; label: string; suffix?: string; decimals?: number; higherIsBetter: boolean }> = [
  { key: 'gamesPlayed', label: 'Games', higherIsBetter: true },
  { key: 'gameWinRate', label: 'Match Win', suffix: '%', higherIsBetter: true },
  { key: 'legWinRate', label: 'Leg Win', suffix: '%', higherIsBetter: true },
  { key: 'avgScore', label: 'Avg', decimals: 2, higherIsBetter: true },
  { key: 'avgScore30', label: 'Avg 30d', decimals: 2, higherIsBetter: true },
  { key: 'first9', label: 'First 9', decimals: 2, higherIsBetter: true },
  { key: 'first9_30', label: 'First 9 30d', decimals: 2, higherIsBetter: true },
  { key: 't20Grouping', label: 'T20 Group', suffix: '%', decimals: 1, higherIsBetter: true },
  { key: 't20Grouping30', label: 'T20 Group 30d', suffix: '%', decimals: 1, higherIsBetter: true },
  { key: 'checkoutRate', label: 'Checkout', suffix: '%', higherIsBetter: true },
  { key: 'bustRate', label: 'Bust', suffix: '%', higherIsBetter: false },
  { key: 'dartsPerLeg', label: 'Darts/Leg', decimals: 1, higherIsBetter: false },
  { key: 'count180', label: '180s', higherIsBetter: true },
  { key: 'highestCheckout', label: 'Top Out', higherIsBetter: true },
];

function formatValue(value: number, col: (typeof COLUMNS)[number]): string {
  const d = col.decimals ?? 0;
  const fixed = d > 0 ? value.toFixed(d) : String(Math.round(value));
  return `${fixed}${col.suffix ?? ''}`;
}

function PlayerRowComponent({
  playerName,
  color,
  row,
  bestByKey,
}: {
  playerName: string;
  color: string;
  row: Row | null;
  bestByKey: Partial<Record<keyof Row, string>>;
}) {
  // `bestByKey` maps column key -> winning player name. The row highlights its
  // cell if it owns that winning name. We pass name rather than id because the
  // parent builds this map without needing to know about row identity.
  return (
    <tr className="border-t">
      <td className="py-2 px-3 font-medium whitespace-nowrap">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
          {playerName}
        </div>
      </td>
      {COLUMNS.map(col => (
        <td key={col.key} className="py-2 px-3 text-right tabular-nums">
          {row === null ? (
            <span className="inline-block w-12 h-4 bg-muted animate-pulse rounded" />
          ) : (
            <span className={bestByKey[col.key] === playerName ? 'font-bold text-foreground' : 'text-muted-foreground'}>
              {formatValue(row[col.key], col)}
            </span>
          )}
        </td>
      ))}
    </tr>
  );
}

export function CompareKpiTable({ playerIds, players, perPlayer, legs, matches }: CompareKpiTableProps) {
  const playerById = useMemo(() => {
    const m = new Map<string, PlayerRow>();
    for (const p of players) m.set(p.id, p);
    return m;
  }, [players]);

  // Compute row per player. Each call is memoised via JSON-stable deps on the
  // per-player query tuple so unchanged players don't recompute on picker edits.
  const rows = useMemo(() => {
    return perPlayer.map((q): Row | null => {
      if (q.status !== 'success') return null;
      return computeRow(q.playerId, q.turns, q.throws, legs, matches);
    });
  }, [perPlayer, legs, matches]);

  // Winner per column (handles ties by taking the first).
  const bestByKey = useMemo(() => {
    const out: Partial<Record<keyof Row, string>> = {};
    for (const col of COLUMNS) {
      let bestIdx = -1;
      let bestVal = col.higherIsBetter ? -Infinity : Infinity;
      rows.forEach((row, i) => {
        if (!row) return;
        const v = row[col.key];
        if ((col.higherIsBetter && v > bestVal) || (!col.higherIsBetter && v < bestVal)) {
          bestVal = v;
          bestIdx = i;
        }
      });
      if (bestIdx >= 0) {
        const winnerId = playerIds[bestIdx];
        out[col.key] = playerById.get(winnerId)?.display_name ?? '';
      }
    }
    return out;
  }, [rows, playerIds, playerById]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Head to Head</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="py-2 px-3 text-left">Player</th>
                {COLUMNS.map(col => (
                  <th key={col.key} className="py-2 px-3 text-right whitespace-nowrap">{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {playerIds.map((id, i) => {
                const player = playerById.get(id);
                if (!player) return null;
                return (
                  <PlayerRowComponent
                    key={id}
                    playerName={player.display_name}
                    color={getPlayerColor(i)}
                    row={rows[i]}
                    bestByKey={bestByKey}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
