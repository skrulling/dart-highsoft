import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Dart Scoreboard</h1>
      <div className="flex gap-3">
        <Link href="/new" className="px-4 py-2 rounded bg-blue-600 text-white">New Match</Link>
        <Link href="/players" className="px-4 py-2 rounded border">Players</Link>
      </div>
    </main>
  );
}
