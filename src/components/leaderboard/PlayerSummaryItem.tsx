import { type PlayerSummaryEntry } from '@/hooks/useLeaderboardData';
import { medal } from '@/utils/leaderboard';

type PlayerSummaryItemProps = {
  entry: PlayerSummaryEntry;
  index: number;
  primaryMetric: 'wins' | 'avg';
};

export function PlayerSummaryItem({ entry, index, primaryMetric }: PlayerSummaryItemProps) {
  return (
    <li className="flex items-center justify-between px-3 py-2">
      <div className="flex items-center gap-3">
        <span className="w-8 text-lg text-center">{medal(index)}</span>
        <span>{entry.display_name}</span>
      </div>
      <div className="flex items-center gap-6">
        {primaryMetric === 'wins' ? (
          <>
            <div className="font-mono tabular-nums">{entry.wins}</div>
            <div className="text-sm text-muted-foreground">{entry.avg_per_turn.toFixed(2)} avg</div>
          </>
        ) : (
          <>
            <div className="font-mono tabular-nums text-lg font-bold">{entry.avg_per_turn.toFixed(2)}</div>
            <div className="text-sm text-muted-foreground">{entry.wins} wins</div>
          </>
        )}
      </div>
    </li>
  );
}
