"use client";

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { EloChangesDisplay } from '@/components/match/EloChangesDisplay';
import type { MatchEloChange } from '@/hooks/useMatchEloChanges';

const DUMMY_PLAYERS: Record<string, { display_name: string }> = {
  'p1': { display_name: 'Alex Storm' },
  'p2': { display_name: 'Mia Larsen' },
  'p3': { display_name: 'Jonas Berg' },
  'p4': { display_name: 'Eline Haugen' },
};

const scenarios: { label: string; winnerId: string; changes: MatchEloChange[] }[] = [
  {
    label: '1v1 — Close match',
    winnerId: 'p1',
    changes: [
      { player_id: 'p1', rating_before: 1234, rating_after: 1250, rating_change: 16 },
      { player_id: 'p2', rating_before: 1280, rating_after: 1264, rating_change: -16 },
    ],
  },
  {
    label: '1v1 — Upset (low beats high)',
    winnerId: 'p2',
    changes: [
      { player_id: 'p2', rating_before: 1050, rating_after: 1078, rating_change: 28 },
      { player_id: 'p1', rating_before: 1450, rating_after: 1422, rating_change: -28 },
    ],
  },
  {
    label: '1v1 — Zero change',
    winnerId: 'p1',
    changes: [
      { player_id: 'p1', rating_before: 1200, rating_after: 1200, rating_change: 0 },
      { player_id: 'p2', rating_before: 1200, rating_after: 1200, rating_change: 0 },
    ],
  },
  {
    label: 'Multiplayer (4 players)',
    winnerId: 'p1',
    changes: [
      { player_id: 'p1', rating_before: 1300, rating_after: 1332, rating_change: 32 },
      { player_id: 'p2', rating_before: 1250, rating_after: 1244, rating_change: -6 },
      { player_id: 'p3', rating_before: 1180, rating_after: 1170, rating_change: -10 },
      { player_id: 'p4', rating_before: 1400, rating_after: 1384, rating_change: -16 },
    ],
  },
  {
    label: 'Empty (match ended early)',
    winnerId: 'p1',
    changes: [],
  },
];

export default function DebugEloModalPage() {
  const [activeScenario, setActiveScenario] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const scenario = scenarios[activeScenario];

  return (
    <div className="p-6 space-y-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold">ELO Modal Debug</h1>

      {/* Scenario picker */}
      <div className="flex flex-wrap gap-2">
        {scenarios.map((s, i) => (
          <Button
            key={i}
            variant={i === activeScenario ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveScenario(i)}
          >
            {s.label}
          </Button>
        ))}
      </div>

      {/* --- Mobile Card preview --- */}
      <div>
        <h2 className="text-lg font-semibold mb-2">Mobile Card (MatchScoringView)</h2>
        <Card className="overflow-hidden border-2 border-green-500/80 shadow-md ring-2 ring-green-400/30 bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/10">
          <CardContent className="py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-3xl animate-bounce">🏆</span>
                <div>
                  <div className="text-xs uppercase tracking-wide text-green-700 dark:text-green-300">Winner</div>
                  <div className="text-2xl font-extrabold">
                    {DUMMY_PLAYERS[scenario.winnerId]?.display_name}
                  </div>
                  <div className="text-sm text-green-700/80 dark:text-green-200/80">wins the match!</div>
                </div>
              </div>
              <Button disabled>Rematch</Button>
            </div>
            <EloChangesDisplay
              eloChanges={scenario.changes}
              loading={false}
              matchWinnerId={scenario.winnerId}
              playerById={DUMMY_PLAYERS}
            />
          </CardContent>
        </Card>
      </div>

      {/* --- Spectator Dialog preview --- */}
      <div>
        <h2 className="text-lg font-semibold mb-2">Spectator Dialog (MatchSpectatorView)</h2>
        <Button onClick={() => setDialogOpen(true)}>Open Winner Dialog</Button>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogTitle className="sr-only">Match Winner</DialogTitle>
            <div className="text-center space-y-4">
              <div className="text-5xl md:text-6xl">🏆</div>
              <div className="text-3xl md:text-4xl font-extrabold text-green-600 dark:text-green-400">
                {DUMMY_PLAYERS[scenario.winnerId]?.display_name} Wins!
              </div>
              <div className="text-base md:text-lg text-muted-foreground">
                Match complete
              </div>
              <EloChangesDisplay
                eloChanges={scenario.changes}
                loading={false}
                matchWinnerId={scenario.winnerId}
                playerById={DUMMY_PLAYERS}
              />
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* --- Loading state preview --- */}
      <div>
        <h2 className="text-lg font-semibold mb-2">Loading state (should show nothing)</h2>
        <Card className="p-4">
          <EloChangesDisplay
            eloChanges={[]}
            loading={true}
            matchWinnerId="p1"
            playerById={DUMMY_PLAYERS}
          />
          <span className="text-muted-foreground text-sm">(empty — correct behavior)</span>
        </Card>
      </div>
    </div>
  );
}
