/**
 * Commentary Service
 * Generates witty and sarcastic commentary using OpenAI GPT-5 nano
 * for Chad, the Gen Z surf-bro commentator
 */

import type {
  CommentaryPayload,
  CommentaryResult,
} from '@/lib/commentary/types';

export type CommentaryContext = CommentaryPayload;
export type CommentaryResponse = CommentaryResult;

/**
 * Generates commentary using GPT-5 nano via the API route
 */
export async function generateChadCommentary(
  context: CommentaryContext
): Promise<CommentaryResponse> {
  try {
    const response = await fetch('/api/commentary', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(context),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    console.log('Getting Chad commentary');
    const data = await response.json();
    console.log(data);
    return { commentary: data.commentary };
  } catch (error) {
    console.error('Failed to generate Chad commentary:', error);

    // Fallback to generic messages based on context
    return {
      commentary: getFallbackCommentary(context),
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Provides fallback commentary when API fails
 */
function getFallbackCommentary(context: CommentaryContext): string {
  const { busted, is180, isHighScore, totalScore, playerName, gameContext, remainingScore } = context;
  const {
    isLeading,
    pointsBehindLeader,
    pointsAheadOfChaser,
    playerTurnNumber,
    currentLegNumber,
  } = gameContext;

  if (busted) {
      return `${playerName} busts on leg ${currentLegNumber}. Massive L, time to touch grass and reset.`;
  }

  if (is180) {
    return `180! ${playerName} just went full main character energy, no cap.`;
  }

  if (isHighScore) {
    if (isLeading) {
      return `${totalScore} in turn ${playerTurnNumber}. ${playerName} keeps the lead, still ${remainingScore} on the board.`;
    }
    return `${totalScore} scored on turn ${playerTurnNumber}. ${playerName} trims it to ${pointsBehindLeader} back with ${remainingScore} left.`;
  }

  if (totalScore < 20) {
    if (gameContext.consecutiveLowScores && gameContext.consecutiveLowScores >= 3) {
      return `${totalScore}? ${playerName}'s confidence just evaporated - ${gameContext.consecutiveLowScores} cold turns straight.`;
    }
    return `${totalScore} points leaves ${remainingScore}. That turn was mid, but the vibes survive.`;
  }

  if (isLeading) {
    const buffer = pointsAheadOfChaser ?? 0;
    return `${playerName} posts ${totalScore} on leg ${currentLegNumber}, still ${buffer} up with ${remainingScore} to clear.`;
  }

  return `${playerName} adds ${totalScore}. Gap is ${pointsBehindLeader} with ${remainingScore} left - keep grinding.`;
}

/**
 * Debounce helper to prevent rapid API calls
 */
export class CommentaryDebouncer {
  private timeoutId: NodeJS.Timeout | null = null;
  private lastCall: number = 0;
  private readonly minInterval: number;

  constructor(minIntervalMs: number = 2000) {
    this.minInterval = minIntervalMs;
  }

  canCall(): boolean {
    const now = Date.now();
    return now - this.lastCall >= this.minInterval;
  }

  markCalled(): void {
    this.lastCall = Date.now();
  }

  reset(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.lastCall = 0;
  }
}
