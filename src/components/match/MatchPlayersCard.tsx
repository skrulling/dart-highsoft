"use client";

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { decorateAvg } from '@/utils/playerStats';
import type { Player, ThrowRecord, TurnRecord, TurnWithThrows } from '@/lib/match/types';
import type { FairEndingState } from '@/utils/fairEnding';
import { useMemo } from 'react';

type LocalTurn = {
  playerId: string | null;
  darts: { scored: number; label: string }[];
};

type Props = {
  match: { start_score: string; finish: string; legs_to_win: number };
  orderPlayers: Player[];
  currentPlayerId: string | null;
  matchWinnerId: string | null;
  localTurn: LocalTurn;
  turns: TurnRecord[];
  turnThrowCounts: Record<string, number>;
  getScoreForPlayer: (playerId: string) => number;
  getAvgForPlayer: (playerId: string) => number;
  checkedOutPlayerIds?: string[];
  fairEndingState?: FairEndingState;
};

export function MatchPlayersCard({
  match,
  orderPlayers,
  currentPlayerId,
  matchWinnerId,
  localTurn,
  turns,
  turnThrowCounts,
  getScoreForPlayer,
  getAvgForPlayer,
  checkedOutPlayerIds,
  fairEndingState,
}: Props) {
  const latestTurnByPlayer = useMemo(() => {
    const byPlayer: Record<string, TurnRecord> = {};
    for (const turn of turns) {
      const existing = byPlayer[turn.player_id];
      if (!existing || turn.turn_number >= existing.turn_number) {
        byPlayer[turn.player_id] = turn;
      }
    }
    return byPlayer;
  }, [turns]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Match</CardTitle>
        <CardDescription>
          Start {match.start_score} • {match.finish.replace('_', ' ')} • Legs to win {match.legs_to_win}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-2">
          {orderPlayers.map((p) => {
            const isTiebreak = fairEndingState?.phase === 'tiebreak';
            const isTiebreakPlayer = isTiebreak && fairEndingState.tiebreakPlayerIds.includes(p.id);
            const tiebreakBase = isTiebreakPlayer ? (fairEndingState.tiebreakScores[p.id] ?? 0) : 0;
            const localTiebreakAdd = isTiebreakPlayer && localTurn.playerId === p.id
              ? localTurn.darts.reduce((s, d) => s + d.scored, 0)
              : 0;
            const score = isTiebreakPlayer
              ? tiebreakBase + localTiebreakAdd
              : getScoreForPlayer(p.id);
            const avg = getAvgForPlayer(p.id);
            const deco = decorateAvg(avg);
            const isCurrent = currentPlayerId === p.id;
            const isLocalActiveTurn = localTurn.playerId === p.id && localTurn.darts.length > 0;

            // Check for throws from any client (including other clients)
            let currentThrows: ThrowRecord[] = [];
            let isRemoteActiveTurn = false;
            const lastTurn = latestTurnByPlayer[p.id] as TurnWithThrows | undefined;
            if (lastTurn && !lastTurn.busted && localTurn.playerId !== p.id) {
              const throwCount = turnThrowCounts[lastTurn.id] || 0;
              if (throwCount > 0 && throwCount < 3) {
                isRemoteActiveTurn = true;
                currentThrows = ((lastTurn as TurnWithThrows).throws ?? []).slice().sort((a, b) => a.dart_index - b.dart_index);
              }
            }

            const isActiveTurn = isLocalActiveTurn || isRemoteActiveTurn;
            return (
              <div
                key={p.id}
                className={`flex items-center justify-between rounded px-3 py-2 transition-colors ${
                  isCurrent ? 'border-2 border-yellow-500 bg-yellow-500/10' : 'border'
                }`}
              >
                <div className="flex items-center gap-2">
                  {isCurrent && !matchWinnerId && <Badge>Up</Badge>}
                  {checkedOutPlayerIds?.includes(p.id) && (
                    <Badge variant="outline" className="border-green-500 text-green-600 dark:text-green-400">Checked out</Badge>
                  )}
                  <div className="font-medium">{p.display_name}</div>
                </div>
                <div className="flex items-center gap-3">
                  {isActiveTurn && (
                    <div className="flex gap-1">
                      {isLocalActiveTurn ? (
                        // Show local client's throws
                        <>
                          {localTurn.darts.map((d, idx) => (
                            <Badge key={idx} variant="secondary">
                              {d.label}
                            </Badge>
                          ))}
                          {Array.from({ length: 3 - localTurn.darts.length }).map((_, idx) => (
                            <Badge key={`p${idx}`} variant="outline">
                              –
                            </Badge>
                          ))}
                        </>
                      ) : (
                        // Show remote client's throws
                        <>
                          {currentThrows.map((thr, idx) => (
                            <Badge key={idx} variant="default" className="bg-blue-500">
                              {thr.segment}
                            </Badge>
                          ))}
                          {Array.from({ length: 3 - currentThrows.length }).map((_, idx) => (
                            <Badge key={`r${idx}`} variant="outline">
                              –
                            </Badge>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                  <div className="flex flex-col items-end">
                    <div className="text-2xl font-mono min-w-[3ch] text-right">{score}</div>
                    <div className={`text-xs ${isTiebreakPlayer ? 'text-amber-600 dark:text-amber-400' : deco.cls}`}>
                      {isTiebreakPlayer ? `Round ${fairEndingState!.tiebreakRound} score` : `${deco.emoji} ${avg.toFixed(2)} avg`}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
