"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  getPlayerEloStats,
  getPlayerEloHistory,
  getEloTier,
  formatEloChange,
  type PlayerEloStats as PlayerEloStatsType,
  type EloRating
} from '@/utils/eloRating';

type Player = {
  id: string;
  display_name: string;
};

type Props = {
  player: Player;
  showHistory?: boolean;
};

export function PlayerEloStats({ player, showHistory = true }: Props) {
  const [stats, setStats] = useState<PlayerEloStatsType | null>(null);
  const [history, setHistory] = useState<EloRating[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, [player.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadStats = async () => {
    try {
      const [statsData, historyData] = await Promise.all([
        getPlayerEloStats(player.id),
        showHistory ? getPlayerEloHistory(player.id, 10) : Promise.resolve([])
      ]);
      
      setStats(statsData);
      setHistory(historyData);
    } catch (error) {
      console.error('Error loading player ELO stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <div className="text-muted-foreground">Loading ELO stats...</div>
        </CardContent>
      </Card>
    );
  }

  if (!stats || stats.total_rated_matches === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>ELO Rating</CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8">
          <div className="space-y-2">
            <div className="text-6xl">🎯</div>
            <div className="text-lg font-semibold">Unrated Player</div>
            <div className="text-sm text-muted-foreground">
              Play some 1v1 matches to get an ELO rating!
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const tier = getEloTier(stats.current_rating);
  const hasImproved = stats.peak_rating && stats.current_rating === stats.peak_rating;

  return (
    <div className="space-y-6">
      {/* Current Rating Card */}
      <Card className={hasImproved ? "border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20" : ""}>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            ELO Rating
            {hasImproved && <Badge variant="secondary" className="text-yellow-600 dark:text-yellow-400">🔥 Peak Rating!</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center space-y-4">
            <div className="text-6xl md:text-8xl font-bold">{stats.current_rating}</div>
            <Badge variant="secondary" className={`text-lg px-4 py-2 ${tier.color}`}>
              {tier.icon} {tier.name}
            </Badge>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.wins}</div>
              <div className="text-sm text-muted-foreground">Wins</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.losses}</div>
              <div className="text-sm text-muted-foreground">Losses</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{stats.win_percentage}%</div>
              <div className="text-sm text-muted-foreground">Win Rate</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{stats.total_rated_matches}</div>
              <div className="text-sm text-muted-foreground">Matches</div>
            </div>
          </div>
          
          {stats.peak_rating && stats.peak_rating !== stats.current_rating && (
            <div className="mt-4 pt-4 border-t text-center">
              <div className="text-sm text-muted-foreground">Peak Rating</div>
              <div className="text-xl font-semibold text-yellow-600 dark:text-yellow-400">
                {stats.peak_rating}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rating History */}
      {showHistory && history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Rating Changes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {history.map((rating) => {
                const changeFormat = formatEloChange(rating.rating_change);
                const afterTier = getEloTier(rating.rating_after);
                
                return (
                  <div
                    key={rating.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`text-lg ${rating.is_winner ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {rating.is_winner ? '🏆' : '💔'}
                      </div>
                      
                      <div>
                        <div className="text-sm font-medium">
                          {rating.is_winner ? 'Victory' : 'Defeat'}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          vs Opponent ({rating.opponent_rating_before})
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(rating.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className="flex items-center gap-2">
                        <span className="font-mono">{rating.rating_after}</span>
                        <span className={`text-sm font-medium ${changeFormat.color}`}>
                          ({changeFormat.text})
                        </span>
                      </div>
                      <Badge variant="secondary" className={`text-xs ${afterTier.color}`}>
                        {afterTier.icon} {afterTier.name}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}