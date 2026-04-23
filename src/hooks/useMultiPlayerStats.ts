"use client";

import { useQueries } from '@tanstack/react-query';
import { fetchPlayerDetailData, type PlayerDetailData } from '@/hooks/useStatsData';
import type { TurnRow, ThrowRow } from '@/lib/stats/types';

export type PerPlayerStatsQuery = {
  playerId: string;
  status: 'loading' | 'success' | 'error';
  turns: TurnRow[];
  throws: ThrowRow[];
};

/**
 * Runs one React Query per player for turn/throw detail data.
 *
 * Query key matches `useStatsData`'s single-player query (`['stats','player',id]`)
 * so cache is shared — switching between Compare and Performance views for a
 * player already loaded is free.
 */
export function useMultiPlayerStats(playerIds: string[]): PerPlayerStatsQuery[] {
  const queries = useQueries({
    queries: playerIds.map((id) => ({
      queryKey: ['stats', 'player', id],
      queryFn: () => fetchPlayerDetailData(id),
      enabled: !!id,
      staleTime: 5 * 60_000,
    })),
  });

  return queries.map((q, i): PerPlayerStatsQuery => {
    const data = q.data as PlayerDetailData | undefined;
    return {
      playerId: playerIds[i],
      status: q.isLoading ? 'loading' : q.isError ? 'error' : 'success',
      turns: data?.turns ?? [],
      throws: data?.throws ?? [],
    };
  });
}
