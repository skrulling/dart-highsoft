import { Badge } from '@/components/ui/badge';
import type { TournamentMatchRecord } from '@/lib/tournament/types';

type Props = {
  tm: TournamentMatchRecord;
  playerName: (id: string | null) => string;
  onMatchClick?: (matchId: string) => void;
};

export function BracketMatchCard({ tm, playerName, onMatchClick }: Props) {
  const isPlayable = tm.match_id && !tm.winner_id;
  const isComplete = !!tm.winner_id;
  const isPending = !tm.player1_id && !tm.player2_id && !tm.is_bye;

  return (
    <div
      className={`
        rounded border px-2 py-1.5 text-xs w-[160px] shrink-0 transition-colors
        ${isPlayable ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-950/50' : ''}
        ${isComplete ? 'border-green-300 bg-green-50/50 dark:bg-green-950/20' : ''}
        ${isPending ? 'border-dashed border-muted-foreground/30 opacity-50' : ''}
        ${tm.is_bye ? 'border-dashed opacity-60' : ''}
      `}
      onClick={() => {
        if (isPlayable && tm.match_id && onMatchClick) {
          onMatchClick(tm.match_id);
        }
      }}
    >
      {tm.is_bye ? (
        <div className="text-center text-muted-foreground">BYE</div>
      ) : (
        <div className="space-y-0.5">
          <PlayerRow
            name={playerName(tm.player1_id)}
            isWinner={tm.winner_id === tm.player1_id && !!tm.winner_id}
            isEmpty={!tm.player1_id}
          />
          <div className="border-t border-dashed" />
          <PlayerRow
            name={playerName(tm.player2_id)}
            isWinner={tm.winner_id === tm.player2_id && !!tm.winner_id}
            isEmpty={!tm.player2_id}
          />
        </div>
      )}
      {isPlayable && (
        <Badge variant="default" className="mt-1 w-full justify-center text-[10px] bg-blue-500">
          LIVE
        </Badge>
      )}
    </div>
  );
}

function PlayerRow({ name, isWinner, isEmpty }: { name: string; isWinner: boolean; isEmpty: boolean }) {
  return (
    <div className={`truncate ${isWinner ? 'font-bold' : ''} ${isEmpty ? 'text-muted-foreground italic' : ''}`}>
      {name}
    </div>
  );
}
