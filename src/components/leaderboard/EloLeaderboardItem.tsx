import { getEloTier, type EloLeaderboardEntry } from '@/utils/eloRating';
import { type MultiEloLeaderboardEntry } from '@/utils/eloRatingMultiplayer';
import { medal } from '@/utils/leaderboard';

type EloLeaderboardItemProps = {
  entry: EloLeaderboardEntry | MultiEloLeaderboardEntry;
  index: number;
};

export function EloLeaderboardItem({ entry, index }: EloLeaderboardItemProps) {
  const tier = getEloTier(entry.current_rating);
  return (
    <li className="flex items-center justify-between px-3 py-2">
      <div className="flex items-center gap-3">
        <span className="w-8 text-lg text-center">{medal(index)}</span>
        <div>
          <div>{entry.display_name}</div>
          <div className={`text-xs ${tier.color}`}>
            {tier.icon} {tier.name}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-6">
        <div className="font-mono tabular-nums text-lg font-bold">{entry.current_rating}</div>
        <div className="text-sm text-muted-foreground">{entry.win_percentage}% win</div>
      </div>
    </li>
  );
}
