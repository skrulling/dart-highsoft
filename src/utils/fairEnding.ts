/**
 * Fair ending logic for X01 games.
 *
 * In 1-leg games the starting player has an advantage because they throw first.
 * Fair ending ensures all players complete the round before a winner is declared.
 * If multiple players check out in the same round they play "high round" tiebreakers.
 *
 * All functions are pure – no DB, no React – fully testable.
 */

export type FairEndingPhase = 'normal' | 'completing_round' | 'tiebreak' | 'resolved';

export type FairEndingState = {
  phase: FairEndingPhase;
  /** Players who reached 0 during the normal X01 round */
  checkedOutPlayerIds: string[];
  /** Current tiebreak round number (0 if not in tiebreak) */
  tiebreakRound: number;
  /** Players competing in current tiebreak round */
  tiebreakPlayerIds: string[];
  /** Scores accumulated in the current tiebreak round, keyed by player ID */
  tiebreakScores: Record<string, number>;
  /** The winner, once resolved */
  winnerId: string | null;
};

type TurnInput = {
  player_id: string;
  total_scored: number;
  busted: boolean;
  tiebreak_round?: number | null;
};

const NORMAL_STATE: FairEndingState = {
  phase: 'normal',
  checkedOutPlayerIds: [],
  tiebreakRound: 0,
  tiebreakPlayerIds: [],
  tiebreakScores: {},
  winnerId: null,
};

/**
 * Compute X01 remaining score for each player from normal (non-tiebreak) turns.
 */
function computeScores(
  turns: TurnInput[],
  playerIds: string[],
  startScore: number
): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const id of playerIds) scores[id] = startScore;
  for (const t of turns) {
    if (t.tiebreak_round != null) continue; // skip tiebreak turns
    if (t.busted) continue;
    if (scores[t.player_id] !== undefined) {
      scores[t.player_id] -= t.total_scored;
    }
  }
  return scores;
}

/**
 * Determine how many completed turns each player has in normal (non-tiebreak) play.
 */
function completedTurnCounts(
  turns: TurnInput[],
  playerIds: string[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const id of playerIds) counts[id] = 0;
  for (const t of turns) {
    if (t.tiebreak_round != null) continue;
    if (counts[t.player_id] !== undefined) {
      counts[t.player_id]++;
    }
  }
  return counts;
}

/**
 * Main state reconstruction. Walks through turns and determines the fair ending phase.
 *
 * @param turns - All turns for the current leg, in order
 * @param orderPlayers - Players in play order (starting player first)
 * @param startScore - The X01 start score (e.g. 501)
 * @param fairEnding - Whether fair ending is enabled for this match
 */
