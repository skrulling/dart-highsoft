"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTournamentData } from '@/hooks/useTournamentData';
import { BracketView } from '@/components/tournament/BracketView';
import { TournamentStandings } from '@/components/tournament/TournamentStandings';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { apiRequest } from '@/lib/apiClient';
import Link from 'next/link';

export default function TournamentClient({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  const { loading, error, tournament, matches, players, playerMap, reload } = useTournamentData(tournamentId);
  const [endTournamentDialogOpen, setEndTournamentDialogOpen] = useState(false);
  const [endTournamentLoading, setEndTournamentLoading] = useState(false);

  function getPlayerName(id: string | null): string {
    if (!id) return 'TBD';
    return playerMap.get(id)?.display_name ?? 'Unknown';
  }

  function handleMatchClick(matchId: string) {
    router.push(`/match/${matchId}`);
  }

  if (loading) return <div className="p-4">Loading tournament...</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;
  if (!tournament) return <div className="p-4">Tournament not found</div>;

  const isInProgress = tournament.status === 'in_progress';
  const isCompleted = tournament.status === 'completed';
  const isCancelled = tournament.status === 'cancelled';

  async function handleEndTournament() {
    try {
      setEndTournamentLoading(true);
      await apiRequest(`/api/tournaments/${tournamentId}/end`, { method: 'PATCH' });
      setEndTournamentDialogOpen(false);
      await reload();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to end tournament';
      alert(message);
    } finally {
      setEndTournamentLoading(false);
    }
  }

  return (
    <div className="w-[95%] max-w-7xl mx-auto p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{tournament.name}</h1>
          <div className="text-sm text-muted-foreground">
            {tournament.start_score} {tournament.mode.toUpperCase()} &middot;{' '}
            {tournament.finish === 'double_out' ? 'Double Out' : 'Single Out'} &middot;{' '}
            Best of {tournament.legs_to_win * 2 - 1}
            {tournament.fair_ending ? ' (Fair Ending)' : ''}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={isCancelled ? 'destructive' : isCompleted ? 'secondary' : 'default'}
            className={isInProgress ? 'animate-pulse' : ''}
          >
            {isInProgress
              ? 'In Progress'
              : isCompleted
              ? 'Completed'
              : isCancelled
              ? 'Cancelled'
              : 'Pending'}
          </Badge>
          {isInProgress && (
            <Dialog open={endTournamentDialogOpen} onOpenChange={setEndTournamentDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  End Tournament
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>End Tournament Early?</DialogTitle>
                  <DialogDescription>
                    Are you sure you want to end this tournament early? This action cannot be undone.
                    <br />
                    <br />
                    <strong>Warning:</strong> Any unresolved tournament matches will be closed, no winner will be recorded, and only already-earned elimination ranks will be preserved.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setEndTournamentDialogOpen(false)}
                    disabled={endTournamentLoading}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleEndTournament}
                    disabled={endTournamentLoading}
                  >
                    {endTournamentLoading ? 'Ending...' : 'End Tournament'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          <Button asChild variant="outline" size="sm">
            <Link href="/">Home</Link>
          </Button>
        </div>
      </div>

      {/* Winner banner */}
      {tournament.winner_player_id && !isCancelled && (
        <div className="rounded-lg border-2 border-green-500/80 bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/10 p-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🏆</span>
            <div>
              <div className="text-xs uppercase tracking-wide text-green-700 dark:text-green-300">Tournament Winner</div>
              <div className="text-2xl font-extrabold">{getPlayerName(tournament.winner_player_id)}</div>
            </div>
          </div>
        </div>
      )}
      {isCancelled && (
        <div className="rounded-lg border border-amber-400/80 bg-gradient-to-br from-amber-50 to-orange-50 p-4 text-amber-900 dark:border-amber-700/60 dark:from-amber-900/20 dark:to-orange-900/10 dark:text-amber-100">
          <div className="flex items-center gap-3">
            <span className="text-3xl">⚠️</span>
            <div>
              <div className="text-xs uppercase tracking-wide text-amber-700 dark:text-amber-300">Tournament Ended Early</div>
              <div className="text-lg font-semibold">This tournament was cancelled before a winner was decided.</div>
            </div>
          </div>
        </div>
      )}

      {/* Bracket + Standings side by side on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        <BracketView
          matches={matches}
          tournamentStatus={tournament.status}
          playerName={getPlayerName}
          onMatchClick={handleMatchClick}
        />
        <TournamentStandings
          players={players}
          winnerId={tournament.winner_player_id}
          tournamentStatus={tournament.status}
        />
      </div>
    </div>
  );
}
