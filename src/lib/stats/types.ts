export type PlayerRow = { id: string; display_name: string };
export type SummaryRow = { player_id: string; display_name: string; wins: number; avg_per_turn: number };
export type LegRow = { id: string; match_id: string; leg_number: number; created_at: string; winner_player_id: string | null };
export type TurnRow = { id: string; leg_id: string; player_id: string; total_scored: number; busted: boolean; turn_number: number; created_at: string };
export type ThrowRow = { id: string; turn_id: string; dart_index: number; segment: string; scored: number };
export type MatchRow = { id: string; created_at: string; winner_player_id: string | null; ended_early?: boolean; start_score: string };
export type PlayerSegmentRow = { player_id: string; display_name: string; segment: string; total_hits: number; total_score: number; avg_score: number; segment_number: number | null };
export type PlayerAccuracyRow = { player_id: string; display_name: string; doubles_attempted: number; doubles_hit: number; doubles_accuracy: number; trebles_attempted: number; trebles_hit: number; trebles_accuracy: number; total_throws: number };
export type PlayerAdjacencyRow = { player_id: string; display_name: string; hits_20: number; hits_1: number; hits_5: number; hits_20_area: number; hits_19: number; hits_3: number; hits_7: number; hits_19_area: number; total_throws: number; accuracy_20_in_area: number; accuracy_19_in_area: number };

export type PlayerCoreStats = {
  totalTurns: number;
  totalThrows: number;
  avgScore: number;
  legsWon: number;
  matchesWon: number;
  gamesPlayed: number;
  legsPlayed: number;
  gameWinRate: number;
  legWinRate: number;
  topRounds: TurnRow[];
  playerTurns: TurnRow[];
  playerThrows: ThrowRow[];
  playerLegs: LegRow[];
  checkoutRate: number;
  highestCheckout: number;
  highestCheckoutDarts: number;
  checkoutCounts: { 1: number; 2: number; 3: number };
  checkoutBreakdown: { 1: number; 2: number; 3: number };
  scoreDistribution: Record<number, number>;
  // 20 target analysis
  hits20Single: number;
  hits20Double: number;
  hits20Triple: number;
  hits20Total: number;
  misses20Left: number;
  misses20Right: number;
  total20Attempts: number;
  rate20Double: number;
  rate20Triple: number;
  rate20Single: number;
  // 19 target analysis
  hits19Single: number;
  hits19Double: number;
  hits19Triple: number;
  hits19Total: number;
  misses19Left: number;
  misses19Right: number;
  total19Attempts: number;
  rate19Double: number;
  rate19Triple: number;
  rate19Single: number;
};

export type OverallStats = {
  totalMatches: number;
  totalLegs: number;
  totalTurns: number;
  totalThrows: number;
  completedMatches: number;
  avgTurnsPerLeg: number;
  avgThrowsPerTurn: number;
};

export type DataLimitWarnings = {
  anyWarning: boolean;
  message: string;
};
