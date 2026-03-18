import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { computeTrebleDoubleByNumber } from '@/lib/stats/computations';
import type { PlayerCoreStats, PlayerSegmentRow, PlayerAdjacencyRow } from '@/lib/stats/types';

const Chart = dynamic(() => import('@/components/Chart'), { ssr: false });

interface TargetAnalysisTabProps {
  playerCoreStats: PlayerCoreStats;
  selectedPlayer: string;
  playerSegments: PlayerSegmentRow[];
  playerAdjacency: PlayerAdjacencyRow[];
}

export function TargetAnalysisTab({ playerCoreStats, selectedPlayer, playerSegments, playerAdjacency }: TargetAnalysisTabProps) {
  const trebleDoubleByNumber = useMemo(() => {
    return computeTrebleDoubleByNumber(selectedPlayer, playerSegments, playerCoreStats.playerThrows);
  }, [selectedPlayer, playerSegments, playerCoreStats.playerThrows]);

  const adjacencyData = playerAdjacency.find(pa => pa.player_id === selectedPlayer);

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        {/* 20 Target Analysis */}
        <Card>
          <CardHeader>
            <CardTitle>🎯 20 Target Analysis</CardTitle>
            <CardDescription>Performance when targeting 20 ({playerCoreStats.total20Attempts} attempts)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-green-50 p-3 rounded">
                  <div className="text-2xl font-bold text-green-600">{playerCoreStats.rate20Triple}%</div>
                  <div className="text-xs text-muted-foreground">Triple 20</div>
                  <div className="text-xs text-gray-500">({playerCoreStats.hits20Triple} hits)</div>
                </div>
                <div className="bg-blue-50 p-3 rounded">
                  <div className="text-2xl font-bold text-blue-600">{playerCoreStats.rate20Double}%</div>
                  <div className="text-xs text-muted-foreground">Double 20</div>
                  <div className="text-xs text-gray-500">({playerCoreStats.hits20Double} hits)</div>
                </div>
                <div className="bg-yellow-50 p-3 rounded">
                  <div className="text-2xl font-bold text-yellow-600">{playerCoreStats.rate20Single}%</div>
                  <div className="text-xs text-muted-foreground">Single 20</div>
                  <div className="text-xs text-gray-500">({playerCoreStats.hits20Single} hits)</div>
                </div>
              </div>

              <div className="mt-4 p-3 bg-gray-50 rounded">
                <div className="text-sm font-medium mb-2">Miss Direction</div>
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div>
                    <div className="text-lg font-bold text-red-500">{playerCoreStats.misses20Left}</div>
                    <div className="text-xs text-muted-foreground">Left (5s)</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-red-500">{playerCoreStats.misses20Right}</div>
                    <div className="text-xs text-muted-foreground">Right (1s)</div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 19 Target Analysis */}
        <Card>
          <CardHeader>
            <CardTitle>🎯 19 Target Analysis</CardTitle>
            <CardDescription>Performance when targeting 19 ({playerCoreStats.total19Attempts} attempts)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-green-50 p-3 rounded">
                  <div className="text-2xl font-bold text-green-600">{playerCoreStats.rate19Triple}%</div>
                  <div className="text-xs text-muted-foreground">Triple 19</div>
                  <div className="text-xs text-gray-500">({playerCoreStats.hits19Triple} hits)</div>
                </div>
                <div className="bg-blue-50 p-3 rounded">
                  <div className="text-2xl font-bold text-blue-600">{playerCoreStats.rate19Double}%</div>
                  <div className="text-xs text-muted-foreground">Double 19</div>
                  <div className="text-xs text-gray-500">({playerCoreStats.hits19Double} hits)</div>
                </div>
                <div className="bg-yellow-50 p-3 rounded">
                  <div className="text-2xl font-bold text-yellow-600">{playerCoreStats.rate19Single}%</div>
                  <div className="text-xs text-muted-foreground">Single 19</div>
                  <div className="text-xs text-gray-500">({playerCoreStats.hits19Single} hits)</div>
                </div>
              </div>

              <div className="mt-4 p-3 bg-gray-50 rounded">
                <div className="text-sm font-medium mb-2">Miss Direction</div>
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div>
                    <div className="text-lg font-bold text-red-500">{playerCoreStats.misses19Left}</div>
                    <div className="text-xs text-muted-foreground">Left (7s)</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-red-500">{playerCoreStats.misses19Right}</div>
                    <div className="text-xs text-muted-foreground">Right (3s)</div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dartboard Adjacency Analysis */}
      {adjacencyData && (
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>🎯 20 vs Adjacent Segments</CardTitle>
              <CardDescription>Accuracy when targeting 20 (neighbors: 1, 5)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="bg-blue-50 p-3 rounded">
                    <div className="text-2xl font-bold text-blue-600">{adjacencyData.hits_20}</div>
                    <div className="text-xs text-muted-foreground">Hits on 20</div>
                  </div>
                  <div className="bg-gray-50 p-3 rounded">
                    <div className="text-2xl font-bold text-gray-600">{adjacencyData.hits_1 + adjacencyData.hits_5}</div>
                    <div className="text-xs text-muted-foreground">Hits on 1,5</div>
                  </div>
                  <div className="bg-green-50 p-3 rounded">
                    <div className="text-2xl font-bold text-green-600">{adjacencyData.accuracy_20_in_area || 0}%</div>
                    <div className="text-xs text-muted-foreground">20 accuracy</div>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground text-center">
                  Total hits in 20 area: {adjacencyData.hits_20_area}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>🎯 19 vs Adjacent Segments</CardTitle>
              <CardDescription>Accuracy when targeting 19 (neighbors: 3, 7)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="bg-purple-50 p-3 rounded">
                    <div className="text-2xl font-bold text-purple-600">{adjacencyData.hits_19}</div>
                    <div className="text-xs text-muted-foreground">Hits on 19</div>
                  </div>
                  <div className="bg-gray-50 p-3 rounded">
                    <div className="text-2xl font-bold text-gray-600">{adjacencyData.hits_3 + adjacencyData.hits_7}</div>
                    <div className="text-xs text-muted-foreground">Hits on 3,7</div>
                  </div>
                  <div className="bg-green-50 p-3 rounded">
                    <div className="text-2xl font-bold text-green-600">{adjacencyData.accuracy_19_in_area || 0}%</div>
                    <div className="text-xs text-muted-foreground">19 accuracy</div>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground text-center">
                  Total hits in 19 area: {adjacencyData.hits_19_area}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Treble/Double Rate by Number */}
      <Card>
        <CardHeader>
          <CardTitle>Treble/Double Rate by Number</CardTitle>
          <CardDescription>Success rates across 1–20 (excluding bull)</CardDescription>
        </CardHeader>
        <CardContent>
          <Chart options={{
            title: { text: null },
            chart: { type: 'bar', height: 500 },
            xAxis: {
              categories: trebleDoubleByNumber.categories,
              title: { text: 'Number' },
            },
            yAxis: {
              title: { text: 'Hit Rate (%)' },
              min: 0,
              max: 100,
            },
            series: [
              {
                type: 'bar',
                name: 'Double %',
                data: trebleDoubleByNumber.doubleRates,
                color: '#3b82f6',
              },
              {
                type: 'bar',
                name: 'Treble %',
                data: trebleDoubleByNumber.trebleRates,
                color: '#10b981',
              },
            ],
            legend: { enabled: true },
            tooltip: {
              shared: true,
              valueSuffix: '%',
            },
            plotOptions: {
              bar: {
                borderRadius: 2,
                dataLabels: { enabled: false },
              },
            },
          }} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Target Comparison Chart</CardTitle>
          <CardDescription>20 vs 19 target success rates</CardDescription>
        </CardHeader>
        <CardContent>
          <Chart options={{
            title: { text: null },
            chart: { type: 'column', height: 400 },
            xAxis: {
              categories: ['20 Triple', '20 Double', '20 Single', '19 Triple', '19 Double', '19 Single'],
              title: { text: 'Target Type' }
            },
            yAxis: {
              title: { text: 'Success Rate (%)' },
              min: 0
            },
            series: [{
              name: 'Hit Rate',
              data: [
                playerCoreStats.rate20Triple,
                playerCoreStats.rate20Double,
                playerCoreStats.rate20Single,
                playerCoreStats.rate19Triple,
                playerCoreStats.rate19Double,
                playerCoreStats.rate19Single
              ],
              colorByPoint: true,
              colors: ['#10b981', '#3b82f6', '#f59e0b', '#10b981', '#3b82f6', '#f59e0b'],
              dataLabels: {
                enabled: true,
                format: '{y}%'
              }
            }],
            legend: { enabled: false },
            plotOptions: {
              column: { borderRadius: 4 }
            }
          }} />
        </CardContent>
      </Card>
    </div>
  );
}
