import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TurnRow, type TurnRowTurn } from '@/components/TurnRow';
import { useMemo } from 'react';

type TurnsHistoryCardProps = {
  turns: TurnRowTurn[];
  playerById: Record<string, { display_name: string }>;
  playersCount: number;
  placeholder?: string;
};

export function TurnsHistoryCard({ turns, playerById, playersCount, placeholder = '-' }: TurnsHistoryCardProps) {
  const reverseTurns = useMemo(() => turns.slice().reverse(), [turns]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Turns</CardTitle>
        <CardDescription>History of this leg</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="max-h-72 overflow-auto divide-y">
          {reverseTurns.map((turn) => {
            return (
              <TurnRow
                key={turn.id}
                turn={turn}
                playerName={playerById[turn.player_id]?.display_name}
                playersCount={playersCount}
                placeholder={placeholder}
                className="py-2 text-sm"
              />
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
