import { describe, it, expect } from 'vitest';
import {
  computeFairEndingState,
  getNextFairEndingPlayer,
  isTiebreakPhase,
  type FairEndingState,
} from './fairEnding';

type TurnInput = {
  player_id: string;
  total_scored: number;
  busted: boolean;
  tiebreak_round?: number | null;
  throw_count?: number;
};

const playerA = { id: 'a' };
const playerB = { id: 'b' };
const playerC = { id: 'c' };
const playerD = { id: 'd' };

function makeTurn(
  playerId: string,
  totalScored: number,
  opts?: { busted?: boolean; tiebreakRound?: number; throwCount?: number }
): TurnInput {
  return {
    player_id: playerId,
    total_scored: totalScored,
    busted: opts?.busted ?? false,
    tiebreak_round: opts?.tiebreakRound ?? null,
    throw_count: opts?.throwCount ?? 3,
  };
}

describe('Fair Ending Logic', () => {
  describe('Basic guard rails', () => {
    it('returns normal phase when fairEnding is false', () => {
      const state = computeFairEndingState([], [playerA, playerB], 501, false);
      expect(state.phase).toBe('normal');
    });

    it('returns normal phase when no players have checked out', () => {
      const turns = [
        makeTurn('a', 60),
        makeTurn('b', 45),
      ];
      const state = computeFairEndingState(turns, [playerA, playerB], 501, true);
      expect(state.phase).toBe('normal');
      expect(state.checkedOutPlayerIds).toEqual([]);
    });

    it('returns normal phase with empty players', () => {
      const state = computeFairEndingState([], [], 501, true);
      expect(state.phase).toBe('normal');
    });
  });

  describe('2-player completing_round', () => {
    it('Player A checks out → phase is completing_round, Player B throws next', () => {
      // Player A has thrown enough to reach 0 from 101
      const turns = [
        makeTurn('a', 60),  // A: 41
        makeTurn('b', 45),  // B: 56
        makeTurn('a', 41),  // A: 0 - checked out!
      ];
      const state = computeFairEndingState(turns, [playerA, playerB], 101, true);
      expect(state.phase).toBe('completing_round');
      expect(state.checkedOutPlayerIds).toEqual(['a']);

      const next = getNextFairEndingPlayer(state, [playerA, playerB], turns);
      expect(next).toBe('b');
    });

    it('Player B finishes without checking out → Player A wins', () => {
      const turns = [
        makeTurn('a', 60),  // A: 41
        makeTurn('b', 45),  // B: 56
        makeTurn('a', 41),  // A: 0
        makeTurn('b', 30),  // B: 26 - did not check out
      ];
      const state = computeFairEndingState(turns, [playerA, playerB], 101, true);
      expect(state.phase).toBe('resolved');
      expect(state.winnerId).toBe('a');
    });

    it('Player B also checks out → phase is tiebreak', () => {
      const turns = [
        makeTurn('a', 60),  // A: 41
        makeTurn('b', 45),  // B: 56
        makeTurn('a', 41),  // A: 0
        makeTurn('b', 56),  // B: 0
      ];
      const state = computeFairEndingState(turns, [playerA, playerB], 101, true);
      expect(state.phase).toBe('tiebreak');
      expect(state.checkedOutPlayerIds).toContain('a');
      expect(state.checkedOutPlayerIds).toContain('b');
      expect(state.tiebreakRound).toBe(1);
      expect(state.tiebreakPlayerIds).toEqual(['a', 'b']);
    });
  });

  describe('3-player completing_round', () => {
    it('Player A checks out → Players B and C still need to throw', () => {
      const turns = [
        makeTurn('a', 60),  // A: 41
        makeTurn('b', 30),  // B: 71
        makeTurn('c', 20),  // C: 81
        makeTurn('a', 41),  // A: 0
      ];
      const state = computeFairEndingState(turns, [playerA, playerB, playerC], 101, true);
      expect(state.phase).toBe('completing_round');
      expect(state.checkedOutPlayerIds).toEqual(['a']);

      const next = getNextFairEndingPlayer(state, [playerA, playerB, playerC], turns);
      expect(next).toBe('b');
    });

    it('Only Player A checked out after full round → Player A wins', () => {
      const turns = [
        makeTurn('a', 60),
        makeTurn('b', 30),
        makeTurn('c', 20),
        makeTurn('a', 41),  // A: 0
        makeTurn('b', 40),  // B: 31
        makeTurn('c', 50),  // C: 31
      ];
      const state = computeFairEndingState(turns, [playerA, playerB, playerC], 101, true);
      expect(state.phase).toBe('resolved');
      expect(state.winnerId).toBe('a');
    });

    it('Players A and C both check out → tiebreak between A and C only', () => {
      const turns = [
        makeTurn('a', 60),
        makeTurn('b', 30),
        makeTurn('c', 50),
        makeTurn('a', 41),  // A: 0
        makeTurn('b', 40),  // B: 31
        makeTurn('c', 51),  // C: 0
      ];
      const state = computeFairEndingState(turns, [playerA, playerB, playerC], 101, true);
      expect(state.phase).toBe('tiebreak');
      expect(state.tiebreakPlayerIds).toEqual(['a', 'c']);
      expect(state.tiebreakPlayerIds).not.toContain('b');
    });
  });

  describe('Tiebreak resolution', () => {
    // Helper: create a base game where both A and B check out from 101
    function twoPlayerTieBase(): TurnInput[] {
      return [
        makeTurn('a', 60),
        makeTurn('b', 45),
        makeTurn('a', 41),  // A: 0
        makeTurn('b', 56),  // B: 0
      ];
    }

    it('Player A scores 100, Player B scores 80 → Player A wins', () => {
      const turns = [
        ...twoPlayerTieBase(),
        makeTurn('a', 100, { tiebreakRound: 1 }),
        makeTurn('b', 80, { tiebreakRound: 1 }),
      ];
      const state = computeFairEndingState(turns, [playerA, playerB], 101, true);
      expect(state.phase).toBe('resolved');
      expect(state.winnerId).toBe('a');
    });

    it('Both score 60 → next tiebreak round needed', () => {
      const turns = [
        ...twoPlayerTieBase(),
        makeTurn('a', 60, { tiebreakRound: 1 }),
        makeTurn('b', 60, { tiebreakRound: 1 }),
      ];
      const state = computeFairEndingState(turns, [playerA, playerB], 101, true);
      expect(state.phase).toBe('tiebreak');
      expect(state.tiebreakRound).toBe(2);
      expect(state.tiebreakPlayerIds).toEqual(['a', 'b']);
    });

    it('Multiple tiebreak rounds resolve correctly', () => {
      const turns = [
        ...twoPlayerTieBase(),
        makeTurn('a', 60, { tiebreakRound: 1 }),
        makeTurn('b', 60, { tiebreakRound: 1 }),
        makeTurn('a', 80, { tiebreakRound: 2 }),
        makeTurn('b', 100, { tiebreakRound: 2 }),
      ];
      const state = computeFairEndingState(turns, [playerA, playerB], 101, true);
      expect(state.phase).toBe('resolved');
      expect(state.winnerId).toBe('b');
    });

    it('3-way tiebreak: 2 tie, 1 doesn\'t → next round between 2 tied players', () => {
      const baseTurns = [
        makeTurn('a', 60),
        makeTurn('b', 30),
        makeTurn('c', 50),
        makeTurn('a', 41),  // A: 0
        makeTurn('b', 71),  // B: 0
        makeTurn('c', 51),  // C: 0
      ];
      const turns = [
        ...baseTurns,
        makeTurn('a', 80, { tiebreakRound: 1 }),
        makeTurn('b', 80, { tiebreakRound: 1 }),
        makeTurn('c', 60, { tiebreakRound: 1 }),
      ];
      const state = computeFairEndingState(turns, [playerA, playerB, playerC], 101, true);
      expect(state.phase).toBe('tiebreak');
      expect(state.tiebreakRound).toBe(2);
      expect(state.tiebreakPlayerIds).toEqual(['a', 'b']);
      expect(state.tiebreakPlayerIds).not.toContain('c');
    });

    it('Tiebreak round in progress - Player A has thrown, Player B hasn\'t', () => {
      const turns = [
        ...twoPlayerTieBase(),
        makeTurn('a', 100, { tiebreakRound: 1 }),
      ];
      const state = computeFairEndingState(turns, [playerA, playerB], 101, true);
      expect(state.phase).toBe('tiebreak');
      expect(state.tiebreakRound).toBe(1);
      expect(state.tiebreakScores).toEqual({ a: 100, b: 0 });

      const next = getNextFairEndingPlayer(state, [playerA, playerB], turns);
      expect(next).toBe('b');
    });
  });

  describe('Edge cases', () => {
    it('Bust during completing_round does NOT count as checkout', () => {
      const turns = [
        makeTurn('a', 60),
        makeTurn('b', 45),
        makeTurn('a', 41),  // A: 0
        makeTurn('b', 56, { busted: true }),  // B busted (would have checked out)
      ];
      const state = computeFairEndingState(turns, [playerA, playerB], 101, true);
      expect(state.phase).toBe('resolved');
      expect(state.winnerId).toBe('a');
      expect(state.checkedOutPlayerIds).toEqual(['a']);
    });

    it('Tiebreak turns are excluded from X01 score calculations', () => {
      const turns = [
        makeTurn('a', 60),
        makeTurn('b', 45),
        makeTurn('a', 41),  // A: 0
        makeTurn('b', 56),  // B: 0
        makeTurn('a', 100, { tiebreakRound: 1 }),
        makeTurn('b', 80, { tiebreakRound: 1 }),
      ];
      const state = computeFairEndingState(turns, [playerA, playerB], 101, true);
      // Both should still show as checked out (scores <= 0 from normal turns only)
      expect(state.checkedOutPlayerIds).toContain('a');
      expect(state.checkedOutPlayerIds).toContain('b');
      expect(state.phase).toBe('resolved');
      expect(state.winnerId).toBe('a');
    });

    it('Busted tiebreak turn counts as 0 score', () => {
      const baseTurns = [
        makeTurn('a', 60),
        makeTurn('b', 45),
        makeTurn('a', 41),
        makeTurn('b', 56),
      ];
      const turns = [
        ...baseTurns,
        makeTurn('a', 80, { tiebreakRound: 1, busted: true }),
        makeTurn('b', 60, { tiebreakRound: 1 }),
      ];
      const state = computeFairEndingState(turns, [playerA, playerB], 101, true);
      expect(state.phase).toBe('resolved');
      expect(state.winnerId).toBe('b');
    });

    it('getNextFairEndingPlayer returns null for normal phase', () => {
      const state: FairEndingState = {
        phase: 'normal',
        checkedOutPlayerIds: [],
        tiebreakRound: 0,
        tiebreakPlayerIds: [],
        tiebreakScores: {},
        winnerId: null,
      };
      expect(getNextFairEndingPlayer(state, [playerA, playerB], [])).toBeNull();
    });

    it('getNextFairEndingPlayer returns null for resolved phase', () => {
      const state: FairEndingState = {
        phase: 'resolved',
        checkedOutPlayerIds: ['a'],
        tiebreakRound: 0,
        tiebreakPlayerIds: [],
        tiebreakScores: {},
        winnerId: 'a',
      };
      expect(getNextFairEndingPlayer(state, [playerA, playerB], [])).toBeNull();
    });

    it('isTiebreakPhase returns correct values', () => {
      expect(isTiebreakPhase({ phase: 'tiebreak' } as FairEndingState)).toBe(true);
      expect(isTiebreakPhase({ phase: 'normal' } as FairEndingState)).toBe(false);
      expect(isTiebreakPhase({ phase: 'completing_round' } as FairEndingState)).toBe(false);
      expect(isTiebreakPhase({ phase: 'resolved' } as FairEndingState)).toBe(false);
    });

    it('Incomplete turn (1 dart thrown) is not counted as completed turn', () => {
      // 4-player game: A checks out, B and C throw, D starts but only 1 dart thrown
      const turns = [
        makeTurn('a', 50),
        makeTurn('b', 30),
        makeTurn('c', 20),
        makeTurn('d', 40),
        makeTurn('a', 51),  // A: 0 - checked out
        makeTurn('b', 30),  // B: completed round
        makeTurn('c', 30),  // C: completed round
        // D's incomplete turn: only 1 dart (5 points), total_scored=0 (not finalized)
        { player_id: 'd', total_scored: 0, busted: false, tiebreak_round: null, throw_count: 1 },
      ];
      const state = computeFairEndingState(
        turns,
        [playerA, playerB, playerC, playerD],
        101,
        true
      );
      // D hasn't completed their turn yet - should still be completing_round, NOT resolved
      expect(state.phase).toBe('completing_round');
      expect(state.winnerId).toBeNull();

      const next = getNextFairEndingPlayer(
        state,
        [playerA, playerB, playerC, playerD],
        turns
      );
      expect(next).toBe('d');
    });

    it('Turn with 3 misses (total_scored=0, throw_count=3) IS counted as completed', () => {
      const turns = [
        makeTurn('a', 60),
        makeTurn('b', 45),
        makeTurn('a', 41),  // A: 0
        // B threw 3 misses - total is 0 but the turn is complete
        { player_id: 'b', total_scored: 0, busted: false, tiebreak_round: null, throw_count: 3 },
      ];
      const state = computeFairEndingState(turns, [playerA, playerB], 101, true);
      // Round is complete, only A checked out → A wins
      expect(state.phase).toBe('resolved');
      expect(state.winnerId).toBe('a');
    });

    it('Without throw_count (backward compat), turns are treated as completed', () => {
      const turns = [
        makeTurn('a', 60),
        makeTurn('b', 45),
        makeTurn('a', 41),  // A: 0
        // Old-style turn without throw_count
        { player_id: 'b', total_scored: 30, busted: false, tiebreak_round: null },
      ];
      const state = computeFairEndingState(turns, [playerA, playerB], 101, true);
      expect(state.phase).toBe('resolved');
      expect(state.winnerId).toBe('a');
    });
  });

  describe('Completing round - next player order', () => {
    it('Respects play order when determining next player in completing_round', () => {
      // 3 players: A, B, C. A checked out (has 3 turns), B and C have 2 turns.
      const turns = [
        makeTurn('a', 30),
        makeTurn('b', 20),
        makeTurn('c', 20),
        makeTurn('a', 30),
        makeTurn('b', 20),
        makeTurn('c', 20),
        makeTurn('a', 41),  // A checks out (30+30+41 = 101)
      ];
      const state = computeFairEndingState(turns, [playerA, playerB, playerC], 101, true);
      expect(state.phase).toBe('completing_round');

      // B should throw next (first in order who hasn't completed round)
      const next = getNextFairEndingPlayer(state, [playerA, playerB, playerC], turns);
      expect(next).toBe('b');
    });

    it('After B throws, C throws next', () => {
      const turns = [
        makeTurn('a', 30),
        makeTurn('b', 20),
        makeTurn('c', 20),
        makeTurn('a', 30),
        makeTurn('b', 20),
        makeTurn('c', 20),
        makeTurn('a', 41),  // A checks out
        makeTurn('b', 30),  // B completes round
      ];
      const state = computeFairEndingState(turns, [playerA, playerB, playerC], 101, true);
      expect(state.phase).toBe('completing_round');

      const next = getNextFairEndingPlayer(state, [playerA, playerB, playerC], turns);
      expect(next).toBe('c');
    });
  });

  describe('Tiebreak - next player order', () => {
    it('Respects play order during tiebreak', () => {
      const baseTurns = [
        makeTurn('a', 60),
        makeTurn('b', 30),
        makeTurn('c', 50),
        makeTurn('a', 41),  // A: 0
        makeTurn('b', 71),  // B: 0
        makeTurn('c', 51),  // C: 0
      ];
      const state = computeFairEndingState(baseTurns, [playerA, playerB, playerC], 101, true);
      expect(state.phase).toBe('tiebreak');

      // First tiebreak player should be A (first in order among tiebreak players)
      const next = getNextFairEndingPlayer(state, [playerA, playerB, playerC], baseTurns);
      expect(next).toBe('a');
    });

    it('After A throws in tiebreak, B throws next', () => {
      const turns = [
        makeTurn('a', 60),
        makeTurn('b', 30),
        makeTurn('c', 50),
        makeTurn('a', 41),
        makeTurn('b', 71),
        makeTurn('c', 51),
        makeTurn('a', 80, { tiebreakRound: 1 }),
      ];
      const state = computeFairEndingState(turns, [playerA, playerB, playerC], 101, true);
      const next = getNextFairEndingPlayer(state, [playerA, playerB, playerC], turns);
      expect(next).toBe('b');
    });
  });
});
