import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ThrowSegmentBadges } from '@/components/ThrowSegmentBadges';

type ThrowRecord = {
  dart_index: number;
  segment: string;
  scored: number;
};

type TurnRecord = {
  id: string;
  turn_number: number;
  player_id: string;
  total_scored: number;
  busted: boolean;
  throws?: ThrowRecord[];
};

type TurnsHistoryCardProps = {
  turns: TurnRecord[];
  playerById: Record<string, { display_name: string }>;
  playersCount: number;
  placeholder?: string;
};

export function TurnsHistoryCard({ turns, playerById, playersCount, placeholder = '-' }: TurnsHistoryCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Turns</CardTitle>
        <CardDescription>History of this leg</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="max-h-72 overflow-auto divide-y">
          {[...turns].reverse().map((turn) => {
            const throwList = (turn.throws ?? [])
              .slice()
              .sort((a, b) => a.dart_index - b.dart_index);
            const throwTotal = throwList.reduce((sum, thr) => sum + thr.scored, 0);
            const displayTotal = turn.busted ? 'BUST' : (turn.total_scored || throwTotal);
            const roundNumber = playersCount > 0 && turn.turn_number
              ? Math.floor((turn.turn_number - 1) / playersCount) + 1
              : null;

            return (
              <div key={turn.id} className="py-2 text-sm flex items-center justify-between">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 w-6 text-right font-mono text-xs text-muted-foreground">
                    {roundNumber ? `T${roundNumber}` : ''}
                  </div>
                  <div className="flex flex-col gap-1">
                    <div>{playerById[turn.player_id]?.display_name ?? 'Unknown'}</div>
                    <ThrowSegmentBadges
                      throws={throwList}
                      placeholder={placeholder}
                      className="text-xs text-muted-foreground"
                    />
                  </div>
                </div>
                <div className="font-mono font-bold pr-2">{displayTotal}</div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
