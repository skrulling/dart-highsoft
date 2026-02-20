import { TrendingUp, TrendingDown } from 'lucide-react';
import { formatEloChange } from '@/utils/eloRating';
import type { MatchEloChange } from '@/hooks/useMatchEloChanges';

type Props = {
  eloChanges: MatchEloChange[];
  loading: boolean;
  matchWinnerId: string | null;
  playerById: Record<string, { display_name: string }>;
};

export function EloChangesDisplay({ eloChanges, loading, matchWinnerId, playerById }: Props) {
  if (loading || eloChanges.length === 0) return null;

  // Sort: winner first, then by rating_change descending
  const sorted = [...eloChanges].sort((a, b) => {
    if (a.player_id === matchWinnerId) return -1;
    if (b.player_id === matchWinnerId) return 1;
    return b.rating_change - a.rating_change;
  });

  return (
    <div className="border-t pt-3 mt-3 space-y-2">
      <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
        Rating Changes
      </div>
      <div className="space-y-1.5">
        {sorted.map((entry) => {
          const { text, color } = formatEloChange(entry.rating_change);
          const name = playerById[entry.player_id]?.display_name ?? 'Unknown';
          const Icon = entry.rating_change >= 0 ? TrendingUp : TrendingDown;

          return (
            <div key={entry.player_id} className="flex items-center justify-between text-sm">
              <span className="truncate mr-2">{name}</span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono text-muted-foreground">
                  {entry.rating_before}
                </span>
                <span className="text-muted-foreground">→</span>
                <span className="font-mono">
                  {entry.rating_after}
                </span>
                <span className={`font-mono font-semibold ${color} flex items-center gap-1`}>
                  <Icon size={14} />
                  {text}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
