type ThrowRecord = {
  scored: number;
};

type TurnWithThrows = {
  player_id: string;
  turn_number: number;
  total_scored?: number | null;
  busted: boolean;
  throws?: ThrowRecord[];
};

export function computeTurnTotal(turn: TurnWithThrows): number {
  if (typeof turn.total_scored === 'number') {
    return turn.total_scored;
  }
  const dartSum = turn.throws?.reduce((sum, thr) => sum + thr.scored, 0) ?? 0;
  return dartSum;
}

export function computeRemainingScore(
  turns: TurnWithThrows[],
  playerId: string,
  startScore: number
): number {
  const playerTurns = turns
    .filter((t) => t.player_id === playerId)
    .sort((a, b) => a.turn_number - b.turn_number);

  let scored = 0;
  for (const playerTurn of playerTurns) {
    if (playerTurn.busted) {
      continue;
    }

    if (typeof playerTurn.total_scored === 'number') {
      scored += playerTurn.total_scored;
    } else if (playerTurn.throws && playerTurn.throws.length > 0) {
      const partial = playerTurn.throws.reduce((sum, thr) => sum + thr.scored, 0);
      scored += partial;
    }
  }

  return Math.max(startScore - scored, 0);
}
