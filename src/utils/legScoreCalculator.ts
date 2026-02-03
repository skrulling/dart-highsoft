/**
 * Leg Score Calculator
 *
 * Pure functions for calculating scores in a dart leg.
 * Extracted from MatchClient to enable thorough unit testing of undo/edit scenarios.
 */

import { applyThrow, FinishRule } from './x01';
import type { SegmentResult } from './dartboard';

export type ThrowData = {
  segment: string;
  scored: number;
  dart_index: number;
};

export type TurnData = {
  id: string;
  player_id: string;
  turn_number: number;
  throws: ThrowData[];
};

export type TurnResult = {
  id: string;
  player_id: string;
  total_scored: number;
  busted: boolean;
  finished: boolean;
  score_after: number;
};

export type LegReplayResult = {
  turns: TurnResult[];
  playerScores: Map<string, number>;
  legWinnerId: string | null;
};

/**
 * Parse a segment label (e.g., "S20", "D16", "T19", "SB", "DB") into a SegmentResult
 */
export function parseSegmentLabel(label: string): SegmentResult {
  if (label === 'Miss') return { kind: 'Miss', scored: 0, label: 'Miss' };
  if (label === 'SB') return { kind: 'OuterBull', scored: 25, label: 'SB' };
  if (label === 'DB') return { kind: 'InnerBull', scored: 50, label: 'DB' };

  const match = label.match(/^([SDT])(\d{1,2})$/);
  if (match) {
    const mod = match[1] as 'S' | 'D' | 'T';
    const n = parseInt(match[2]!, 10);
    if (mod === 'S') return { kind: 'Single', value: n, scored: n, label };
    if (mod === 'D') return { kind: 'Double', value: n, scored: n * 2, label };
    return { kind: 'Triple', value: n, scored: n * 3, label };
  }

  return { kind: 'Miss', scored: 0, label: 'Miss' };
}

/**
 * Replay a single turn and calculate its result.
 *
 * @param throws - The throws in this turn, sorted by dart_index
 * @param startScore - The player's score at the start of the turn
 * @param finishRule - 'single_out' or 'double_out'
 * @returns The turn result including total scored, bust status, and final score
 */
export function replayTurn(
  throws: ThrowData[],
  startScore: number,
  finishRule: FinishRule
): { total_scored: number; busted: boolean; finished: boolean; score_after: number } {
  let current = startScore;
  let total = 0;
  let busted = false;
  let finished = false;

  for (const thr of throws.sort((a, b) => a.dart_index - b.dart_index)) {
    if (finished || busted) break;

    const segment = parseSegmentLabel(thr.segment);
    const outcome = applyThrow(current, segment, finishRule);

    if (outcome.busted) {
      busted = true;
      total = 0;
      current = startScore; // Score reverts on bust
      break;
    }

    total += current - outcome.newScore;
    current = outcome.newScore;

    if (outcome.finished) {
      finished = true;
    }
  }

  return {
    total_scored: total,
    busted,
    finished,
    score_after: busted ? startScore : current,
  };
}

/**
 * Replay an entire leg from the beginning, calculating all turn results.
 *
 * This is used after editing throws to recalculate all scores and bust statuses.
 *
 * @param turns - All turns in the leg, with their throws
 * @param playerIds - List of player IDs in play order
 * @param startScore - The starting score (e.g., 501)
 * @param finishRule - 'single_out' or 'double_out'
 * @returns Complete leg replay result with all turn results and final scores
 */
export function replayLeg(
  turns: TurnData[],
  playerIds: string[],
  startScore: number,
  finishRule: FinishRule
): LegReplayResult {
  // Initialize player scores
  const playerScores = new Map<string, number>();
  for (const id of playerIds) {
    playerScores.set(id, startScore);
  }

  // Sort turns by turn_number
  const sortedTurns = [...turns].sort((a, b) => a.turn_number - b.turn_number);

  const turnResults: TurnResult[] = [];
  let legWinnerId: string | null = null;

  for (const turn of sortedTurns) {
    if (legWinnerId) {
      // Leg already won, skip remaining turns
      break;
    }

    const playerScore = playerScores.get(turn.player_id) ?? startScore;
    const result = replayTurn(turn.throws, playerScore, finishRule);

    turnResults.push({
      id: turn.id,
      player_id: turn.player_id,
      total_scored: result.total_scored,
      busted: result.busted,
      finished: result.finished,
      score_after: result.score_after,
    });

    // Update player's score (only if not busted)
    if (!result.busted) {
      playerScores.set(turn.player_id, result.score_after);
    }

    // Check for leg winner
    if (result.finished) {
      legWinnerId = turn.player_id;
    }
  }

  return {
    turns: turnResults,
    playerScores,
    legWinnerId,
  };
}

/**
 * Determine whose turn it should be after undoing a throw.
 *
 * @param turns - All turns in the leg after the undo
 * @param playerIds - List of player IDs in play order
 * @param startingPlayerId - The player who started the leg
 * @returns The player ID whose turn it is, and whether they need a new turn created
 */
export function determineCurrentPlayer(
  turns: TurnData[],
  playerIds: string[],
  startingPlayerId: string
): { currentPlayerId: string; needsNewTurn: boolean; existingTurnId?: string } {
  if (turns.length === 0) {
    // No turns yet, starting player goes first
    return { currentPlayerId: startingPlayerId, needsNewTurn: true };
  }

  // Find the starting player's index in the rotation
  const startIndex = playerIds.indexOf(startingPlayerId);
  if (startIndex === -1) {
    // Fallback to first player
    return { currentPlayerId: playerIds[0], needsNewTurn: true };
  }

  // Sort turns and find the last one with throws
  const sortedTurns = [...turns].sort((a, b) => a.turn_number - b.turn_number);
  const lastTurnWithThrows = [...sortedTurns].reverse().find((t) => t.throws.length > 0);

  if (!lastTurnWithThrows) {
    // All turns are empty, go back to starting player
    return { currentPlayerId: startingPlayerId, needsNewTurn: true };
  }

  // Check if last turn is complete (3 throws or busted/finished)
  const turnIsComplete = lastTurnWithThrows.throws.length >= 3;

  if (turnIsComplete) {
    // Next player's turn
    const lastPlayerIndex = playerIds.indexOf(lastTurnWithThrows.player_id);
    const nextPlayerIndex = (lastPlayerIndex + 1) % playerIds.length;
    return { currentPlayerId: playerIds[nextPlayerIndex], needsNewTurn: true };
  } else {
    // Continue current player's turn
    return {
      currentPlayerId: lastTurnWithThrows.player_id,
      needsNewTurn: false,
      existingTurnId: lastTurnWithThrows.id,
    };
  }
}

/**
 * Calculate what the score should be for a player at the start of a specific turn.
 *
 * Used when reopening a turn after undo to know what score to display.
 */
export function calculateScoreAtTurnStart(
  turns: TurnData[],
  targetTurnNumber: number,
  playerId: string,
  startScore: number,
  finishRule: FinishRule
): number {
  let score = startScore;

  // Process all completed turns before the target turn
  const previousTurns = turns
    .filter((t) => t.turn_number < targetTurnNumber && t.player_id === playerId)
    .sort((a, b) => a.turn_number - b.turn_number);

  for (const turn of previousTurns) {
    const result = replayTurn(turn.throws, score, finishRule);
    if (!result.busted) {
      score = result.score_after;
    }
  }

  return score;
}
