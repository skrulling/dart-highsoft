import QRCode from 'react-qr-code';
import { Home } from 'lucide-react';
import { TurnRow } from '@/components/TurnRow';
import { SpectatorLiveMatchCard } from '@/components/match/SpectatorLiveMatchCard';
import CommentaryDisplay from '@/components/CommentaryDisplay';
import CommentarySettings from '@/components/CommentarySettings';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { EloChangesDisplay } from '@/components/match/EloChangesDisplay';
import type { MatchEloChange } from '@/hooks/useMatchEloChanges';
import type { CommentaryPersona, CommentaryPersonaId } from '@/lib/commentary/types';
import type { LegRecord, MatchRecord, Player, TurnRecord } from '@/lib/match/types';
import type { VoiceOption } from '@/services/ttsService';
import type { FinishRule } from '@/utils/x01';
import type { FairEndingState } from '@/utils/fairEnding';
import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';

const ScoreProgressChart = dynamic(
  () => import('@/components/ScoreProgressChart').then((module) => module.ScoreProgressChart),
  { loading: () => <div className="h-[300px] w-full animate-pulse rounded-md bg-muted/30" /> }
);

type CelebrationState = {
  score: number;
  playerName: string;
  level: 'info' | 'good' | 'excellent' | 'godlike' | 'max' | 'bust';
  throws: { segment: string; scored: number; dart_index: number }[];
} | null;

type Props = {
  celebration: CelebrationState;
  realtimeConnectionStatus: string;
  realtimeIsConnected: boolean;
  spectatorLoading: boolean;
  matchUrl: string;
  match: MatchRecord;
  orderPlayers: Player[];
  spectatorCurrentPlayer: Player | null;
  turns: TurnRecord[];
  currentLegId?: string;
  startScore: number;
  finishRule: FinishRule;
  turnThrowCounts: Record<string, number>;
  getAvgForPlayer: (playerId: string) => number;
  legs: LegRecord[];
  players: Player[];
  playerById: Record<string, Player>;
  matchWinnerId: string | null;
  onHome: () => void;
  onToggleSpectatorMode: () => void;
  commentaryEnabled: boolean;
  audioEnabled: boolean;
  voice: VoiceOption;
  personaId: CommentaryPersonaId;
  onCommentaryEnabledChange: (enabled: boolean) => void;
  onAudioEnabledChange: (enabled: boolean) => void;
  onVoiceChange: (voice: VoiceOption) => void;
  onPersonaChange: (personaId: CommentaryPersonaId) => void;
  currentCommentary: string | null;
  commentaryLoading: boolean;
  commentaryPlaying: boolean;
  onSkipCommentary: () => void;
  onToggleMute: () => void;
  queueLength: number;
  activePersona: CommentaryPersona;
  eloChanges: MatchEloChange[];
  eloChangesLoading: boolean;
  fairEndingState?: FairEndingState;
};

