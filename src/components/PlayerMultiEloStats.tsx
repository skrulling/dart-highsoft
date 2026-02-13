"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  getPlayerMultiEloStats,
  getPlayerMultiEloHistory,
  type PlayerMultiEloStats,
  type MultiEloRating,
} from '@/utils/eloRatingMultiplayer';
import { getEloTier } from '@/utils/eloRating';

type Player = { id: string; display_name: string };

type Props = { player: Player; showHistory?: boolean };

export function PlayerMultiEloStats({ player, showHistory = true }: Props) {
  const [stats, setStats] = useState<PlayerMultiEloStats | null>(null);
  const [history, setHistory] = useState<MultiEloRating[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [s, h] = await Promise.all([
          getPlayerMultiEloStats(player.id),
          showHistory ? getPlayerMultiEloHistory(player.id, 10) : Promise.resolve([]),
        ]);
        setStats(s);
        setHistory(h);
      } catch (e) {
        console.error('Failed to load multiplayer elo stats', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [player.id, showHistory]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <div className="text-muted-foreground">Loading multiplayer Elo stats...</div>
        </CardContent>
      </Card>
    );
  }

  if (!stats || stats.total_rated_matches === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Multiplayer Elo Rating</CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8">
          <div className="space-y-2">
            <div className="text-6xl">🎯</div>
            <div className="text-lg font-semibold">Unrated Player</div>
            <div className="text-sm text-muted-foreground">Play some multiplayer matches to get a rating!</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const tier = getEloTier(stats.current_rating);
  const hasImproved = stats.peak_rating && stats.current_rating === stats.peak_rating;

  return (
    <div className="space-y-6">
      <Card className={hasImproved ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/20' : ''}>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Multiplayer Elo Rating
            {hasImproved && (
              <Badge variant="secondary" className="text-indigo-600 dark:text-indigo-400">
                🔥 Peak Rating!
              </Badge>
            )}
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
              <div className="text-sm text-muted-foreground">First Places</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.losses}</div>
              <div className="text-sm text-muted-foreground">Other Placings</div>
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
              <div className="text-xl font-semibold text-indigo-600 dark:text-indigo-400">{stats.peak_rating}</div>
            </div>
          )}
        </CardContent>
      </Card>

      {showHistory && history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Rating Changes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {history.map((h) => (
                <div key={h.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                  <div>
                    <div className="text-sm font-medium">Rank {h.rank}/{h.field_size}</div>
                    <div className="text-xs text-muted-foreground">
                      E={h.expected_score.toFixed(2)} S={h.observed_score.toFixed(2)} • {new Date(h.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-medium ${h.rating_change >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {h.rating_change >= 0 ? '+' : ''}{h.rating_change}
                    </div>
                    <div className="font-mono">{h.rating_after}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
