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
  throws_total?: number;
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

  describe('4-player scenarios', () => {
    it('4-player completing_round: A checks out, B/C/D need to throw', () => {
      const turns = [
        makeTurn('a', 30),
        makeTurn('b', 20),
        makeTurn('c', 20),
        makeTurn('d', 20),
        makeTurn('a', 30),
        makeTurn('b', 20),
        makeTurn('c', 20),
        makeTurn('d', 20),
        makeTurn('a', 41),  // A: 0 - checked out (30+30+41 = 101)
      ];
      const state = computeFairEndingState(turns, [playerA, playerB, playerC, playerD], 101, true);
      expect(state.phase).toBe('completing_round');
      expect(state.checkedOutPlayerIds).toEqual(['a']);

      const next = getNextFairEndingPlayer(state, [playerA, playerB, playerC, playerD], turns);
      expect(next).toBe('b');
    });

    it('4-player: only A checked out after full round → A wins', () => {
      const turns = [
        makeTurn('a', 30),
        makeTurn('b', 20),
        makeTurn('c', 20),
        makeTurn('d', 20),
        makeTurn('a', 30),
        makeTurn('b', 20),
        makeTurn('c', 20),
        makeTurn('d', 20),
        makeTurn('a', 41),  // A: 0
        makeTurn('b', 30),  // B: 31
        makeTurn('c', 30),  // C: 31
        makeTurn('d', 30),  // D: 31
      ];
      const state = computeFairEndingState(turns, [playerA, playerB, playerC, playerD], 101, true);
      expect(state.phase).toBe('resolved');
      expect(state.winnerId).toBe('a');
    });

    it('4-player: A and D check out → tiebreak between A and D only', () => {
      const turns = [
        makeTurn('a', 30),
        makeTurn('b', 20),
        makeTurn('c', 20),
        makeTurn('d', 30),
        makeTurn('a', 30),
        makeTurn('b', 20),
        makeTurn('c', 20),
        makeTurn('d', 30),
        makeTurn('a', 41),  // A: 0
        makeTurn('b', 30),  // B: 31
        makeTurn('c', 30),  // C: 31
        makeTurn('d', 41),  // D: 0
      ];
      const state = computeFairEndingState(turns, [playerA, playerB, playerC, playerD], 101, true);
      expect(state.phase).toBe('tiebreak');
      expect(state.tiebreakPlayerIds).toEqual(['a', 'd']);
      expect(state.tiebreakPlayerIds).not.toContain('b');
      expect(state.tiebreakPlayerIds).not.toContain('c');
    });
  });

  describe('Throw count edge cases', () => {
    it('Turn with throw_count=0 and total_scored=0 is treated as incomplete', () => {
      const turns = [
        makeTurn('a', 60),
        makeTurn('b', 45),
        makeTurn('a', 41),  // A: 0 - checked out
        // B's incomplete turn: throw_count=0 (just created, no darts yet)
        { player_id: 'b', total_scored: 0, busted: false, tiebreak_round: null, throw_count: 0 },
      ];
      const state = computeFairEndingState(turns, [playerA, playerB], 101, true);
      expect(state.phase).toBe('completing_round');
      expect(state.winnerId).toBeNull();

      const next = getNextFairEndingPlayer(state, [playerA, playerB], turns);
      expect(next).toBe('b');
    });

    it('Turn with total_scored > 0 and throw_count=0 IS counted as complete', () => {
      const turns = [
        makeTurn('a', 60),
        makeTurn('b', 45),
        makeTurn('a', 41),  // A: 0 - checked out
        // B's turn: total_scored=30 means finalized even if throw_count is stale/missing
        { player_id: 'b', total_scored: 30, busted: false, tiebreak_round: null, throw_count: 0 },
      ];
      const state = computeFairEndingState(turns, [playerA, playerB], 101, true);
      expect(state.phase).toBe('resolved');
      expect(state.winnerId).toBe('a');
    });

    it('All-misses turn during completing_round is counted correctly', () => {
      const turns = [
        makeTurn('a', 60),
        makeTurn('b', 45),
        makeTurn('a', 41),  // A: 0 - checked out
        // B threw 3 misses: total_scored=0, throw_count=3, not busted
        { player_id: 'b', total_scored: 0, busted: false, tiebreak_round: null, throw_count: 3 },
      ];
      const state = computeFairEndingState(turns, [playerA, playerB], 101, true);
      expect(state.phase).toBe('resolved');
      expect(state.winnerId).toBe('a');
    });
  });

  describe('Completing round with second checkout', () => {
    it('Player checks out during completing_round → enters tiebreak', () => {
      const turns = [
        makeTurn('a', 60),
        makeTurn('b', 30),
        makeTurn('c', 50),
        makeTurn('a', 41),  // A: 0 - checked out
        makeTurn('b', 40),  // B: 31 - did not check out
        makeTurn('c', 51),  // C: 0 - checked out during completing round!
      ];
      const state = computeFairEndingState(turns, [playerA, playerB, playerC], 101, true);
      expect(state.phase).toBe('tiebreak');
      expect(state.tiebreakPlayerIds).toEqual(['a', 'c']);
      expect(state.tiebreakPlayerIds).not.toContain('b');
    });
  });

  describe('Tiebreak incomplete turn handling', () => {
    // Base game where both A and B check out from 101
    function twoPlayerTieBase(): TurnInput[] {
      return [
        makeTurn('a', 60),
        makeTurn('b', 45),
        makeTurn('a', 41), // A: 0
        makeTurn('b', 56), // B: 0
      ];
    }

    it('Incomplete tiebreak turn keeps same player', () => {
      // Player A has thrown 1 dart in tiebreak round 1 (turn exists but incomplete)
      const turns = [
        ...twoPlayerTieBase(),
        { player_id: 'a', total_scored: 0, busted: false, tiebreak_round: 1, throw_count: 1 },
      ];
      const state = computeFairEndingState(turns, [playerA, playerB], 101, true);
      expect(state.phase).toBe('tiebreak');
      expect(state.tiebreakRound).toBe(1);

      const next = getNextFairEndingPlayer(state, [playerA, playerB], turns);
      expect(next).toBe('a'); // Still A's turn — not B!
    });

    it('Does not resolve when second player has incomplete turn', () => {
      // Player A completed tiebreak (total_scored=26, 3 darts), Player B has 1 dart thrown
      const turns = [
        ...twoPlayerTieBase(),
        makeTurn('a', 26, { tiebreakRound: 1, throwCount: 3 }),
        { player_id: 'b', total_scored: 0, busted: false, tiebreak_round: 1, throw_count: 1 },
      ];
      const state = computeFairEndingState(turns, [playerA, playerB], 101, true);
      // Should still be tiebreak — B hasn't finished their turn
      expect(state.phase).toBe('tiebreak');
      expect(state.winnerId).toBeNull();
    });

    it('Resolves only after both complete', () => {
      const turns = [
        ...twoPlayerTieBase(),
        makeTurn('a', 26, { tiebreakRound: 1, throwCount: 3 }),
        makeTurn('b', 60, { tiebreakRound: 1, throwCount: 3 }),
      ];
      const state = computeFairEndingState(turns, [playerA, playerB], 101, true);
      expect(state.phase).toBe('resolved');
      expect(state.winnerId).toBe('b'); // 60 > 26
    });

    it('Busted turn with throw_count < 3 is complete', () => {
      // A busted tiebreak turn should count as done even with < 3 darts
      const turns = [
        ...twoPlayerTieBase(),
        { player_id: 'a', total_scored: 0, busted: true, tiebreak_round: 1, throw_count: 2 },
        makeTurn('b', 60, { tiebreakRound: 1, throwCount: 3 }),
      ];
      const state = computeFairEndingState(turns, [playerA, playerB], 101, true);
      expect(state.phase).toBe('resolved');
      expect(state.winnerId).toBe('b'); // A busted (0), B scored 60
    });
  });

  describe('Tiebreak stale total_scored (race condition)', () => {
    // Reproduces production bug: when both players tie in tiebreak round 1 (e.g. both score 22),
    // a realtime refresh can see throw_count=3 but total_scored=0 (stale) for the last player's turn.
    // Without the fix, this incorrectly resolves the first player as winner (22 > 0).

    function twoPlayerTieBase(): TurnInput[] {
      return [
        makeTurn('a', 60),
        makeTurn('b', 45),
        makeTurn('a', 41), // A: 0
        makeTurn('b', 56), // B: 0
      ];
    }

    it('Uses throws_total instead of stale total_scored for tiebreak scoring', () => {
      const turns = [
        ...twoPlayerTieBase(),
        makeTurn('a', 22, { tiebreakRound: 1, throwCount: 3 }),
        // B has thrown 3 darts but total_scored is stale (still 0). throws_total has the real score.
        {
          player_id: 'b',
          total_scored: 0,  // stale!
          busted: false,
          tiebreak_round: 1,
          throw_count: 3,
          throws_total: 22,  // actual score from throws
        },
      ];
      const state = computeFairEndingState(turns, [playerA, playerB], 101, true);
      // Should be tiebreak round 2, NOT resolved with A as winner
      expect(state.phase).toBe('tiebreak');
      expect(state.tiebreakRound).toBe(2);
      expect(state.winnerId).toBeNull();
    });

    it('Falls back to total_scored when throws_total is not available', () => {
      const turns = [
        ...twoPlayerTieBase(),
        makeTurn('a', 22, { tiebreakRound: 1, throwCount: 3 }),
        {
          player_id: 'b',
          total_scored: 22,
          busted: false,
          tiebreak_round: 1,
          throw_count: 3,
          // no throws_total
        },
      ];
      const state = computeFairEndingState(turns, [playerA, playerB], 101, true);
      expect(state.phase).toBe('tiebreak');
      expect(state.tiebreakRound).toBe(2);
      expect(state.winnerId).toBeNull();
    });

    it('Correctly resolves winner using throws_total when scores differ', () => {
      const turns = [
        ...twoPlayerTieBase(),
        { player_id: 'a', total_scored: 0, busted: false, tiebreak_round: 1, throw_count: 3, throws_total: 60 },
        { player_id: 'b', total_scored: 0, busted: false, tiebreak_round: 1, throw_count: 3, throws_total: 30 },
      ];
      const state = computeFairEndingState(turns, [playerA, playerB], 101, true);
      expect(state.phase).toBe('resolved');
      expect(state.winnerId).toBe('a'); // 60 > 30
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
