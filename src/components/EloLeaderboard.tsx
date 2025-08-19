"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  getEloLeaderboard,
  getRecentEloChanges,
  getEloTier,
  formatEloChange,
  type EloLeaderboardEntry,
  type RecentEloChange
} from '@/utils/eloRating';

type Props = {
  limit?: number;
  showRecentChanges?: boolean;
};

export function EloLeaderboard({ limit = 20, showRecentChanges = false }: Props) {
  const [leaderboard, setLeaderboard] = useState<EloLeaderboardEntry[]>([]);
  const [recentChanges, setRecentChanges] = useState<RecentEloChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'leaderboard' | 'recent'>('leaderboard');

  useEffect(() => {
    loadData();
  }, [limit]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = async () => {
    try {
      const [leaderboardData, recentData] = await Promise.all([
        getEloLeaderboard(limit),
        showRecentChanges ? getRecentEloChanges(20) : Promise.resolve([])
      ]);
      
      setLeaderboard(leaderboardData);
      setRecentChanges(recentData);
    } catch (error) {
      console.error('Error loading ELO data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <div className="text-lg text-muted-foreground">Loading ELO rankings...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {showRecentChanges && (
        <div className="flex gap-2">
          <Button
            variant={activeTab === 'leaderboard' ? 'default' : 'outline'}
            onClick={() => setActiveTab('leaderboard')}
          >
            Leaderboard
          </Button>
          <Button
            variant={activeTab === 'recent' ? 'default' : 'outline'}
            onClick={() => setActiveTab('recent')}
          >
            Recent Changes
          </Button>
        </div>
      )}

      {activeTab === 'leaderboard' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              🏆 ELO Leaderboard
            </CardTitle>
          </CardHeader>
          <CardContent>
            {leaderboard.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <div className="text-lg mb-2">No rated players yet</div>
                <div className="text-sm">Complete some 1v1 matches to see rankings!</div>
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
                          ? 'bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-950/20 dark:to-orange-950/20 border border-yellow-200 dark:border-yellow-800' 
                          : 'bg-muted/30 hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`text-2xl font-bold min-w-[3rem] text-center ${
                          entry.rank === 1 ? 'text-yellow-600 dark:text-yellow-400' :
                          entry.rank === 2 ? 'text-gray-600 dark:text-gray-400' :
                          entry.rank === 3 ? 'text-amber-600 dark:text-amber-400' :
                          'text-muted-foreground'
                        }`}>
                          {entry.rank === 1 ? '🥇' : 
                           entry.rank === 2 ? '🥈' : 
                           entry.rank === 3 ? '🥉' : 
                           `#${entry.rank}`}
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
                        <div className="text-sm text-muted-foreground">
                          {entry.total_rated_matches} matches
                        </div>
                        {entry.peak_rating && entry.peak_rating !== entry.current_rating && (
                          <div className="text-xs text-muted-foreground">
                            Peak: {entry.peak_rating}
                          </div>
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
            <CardTitle>Recent ELO Changes</CardTitle>
          </CardHeader>
          <CardContent>
            {recentChanges.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <div className="text-lg mb-2">No recent matches</div>
                <div className="text-sm">ELO changes will appear here after rated matches.</div>
              </div>
            ) : (
              <div className="space-y-3">
                {recentChanges.map((change) => {
                  const changeFormat = formatEloChange(change.rating_change);
                  const tier = getEloTier(change.rating_after);
                  
                  return (
                    <div
                      key={change.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`text-lg ${change.is_winner ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          {change.is_winner ? '🏆' : '💔'}
                        </div>
                        
                        <div>
                          <div className="font-medium">{change.player_name}</div>
                          <div className="text-sm text-muted-foreground">
                            vs {change.opponent_name} ({change.opponent_rating_before})
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(change.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      
                      <div className="text-right">
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-mono">{change.rating_after}</span>
                          <span className={`text-sm font-medium ${changeFormat.color}`}>
                            ({changeFormat.text})
                          </span>
                        </div>
                        <Badge variant="secondary" className={`text-xs ${tier.color}`}>
                          {tier.icon} {tier.name}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}