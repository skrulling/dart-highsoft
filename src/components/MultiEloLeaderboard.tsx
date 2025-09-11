"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  getMultiEloLeaderboard,
  getRecentMultiEloChanges,
  type MultiEloLeaderboardEntry,
  type RecentMultiEloChange,
} from '@/utils/eloRatingMultiplayer';
import { getEloTier } from '@/utils/eloRating';

type Props = {
  limit?: number;
  showRecentChanges?: boolean;
};

export function MultiEloLeaderboard({ limit = 20, showRecentChanges = false }: Props) {
  const [leaderboard, setLeaderboard] = useState<MultiEloLeaderboardEntry[]>([]);
  const [recent, setRecent] = useState<RecentMultiEloChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'leaderboard' | 'recent'>('leaderboard');

  useEffect(() => {
    (async () => {
      try {
        const [lb, rc] = await Promise.all([
          getMultiEloLeaderboard(limit),
          showRecentChanges ? getRecentMultiEloChanges(20) : Promise.resolve([]),
        ]);
        setLeaderboard(lb);
        setRecent(rc);
      } catch (e) {
        console.error('Failed to load multi elo data', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [limit, showRecentChanges]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <div className="text-lg text-muted-foreground">Loading multiplayer ELO rankings...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {showRecentChanges && (
        <div className="flex gap-2">
          <Button variant={activeTab === 'leaderboard' ? 'default' : 'outline'} onClick={() => setActiveTab('leaderboard')}>
            Leaderboard
          </Button>
          <Button variant={activeTab === 'recent' ? 'default' : 'outline'} onClick={() => setActiveTab('recent')}>
            Recent Changes
          </Button>
        </div>
      )}

      {activeTab === 'leaderboard' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">🏆 Multiplayer ELO Leaderboard</CardTitle>
          </CardHeader>
          <CardContent>
            {leaderboard.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <div className="text-lg mb-2">No rated players yet</div>
                <div className="text-sm">Complete some multiplayer matches to see rankings!</div>
              </div>
            ) : (
              <div className="space-y-3">
                {leaderboard.map((entry) => {
                  const tier = getEloTier(entry.current_rating);
                  const isTopThree = entry.rank <= 3;
                  return (
                    <div
                      key={entry.player_id}
                      className={`flex items-center justify-between p-4 rounded-lg transition-colors ${
                        isTopThree
                          ? 'bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-950/20 dark:to-blue-950/20 border border-indigo-200 dark:border-indigo-800'
                          : 'bg-muted/30 hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`text-2xl font-bold min-w-[3rem] text-center ${
                            entry.rank === 1
                              ? 'text-yellow-600 dark:text-yellow-400'
                              : entry.rank === 2
                              ? 'text-gray-600 dark:text-gray-400'
                              : entry.rank === 3
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-muted-foreground'
                          }`}
                        >
                          {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`}
                        </div>
                        <div>
                          <div className="font-semibold text-lg">{entry.display_name}</div>
                          <div className="flex items-center gap-2 text-sm">
                            <Badge variant="secondary" className={tier.color}>
                              {tier.icon} {tier.name}
                            </Badge>
                            <span className="text-muted-foreground">
                              {entry.wins}W-{entry.losses}L ({entry.win_percentage}%)
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold">{entry.current_rating}</div>
                        <div className="text-sm text-muted-foreground">{entry.total_rated_matches} matches</div>
                        {entry.peak_rating && entry.peak_rating !== entry.current_rating && (
                          <div className="text-xs text-muted-foreground">Peak: {entry.peak_rating}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === 'recent' && showRecentChanges && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Multiplayer ELO Changes</CardTitle>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No recent multiplayer matches.</div>
            ) : (
              <div className="space-y-3">
                {recent.map((r) => (
                  <div key={r.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div>
                      <div className="text-sm font-medium">{r.player_name}</div>
                      <div className="text-xs text-muted-foreground">
                        Rank {r.rank}/{r.field_size} • E={r.expected_score.toFixed(2)} S={r.observed_score.toFixed(2)}
                      </div>
                      <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-medium ${r.rating_change >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {r.rating_change >= 0 ? '+' : ''}{r.rating_change}
                      </div>
                      <div className="font-mono">{r.rating_after}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

