export type TournamentStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
export type BracketType = 'winners' | 'losers' | 'grand_final';

export type TournamentRecord = {
  id: string;
  name: string;
  mode: 'x01';
  start_score: '201' | '301' | '501';
  finish: 'single_out' | 'double_out';
  legs_to_win: number;
  fair_ending: boolean;
  status: TournamentStatus;
  winner_player_id: string | null;
  created_at: string;
  completed_at: string | null;
};

export type TournamentMatchRecord = {
  id: string;
  tournament_id: string;
  bracket: BracketType;
  round: number;
  position: number;
  player1_id: string | null;
  player2_id: string | null;
  winner_id: string | null;
  loser_id: string | null;
  match_id: string | null;
  is_bye: boolean;
  next_winner_tm_id: string | null;
  next_loser_tm_id: string | null;
};

export type TournamentPlayerRecord = {
  tournament_id: string;
  player_id: string;
  seed: number;
  final_rank: number | null;
};
