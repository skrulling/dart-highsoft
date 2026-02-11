"use client";
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';
import QRCode from 'react-qr-code';
import dynamic from 'next/dynamic';

const GridLeaderboard = dynamic(
  () => import('@/components/GridLeaderboard').then(m => ({ default: m.GridLeaderboard })),
  { ssr: false }
);

export default function Home() {
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

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

      <GridLeaderboard />

      {origin && (
        <div className="fixed bottom-4 left-4 z-40 hidden flex-col items-center gap-2 rounded-lg bg-background/90 p-3 shadow-md ring-1 ring-border sm:flex">
          <div className="text-xs font-semibold text-muted-foreground">New match</div>
          <QRCode value={`${origin}/new`} size={96} />
        </div>
      )}
    </main>
  );
}