const confettiColors = ['#22c55e', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#a855f7'];

function ConfettiOverlay() {
  const pieces = Array.from({ length: 120 }, (_, i) => i);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((i) => {
        const left = (i * 7) % 100;
        const delay = (i % 12) * 0.08;
        const duration = 2.4 + (i % 6) * 0.25;
        const size = 5 + (i % 5) * 2;
        const rotate = (i * 37) % 360;
        return (
          <span
            key={i}
            className="confetti-piece"
            style={{
              left: `${left}%`,
              width: `${size}px`,
              height: `${size * 1.6}px`,
              backgroundColor: confettiColors[i % confettiColors.length],
              animationDelay: `${delay}s`,
              animationDuration: `${duration}s`,
              transform: `rotate(${rotate}deg)`,
            }}
          />
        );
      })}
      <style jsx>{`
        .confetti-piece {
          position: absolute;
          top: -10%;
          opacity: 0.9;
          border-radius: 2px;
          animation-name: confetti-fall;
          animation-timing-function: ease-in;
          animation-iteration-count: 1;
        }
        @keyframes confetti-fall {
          0% {
            transform: translateY(0) translateX(0) rotate(0deg);
            opacity: 1;
          }
          60% {
            opacity: 1;
          }
          100% {
            transform: translateY(140vh) translateX(20px) rotate(240deg);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}

export function MatchSpectatorView({
  celebration,
  realtimeConnectionStatus,
  realtimeIsConnected,
  spectatorLoading,
  matchUrl,
  match,
  orderPlayers,
  spectatorCurrentPlayer,
  turns,
  currentLegId,
  startScore,
  finishRule,
  turnThrowCounts,
  getAvgForPlayer,
  legs,
  players,
  playerById,
  matchWinnerId,
  onHome,
  onToggleSpectatorMode,
  commentaryEnabled,
  audioEnabled,
  voice,
  personaId,
  onCommentaryEnabledChange,
  onAudioEnabledChange,
  onVoiceChange,
  onPersonaChange,
  currentCommentary,
  commentaryLoading,
  commentaryPlaying,
  onSkipCommentary,
  onToggleMute,
  queueLength,
  activePersona,
  eloChanges,
  eloChangesLoading,
  fairEndingState,
}: Props) {
  const [winnerModalOpen, setWinnerModalOpen] = useState(false);

  useEffect(() => {
    setWinnerModalOpen(Boolean(matchWinnerId));
  }, [matchWinnerId]);

  const topThreeTurns = useMemo(
    () =>
      turns
        .filter((t) => t.leg_id === currentLegId && !t.busted && t.total_scored > 0)
        .sort((a, b) => b.total_scored - a.total_scored)
        .slice(0, 3),
    [turns, currentLegId]
  );

  const recentThreeTurns = useMemo(
    () =>
      turns
        .filter((t) => t.leg_id === currentLegId && !t.busted)
        .sort((a, b) => b.turn_number - a.turn_number)
        .slice(0, 3),
    [turns, currentLegId]
  );

  return (
    <div className="fixed inset-0 overflow-y-auto bg-background">
      <div className="w-full space-y-3 md:space-y-6 px-4 md:px-6 xl:px-8 py-6 pb-24 md:pb-6 relative">
        {/* Round Score Modal */}
        <Dialog open={!!celebration} onOpenChange={() => {}}>
          <DialogContent className="sm:max-w-md [&>button]:hidden">
            <DialogTitle className="sr-only">
              {celebration?.level === 'bust'
                ? `${celebration?.playerName} busted with ${celebration?.score} points`
                : `Round Score: ${celebration?.playerName} scored ${celebration?.score} points`}
            </DialogTitle>
            <div className="text-center space-y-4">
              <div
                className={`font-extrabold ${
                  celebration?.level === 'bust'
                    ? 'text-5xl md:text-6xl text-red-600 dark:text-red-400'
                    : celebration?.level === 'max'
                    ? 'text-6xl md:text-7xl bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-500 bg-clip-text text-transparent drop-shadow'
                    : celebration?.level === 'godlike'
                    ? 'text-5xl md:text-6xl bg-gradient-to-r from-fuchsia-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent'
                    : celebration?.level === 'excellent'
                    ? 'text-5xl md:text-6xl bg-gradient-to-r from-yellow-400 via-red-500 to-pink-500 bg-clip-text text-transparent'
                    : celebration?.level === 'good'
                    ? 'text-5xl md:text-6xl bg-gradient-to-r from-blue-500 to-green-500 bg-clip-text text-transparent'
                    : 'text-4xl md:text-5xl text-foreground'
                }`}
              >
                {celebration?.level === 'bust'
                  ? 'BUST'
                  : celebration?.level === 'max'
                  ? '180!'
                  : celebration?.score}
              </div>
              <div
                className={`font-bold text-xl md:text-2xl ${
                  celebration?.level === 'bust'
                    ? 'text-red-600 dark:text-red-400'
                    : celebration?.level === 'max'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : celebration?.level === 'godlike'
                    ? 'text-fuchsia-600 dark:text-fuchsia-400'
                    : celebration?.level === 'excellent'
                    ? 'text-yellow-600 dark:text-yellow-400'
                    : celebration?.level === 'good'
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-foreground'
                }`}
              >
                {celebration?.playerName}
              </div>
              {celebration?.level !== 'info' && (
                <div
                  className={`text-lg md:text-xl font-semibold ${
                    celebration?.level === 'bust'
                      ? 'text-red-600 dark:text-red-400'
                      : celebration?.level === 'max'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : celebration?.level === 'godlike'
                      ? 'text-fuchsia-600 dark:text-fuchsia-400'
                      : celebration?.level === 'excellent'
                      ? 'text-red-500 dark:text-red-400'
                      : 'text-green-600 dark:text-green-400'
                  }`}
                >
                  {celebration?.level === 'bust'
                    ? '💥 BUST! 💥'
                    : celebration?.level === 'max'
                    ? '🎯 180! 🎯'
                    : celebration?.level === 'godlike'
                    ? '🌟 GODLIKE 🌟'
                    : celebration?.level === 'excellent'
                    ? '🔥 EXCELLENT! 🔥'
                    : '⚡ GREAT ROUND! ⚡'}
                </div>
              )}

              {/* Individual Dart Throws */}
              {celebration?.throws && celebration.throws.length > 0 && (
                <div className="space-y-2">
                  <div className="text-sm font-medium text-muted-foreground">Darts Thrown</div>
                  <div className="flex justify-center items-center gap-3">
                    {celebration.throws.map((dart, index) => (
                      <div
                        key={`${dart.dart_index}-${index}`}
                        className="bg-muted/50 rounded-lg px-3 py-2 font-mono text-lg font-semibold"
                      >
                        {dart.segment === 'MISS' || dart.segment === 'Miss' ? 'Miss' : dart.segment}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Connection status and refresh indicator */}
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2">
          {/* Real-time connection status */}
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

          {/* Loading indicator for fallback polling */}
          {spectatorLoading && !realtimeIsConnected && (
            <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
          )}
        </div>

        {matchUrl && (
          <div className="fixed bottom-4 left-4 z-40 pointer-events-none opacity-80">
            <span className="sr-only">Join match QR code</span>
            <QRCode value={matchUrl} size={72} />
          </div>
        )}

        {/* Fair ending status banner */}
        {fairEndingState && fairEndingState.phase === 'completing_round' && (
          <div className="rounded-md border border-amber-400/60 bg-amber-50 px-4 py-3 text-amber-800 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-200">
            <div className="font-semibold">Completing round</div>
            <div className="text-sm">
              {fairEndingState.checkedOutPlayerIds.length === 1
                ? `${orderPlayers.find((p) => p.id === fairEndingState.checkedOutPlayerIds[0])?.display_name ?? 'Player'} checked out! Remaining players complete the round.`
                : `${fairEndingState.checkedOutPlayerIds.length} players checked out! Remaining players complete the round.`}
            </div>
          </div>
        )}
        {fairEndingState && fairEndingState.phase === 'tiebreak' && (
          <div className="rounded-md border border-purple-400/60 bg-purple-50 px-4 py-3 text-purple-800 dark:border-purple-700/60 dark:bg-purple-900/20 dark:text-purple-200">
            <div className="font-semibold">Tiebreak Round {fairEndingState.tiebreakRound}</div>
            <div className="text-sm">Multiple players checked out — highest score wins!</div>
          </div>
        )}

        {/* Cards Row - responsive layout */}
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          <SpectatorLiveMatchCard
            match={match}
            orderPlayers={orderPlayers}
            spectatorCurrentPlayer={spectatorCurrentPlayer}
            turns={turns}
            currentLegId={currentLegId}
            startScore={startScore}
            finishRule={finishRule}
            turnThrowCounts={turnThrowCounts}
            getAvgForPlayer={getAvgForPlayer}
            fairEndingState={fairEndingState}
          />

          {/* Legs Summary */}
          {legs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Legs Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {legs.map((leg) => {
                  const winner = leg.winner_player_id ? playerById[leg.winner_player_id] : undefined;
                  return (
                    <div
                      key={leg.id}
                      className="flex items-center justify-between p-3 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <span className="font-medium">Leg {leg.leg_number}</span>
                      {winner ? (
                        <span className="font-semibold text-green-600 dark:text-green-400">🏆 {winner.display_name}</span>
                      ) : (
                        <span className="text-muted-foreground">In Progress</span>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Round Statistics */}
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle>Round Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-[55vh] overflow-y-auto space-y-6 pr-1">
                {/* Top 3 Round Scores */}
                <div>
                  <h4 className="font-semibold mb-3">Top 3 Rounds</h4>
                  <div className="space-y-1">
                    {topThreeTurns.length > 0 ? (
                      topThreeTurns.map((turn, index) => {
                        const medal = ['🥇', '🥈', '🥉'][index] || '🏆';
                        return (
                          <TurnRow
                            key={turn.id}
                            turn={turn}
                            playerName={playerById[turn.player_id]?.display_name}
                            playersCount={players.length}
                            leading={<span className="text-xl">{medal}</span>}
                            placeholder="—"
                            className="p-3 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors"
                            totalClassName="text-primary text-lg"
                            throwBadgeClassName="text-[10px]"
                          />
                        );
                      })
                    ) : (
                      <div className="text-center py-4 text-muted-foreground">
                        <div className="text-sm">No completed rounds yet</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Last 3 Rounds */}
                <div>
                  <h4 className="font-semibold mb-3">Recent Rounds</h4>
                  <div className="space-y-1">
                    {recentThreeTurns.length > 0 ? (
                      recentThreeTurns.map((turn) => (
                        <TurnRow
                          key={turn.id}
                          turn={turn}
                          playerName={playerById[turn.player_id]?.display_name}
                          playersCount={players.length}
                          placeholder="—"
                          className="p-3 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors"
                          throwBadgeClassName="text-[10px]"
                        />
                      ))
                    ) : (
                      <div className="text-center py-4 text-muted-foreground">
                        <div className="text-sm">No recent rounds yet</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Score Progress Chart - Second Row */}
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Score Progress</CardTitle>
            <CardDescription>
              Player scores by round - showing the remaining points for each player over time
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScoreProgressChart
              players={orderPlayers}
              turns={turns}
              startScore={parseInt(match.start_score)}
              currentLegId={currentLegId}
            />
          </CardContent>
        </Card>

        {/* Match winner modal */}
        <Dialog open={winnerModalOpen && !!matchWinnerId} onOpenChange={setWinnerModalOpen}>
          <DialogContent className="sm:max-w-md [&>button]:hidden">
            <DialogTitle className="sr-only">Match Winner</DialogTitle>
            <ConfettiOverlay />
            <div className="text-center space-y-4">
              <div className="text-5xl md:text-6xl">🏆</div>
              <div className="text-3xl md:text-4xl font-extrabold text-green-600 dark:text-green-400">
                {(matchWinnerId ? playerById[matchWinnerId] : undefined)?.display_name} Wins!
              </div>
              <div className="text-base md:text-lg text-muted-foreground">
                Match complete
              </div>
              <EloChangesDisplay
                eloChanges={eloChanges}
                loading={eloChangesLoading}
                matchWinnerId={matchWinnerId}
                playerById={playerById}
              />
            </div>
          </DialogContent>
        </Dialog>

        {/* Navigation Buttons */}
        <div className="flex justify-center gap-3 pt-6 pb-20 md:pb-6">
          <Button variant="outline" onClick={onHome} className="flex items-center gap-2 flex-1 max-w-xs">
            <Home size={16} />
            Home
          </Button>
          <Button variant="outline" onClick={onToggleSpectatorMode} className="flex-1 max-w-xs">
            Exit Spectator Mode
          </Button>
          <CommentarySettings
            enabled={commentaryEnabled}
            audioEnabled={audioEnabled}
            voice={voice}
            personaId={personaId}
            onEnabledChange={onCommentaryEnabledChange}
            onAudioEnabledChange={onAudioEnabledChange}
            onVoiceChange={onVoiceChange}
            onPersonaChange={onPersonaChange}
          />
        </div>

        {/* Commentary Display */}
        {commentaryEnabled && (
          <CommentaryDisplay
            commentary={currentCommentary}
            isLoading={commentaryLoading}
            isPlaying={commentaryPlaying}
            onSkip={onSkipCommentary}
            onToggleMute={onToggleMute}
            isMuted={!audioEnabled}
            queueLength={queueLength}
            speakerName={activePersona.label}
            speakerAvatar={activePersona.avatar}
            thinkingLabel={activePersona.thinkingLabel}
          />
        )}
      </div>
    </div>
  );
}
