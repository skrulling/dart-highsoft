"use client";

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AroundWorldSession,
  getAroundWorldSessionStats,
  getPlayerAroundWorldHistory,
  getPlayerAroundWorldStats,
  formatDuration,
  getImprovementMessage,
  AroundWorldSessionStats,
  PlayerAroundWorldStats,
} from '@/utils/aroundTheWorld';

type Player = { id: string; display_name: string };

type Props = {
  player: Player;
  session: AroundWorldSession;
  onClose: () => void;
  onPlayAgain: () => void;
  onBack: () => void;
};

export function AroundTheWorldResults({ player, session, onClose, onPlayAgain, onBack }: Props) {
  const [sessionStats, setSessionStats] = useState<AroundWorldSessionStats | null>(null);
  const [playerStats, setPlayerStats] = useState<PlayerAroundWorldStats | null>(null);
  const [recentHistory, setRecentHistory] = useState<AroundWorldSessionStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const [stats, playerOverall, history] = await Promise.all([
          getAroundWorldSessionStats(session.id),
          getPlayerAroundWorldStats(player.id),
          getPlayerAroundWorldHistory(player.id, session.variant, 5)
        ]);

        setSessionStats(stats);
        setPlayerStats(playerOverall);
        setRecentHistory(history);
      } catch (error) {
        console.error('Error loading stats:', error);
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, [session.id, player.id, session.variant]);

  if (loading) {
    return (
      <div className="container mx-auto p-6 max-w-2xl">
        <Card>
          <CardContent className="py-12 text-center">
            <div className="text-lg text-muted-foreground">Loading results...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!sessionStats || !session.duration_seconds) {
    return (
      <div className="container mx-auto p-6 max-w-2xl">
        <Card>
          <CardContent className="py-12 text-center">
            <div className="text-lg text-muted-foreground">Error loading results</div>
            <Button onClick={onClose} className="mt-4">Close</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const improvement = getImprovementMessage(
    session.duration_seconds,
    sessionStats.previous_avg_seconds,
    session.variant === 'single' ? playerStats?.single_best_time : playerStats?.double_best_time
  );

  const isPersonalBest = sessionStats.rank_in_variant === 1;
  const variantStats = session.variant === 'single' 
    ? { sessions: playerStats?.single_sessions_completed || 0, best: playerStats?.single_best_time, avg: playerStats?.single_avg_time }
    : { sessions: playerStats?.double_sessions_completed || 0, best: playerStats?.double_best_time, avg: playerStats?.double_avg_time };

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <div className="space-y-6">
        {/* Main Result */}
        <Card className={isPersonalBest ? "border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20" : ""}>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">
              {isPersonalBest && <span className="text-4xl mb-2 block">🏆</span>}
              Session Complete!
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <div>
              <Badge variant="secondary" className="text-lg px-4 py-2 mb-4">
                {session.variant === 'single' ? 'Single' : 'Double'} Mode
              </Badge>
            </div>

            <div className="text-5xl md:text-7xl font-mono font-bold text-primary">
              {formatDuration(session.duration_seconds)}
            </div>

            <div className={`text-lg font-semibold ${
              improvement.type === 'excellent' ? 'text-green-600 dark:text-green-400' :
              improvement.type === 'good' ? 'text-blue-600 dark:text-blue-400' :
              improvement.type === 'slower' ? 'text-orange-600 dark:text-orange-400' :
              'text-muted-foreground'
            }`}>
              {improvement.message}
            </div>
          </CardContent>
        </Card>

        {/* Performance Comparison */}
        <Card>
          <CardHeader>
            <CardTitle>Your Performance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-3 rounded-lg bg-muted/30">
                <div className="text-2xl font-bold">{variantStats.sessions}</div>
                <div className="text-sm text-muted-foreground">
                  {session.variant} sessions
                </div>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/30">
                <div className="text-2xl font-bold">
                  {variantStats.best ? formatDuration(variantStats.best) : '-'}
                </div>
                <div className="text-sm text-muted-foreground">Personal best</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/30">
                <div className="text-2xl font-bold">
                  {variantStats.avg ? formatDuration(Math.round(variantStats.avg)) : '-'}
                </div>
                <div className="text-sm text-muted-foreground">Average time</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent History */}
        {recentHistory.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Recent Sessions ({session.variant})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {recentHistory.map((historySession, index) => (
                  <div 
                    key={historySession.session_id} 
                    className={`flex items-center justify-between p-3 rounded-lg ${
                      historySession.session_id === session.id ? 'bg-primary/10 border border-primary/20' : 'bg-muted/30'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {historySession.session_id === session.id && (
                        <Badge variant="secondary" className="text-xs">Current</Badge>
                      )}
                      {historySession.rank_in_variant === 1 && (
                        <span className="text-lg">🏆</span>
                      )}
                      <span className="font-mono font-semibold">
                        {formatDuration(historySession.duration_seconds!)}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {historySession.completed_at && 
                        new Date(historySession.completed_at).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={onPlayAgain} size="lg">
            Play Again ({session.variant})
          </Button>
          <Button variant="outline" onClick={onClose} size="lg">
            Try Other Variant
          </Button>
          <Button variant="outline" onClick={onBack} size="lg">
            Back to Menu
          </Button>
        </div>
      </div>
    </div>
  );
}