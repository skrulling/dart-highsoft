import type { FinishRule } from '@/utils/x01';

export type Player = { id: string; display_name: string };

export type MatchRecord = {
  id: string;
  mode: 'x01';
  start_score: '201' | '301' | '501';
  finish: FinishRule;
  legs_to_win: number;
  ended_early?: boolean;
};

export type LegRecord = {
  id: string;
  match_id: string;
  leg_number: number;
  starting_player_id: string;
  winner_player_id: string | null;
};

export type TurnRecord = {
  id: string;
  leg_id: string;
  player_id: string;
  turn_number: number;
  total_scored: number;
  busted: boolean;
};

export type MatchPlayersRow = {
  match_id: string;
  player_id: string;
  play_order: number;
  players: Player;
};

export type ThrowRecord = {
  id: string;
  turn_id: string;
  dart_index: number;
  segment: string;
  scored: number;
};

export type TurnWithThrows = TurnRecord & {
  throws: ThrowRecord[];
};

