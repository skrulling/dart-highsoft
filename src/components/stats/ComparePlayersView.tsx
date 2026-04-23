"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ComparePlayerPicker, MIN_COMPARE } from './ComparePlayerPicker';
import { CompareKpiTable } from './CompareKpiTable';
import { CompareTrendChart } from './CompareTrendChart';
import { useMultiPlayerStats } from '@/hooks/useMultiPlayerStats';
import type { LegRow, MatchRow, PlayerRow } from '@/lib/stats/types';

interface ComparePlayersViewProps {
  players: PlayerRow[];
  legs: LegRow[];
  matches: MatchRow[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function ComparePlayersView({ players, legs, matches, selectedIds, onChange }: ComparePlayersViewProps) {
  const perPlayer = useMultiPlayerStats(selectedIds);
  const hasEnough = selectedIds.length >= MIN_COMPARE;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Compare Players</CardTitle>
          <CardDescription>
            Pick 2–6 players to see their stats side by side. The URL updates as you change the selection so links can be shared.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ComparePlayerPicker
            players={players}
            selectedIds={selectedIds}
            onChange={onChange}
          />
        </CardContent>
      </Card>

      {hasEnough && (
        <>
          <CompareKpiTable
            playerIds={selectedIds}
            players={players}
            perPlayer={perPlayer}
            legs={legs}
            matches={matches}
          />
          <CompareTrendChart
            playerIds={selectedIds}
            players={players}
            perPlayer={perPlayer}
            legs={legs}
            matches={matches}
          />
        </>
      )}
    </div>
  );
}
