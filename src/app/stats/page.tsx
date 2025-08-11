"use client";

import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import { useEffect, useMemo, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabaseClient';

type PlayerRow = { id: string; display_name: string };
type SummaryRow = { player_id: string; display_name: string; wins: number; avg_per_turn: number };
type LegRow = { id: string; match_id: string; leg_number: number; created_at: string; winner_player_id: string | null };
type TurnRow = { id: string; leg_id: string; player_id: string; total_scored: number; busted: boolean };

export default function StatsPage() {
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [legs, setLegs] = useState<LegRow[]>([]);
  const [turns, setTurns] = useState<TurnRow[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const supabase = await getSupabaseClient();
        const [{ data: s }, { data: p }, { data: l }] = await Promise.all([
          supabase
            .from('player_summary')
            .select('*')
            .not('display_name', 'ilike', '%test%')
            .order('wins', { ascending: false }),
          supabase
            .from('players')
            .select('id, display_name')
            .not('display_name', 'ilike', '%test%')
            .order('display_name'),
          supabase.from('legs').select('*').order('created_at'),
        ]);
        setSummary(((s as unknown) as SummaryRow[]) ?? []);
        const pl = ((p as unknown) as PlayerRow[]) ?? [];
        setPlayers(pl);
        const lg = ((l as unknown) as LegRow[]) ?? [];
        setLegs(lg);
        if (lg.length) {
          const { data: t } = await supabase
            .from('turns')
            .select('id, leg_id, player_id, total_scored, busted')
            .in('leg_id', lg.map((x) => x.id));
          setTurns(((t as unknown) as TurnRow[]) ?? []);
        } else {
          setTurns([]);
        }
      } catch {
        setSummary([]);
        setPlayers([]);
        setLegs([]);
        setTurns([]);
      }
    })();
  }, []);

  const winsOptions: Highcharts.Options = useMemo(() => ({
    title: { text: 'Total Match Wins' },
    xAxis: { categories: summary.map((d) => d.display_name) },
    series: [
      { type: 'column', name: 'Wins', data: summary.map((d) => d.wins) },
    ],
  }), [summary]);

  const avgBarOptions: Highcharts.Options = useMemo(() => ({
    title: { text: 'Average Points per Turn (overall)' },
    xAxis: { categories: summary.map((d) => d.display_name) },
    series: [
      { type: 'column', name: 'Avg/Turn', data: summary.map((d) => Number(d.avg_per_turn.toFixed?.(2) ?? d.avg_per_turn)) },
    ],
  }), [summary]);

  // Build per-leg average over time for each player
  const perLegSeries = useMemo(() => {
    const legsSorted = [...legs].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const turnsByLeg = turns.reduce<Record<string, TurnRow[]>>((acc, t) => {
      (acc[t.leg_id] ||= []).push(t);
      return acc;
    }, {});
    const series: Highcharts.SeriesLineOptions[] = players.map((p) => ({ type: 'line', name: p.display_name, data: [] as Highcharts.PointOptionsType[] }));
    const playerIndex = new Map(players.map((p, i) => [p.id, i] as const));
    for (const leg of legsSorted) {
      const ts = new Date(leg.created_at).getTime();
      const legTurns = turnsByLeg[leg.id] ?? [];
      const byPlayer = legTurns.reduce<Record<string, { total: number; turns: number }>>((acc, t) => {
        (acc[t.player_id] ||= { total: 0, turns: 0 });
        acc[t.player_id].turns += 1;
        if (!t.busted) acc[t.player_id].total += t.total_scored;
        return acc;
      }, {});
      for (const [pid, stats] of Object.entries(byPlayer) as [string, { total: number; turns: number }][]) {
        const idx = playerIndex.get(pid);
        if (idx === undefined) continue;
        const avg = stats.turns > 0 ? stats.total / stats.turns : 0;
        (series[idx].data as Highcharts.PointOptionsType[]).push([ts, Number(avg.toFixed(2))] as Highcharts.PointOptionsType);
      }
    }
    return series;
  }, [players, legs, turns]);

  const cumulativePerPlayer = useMemo(() => {
    // For each player, build cumulative average over time (across legs)
    const legsSorted = [...legs].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const turnsByLeg = turns.reduce<Record<string, TurnRow[]>>((acc, t) => {
      (acc[t.leg_id] ||= []).push(t);
      return acc;
    }, {});
    const result: { player: PlayerRow; series: Highcharts.SeriesLineOptions }[] = [];
    for (const p of players) {
      let cumTotal = 0;
      let cumTurns = 0;
      const data: Highcharts.PointOptionsType[] = [];
      for (const leg of legsSorted) {
        const legTurns = (turnsByLeg[leg.id] ?? []).filter((t) => t.player_id === p.id);
        if (legTurns.length === 0) continue;
        const totals = legTurns.reduce(
          (acc, t) => ({ total: acc.total + (t.busted ? 0 : t.total_scored), turns: acc.turns + 1 }),
          { total: 0, turns: 0 }
        );
        cumTotal += totals.total;
        cumTurns += totals.turns;
        const ts = new Date(leg.created_at).getTime();
        const avg = cumTurns > 0 ? cumTotal / cumTurns : 0;
        data.push([ts, Number(avg.toFixed(2))]);
      }
      result.push({ player: p, series: { type: 'line', name: p.display_name, data } });
    }
    return result;
  }, [players, legs, turns]);

  const perLegOptions: Highcharts.Options = useMemo(() => ({
    title: { text: 'Per-Leg Average over Time' },
    xAxis: { type: 'datetime' },
    yAxis: { title: { text: 'Avg per turn' } },
    tooltip: { shared: true, xDateFormat: '%Y-%m-%d %H:%M' },
    series: perLegSeries,
  }), [perLegSeries]);

  return (
    <div className="space-y-6">
      <div className="grid gap-6">
        <HighchartsReact highcharts={Highcharts} options={winsOptions} />
        <HighchartsReact highcharts={Highcharts} options={avgBarOptions} />
        <HighchartsReact highcharts={Highcharts} options={perLegOptions} />
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Per-player cumulative average</h2>
        <div className="grid md:grid-cols-2 gap-6">
          {cumulativePerPlayer.map(({ player, series }) => (
            <div key={player.id} className="border rounded p-2">
              <HighchartsReact
                highcharts={Highcharts}
                options={{
                  title: { text: player.display_name },
                  xAxis: { type: 'datetime' },
                  yAxis: { title: { text: 'Cumulative avg' } },
                  series: [series],
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
