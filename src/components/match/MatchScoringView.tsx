import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import Dartboard from '@/components/Dartboard';
import MobileKeypad from '@/components/MobileKeypad';
import { MatchPlayersCard } from '@/components/match/MatchPlayersCard';
import { EditPlayersModal } from '@/components/match/EditPlayersModal';
import { EditThrowsModal, type EditableThrow } from '@/components/match/EditThrowsModal';
import { TurnsHistoryCard } from '@/components/TurnsHistoryCard';
import { computeCheckoutSuggestions } from '@/utils/checkoutSuggestions';
import { computeHit, type SegmentResult } from '@/utils/dartboard';
import type { LegRecord, MatchRecord, Player, TurnRecord, TurnWithThrows } from '@/lib/match/types';
import type { FinishRule } from '@/utils/x01';

type Props = {
  realtimeConnectionStatus: string;
  currentPlayer: Player | null;
  getScoreForPlayer: (playerId: string) => number;
  localTurn: { playerId: string | null; darts: { scored: number; label: string; kind: SegmentResult['kind'] }[] };
  turns: TurnRecord[];
  turnThrowCounts: Record<string, number>;
  matchWinnerId: string | null;
  onBoardClick: (_x: number, _y: number, result: ReturnType<typeof computeHit>) => void;
  onUndoLastThrow: () => void;
  onOpenEditModal: () => void;
  onOpenEditPlayersModal: () => void;
  onToggleSpectatorMode: () => void;
  endGameDialogOpen: boolean;
  onEndGameDialogOpenChange: (open: boolean) => void;
  endGameLoading: boolean;
  onEndGameEarly: () => void;
  rematchLoading: boolean;
  onStartRematch: () => void;
  editOpen: boolean;
  onEditOpenChange: (open: boolean) => void;
  editingThrows: EditableThrow[];
  playerById: Record<string, Player>;
  selectedThrowId: string | null;
  onSelectThrow: (throwId: string) => void;
  onUpdateThrow: (seg: SegmentResult) => void;
  editPlayersOpen: boolean;
  onEditPlayersOpenChange: (open: boolean) => void;
  canEditPlayers: boolean;
  canReorderPlayers: boolean;
  players: Player[];
  availablePlayers: Player[];
  newPlayerName: string;
  onNewPlayerNameChange: (value: string) => void;
  onAddNewPlayer: () => void;
  onAddExistingPlayer: (playerId: string) => void;
  onRemovePlayer: (playerId: string) => void;
  onMovePlayerUp: (index: number) => void;
  onMovePlayerDown: (index: number) => void;
  match: MatchRecord;
  orderPlayers: Player[];
  turnsByLeg: Record<string, TurnRecord[]>;
  legs: LegRecord[];
  currentLeg: LegRecord;
  getAvgForPlayer: (playerId: string) => number;
  finishRule: FinishRule;
};

