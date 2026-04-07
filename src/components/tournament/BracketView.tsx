"use client";

import { useMemo } from 'react';
import { BracketMatchCard } from './BracketMatchCard';
import type { TournamentMatchRecord, TournamentStatus } from '@/lib/tournament/types';

type Props = {
  matches: TournamentMatchRecord[];
  tournamentStatus: TournamentStatus;
  playerName: (id: string | null) => string;
  onMatchClick?: (matchId: string) => void;
};

export function BracketView({ matches, tournamentStatus, playerName, onMatchClick }: Props) {
  const { wbRounds, lbRounds, gfMatches } = useMemo(() => {
    const wb = matches.filter((m) => m.bracket === 'winners');
    const lb = matches.filter((m) => m.bracket === 'losers');
    const gf = matches.filter((m) => m.bracket === 'grand_final');

    const wbByRound = new Map<number, TournamentMatchRecord[]>();
    for (const m of wb) {
      const arr = wbByRound.get(m.round) ?? [];
      arr.push(m);
      wbByRound.set(m.round, arr);
    }

    const lbByRound = new Map<number, TournamentMatchRecord[]>();
    for (const m of lb) {
      const arr = lbByRound.get(m.round) ?? [];
      arr.push(m);
      lbByRound.set(m.round, arr);
    }

    // Sort each round by position
    for (const [, arr] of wbByRound) arr.sort((a, b) => a.position - b.position);
    for (const [, arr] of lbByRound) arr.sort((a, b) => a.position - b.position);
    gf.sort((a, b) => a.round - b.round);

    return {
      wbRounds: Array.from(wbByRound.entries()).sort(([a], [b]) => a - b),
      lbRounds: Array.from(lbByRound.entries()).sort(([a], [b]) => a - b),
      gfMatches: gf,
    };
  }, [matches]);

  if (matches.length === 0) return null;

  return (
    <div className="space-y-6">
      {/* Winners Bracket */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Winners Bracket</h3>
        <div className="overflow-x-auto pb-2">
          <div className="flex gap-4 items-start min-w-max">
            {wbRounds.map(([round, roundMatches]) => (
              <div key={`wb-${round}`} className="flex flex-col gap-2">
                <div className="text-xs text-muted-foreground text-center font-medium mb-1">
                  {round === wbRounds[wbRounds.length - 1][0] ? 'WB Final' : `WB R${round}`}
                </div>
                <div className="flex flex-col justify-around gap-2 min-h-[60px]" style={{ gap: `${Math.pow(2, round - 1) * 8}px` }}>
                  {roundMatches.map((tm) => (
                    <BracketMatchCard
                      key={tm.id}
                      tm={tm}
                      tournamentStatus={tournamentStatus}
                      playerName={playerName}
                      onMatchClick={onMatchClick}
                    />
                  ))}
                </div>
              </div>
            ))}

            {/* Grand Final */}
            {gfMatches.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="text-xs text-muted-foreground text-center font-medium mb-1">Grand Final</div>
                <div className="flex flex-col gap-2">
                  {gfMatches.map((tm) => (
                    <div key={tm.id}>
                      <div className="text-[10px] text-muted-foreground text-center mb-0.5">
                        {tm.round === 1 ? 'Match 1' : 'Reset'}
                      </div>
                      <BracketMatchCard
                        tm={tm}
                        tournamentStatus={tournamentStatus}
                        playerName={playerName}
                        onMatchClick={onMatchClick}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Losers Bracket */}
      {lbRounds.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Losers Bracket</h3>
          <div className="overflow-x-auto pb-2">
            <div className="flex gap-4 items-start min-w-max">
              {lbRounds.map(([round, roundMatches]) => (
                <div key={`lb-${round}`} className="flex flex-col gap-2">
                  <div className="text-xs text-muted-foreground text-center font-medium mb-1">
                    {round === lbRounds[lbRounds.length - 1][0] ? 'LB Final' : `LB R${round}`}
                  </div>
                  <div className="flex flex-col justify-around gap-2">
                    {roundMatches.map((tm) => (
                    <BracketMatchCard
                      key={tm.id}
                      tm={tm}
                      tournamentStatus={tournamentStatus}
                      playerName={playerName}
                      onMatchClick={onMatchClick}
                    />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
