import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { TournamentPlayerRecord } from '@/lib/tournament/types';

type PlayerInfo = { id: string; display_name: string };

type Props = {
  players: (TournamentPlayerRecord & { player: PlayerInfo })[];
  winnerId: string | null;
};

export function TournamentStandings({ players, winnerId }: Props) {
  const sorted = [...players].sort((a, b) => {
    // Ranked players come first (by rank ascending)
    if (a.final_rank !== null && b.final_rank !== null) return a.final_rank - b.final_rank;
    if (a.final_rank !== null) return -1;
    if (b.final_rank !== null) return 1;
    // Active players at bottom, sorted by seed
    return a.seed - b.seed;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Standings</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {sorted.map((p) => (
            <div
              key={p.player_id}
              className={`flex items-center justify-between rounded px-3 py-1.5 text-sm ${
                p.player_id === winnerId
                  ? 'bg-green-50 dark:bg-green-950/30 font-semibold'
                  : p.final_rank !== null
                  ? 'opacity-60'
                  : ''
              }`}
            >
              <div className="flex items-center gap-2">
                {p.final_rank !== null ? (
                  <span className="w-6 text-center font-mono text-xs">
                    {p.final_rank === 1 ? '1st' : p.final_rank === 2 ? '2nd' : p.final_rank === 3 ? '3rd' : `${p.final_rank}th`}
                  </span>
                ) : (
                  <span className="w-6" />
                )}
                <span>{p.player.display_name}</span>
              </div>
              <Badge
                variant={p.final_rank === null ? 'default' : p.player_id === winnerId ? 'default' : 'secondary'}
                className={`text-[10px] ${p.player_id === winnerId ? 'bg-green-600' : ''}`}
              >
                {p.final_rank === null ? 'Active' : p.player_id === winnerId ? 'Winner' : 'Eliminated'}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