export function MatchScoringView({
  realtimeConnectionStatus,
  currentPlayer,
  getScoreForPlayer,
  localTurn,
  turns,
  turnThrowCounts,
  matchWinnerId,
  onBoardClick,
  onUndoLastThrow,
  onOpenEditModal,
  onOpenEditPlayersModal,
  onToggleSpectatorMode,
  endGameDialogOpen,
  onEndGameDialogOpenChange,
  endGameLoading,
  onEndGameEarly,
  rematchLoading,
  onStartRematch,
  editOpen,
  onEditOpenChange,
  editingThrows,
  playerById,
  selectedThrowId,
  onSelectThrow,
  onUpdateThrow,
  editPlayersOpen,
  onEditPlayersOpenChange,
  canEditPlayers,
  canReorderPlayers,
  players,
  availablePlayers,
  newPlayerName,
  onNewPlayerNameChange,
  onAddNewPlayer,
  onAddExistingPlayer,
  onRemovePlayer,
  onMovePlayerUp,
  onMovePlayerDown,
  match,
  orderPlayers,
  turnsByLeg,
  legs,
  currentLeg,
  getAvgForPlayer,
  finishRule,
}: Props) {
  return (
    <div className="w-full space-y-3 md:space-y-6 md:-ml-[calc(50vw-50%)] md:-mr-6 md:pl-4 md:pr-4 lg:pr-6 md:max-w-none relative">
      {/* Connection status indicator */}
      <div className="fixed bottom-4 right-4 z-50">
        <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-white/90 dark:bg-gray-800/90 shadow-sm text-xs">
          <div
            className={`w-2 h-2 rounded-full ${
              realtimeConnectionStatus === 'connected'
                ? 'bg-green-500'
                : realtimeConnectionStatus === 'connecting'
                ? 'bg-yellow-500 animate-pulse'
                : realtimeConnectionStatus === 'error'
                ? 'bg-red-500'
                : 'bg-gray-500'
            }`}
          />
          <span className="font-medium">
            {realtimeConnectionStatus === 'connected'
              ? 'Live'
              : realtimeConnectionStatus === 'connecting'
              ? 'Connecting...'
              : realtimeConnectionStatus === 'error'
              ? 'Error'
              : 'Offline'}
          </span>
        </div>
      </div>
      {/* Scoring input at top (mobile keypad or desktop board) */}
      <div className="w-full space-y-6 md:space-y-0 md:grid md:grid-cols-[minmax(320px,25%)_1fr] md:gap-4 lg:gap-6 md:items-start">
        <div className="space-y-3 md:col-start-2 md:row-start-1">
          {/* Mobile: player indicator + keypad at top */}
          <div className="md:hidden space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="font-medium">{currentPlayer?.display_name ?? '—'}</div>
                {currentPlayer && (
                  <span className="rounded-full border border-yellow-400/60 bg-yellow-50 px-3 py-1 text-sm font-mono text-yellow-700 shadow-sm dark:border-yellow-700/60 dark:bg-yellow-900/30 dark:text-yellow-200">
                    {getScoreForPlayer(currentPlayer.id)} pts
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                {(() => {
                  // Show throws from current player (could be local or remote)
                  if (currentPlayer && localTurn.playerId === currentPlayer.id) {
                    // Local turn - show local darts
                    return (
                      <>
                        {localTurn.darts.map((d, idx) => (
                          <Badge key={idx} variant="secondary">
                            {d.label}
                          </Badge>
                        ))}
                        {Array.from({ length: 3 - localTurn.darts.length }).map((_, idx) => (
                          <Badge key={`m${idx}`} variant="outline">
                            –
                          </Badge>
                        ))}
                      </>
                    );
                  } else if (currentPlayer) {
                    // Remote turn - show remote throws
                    const playerTurns = turns.filter((turn) => turn.player_id === currentPlayer.id);
                    const lastTurn = playerTurns.length > 0 ? playerTurns[playerTurns.length - 1] : null;
                    if (lastTurn && !lastTurn.busted) {
                      const throwCount = turnThrowCounts[lastTurn.id] || 0;
                      if (throwCount > 0 && throwCount < 3) {
                        const currentThrows = (lastTurn as TurnWithThrows).throws || [];
                        currentThrows.sort((a, b) => a.dart_index - b.dart_index);
                        return (
                          <>
                            {currentThrows.map((thr, idx) => (
                              <Badge key={idx} variant="default" className="bg-blue-500">
                                {thr.scored}
                              </Badge>
                            ))}
                            {Array.from({ length: 3 - currentThrows.length }).map((_, idx) => (
                              <Badge key={`r${idx}`} variant="outline">
                                –
                              </Badge>
                            ))}
                          </>
                        );
                      }
                    }
                    // No active turn - show empty darts
                    return (
                      <>
                        {Array.from({ length: 3 }).map((_, idx) => (
                          <Badge key={`e${idx}`} variant="outline">
                            –
                          </Badge>
                        ))}
                      </>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>
          </div>
          {/* Checkout suggestions */}
          <div className="text-xs text-muted-foreground">
            {(() => {
              const rem = currentPlayer ? getScoreForPlayer(currentPlayer.id) : 0;

              // Calculate darts left - could be from local or remote turn
              let dartsLeft = 3;
              if (currentPlayer && localTurn.playerId === currentPlayer.id) {
                dartsLeft = 3 - localTurn.darts.length;
              } else if (currentPlayer) {
                const playerTurns = turns.filter((turn) => turn.player_id === currentPlayer.id);
                const lastTurn = playerTurns.length > 0 ? playerTurns[playerTurns.length - 1] : null;
                if (lastTurn && !lastTurn.busted) {
                  const throwCount = turnThrowCounts[lastTurn.id] || 0;
                  if (throwCount > 0 && throwCount < 3) {
                    dartsLeft = 3 - throwCount;
                  }
                }
              }

              const paths = computeCheckoutSuggestions(rem, dartsLeft, finishRule);
              return (
                <div className="flex flex-wrap items-center gap-2 min-h-6">
                  {paths.length > 0 && rem !== 0 ? (
                    paths.map((p, i) => (
                      <Badge key={i} variant="outline">
                        {p.join(', ')}
                      </Badge>
                    ))
                  ) : (
                    <Badge variant="outline" className="invisible" aria-hidden>
                      –
                    </Badge>
                  )}
                </div>
              );
            })()}
          </div>
          <div className={`${matchWinnerId ? 'pointer-events-none opacity-50' : ''} md:hidden`}>
            <MobileKeypad onHit={(seg) => onBoardClick(0, 0, seg as unknown as ReturnType<typeof computeHit>)} />
          </div>
          {/* Desktop: board with buttons on the right */}
          <div className="hidden md:flex items-start gap-4">
            <div className={`flex-1 flex justify-center ${matchWinnerId ? 'pointer-events-none opacity-50' : ''}`}>
              <Dartboard onHit={onBoardClick} />
            </div>
            <div className="flex flex-col gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={onUndoLastThrow}
                disabled={!!matchWinnerId}
                className="text-xs whitespace-nowrap"
              >
                Undo dart
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onOpenEditModal}
                disabled={!currentLeg}
                className="text-xs whitespace-nowrap"
              >
                Edit throws
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onOpenEditPlayersModal}
                disabled={!canEditPlayers}
                className="text-xs whitespace-nowrap"
              >
                Edit players
              </Button>
              <Button variant="outline" size="sm" onClick={onToggleSpectatorMode} className="text-xs whitespace-nowrap">
                Spectator
              </Button>
              {!matchWinnerId && (
                <Dialog open={endGameDialogOpen} onOpenChange={onEndGameDialogOpenChange}>
                  <DialogTrigger asChild>
                    <Button variant="destructive" size="sm" className="text-xs whitespace-nowrap">
                      End Game
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>End Game Early?</DialogTitle>
                      <DialogDescription>
                        Are you sure you want to end this game early? This action cannot be undone.
                        <br />
                        <br />
                        <strong>Warning:</strong> This match and all its statistics will not count towards player records.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => onEndGameDialogOpenChange(false)} disabled={endGameLoading}>
                        Cancel
                      </Button>
                      <Button variant="destructive" onClick={onEndGameEarly} disabled={endGameLoading}>
                        {endGameLoading ? 'Ending...' : 'End Game'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
              {matchWinnerId && (
                <Button onClick={onStartRematch} disabled={rematchLoading} size="sm" className="text-xs whitespace-nowrap">
                  {rematchLoading ? 'Starting…' : 'Rematch'}
                </Button>
              )}
            </div>
          </div>
          {/* Mobile: buttons below keypad */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-2 md:hidden">
            <Button variant="outline" size="sm" onClick={onUndoLastThrow} disabled={!!matchWinnerId} className="text-xs sm:text-sm">
              Undo dart
            </Button>
            <Button variant="outline" size="sm" onClick={onOpenEditModal} disabled={!currentLeg} className="text-xs sm:text-sm">
              Edit throws
            </Button>
            <Button variant="outline" size="sm" onClick={onOpenEditPlayersModal} disabled={!canEditPlayers} className="text-xs sm:text-sm">
              Edit players
            </Button>
          </div>
          {matchWinnerId && (
            <Card className="mt-4 overflow-hidden border-2 border-green-500/80 shadow-md ring-2 ring-green-400/30 bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/10 md:hidden">
              <CardContent className="py-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl animate-bounce">🏆</span>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-green-700 dark:text-green-300">Winner</div>
                      <div className="text-2xl font-extrabold">
                        {players.find((p) => p.id === matchWinnerId)?.display_name}
                      </div>
                      <div className="text-sm text-green-700/80 dark:text-green-200/80">wins the match!</div>
                    </div>
                  </div>
                  <Button onClick={onStartRematch} disabled={rematchLoading}>
                    {rematchLoading ? 'Starting…' : 'Rematch'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4 md:col-start-1 md:row-start-1">
          {/* Desktop: current player header - above sidebar */}
          <div className="hidden md:flex items-center gap-3 mb-2">
            <div className="text-lg font-medium">{currentPlayer?.display_name ?? '—'}</div>
            {currentPlayer && (
              <span className="rounded-full border border-yellow-400/60 bg-yellow-50 px-3 py-1 text-sm font-mono text-yellow-700 shadow-sm dark:border-yellow-700/60 dark:bg-yellow-900/30 dark:text-yellow-200">
                {getScoreForPlayer(currentPlayer.id)} pts
              </span>
            )}
          </div>
          {/* Match info and summaries */}
          <EditThrowsModal
            open={editOpen}
            onClose={() => onEditOpenChange(false)}
            throws={editingThrows}
            playerById={playerById}
            selectedThrowId={selectedThrowId}
            onSelectThrow={(throwId) => onSelectThrow(throwId)}
            onUpdateThrow={onUpdateThrow}
          />

          <EditPlayersModal
            open={editPlayersOpen}
            onClose={() => onEditPlayersOpenChange(false)}
            canEditPlayers={canEditPlayers}
            canReorderPlayers={canReorderPlayers}
            players={players}
            availablePlayers={availablePlayers}
            newPlayerName={newPlayerName}
            onNewPlayerNameChange={onNewPlayerNameChange}
            onAddNewPlayer={onAddNewPlayer}
            onAddExistingPlayer={onAddExistingPlayer}
            onRemovePlayer={onRemovePlayer}
            onMovePlayerUp={onMovePlayerUp}
            onMovePlayerDown={onMovePlayerDown}
          />

          <MatchPlayersCard
            match={match}
            orderPlayers={orderPlayers}
            currentPlayerId={currentPlayer?.id ?? null}
            matchWinnerId={matchWinnerId}
            localTurn={localTurn}
            turns={turns}
            turnThrowCounts={turnThrowCounts}
            getScoreForPlayer={getScoreForPlayer}
            getAvgForPlayer={getAvgForPlayer}
          />
          {match && match.legs_to_win > 1 && legs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Legs</CardTitle>
                <CardDescription>Winners and averages</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-2">
                  {legs.map((l) => {
                    const winner = players.find((p) => p.id === l.winner_player_id);
                    const legTurns = turnsByLeg[l.id] ?? [];
                    const byPlayer: Record<string, { total: number; turns: number }> = {};
                    for (const t of legTurns) {
                      if (!byPlayer[t.player_id]) byPlayer[t.player_id] = { total: 0, turns: 0 };
                      byPlayer[t.player_id].turns += 1;
                      if (!t.busted) byPlayer[t.player_id].total += t.total_scored;
                    }
                    return (
                      <div key={l.id} className="flex items-center justify-between rounded border px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">Leg {l.leg_number}</span>
                          {winner && <span>🏆 {winner.display_name}</span>}
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          {orderPlayers.map((p) => {
                            const s = byPlayer[p.id] ?? { total: 0, turns: 0 };
                            const avg = s.turns > 0 ? (s.total / s.turns).toFixed(2) : '0.00';
                            return (
                              <span key={p.id} className="text-muted-foreground">
                                {p.display_name}: {avg}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
          {false && matchWinnerId && null}
          <TurnsHistoryCard turns={turns} playerById={playerById} playersCount={players.length} placeholder="—" />
        </div>
      </div>
      {/* Action Buttons - Mobile only */}
      <div className="flex flex-col sm:flex-row gap-2 pt-4 md:hidden">
        {!matchWinnerId && (
          <Dialog open={endGameDialogOpen} onOpenChange={onEndGameDialogOpenChange}>
            <DialogTrigger asChild>
              <Button variant="destructive" className="flex-1 sm:max-w-xs">
                End Game Early
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>End Game Early?</DialogTitle>
                <DialogDescription>
                  Are you sure you want to end this game early? This action cannot be undone.
                  <br />
                  <br />
                  <strong>Warning:</strong> This match and all its statistics will not count towards player records.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => onEndGameDialogOpenChange(false)} disabled={endGameLoading}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={onEndGameEarly} disabled={endGameLoading}>
                  {endGameLoading ? 'Ending...' : 'End Game'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
        <Button variant="outline" onClick={onToggleSpectatorMode} className="flex-1 sm:max-w-xs">
          Enter Spectator Mode
        </Button>
      </div>
    </div>
  );
}
