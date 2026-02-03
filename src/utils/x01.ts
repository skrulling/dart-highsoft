import { SegmentResult, isDoubleKind } from './dartboard';

export type StartScore = 201 | 301 | 501;
export type FinishRule = 'single_out' | 'double_out';

export type ThrowEvent = {
  segment: SegmentResult;
};

export type TurnOutcome = {
  newScore: number;
  busted: boolean;
  finished: boolean;
};

/**
 * Represents a turn for average calculation
 */
export type TurnForAverage = {
  busted: boolean;
  total_scored: number | null;
  darts_thrown?: number; // Number of darts in this turn (1-3), defaults to 3 if not provided
};

export function applyThrow(
  currentScore: number,
  segment: SegmentResult,
  finish: FinishRule
): TurnOutcome {
  const scored = segment.scored;
  const next = currentScore - scored;
  if (next < 0) {
    return { newScore: currentScore, busted: true, finished: false };
  }
  if (next === 0) {
    if (finish === 'double_out' && !isDoubleKind(segment.kind)) {
      return { newScore: currentScore, busted: true, finished: false };
    }
    return { newScore: 0, busted: false, finished: true };
  }
  if (finish === 'double_out' && next === 1) {
    return { newScore: currentScore, busted: true, finished: false };
  }
  return { newScore: next, busted: false, finished: false };
}

/**
 * Calculates the 3-dart average following PDC professional tournament standards.
 *
 * Rules:
 * - Only non-busted turns are counted
 * - Busted turns are excluded completely (no darts counted, no score counted)
 * - Formula: (total points scored / total darts thrown) × 3
 * - If darts_thrown is not provided for a turn, assumes 3 darts (standard turn)
 *
 * @param turns - Array of turns to calculate average from
 * @returns The 3-dart average, or 0 if no valid turns
 *
 * @example
 * // Player throws 60, 45, 30 (all 3-dart turns)
 * calculate3DartAverage([
 *   { busted: false, total_scored: 60, darts_thrown: 3 },
 *   { busted: false, total_scored: 45, darts_thrown: 3 },
 *   { busted: false, total_scored: 30, darts_thrown: 3 }
 * ]) // Returns 45.0
 *
 * @example
 * // Player throws 60, then busts, then 45
 * calculate3DartAverage([
 *   { busted: false, total_scored: 60, darts_thrown: 3 },
 *   { busted: true, total_scored: 40, darts_thrown: 3 }, // Excluded
 *   { busted: false, total_scored: 45, darts_thrown: 3 }
 * ]) // Returns 52.5 (105 points / 6 darts × 3)
 */
export function calculate3DartAverage(turns: TurnForAverage[]): number {
  // Filter to only valid, non-busted turns with a score
  const validTurns = turns.filter(
    (t) => !t.busted && typeof t.total_scored === 'number' && t.total_scored !== null
  );

  if (validTurns.length === 0) {
    return 0;
  }

  // Sum total points from valid turns
  const totalPoints = validTurns.reduce((sum, t) => sum + (t.total_scored || 0), 0);

  // Sum total darts from valid turns (default to 3 darts per turn if not specified)
  const totalDarts = validTurns.reduce((sum, t) => sum + (t.darts_thrown ?? 3), 0);

  if (totalDarts === 0) {
    return 0;
  }

  // Calculate 3-dart average: (points / darts) * 3
  return (totalPoints / totalDarts) * 3;
}
