/**
 * Commentary Service
 * Generates witty and persona-driven commentary using OpenAI GPT-5 nano
 */

import type {
  CommentaryPayload,
  CommentaryResult,
  CommentaryPersonaId,
  MatchRecapPayload,
} from '@/lib/commentary/types';

export type CommentaryContext = CommentaryPayload;
export type CommentaryResponse = CommentaryResult;

/**
 * Generates commentary via the API route for the requested persona
 */
export async function generateCommentary(
  context: CommentaryContext,
  personaId: CommentaryPersonaId = 'chad'
): Promise<CommentaryResponse> {
  try {
    const response = await fetch('/api/commentary', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...context, personaId }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    console.log(`Getting ${personaId} commentary`);
    const data = await response.json();
    console.log(data);
    return {
      commentary: data.commentary,
      usage: data.usage,
    };
  } catch (error) {
    console.error(`Failed to generate ${personaId} commentary:`, error);

    // Fallback to generic messages based on context
    return {
      commentary: getFallbackCommentary(personaId, context),
      error: error instanceof Error ? error.message : 'Unknown error',
      usage: {
        note: 'fallback',
        persona: personaId,
      },
    };
  }
}

/**
 * Provides fallback commentary when API fails
 */
function getFallbackCommentary(
  personaId: CommentaryPersonaId,
  context: CommentaryContext
): string {
  if (personaId === 'bob') {
    return getBobFallback(context);
  }
  return getChadFallback(context);
}

function getChadFallback(context: CommentaryContext): string {
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

function getBobFallback(context: CommentaryContext): string {
  const { busted, is180, isHighScore, totalScore, playerName, gameContext, remainingScore } = context;
  const { currentLegNumber, playerTurnNumber, pointsBehindLeader, pointsAheadOfChaser, isLeading } = gameContext;

  const professionalLead = (analysis: string, quip: string) => `${analysis} ${quip}`.trim();

  if (busted) {
    return professionalLead(
      `${playerName} busts turn ${playerTurnNumber}, score resets to ${remainingScore}.`,
      'Someone tell the marker to keep the eraser handy.'
    );
  }

  if (is180) {
    return professionalLead(
      `${playerName} fires the maximum for 180, leaves ${remainingScore} after leg ${currentLegNumber}.`,
      'Textbook tungsten ballet — judges still gave it triple top marks.'
    );
  }

  if (isHighScore) {
    if (isLeading) {
      return professionalLead(
        `${playerName} posts ${totalScore}, maintains the lead with ${remainingScore} required.`,
        'At this rate even the chalk can take a tea break.'
      );
    }
    return professionalLead(
      `${playerName} scores ${totalScore}, now ${pointsBehindLeader} behind with ${remainingScore} in hand.`,
      'Pressure’s on, but he just ordered a calm pint of composure.'
    );
  }

  if (totalScore < 40) {
    return professionalLead(
      `${playerName} collects ${totalScore}, leaves ${remainingScore} to tidy up.`,
      'If accuracy were pints, that was definitely the shandy.'
    );
  }

  if (isLeading) {
    const cushion = pointsAheadOfChaser ?? 0;
    return professionalLead(
      `${playerName} adds ${totalScore}, still ${cushion} to the good with ${remainingScore} remaining.`,
      'Like a well-set dartboard, firmly anchored.'
    );
  }

  return professionalLead(
    `${playerName} posts ${totalScore}, ${pointsBehindLeader} still to chase with ${remainingScore} on the docket.`,
    'Time for nerves of steel — the kind that never miss tops.'
  );
}

/**
 * Generates match recap commentary via the API route
 */
export async function generateMatchRecap(
  payload: MatchRecapPayload,
  personaId: CommentaryPersonaId = 'chad'
): Promise<CommentaryResponse> {
  try {
    const response = await fetch('/api/commentary', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...payload, personaId }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    console.log(`Getting ${personaId} match recap commentary`);
    const data = await response.json();
    console.log(data);
    return {
      commentary: data.commentary,
      usage: data.usage,
    };
  } catch (error) {
    console.error(`Failed to generate ${personaId} match recap:`, error);

    // Fallback to generic match end message
    return {
      commentary: getMatchRecapFallback(personaId, payload),
      error: error instanceof Error ? error.message : 'Unknown error',
      usage: {
        note: 'fallback',
        persona: personaId,
      },
    };
  }
}

/**
 * Provides fallback match recap when API fails
 */
function getMatchRecapFallback(
  personaId: CommentaryPersonaId,
  payload: MatchRecapPayload
): string {
  const { context } = payload;
  const score = `${context.winnerLegsWon}-${context.totalLegs - context.winnerLegsWon}`;

  if (personaId === 'bob') {
    return `${context.winnerName} takes the match ${score}! Brilliant performance from start to finish. That's darts at its finest, folks.`;
  }

  return `${context.winnerName} just closed out the W ${score}! Absolute main character energy all match. No cap, that was bussin'.`;
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
