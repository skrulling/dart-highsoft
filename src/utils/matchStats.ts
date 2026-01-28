type ThrowRecord = {
  scored: number;
  dart_index: number;
};

type TurnRecord = {
  id: string;
  leg_id: string;
  player_id: string;
  total_scored: number;
  busted: boolean;
};

type TurnWithThrows = TurnRecord & {
  throws?: ThrowRecord[];
};

export function getSpectatorScore(
  turns: TurnRecord[],
  currentLegId: string | undefined,
  startScore: number,
  turnThrowCounts: Record<string, number>,
  playerId: string
): number {
  const legTurns = currentLegId
    ? turns.filter((t) => t.player_id === playerId && t.leg_id === currentLegId)
    : [];
  const scored = legTurns.reduce((sum, t) => (t.busted ? sum : sum + (t.total_scored || 0)), 0);
  let current = startScore - scored;

  const playerTurns = turns.filter((turn) => turn.player_id === playerId);
  const lastTurn = playerTurns.length > 0 ? playerTurns[playerTurns.length - 1] : null;
  if (lastTurn && !lastTurn.busted) {
    const throwCount = turnThrowCounts[lastTurn.id] || 0;
    if (throwCount > 0 && throwCount < 3) {
      const currentThrows = (lastTurn as TurnWithThrows).throws || [];
      const incompleteTotal = currentThrows.reduce((sum, thr) => sum + thr.scored, 0);
      const persistedSubtotal = typeof lastTurn.total_scored === 'number' ? lastTurn.total_scored : 0;
      current -= Math.max(0, incompleteTotal - persistedSubtotal);
    }
  }

  return Math.max(0, current);
}

export function getLegRoundStats(
  turns: TurnRecord[],
  currentLegId: string | undefined,
  playerId: string
): { lastRoundScore: number; bestRoundScore: number } {
  const legTurns = currentLegId
    ? turns.filter((t) => t.player_id === playerId && t.leg_id === currentLegId && !t.busted)
    : [];

  if (legTurns.length === 0) {
    return { lastRoundScore: 0, bestRoundScore: 0 };
  }

  const lastRoundScore = legTurns[legTurns.length - 1].total_scored || 0;
  const bestRoundScore = Math.max(...legTurns.map((t) => t.total_scored || 0));

  return { lastRoundScore, bestRoundScore };
}
