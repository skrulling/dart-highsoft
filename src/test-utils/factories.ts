/**
 * Test data factories for creating consistent test data
 *
 * These factories create mock data with sensible defaults that can be
 * overridden for specific test cases.
 */

import type {
  MatchRow,
  PlayerRow,
  MatchPlayerRow,
  LegRow,
  TurnRow,
  ThrowRow,
  MockDb,
} from './mockSupabase';

let idCounter = 1;
const generateId = (prefix: string) => `${prefix}-${idCounter++}`;

/**
 * Reset the ID counter (call in beforeEach)
 */
export const resetFactoryIds = () => {
  idCounter = 1;
};

/**
 * Create a mock player
 */
export const createMockPlayer = (overrides?: Partial<PlayerRow>): PlayerRow => ({
  id: generateId('player'),
  display_name: `Player ${idCounter}`,
  ...overrides,
});

/**
 * Create a mock match
 */
export const createMockMatch = (overrides?: Partial<MatchRow>): MatchRow => ({
  id: generateId('match'),
  mode: 'x01',
  start_score: '501',
  finish: 'double_out',
  legs_to_win: 3,
  ...overrides,
});

/**
 * Create a mock match player (junction table)
 */
export const createMockMatchPlayer = (
  matchId: string,
  player: PlayerRow,
  playOrder: number
): MatchPlayerRow => ({
  match_id: matchId,
  player_id: player.id,
  play_order: playOrder,
  players: player,
});

/**
 * Create a mock leg
 */
export const createMockLeg = (overrides?: Partial<LegRow>): LegRow => ({
  id: generateId('leg'),
  match_id: 'match-1',
  leg_number: 1,
  starting_player_id: 'player-1',
  winner_player_id: null,
  ...overrides,
});

/**
 * Create a mock turn
 */
export const createMockTurn = (overrides?: Partial<TurnRow>): TurnRow => ({
  id: generateId('turn'),
  leg_id: 'leg-1',
  player_id: 'player-1',
  turn_number: 1,
  total_scored: null,
  busted: false,
  tiebreak_round: null,
  ...overrides,
});

/**
 * Create a mock throw
 */
export const createMockThrow = (overrides?: Partial<ThrowRow>): ThrowRow => ({
  id: generateId('throw'),
  turn_id: 'turn-1',
  dart_index: 1,
  segment: 'S20',
  scored: 20,
  match_id: 'match-1',
  ...overrides,
});

/**
 * Create a standard two-player game setup
 */
export const createTwoPlayerGameSetup = (): MockDb => {
  const player1: PlayerRow = { id: 'player-1', display_name: 'Player One' };
  const player2: PlayerRow = { id: 'player-2', display_name: 'Player Two' };

  const match: MatchRow = {
    id: 'match-1',
    mode: 'x01',
    start_score: '501',
    finish: 'double_out',
    legs_to_win: 3,
  };

  return {
    matches: [match],
    match_players: [
      createMockMatchPlayer(match.id, player1, 0),
      createMockMatchPlayer(match.id, player2, 1),
    ],
    legs: [
      {
        id: 'leg-1',
        match_id: match.id,
        leg_number: 1,
        starting_player_id: player1.id,
        winner_player_id: null,
      },
    ],
    turns: [
      {
        id: 'turn-1',
        leg_id: 'leg-1',
        player_id: player1.id,
        turn_number: 1,
        total_scored: null,
        busted: false,
        tiebreak_round: null,
      },
    ],
    throws: [
      {
        id: 'throw-1',
        turn_id: 'turn-1',
        dart_index: 1,
        segment: 'S20',
        scored: 20,
        match_id: match.id,
      },
      {
        id: 'throw-2',
        turn_id: 'turn-1',
        dart_index: 2,
        segment: 'S20',
        scored: 20,
        match_id: match.id,
      },
    ],
  };
};

/**
 * Create an empty database structure
 */
export const createEmptyDb = (): MockDb => ({
  matches: [],
  match_players: [],
  legs: [],
  turns: [],
  throws: [],
});

/**
 * Simulate completing a turn with a third throw
 */
export const completeTurn = (
  db: MockDb,
  turnId: string,
  thirdThrow: Partial<ThrowRow> = {}
): void => {
  const turn = db.turns.find((t) => t.id === turnId);
  const existingThrows = db.throws.filter((t) => t.turn_id === turnId);
  const totalFromExisting = existingThrows.reduce((sum, t) => sum + t.scored, 0);
  const thirdScore = thirdThrow.scored ?? 1;

  db.throws.push({
    id: `${turnId}-throw-3`,
    turn_id: turnId,
    dart_index: 3,
    segment: thirdThrow.segment ?? 'S1',
    scored: thirdScore,
    match_id: thirdThrow.match_id ?? 'match-1',
    ...thirdThrow,
  });

  if (turn) {
    turn.total_scored = totalFromExisting + thirdScore;
    turn.busted = false;
  }
};

/**
 * Simulate a busted turn
 */
export const bustTurn = (db: MockDb, turnId: string): void => {
  const turn = db.turns.find((t) => t.id === turnId);
  if (turn) {
    turn.total_scored = null;
    turn.busted = true;
  }
};

/**
 * Create a checkout throw (double to finish)
 */
export const createCheckoutThrow = (
  score: number,
  overrides?: Partial<ThrowRow>
): Partial<ThrowRow> => {
  const doubleValue = score / 2;
  return {
    segment: `D${doubleValue}`,
    scored: score,
    ...overrides,
  };
};
