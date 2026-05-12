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
import Link from 'next/link';

export default function TournamentClient({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  const { loading, error, tournament, matches, players, playerMap } = useTournamentData(tournamentId);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDeleteTournament() {
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setDeleteError(body.error ?? 'Failed to delete tournament');
        setDeleteLoading(false);
        return;
      }
      router.push('/games');
    } catch {
      setDeleteError('Network error while deleting tournament');
      setDeleteLoading(false);
    }
  }

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
            variant={tournament.status === 'completed' ? 'secondary' : 'default'}
            className={tournament.status === 'in_progress' ? 'animate-pulse' : ''}
          >
            {tournament.status === 'in_progress' ? 'In Progress' : tournament.status === 'completed' ? 'Completed' : 'Pending'}
          </Badge>
          {tournament.status !== 'completed' && (
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  Delete
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete Tournament?</DialogTitle>
                  <DialogDescription>
                    This permanently deletes <strong>{tournament.name}</strong> and all of its
                    matches, legs, turns, and throws. This cannot be undone.
                    <br />
                    <br />
                    Use this when the tournament was created with the wrong configuration.
                  </DialogDescription>
                </DialogHeader>
                {deleteError && (
                  <div className="text-sm text-red-600">{deleteError}</div>
                )}
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setDeleteDialogOpen(false)}
                    disabled={deleteLoading}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleDeleteTournament}
                    disabled={deleteLoading}
                  >
                    {deleteLoading ? 'Deleting…' : 'Delete Tournament'}
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
      {tournament.winner_player_id && (
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

      {/* Bracket + Standings side by side on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        <BracketView
          matches={matches}
          playerName={getPlayerName}
          onMatchClick={handleMatchClick}
        />
        <TournamentStandings
          players={players}
          winnerId={tournament.winner_player_id}
        />
      </div>
    </div>
  );
}
