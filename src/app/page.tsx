"use client";
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { useEffect, useState } from 'react';
import QRCode from 'react-qr-code';
import { getEloLeaderboard, getEloTier, type EloLeaderboardEntry } from '@/utils/eloRating';
import { getMultiEloLeaderboard, type MultiEloLeaderboardEntry } from '@/utils/eloRatingMultiplayer';

export default function Home() {
  const router = useRouter();
  const [leaders, setLeaders] = useState<{ player_id: string; display_name: string; wins: number; avg_per_turn: number }[]>([]);
  const [avgLeaders, setAvgLeaders] = useState<{ player_id: string; display_name: string; wins: number; avg_per_turn: number }[]>([]);
  const [eloLeaders, setEloLeaders] = useState<EloLeaderboardEntry[]>([]);
  const [eloMultiLeaders, setEloMultiLeaders] = useState<MultiEloLeaderboardEntry[]>([]);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const supabase = await getSupabaseClient();
        const [{ data: winnersData }, eloData, eloMultiData, { data: avgData }] = await Promise.all([
          supabase
            .from('player_summary')
            .select('*')
            .not('display_name', 'ilike', '%test%')
            .order('wins', { ascending: false })
            .limit(10),
          getEloLeaderboard(10),
          getMultiEloLeaderboard(10),
          supabase
            .from('player_summary')
            .select('*')
            .not('display_name', 'ilike', '%test%')
            .order('avg_per_turn', { ascending: false })
            .limit(10)
        ]);
        setLeaders(((winnersData as unknown) as { player_id: string; display_name: string; wins: number; avg_per_turn: number }[]) ?? []);
        setAvgLeaders(((avgData as unknown) as { player_id: string; display_name: string; wins: number; avg_per_turn: number }[]) ?? []);
        setEloLeaders(eloData);
        setEloMultiLeaders(eloMultiData);
      } catch {
        setLeaders([]);
        setAvgLeaders([]);
        setEloLeaders([]);
        setEloMultiLeaders([]);
      }
    })();
  }, []);

  useEffect(() => {
    setOrigin(window.location.origin);
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
        <Button asChild variant="outline">
          <Link href="/elo-multi">Multiplayer ELO</Link>
        </Button>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Top 10 Multiplayer ELO Ratings</h2>
          <ul
            className="divide-y border rounded bg-card cursor-pointer"
            onClick={() => router.push('/elo-multi')}
            title="View full Multiplayer ELO leaderboard"
          >
            {eloMultiLeaders.map((entry, idx) => {
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
            {eloMultiLeaders.length === 0 && (
              <li className="px-3 py-4 text-sm text-muted-foreground">
                <div>No multiplayer ELO ratings yet.</div>
                <div className="text-xs mt-1">Complete some 3+ player matches to see rankings!</div>
              </li>
            )}
          </ul>
        </section>

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
          <h2 className="text-xl font-semibold">Top 10 by Average Score</h2>
          <ul className="divide-y border rounded bg-card">
            {avgLeaders.map((row, idx) => (
              <li key={row.player_id} className="flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-3">
                  <span className="w-8 text-lg text-center">{medal(idx)}</span>
                  <span>{row.display_name}</span>
                </div>
                <div className="flex items-center gap-6">
                  <div className="font-mono tabular-nums text-lg font-bold">{row.avg_per_turn.toFixed(2)}</div>
                  <div className="text-sm text-muted-foreground">{row.wins} wins</div>
                </div>
              </li>
            ))}
            {avgLeaders.length === 0 && (
              <li className="px-3 py-4 text-sm text-muted-foreground">No average scores to display yet.</li>
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
      {origin && (
        <div className="fixed bottom-4 left-4 z-40 flex flex-col items-center gap-2 rounded-lg bg-background/90 p-3 shadow-md ring-1 ring-border">
          <div className="text-xs font-semibold text-muted-foreground">New match</div>
          <QRCode value={`${origin}/new`} size={96} />
        </div>
      )}
    </main>
  );
}
