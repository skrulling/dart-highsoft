"use client";

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ThrowSegmentBadges } from '@/components/ThrowSegmentBadges';
import { computeCheckoutSuggestions } from '@/utils/checkoutSuggestions';
import { getLegRoundStats, getSpectatorScore } from '@/utils/matchStats';
import { decorateAvg } from '@/utils/playerStats';
import type { Player, ThrowRecord, TurnRecord, TurnWithThrows } from '@/lib/match/types';
import type { FinishRule } from '@/utils/x01';

type Props = {
  match: { start_score: string; finish: string; legs_to_win: number };
  orderPlayers: Player[];
  spectatorCurrentPlayer: Player | null;
  turns: TurnRecord[];
  currentLegId?: string;
  startScore: number;
  finishRule: FinishRule;
  turnThrowCounts: Record<string, number>;
  getAvgForPlayer: (playerId: string) => number;
};

export function SpectatorLiveMatchCard({
  match,
  orderPlayers,
  spectatorCurrentPlayer,
  turns,
  currentLegId,
  startScore,
  finishRule,
  turnThrowCounts,
  getAvgForPlayer,
}: Props) {
  return (
    <Card className="xl:col-span-2">
      <CardHeader>
        <CardTitle>Live Match</CardTitle>
        <CardDescription>
          {match.start_score} • {match.finish.replace('_', ' ')} • Legs to win {match.legs_to_win}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Current player indicator */}
          {spectatorCurrentPlayer && (
            <div className="text-center">
              <div className="text-lg font-semibold text-muted-foreground">Current Turn</div>
              <div className="text-3xl font-bold text-primary">{spectatorCurrentPlayer.display_name}</div>
            </div>
          )}

          {/* Checkout suggestions - with space reservation */}
          <div className="min-h-8 flex justify-center">
            {(() => {
              if (!spectatorCurrentPlayer) return <div className="invisible">-</div>;

              const currentScore = getSpectatorScore(
                turns,
                currentLegId,
                startScore,
                turnThrowCounts,
                spectatorCurrentPlayer.id
              );
              const playerTurns = turns.filter((turn) => turn.player_id === spectatorCurrentPlayer.id);
              const lastTurn = playerTurns.length > 0 ? playerTurns[playerTurns.length - 1] : null;
              const throwCount = lastTurn ? turnThrowCounts[lastTurn.id] || 0 : 0;

              // Determine if this is a new turn starting or continuing an incomplete turn
              // New turn if: no turns yet, last turn was busted, or last turn completed (3 throws)
              const isNewTurnStarting = !lastTurn || lastTurn.busted || throwCount === 3;
              const dartsLeft = isNewTurnStarting ? 3 : Math.max(0, 3 - throwCount);

              const paths = computeCheckoutSuggestions(currentScore, dartsLeft, finishRule);

              // Only show checkout suggestions if we're actually in a checkout scenario
              const shouldShowCheckout = currentScore > 0 && currentScore <= 170 && dartsLeft > 0;

              return (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {shouldShowCheckout && paths.length > 0
                    ? paths.map((p, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {p.join(', ')}
                        </Badge>
                      ))
                    : shouldShowCheckout ? (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          No checkout available
                        </Badge>
                      ) : (
                        <div className="invisible">-</div>
                      )}
                </div>
              );
            })()}
          </div>

          {/* Player scores with inline throw indicators */}
          <div className="grid gap-3">
            {orderPlayers.map((player) => {
              const score = getSpectatorScore(turns, currentLegId, startScore, turnThrowCounts, player.id);
              const avg = getAvgForPlayer(player.id);
              const deco = decorateAvg(avg);
              const isCurrent = spectatorCurrentPlayer?.id === player.id;

              // Get throws to display for this player
              let displayThrows: ThrowRecord[] = [];
              const playerTurns = turns.filter((turn) => turn.player_id === player.id);
              const lastTurn = playerTurns.length > 0 ? playerTurns[playerTurns.length - 1] : null;

              if (lastTurn) {
                const throwCount = turnThrowCounts[lastTurn.id] || 0;
                const isPlayerNewTurnStarting = lastTurn.busted || throwCount === 3;

                if (isCurrent && isPlayerNewTurnStarting) {
                  // Current player starting new turn - don't show any throws yet
                  displayThrows = [];
                } else if (isCurrent && throwCount > 0 && throwCount < 3) {
                  // Current player with incomplete turn - show current throws
                  displayThrows = (lastTurn as TurnWithThrows).throws || [];
                } else if (!isCurrent && (throwCount === 3 || lastTurn.busted)) {
                  // Show last completed turn for non-current players
                  displayThrows = (lastTurn as TurnWithThrows).throws || [];
                }

                displayThrows.sort((a, b) => a.dart_index - b.dart_index);
              }

              return (
                <div
                  key={player.id}
                  className={`p-4 rounded-lg transition-all duration-500 ease-in-out ${
                    isCurrent ? 'border-2 border-primary bg-primary/5 shadow-lg scale-[1.02]' : 'border bg-card hover:bg-accent/30'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isCurrent && <Badge variant="default">Playing</Badge>}
                      <div className="font-semibold text-lg">{player.display_name}</div>

                      {/* Inline throw indicators */}
                      {displayThrows.length > 0 && (
                        <ThrowSegmentBadges
                          throws={displayThrows}
                          highlightIncomplete={isCurrent}
                          showCount
                          placeholder="—"
                          className="ml-2"
                        />
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-mono font-bold">{score}</div>
                      <div className="flex flex-col items-end gap-1">
                        <div className={`text-sm font-medium ${deco.cls}`}>
                          {deco.emoji} {avg.toFixed(1)} avg
                        </div>
                        {(() => {
                          const { lastRoundScore, bestRoundScore } = getLegRoundStats(turns, currentLegId, player.id);

                          return (
                            <div className="space-y-0.5">
                              <div className="text-xs text-muted-foreground">Last: {lastRoundScore}</div>
                              <div className="text-xs text-muted-foreground">Best: {bestRoundScore}</div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

