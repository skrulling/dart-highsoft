"use client";
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { useEffect, useState } from 'react';
import { getEloLeaderboard, getEloTier, type EloLeaderboardEntry } from '@/utils/eloRating';

export default function Home() {
  const [leaders, setLeaders] = useState<{ player_id: string; display_name: string; wins: number; avg_per_turn: number }[]>([]);
  const [eloLeaders, setEloLeaders] = useState<EloLeaderboardEntry[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const supabase = await getSupabaseClient();
        const [{ data }, eloData] = await Promise.all([
          supabase
            .from('player_summary')
            .select('*')
            .not('display_name', 'ilike', '%test%')
            .order('wins', { ascending: false })
            .limit(10),
          getEloLeaderboard(10)
        ]);
        setLeaders(((data as unknown) as { player_id: string; display_name: string; wins: number; avg_per_turn: number }[]) ?? []);
        setEloLeaders(eloData);
      } catch {
        setLeaders([]);
        setEloLeaders([]);
      }
    })();
  }, []);

  const medal = (index: number) => (index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`);

  return (
    <main className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <Image src="/favicon.ico" alt="Dart Scoreboard" width={32} height={32} className="rounded" />
        <h1 className="text-2xl font-semibold">Dart Scoreboard</h1>
      </div>
      <div className="flex gap-3">
        <Button asChild>
          <Link href="/new">New Match</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/practice">Practice</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/players">Players</Link>
        </Button>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Top 10 Match Winners</h2>
          <ul className="divide-y border rounded bg-card">
            {leaders.map((row, idx) => (
              <li key={row.player_id} className="flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-3">
                  <span className="w-8 text-lg text-center">{medal(idx)}</span>
                  <span>{row.display_name}</span>
                </div>
                <div className="flex items-center gap-6">
                  <div className="font-mono tabular-nums">{row.wins}</div>
                  <div className="text-sm text-muted-foreground">{row.avg_per_turn.toFixed(2)} avg</div>
                </div>
              </li>
            ))}
            {leaders.length === 0 && (
              <li className="px-3 py-4 text-sm text-muted-foreground">No matches recorded yet.</li>
            )}
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Top 10 ELO Ratings</h2>
          <ul className="divide-y border rounded bg-card">
            {eloLeaders.map((entry, idx) => {
              const tier = getEloTier(entry.current_rating);
              return (
                <li key={entry.player_id} className="flex items-center justify-between px-3 py-2">
                  <div className="flex items-center gap-3">
                    <span className="w-8 text-lg text-center">{medal(idx)}</span>
                    <div>
                      <div>{entry.display_name}</div>
                      <div className={`text-xs ${tier.color}`}>
                        {tier.icon} {tier.name}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="font-mono tabular-nums text-lg font-bold">{entry.current_rating}</div>
                    <div className="text-sm text-muted-foreground">{entry.win_percentage}% win</div>
                  </div>
                </li>
              );
            })}
            {eloLeaders.length === 0 && (
              <li className="px-3 py-4 text-sm text-muted-foreground">
                <div>No ELO ratings yet.</div>
                <div className="text-xs mt-1">Complete some 1v1 matches to see ELO rankings!</div>
              </li>
            )}
          </ul>
        </section>
      </div>
    </main>
  );
}
