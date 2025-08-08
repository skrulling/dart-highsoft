import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function Home() {
  return (
    <main className="min-h-screen p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Dart Scoreboard</h1>
      <div className="flex gap-3">
        <Button asChild>
          <Link href="/new">New Match</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/players">Players</Link>
        </Button>
      </div>
    </main>
  );
}
