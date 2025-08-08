"use client";

import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import { useEffect, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabaseClient';

export default function StatsPage() {
  const [data, setData] = useState<{ display_name: string; wins: number; avg_per_turn: number }[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const supabase = await getSupabaseClient();
        const { data } = await supabase.from('player_summary').select('*').order('wins', { ascending: false });
        setData(((data as unknown) as { display_name: string; wins: number; avg_per_turn: number }[]) ?? []);
      } catch {
        setData([]);
      }
    })();
  }, []);

  const winsOptions: Highcharts.Options = {
    title: { text: 'Total Match Wins' },
    xAxis: { categories: data.map((d) => d.display_name) },
    series: [
      {
        type: 'column',
        name: 'Wins',
        data: data.map((d) => d.wins),
      },
    ],
  };

  const avgOptions: Highcharts.Options = {
    title: { text: 'Average Points per Turn' },
    xAxis: { categories: data.map((d) => d.display_name) },
    series: [
      {
        type: 'line',
        name: 'Avg/Turn',
        data: data.map((d) => d.avg_per_turn),
      },
    ],
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6">
        <HighchartsReact highcharts={Highcharts} options={winsOptions} />
        <HighchartsReact highcharts={Highcharts} options={avgOptions} />
      </div>
    </div>
  );
}
