import { getSupabaseClient } from '@/lib/supabaseClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default async function PracticePage() {
  const supabase = await getSupabaseClient();
  
  const { data: players } = await supabase
    .from('players')
    .select('id, display_name')
    .order('display_name', { ascending: true });

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Practice Mode</h1>
      
      <Card className="max-w-md mx-auto">
        <CardHeader>
          <CardTitle>Select Player</CardTitle>
          <CardDescription>Choose who will be practicing. Each player gets their own practice session.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            {(players || []).map((player) => (
              <Button
                key={player.id}
                variant="outline"
                className="justify-start"
                asChild
              >
                <Link href={`/practice/${player.id}`}>
                  {player.display_name}
                </Link>
              </Button>
            ))}
            {(!players || players.length === 0) && (
              <p className="text-center text-muted-foreground">
                No players found. <Link href="/players" className="text-blue-600 hover:underline">Create some players</Link> first.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}