"use client";
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { useEffect, useState } from 'react';

export default function Home() {
  const [leaders, setLeaders] = useState<{ player_id: string; display_name: string; wins: number }[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const supabase = getSupabaseClient();
        const { data } = await supabase.from('player_match_wins').select('*').order('wins', { ascending: false }).limit(10);
        setLeaders((data as any[]) ?? []);
      } catch {
        setLeaders([]);
      }
    })();
  }, []);

  const medal = (index: number) => (index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`);

  return (
    <main className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold">Dart Scoreboard</h1>
      <div className="flex gap-3">
        <Button asChild>
          <Link href="/new">New Match</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/players">Players</Link>
        </Button>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Top 10 Match Winners</h2>
        <ul className="divide-y border rounded bg-card">
          {leaders.map((row, idx) => (
            <li key={row.player_id} className="flex items-center justify-between px-3 py-2">
              <div className="flex items-center gap-3">
                <span className="w-8 text-lg text-center">{medal(idx)}</span>
                <span>{row.display_name}</span>
              </div>
              <div className="font-mono">{row.wins}</div>
            </li>
          ))}
          {leaders.length === 0 && (
            <li className="px-3 py-4 text-sm text-muted-foreground">No matches recorded yet.</li>
          )}
        </ul>
      </section>
    </main>
  );
}
