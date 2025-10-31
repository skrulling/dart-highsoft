export interface ThrowData {
  segment: string;
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

export interface CommentaryGameContext {
  startScore: number;
  legsToWin: number;
  currentLegNumber: number;
  overallTurnNumber: number;
  playerTurnNumber: number;
  dartsUsedThisTurn: number;
  playerAverage: number;
  playerLegsWon: number;
  playerRecentTurns: TurnHistoryItem[];
  allPlayers: PlayerStats[];
  isLeading: boolean;
  positionInMatch: number;
  pointsBehindLeader: number;
  pointsAheadOfChaser?: number;
  consecutiveHighScores?: number;
  consecutiveLowScores?: number;
}

export interface CommentaryPayload {
  playerName: string;
  playerId: string;
  totalScore: number;
  remainingScore: number;
  throws: ThrowData[];
  busted: boolean;
  isHighScore: boolean;
  is180: boolean;
  gameContext: CommentaryGameContext;
}

export interface CommentaryUsageMeta {
  note?: string;
  persona?: CommentaryPersonaId;
  model?: string;
  allowSlang?: boolean;
  humorStyle?: string;
  tokens?: unknown;
}

export interface CommentaryResult {
  commentary: string;
  usage?: CommentaryUsageMeta;
  error?: string;
}

export interface CommentaryStyleConfig {
  slangUseProbability: number;
  maxSlangPerLine: number;
  plainLineProbability: number;
  maxWords: number;
}

export interface CommentaryPersona {
  id: string;
  label: string;
  systemPrompt: string;
  style: CommentaryStyleConfig;
  avatar: string;
  description: string;
  thinkingLabel: string;
}

export type CommentaryPersonaId = CommentaryPersona['id'];
export type CommentaryExcitementLevel = 'low' | 'medium' | 'high';