export function computeFairEndingState(
  turns: TurnInput[],
  orderPlayers: { id: string }[],
  startScore: number,
  fairEnding: boolean
): FairEndingState {
  if (!fairEnding || orderPlayers.length === 0) return NORMAL_STATE;

  const playerIds = orderPlayers.map((p) => p.id);
  const scores = computeScores(turns, playerIds, startScore);
  const counts = completedTurnCounts(turns, playerIds);

  // Find players who have checked out (score reached 0)
  const checkedOutPlayerIds = playerIds.filter((id) => scores[id] <= 0);

  if (checkedOutPlayerIds.length === 0) {
    return NORMAL_STATE;
  }

  // Check if all players have completed the same number of turns (round is complete)
  const minTurns = Math.min(...playerIds.map((id) => counts[id]));
  const maxTurns = Math.max(...playerIds.map((id) => counts[id]));
  const roundComplete = minTurns === maxTurns;

  if (!roundComplete) {
    // Some players still need to complete the round
    return {
      phase: 'completing_round',
      checkedOutPlayerIds,
      tiebreakRound: 0,
      tiebreakPlayerIds: [],
      tiebreakScores: {},
      winnerId: null,
    };
  }

  // Round is complete. Check how many checked out.
  if (checkedOutPlayerIds.length === 1) {
    return {
      phase: 'resolved',
      checkedOutPlayerIds,
      tiebreakRound: 0,
      tiebreakPlayerIds: [],
      tiebreakScores: {},
      winnerId: checkedOutPlayerIds[0],
    };
  }

  // Multiple players checked out - need tiebreak
  // Look at tiebreak turns to determine current state
  const tiebreakTurns = turns.filter((t) => t.tiebreak_round != null && t.tiebreak_round > 0);

  if (tiebreakTurns.length === 0) {
    // Tiebreak hasn't started yet
    return {
      phase: 'tiebreak',
      checkedOutPlayerIds,
      tiebreakRound: 1,
      tiebreakPlayerIds: checkedOutPlayerIds,
      tiebreakScores: {},
      winnerId: null,
    };
  }

  // Process tiebreak rounds
  let currentTiebreakPlayers = [...checkedOutPlayerIds];
  const maxTiebreakRound = Math.max(...tiebreakTurns.map((t) => t.tiebreak_round!));

  for (let round = 1; round <= maxTiebreakRound; round++) {
    const roundTurns = tiebreakTurns.filter((t) => t.tiebreak_round === round);
    const roundScores: Record<string, number> = {};
    for (const pid of currentTiebreakPlayers) roundScores[pid] = 0;

    for (const t of roundTurns) {
      if (currentTiebreakPlayers.includes(t.player_id)) {
        roundScores[t.player_id] = t.busted ? 0 : t.total_scored;
      }
    }

    // Check if all tiebreak players have thrown this round
    const allThrown = currentTiebreakPlayers.every(
      (pid) => roundTurns.some((t) => t.player_id === pid)
    );

    if (!allThrown) {
      // This round is still in progress
      return {
        phase: 'tiebreak',
        checkedOutPlayerIds,
        tiebreakRound: round,
        tiebreakPlayerIds: currentTiebreakPlayers,
        tiebreakScores: roundScores,
        winnerId: null,
      };
    }

    // Round complete - determine winners
    const maxScore = Math.max(...currentTiebreakPlayers.map((pid) => roundScores[pid]));
    const winners = currentTiebreakPlayers.filter((pid) => roundScores[pid] === maxScore);

    if (winners.length === 1) {
      return {
        phase: 'resolved',
        checkedOutPlayerIds,
        tiebreakRound: round,
        tiebreakPlayerIds: currentTiebreakPlayers,
        tiebreakScores: roundScores,
        winnerId: winners[0],
      };
    }

    // Tied - next round with only the tied players
    currentTiebreakPlayers = winners;
  }

  // Need another tiebreak round
  return {
    phase: 'tiebreak',
    checkedOutPlayerIds,
    tiebreakRound: maxTiebreakRound + 1,
    tiebreakPlayerIds: currentTiebreakPlayers,
    tiebreakScores: {},
    winnerId: null,
  };
}

/**
 * Determine who throws next during completing_round or tiebreak phases.
 */
export function getNextFairEndingPlayer(
  state: FairEndingState,
  orderPlayers: { id: string }[],
  turns: TurnInput[]
): string | null {
  if (state.phase === 'normal' || state.phase === 'resolved') return null;

  const playerIds = orderPlayers.map((p) => p.id);

  if (state.phase === 'completing_round') {
    // Find which players haven't completed the round yet
    const normalTurns = turns.filter((t) => t.tiebreak_round == null);
    const counts: Record<string, number> = {};
    for (const id of playerIds) counts[id] = 0;
    for (const t of normalTurns) {
      if (counts[t.player_id] !== undefined) counts[t.player_id]++;
    }
    const maxCount = Math.max(...playerIds.map((id) => counts[id]));

    // Next player in order who hasn't completed this round
    for (const p of orderPlayers) {
      if (counts[p.id] < maxCount) return p.id;
    }
    return null;
  }

  if (state.phase === 'tiebreak') {
    // Find which tiebreak players haven't thrown in the current round
    const currentRoundTurns = turns.filter(
      (t) => t.tiebreak_round === state.tiebreakRound
    );
    const thrownIds = new Set(currentRoundTurns.map((t) => t.player_id));

    // Use play order among tiebreak players
    for (const p of orderPlayers) {
      if (state.tiebreakPlayerIds.includes(p.id) && !thrownIds.has(p.id)) {
        return p.id;
      }
    }
    return null;
  }

  return null;
}

/**
 * Quick check for tiebreak phase.
 */
export function isTiebreakPhase(state: FairEndingState): boolean {
  return state.phase === 'tiebreak';
}
