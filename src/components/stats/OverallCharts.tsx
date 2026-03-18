import dynamic from 'next/dynamic';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { SummaryRow } from '@/lib/stats/types';

const Chart = dynamic(() => import('@/components/Chart'), { ssr: false });

interface OverallChartsProps {
  summary: SummaryRow[];
  topAvgPlayers: SummaryRow[];
}

export function OverallCharts({ summary, topAvgPlayers }: OverallChartsProps) {
  return (
    <div className="grid md:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>🏆 Match Wins by Player</CardTitle>
          <CardDescription>Championship leaderboard</CardDescription>
        </CardHeader>
        <CardContent>
          <Chart options={{
            title: { text: null },
            chart: { type: 'bar', height: 300 },
            xAxis: {
              categories: summary.slice(0, 8).map(d => d.display_name),
              title: { text: 'Player' }
            },
            yAxis: {
              title: { text: 'Wins' },
              min: 0
            },
            series: [{
              name: 'Match Wins',
              data: summary.slice(0, 8).map(d => d.wins),
              color: '#3b82f6',
              dataLabels: { enabled: true }
            }],
            legend: { enabled: false },
            plotOptions: {
              bar: { borderRadius: 2 }
            }
          }} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>📊 Average Score by Player</CardTitle>
          <CardDescription>Consistency rankings</CardDescription>
        </CardHeader>
        <CardContent>
          <Chart options={{
            title: { text: null },
            chart: { type: 'bar', height: 300 },
            xAxis: {
              categories: topAvgPlayers.map(d => d.display_name),
              title: { text: 'Player' }
            },
            yAxis: {
              title: { text: 'Average Score' },
              min: 0
            },
            series: [{
              name: 'Avg Score',
              data: topAvgPlayers.map(d => Number(d.avg_per_turn.toFixed?.(2) ?? d.avg_per_turn)),
              color: '#10b981',
              dataLabels: {
                enabled: true,
                format: '{y:.1f}'
              }
            }],
            legend: { enabled: false },
            plotOptions: {
              bar: { borderRadius: 2 }
            }
          }} />
        </CardContent>
      </Card>
    </div>
  );
}
