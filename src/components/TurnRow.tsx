import { ThrowSegmentBadges } from '@/components/ThrowSegmentBadges';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

type ThrowRecord = {
  dart_index: number;
  segment: string;
  scored: number;
};

export type TurnRowTurn = {
  id: string;
  player_id: string;
  turn_number: number;
  total_scored: number;
  busted: boolean;
  throws?: ThrowRecord[];
};

type TurnRowProps = {
  turn: TurnRowTurn;
  playerName?: string;
  playersCount: number;
  leading?: ReactNode;
  placeholder?: string;
  showThrows?: boolean;
  showRoundLabel?: boolean;
  className?: string;
  totalClassName?: string;
  throwBadgeClassName?: string;
};

export function TurnRow({
  turn,
  playerName,
  playersCount,
  leading,
  placeholder = '-',
  showThrows = true,
  showRoundLabel = true,
  className,
  totalClassName,
  throwBadgeClassName,
}: TurnRowProps) {
  const throwList = (turn.throws ?? [])
    .slice()
    .sort((a, b) => a.dart_index - b.dart_index);
  const throwTotal = throwList.reduce((sum, thr) => sum + thr.scored, 0);
  const displayTotal = turn.busted ? 'BUST' : (turn.total_scored || throwTotal);
  const roundNumber = playersCount > 0 && turn.turn_number
    ? Math.floor((turn.turn_number - 1) / playersCount) + 1
    : null;

  return (
    <div className={cn('flex items-center justify-between', className)}>
      <div className="flex items-start gap-3">
        {showRoundLabel && (
          <div className="mt-0.5 w-6 text-right font-mono text-xs text-muted-foreground">
            {roundNumber ? `T${roundNumber}` : ''}
          </div>
        )}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            {leading}
            <span>{playerName ?? 'Unknown'}</span>
          </div>
          {showThrows && (
            <ThrowSegmentBadges
              throws={throwList}
              placeholder={placeholder}
              className={cn('text-xs text-muted-foreground', throwBadgeClassName)}
            />
          )}
        </div>
      </div>
      <div className={cn('font-mono font-bold pr-2', totalClassName)}>{displayTotal}</div>
    </div>
  );
}
