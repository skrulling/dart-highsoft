/**
 * Commentary Service
 * Generates witty and sarcastic commentary using OpenAI GPT-5 nano
 * for Merv, the alien commentator from planet 6
 */

export interface ThrowData {
  segment: string; // e.g., "T20", "D16", "SB"
  scored: number;
  dart_index: number;
}

export interface PlayerStats {
  name: string;
  id: string;
  remainingScore: number;
  average: number;
  legsWon: number;
  isCurrentPlayer: boolean;
}

export interface TurnHistoryItem {
  score: number;
  busted: boolean;
}

export interface CommentaryContext {
  playerName: string;
  playerId: string;
  totalScore: number;
  remainingScore: number;
  throws: ThrowData[];
  busted: boolean;
  isHighScore: boolean; // 100+ points
  is180: boolean;

  // Rich game context
  gameContext: {
    // Match info
    startScore: number;
    legsToWin: number;
    currentLegNumber: number;

    // Current player stats
    playerAverage: number;
    playerLegsWon: number;
    playerRecentTurns: TurnHistoryItem[]; // Last 3-5 turns

    // All players comparison
    allPlayers: PlayerStats[];

    // Match state
    isLeading: boolean;
    positionInMatch: number; // 1st, 2nd, 3rd place
    pointsBehindLeader: number;

    // Streak info
    consecutiveHighScores?: number; // If they've been on a hot streak
    consecutiveLowScores?: number; // If they've been struggling
  };
}

export interface CommentaryResponse {
  commentary: string;
  error?: string;
}

/**
 * Generates commentary using GPT-5 nano via the API route
 */
export async function generateMervCommentary(
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

    const data = await response.json();
    return { commentary: data.commentary };
  } catch (error) {
    console.error('Failed to generate commentary:', error);

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
  const { busted, is180, isHighScore, totalScore, playerName, gameContext } = context;

  if (busted) {
    return `${playerName} busted! Even on planet 6, we know when to stop throwing.`;
  }

  if (is180) {
    return `180! ${playerName} just made my antenna tingle with that one!`;
  }

  if (isHighScore) {
    if (gameContext.isLeading) {
      return `${totalScore} from the leader ${playerName}! Showing off now?`;
    }
    return `${totalScore} points! ${playerName} trying to catch up!`;
  }

  if (totalScore < 20) {
    if (gameContext.consecutiveLowScores && gameContext.consecutiveLowScores >= 3) {
      return `${totalScore}? ${playerName}'s having a cosmic meltdown!`;
    }
    return `${totalScore} points? My grandma throws better, and she's a blob of gas.`;
  }

  if (gameContext.isLeading) {
    return `${playerName} leads with ${totalScore}. Cruise control activated!`;
  }

  return `${playerName} scored ${totalScore}. ${gameContext.pointsBehindLeader} behind the leader.`;
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
