/**
 * Tests for leg score calculation and undo/edit scenarios.
 *
 * These tests verify the core scoring logic that's used when:
 * - Undoing throws
 * - Editing throws
 * - Recalculating scores after modifications
 */

import { describe, it, expect } from 'vitest';
import {
  parseSegmentLabel,
  replayTurn,
  replayLeg,
  determineCurrentPlayer,
  calculateScoreAtTurnStart,
  type TurnData,
  type ThrowData,
} from './legScoreCalculator';

describe('parseSegmentLabel', () => {
  it('parses single segments', () => {
    expect(parseSegmentLabel('S20')).toEqual({ kind: 'Single', value: 20, scored: 20, label: 'S20' });
    expect(parseSegmentLabel('S1')).toEqual({ kind: 'Single', value: 1, scored: 1, label: 'S1' });
  });

  it('parses double segments', () => {
    expect(parseSegmentLabel('D20')).toEqual({ kind: 'Double', value: 20, scored: 40, label: 'D20' });
    expect(parseSegmentLabel('D16')).toEqual({ kind: 'Double', value: 16, scored: 32, label: 'D16' });
  });

  it('parses triple segments', () => {
    expect(parseSegmentLabel('T20')).toEqual({ kind: 'Triple', value: 20, scored: 60, label: 'T20' });
    expect(parseSegmentLabel('T19')).toEqual({ kind: 'Triple', value: 19, scored: 57, label: 'T19' });
  });

  it('parses bulls', () => {
    expect(parseSegmentLabel('SB')).toEqual({ kind: 'OuterBull', scored: 25, label: 'SB' });
    expect(parseSegmentLabel('DB')).toEqual({ kind: 'InnerBull', scored: 50, label: 'DB' });
  });

  it('parses miss', () => {
    expect(parseSegmentLabel('Miss')).toEqual({ kind: 'Miss', scored: 0, label: 'Miss' });
  });

  it('returns miss for invalid labels', () => {
    expect(parseSegmentLabel('invalid')).toEqual({ kind: 'Miss', scored: 0, label: 'Miss' });
    expect(parseSegmentLabel('')).toEqual({ kind: 'Miss', scored: 0, label: 'Miss' });
  });
});

describe('replayTurn', () => {
  describe('normal scoring', () => {
    it('calculates score for a complete turn', () => {
      const throws: ThrowData[] = [
        { segment: 'T20', scored: 60, dart_index: 1 },
        { segment: 'T20', scored: 60, dart_index: 2 },
        { segment: 'T20', scored: 60, dart_index: 3 },
      ];

      const result = replayTurn(throws, 501, 'double_out');

      expect(result.total_scored).toBe(180);
      expect(result.busted).toBe(false);
      expect(result.finished).toBe(false);
      expect(result.score_after).toBe(321);
    });

    it('calculates score for a partial turn', () => {
      const throws: ThrowData[] = [
        { segment: 'S20', scored: 20, dart_index: 1 },
        { segment: 'S20', scored: 20, dart_index: 2 },
      ];

      const result = replayTurn(throws, 100, 'double_out');

      expect(result.total_scored).toBe(40);
      expect(result.score_after).toBe(60);
    });

    it('handles throws in wrong order by sorting', () => {
      const throws: ThrowData[] = [
        { segment: 'S3', scored: 3, dart_index: 3 },
        { segment: 'S1', scored: 1, dart_index: 1 },
        { segment: 'S2', scored: 2, dart_index: 2 },
      ];

      const result = replayTurn(throws, 100, 'double_out');

      expect(result.total_scored).toBe(6);
      expect(result.score_after).toBe(94);
    });
  });

  describe('double-out bust scenarios', () => {
    it('busts when going below zero', () => {
      const throws: ThrowData[] = [
        { segment: 'T20', scored: 60, dart_index: 1 },
      ];

      const result = replayTurn(throws, 50, 'double_out');

      expect(result.busted).toBe(true);
      expect(result.total_scored).toBe(0);
      expect(result.score_after).toBe(50); // Score reverts
    });

    it('busts when landing on 1', () => {
      const throws: ThrowData[] = [
        { segment: 'S19', scored: 19, dart_index: 1 },
      ];

      const result = replayTurn(throws, 20, 'double_out');

      expect(result.busted).toBe(true);
      expect(result.score_after).toBe(20);
    });

    it('busts when finishing with non-double', () => {
      const throws: ThrowData[] = [
        { segment: 'S20', scored: 20, dart_index: 1 },
      ];

      const result = replayTurn(throws, 20, 'double_out');

      expect(result.busted).toBe(true);
      expect(result.finished).toBe(false);
    });

    it('stops processing throws after bust', () => {
      const throws: ThrowData[] = [
        { segment: 'T20', scored: 60, dart_index: 1 }, // Busts from 50
        { segment: 'S20', scored: 20, dart_index: 2 }, // Should not be processed
        { segment: 'S20', scored: 20, dart_index: 3 }, // Should not be processed
      ];

      const result = replayTurn(throws, 50, 'double_out');

      expect(result.busted).toBe(true);
      expect(result.total_scored).toBe(0);
      expect(result.score_after).toBe(50);
    });
  });

  describe('double-out finish scenarios', () => {
    it('finishes with double', () => {
      const throws: ThrowData[] = [
        { segment: 'D20', scored: 40, dart_index: 1 },
      ];

      const result = replayTurn(throws, 40, 'double_out');

      expect(result.finished).toBe(true);
      expect(result.busted).toBe(false);
      expect(result.score_after).toBe(0);
    });

    it('finishes with inner bull (double)', () => {
      const throws: ThrowData[] = [
        { segment: 'DB', scored: 50, dart_index: 1 },
      ];

      const result = replayTurn(throws, 50, 'double_out');

      expect(result.finished).toBe(true);
      expect(result.busted).toBe(false);
    });

    it('finishes mid-turn and ignores remaining throws', () => {
      const throws: ThrowData[] = [
        { segment: 'S20', scored: 20, dart_index: 1 },
        { segment: 'D20', scored: 40, dart_index: 2 }, // Finishes here
        { segment: 'S20', scored: 20, dart_index: 3 }, // Should not be processed
      ];

      const result = replayTurn(throws, 60, 'double_out');

      expect(result.finished).toBe(true);
      expect(result.total_scored).toBe(60);
      expect(result.score_after).toBe(0);
    });
  });

  describe('single-out scenarios', () => {
    it('finishes with single', () => {
      const throws: ThrowData[] = [
        { segment: 'S20', scored: 20, dart_index: 1 },
      ];

      const result = replayTurn(throws, 20, 'single_out');

      expect(result.finished).toBe(true);
      expect(result.busted).toBe(false);
    });

    it('does not bust on landing on 1', () => {
      const throws: ThrowData[] = [
        { segment: 'S19', scored: 19, dart_index: 1 },
      ];

      const result = replayTurn(throws, 20, 'single_out');

      expect(result.busted).toBe(false);
      expect(result.score_after).toBe(1);
    });

    it('still busts when going below zero', () => {
      const throws: ThrowData[] = [
        { segment: 'T20', scored: 60, dart_index: 1 },
      ];

      const result = replayTurn(throws, 50, 'single_out');

      expect(result.busted).toBe(true);
    });
  });
});

describe('replayLeg', () => {
  const playerIds = ['player-1', 'player-2'];

  it('replays a simple leg with no busts', () => {
    const turns: TurnData[] = [
      {
        id: 'turn-1',
        player_id: 'player-1',
        turn_number: 1,
        throws: [
          { segment: 'T20', scored: 60, dart_index: 1 },
          { segment: 'T20', scored: 60, dart_index: 2 },
          { segment: 'T20', scored: 60, dart_index: 3 },
        ],
      },
      {
        id: 'turn-2',
        player_id: 'player-2',
        turn_number: 2,
        throws: [
          { segment: 'T19', scored: 57, dart_index: 1 },
          { segment: 'T19', scored: 57, dart_index: 2 },
          { segment: 'T19', scored: 57, dart_index: 3 },
        ],
      },
    ];

    const result = replayLeg(turns, playerIds, 501, 'double_out');

    expect(result.turns).toHaveLength(2);
    expect(result.turns[0].total_scored).toBe(180);
    expect(result.turns[1].total_scored).toBe(171);
    expect(result.playerScores.get('player-1')).toBe(321);
    expect(result.playerScores.get('player-2')).toBe(330);
    expect(result.legWinnerId).toBeNull();
  });

  it('handles bust correctly - score reverts', () => {
    const turns: TurnData[] = [
      {
        id: 'turn-1',
        player_id: 'player-1',
        turn_number: 1,
        throws: [
          { segment: 'T20', scored: 60, dart_index: 1 },
          { segment: 'T20', scored: 60, dart_index: 2 },
          { segment: 'T20', scored: 60, dart_index: 3 },
        ],
      },
      {
        id: 'turn-2',
        player_id: 'player-2',
        turn_number: 2,
        throws: [
          { segment: 'T20', scored: 60, dart_index: 1 },
          { segment: 'T20', scored: 60, dart_index: 2 },
          { segment: 'T20', scored: 60, dart_index: 3 },
        ],
      },
      {
        id: 'turn-3',
        player_id: 'player-1',
        turn_number: 3,
        throws: [
          { segment: 'T20', scored: 60, dart_index: 1 },
          { segment: 'T20', scored: 60, dart_index: 2 },
          { segment: 'T20', scored: 60, dart_index: 3 }, // Would go to 141, OK
        ],
      },
      {
        id: 'turn-4',
        player_id: 'player-2',
        turn_number: 4,
        throws: [
          { segment: 'T20', scored: 60, dart_index: 1 },
          { segment: 'T20', scored: 60, dart_index: 2 },
          { segment: 'T20', scored: 60, dart_index: 3 }, // Would go to 141, OK
        ],
      },
      {
        id: 'turn-5',
        player_id: 'player-1',
        turn_number: 5,
        throws: [
          { segment: 'T20', scored: 60, dart_index: 1 },
          { segment: 'T20', scored: 60, dart_index: 2 },
          { segment: 'T20', scored: 60, dart_index: 3 }, // Would go to -39, BUST
        ],
      },
    ];

    const result = replayLeg(turns, playerIds, 501, 'double_out');

    // Player 1's turn 5 should be busted
    expect(result.turns[4].busted).toBe(true);
    expect(result.turns[4].total_scored).toBe(0);
    // Player 1's score should revert to 141 (not go negative)
    expect(result.playerScores.get('player-1')).toBe(141);
  });

  it('detects leg winner', () => {
    const turns: TurnData[] = [
      {
        id: 'turn-1',
        player_id: 'player-1',
        turn_number: 1,
        throws: [
          { segment: 'T20', scored: 60, dart_index: 1 },
          { segment: 'T19', scored: 57, dart_index: 2 },
          { segment: 'D12', scored: 24, dart_index: 3 }, // 501 - 141 = 360... wait that's not right
        ],
      },
    ];

    // Let's use a simpler checkout scenario
    const checkoutTurns: TurnData[] = [
      {
        id: 'turn-1',
        player_id: 'player-1',
        turn_number: 1,
        throws: [
          { segment: 'D20', scored: 40, dart_index: 1 },
        ],
      },
    ];

    const result = replayLeg(checkoutTurns, playerIds, 40, 'double_out');

    expect(result.legWinnerId).toBe('player-1');
    expect(result.turns[0].finished).toBe(true);
    expect(result.playerScores.get('player-1')).toBe(0);
  });

  it('stops processing turns after leg is won', () => {
    const turns: TurnData[] = [
      {
        id: 'turn-1',
        player_id: 'player-1',
        turn_number: 1,
        throws: [{ segment: 'D20', scored: 40, dart_index: 1 }],
      },
      {
        id: 'turn-2',
        player_id: 'player-2',
        turn_number: 2,
        throws: [{ segment: 'D20', scored: 40, dart_index: 1 }], // Should not be processed
      },
    ];

    const result = replayLeg(turns, playerIds, 40, 'double_out');

    expect(result.turns).toHaveLength(1); // Only first turn processed
    expect(result.legWinnerId).toBe('player-1');
  });
});

describe('determineCurrentPlayer', () => {
  const playerIds = ['player-1', 'player-2', 'player-3'];

  it('returns starting player when no turns exist', () => {
    const result = determineCurrentPlayer([], playerIds, 'player-2');

    expect(result.currentPlayerId).toBe('player-2');
    expect(result.needsNewTurn).toBe(true);
  });

  it('returns next player after completed turn', () => {
    const turns: TurnData[] = [
      {
        id: 'turn-1',
        player_id: 'player-1',
        turn_number: 1,
        throws: [
          { segment: 'S20', scored: 20, dart_index: 1 },
          { segment: 'S20', scored: 20, dart_index: 2 },
          { segment: 'S20', scored: 20, dart_index: 3 },
        ],
      },
    ];

    const result = determineCurrentPlayer(turns, playerIds, 'player-1');

    expect(result.currentPlayerId).toBe('player-2');
    expect(result.needsNewTurn).toBe(true);
  });

  it('continues current player turn when not complete', () => {
    const turns: TurnData[] = [
      {
        id: 'turn-1',
        player_id: 'player-1',
        turn_number: 1,
        throws: [
          { segment: 'S20', scored: 20, dart_index: 1 },
          { segment: 'S20', scored: 20, dart_index: 2 },
        ],
      },
    ];

    const result = determineCurrentPlayer(turns, playerIds, 'player-1');

    expect(result.currentPlayerId).toBe('player-1');
    expect(result.needsNewTurn).toBe(false);
    expect(result.existingTurnId).toBe('turn-1');
  });

  it('wraps around player order correctly', () => {
    const turns: TurnData[] = [
      {
        id: 'turn-1',
        player_id: 'player-3',
        turn_number: 1,
        throws: [
          { segment: 'S20', scored: 20, dart_index: 1 },
          { segment: 'S20', scored: 20, dart_index: 2 },
          { segment: 'S20', scored: 20, dart_index: 3 },
        ],
      },
    ];

    const result = determineCurrentPlayer(turns, playerIds, 'player-3');

    expect(result.currentPlayerId).toBe('player-1'); // Wraps around
    expect(result.needsNewTurn).toBe(true);
  });

  it('handles empty turns correctly', () => {
    const turns: TurnData[] = [
      {
        id: 'turn-1',
        player_id: 'player-1',
        turn_number: 1,
        throws: [], // Empty turn
      },
    ];

    const result = determineCurrentPlayer(turns, playerIds, 'player-1');

    expect(result.currentPlayerId).toBe('player-1');
    expect(result.needsNewTurn).toBe(true);
  });
});

describe('calculateScoreAtTurnStart', () => {
  it('returns start score for first turn', () => {
    const turns: TurnData[] = [];

    const score = calculateScoreAtTurnStart(turns, 1, 'player-1', 501, 'double_out');

    expect(score).toBe(501);
  });

  it('calculates score after previous turns', () => {
    const turns: TurnData[] = [
      {
        id: 'turn-1',
        player_id: 'player-1',
        turn_number: 1,
        throws: [
          { segment: 'T20', scored: 60, dart_index: 1 },
          { segment: 'T20', scored: 60, dart_index: 2 },
          { segment: 'T20', scored: 60, dart_index: 3 },
        ],
      },
    ];

    const score = calculateScoreAtTurnStart(turns, 3, 'player-1', 501, 'double_out');

    expect(score).toBe(321); // 501 - 180
  });

  it('ignores other players turns', () => {
    const turns: TurnData[] = [
      {
        id: 'turn-1',
        player_id: 'player-1',
        turn_number: 1,
        throws: [{ segment: 'T20', scored: 60, dart_index: 1 }],
      },
      {
        id: 'turn-2',
        player_id: 'player-2',
        turn_number: 2,
        throws: [{ segment: 'T20', scored: 60, dart_index: 1 }],
      },
    ];

    const scoreP1 = calculateScoreAtTurnStart(turns, 3, 'player-1', 501, 'double_out');
    const scoreP2 = calculateScoreAtTurnStart(turns, 3, 'player-2', 501, 'double_out');

    expect(scoreP1).toBe(441); // 501 - 60
    expect(scoreP2).toBe(441); // 501 - 60
  });

  it('handles busted turns correctly - score should not change', () => {
    const turns: TurnData[] = [
      {
        id: 'turn-1',
        player_id: 'player-1',
        turn_number: 1,
        throws: [
          { segment: 'T20', scored: 60, dart_index: 1 },
          { segment: 'T20', scored: 60, dart_index: 2 },
          { segment: 'T20', scored: 60, dart_index: 3 }, // Busts from 100
        ],
      },
    ];

    const score = calculateScoreAtTurnStart(turns, 3, 'player-1', 100, 'double_out');

    expect(score).toBe(100); // Busted, so score unchanged
  });
});

describe('undo/edit scenarios', () => {
  describe('undoing the last throw of a turn', () => {
    it('recalculates turn total correctly', () => {
      // Scenario: Player has thrown T20, T20, then we undo the second T20
      const throwsBefore: ThrowData[] = [
        { segment: 'T20', scored: 60, dart_index: 1 },
        { segment: 'T20', scored: 60, dart_index: 2 },
      ];
      const throwsAfter: ThrowData[] = [
        { segment: 'T20', scored: 60, dart_index: 1 },
      ];

      const beforeResult = replayTurn(throwsBefore, 501, 'double_out');
      const afterResult = replayTurn(throwsAfter, 501, 'double_out');

      expect(beforeResult.total_scored).toBe(120);
      expect(afterResult.total_scored).toBe(60);
    });
  });

  describe('undoing a throw that caused a bust', () => {
    it('removes bust status after undo', () => {
      // Scenario: T20, T20 from 100 = bust (would go to -20)
      // After undo: just T20 from 100 = 40 remaining, not bust
      const throwsBust: ThrowData[] = [
        { segment: 'T20', scored: 60, dart_index: 1 },
        { segment: 'T20', scored: 60, dart_index: 2 },
      ];
      const throwsUndo: ThrowData[] = [
        { segment: 'T20', scored: 60, dart_index: 1 },
      ];

      const bustResult = replayTurn(throwsBust, 100, 'double_out');
      const undoResult = replayTurn(throwsUndo, 100, 'double_out');

      expect(bustResult.busted).toBe(true);
      expect(undoResult.busted).toBe(false);
      expect(undoResult.score_after).toBe(40);
    });
  });

  describe('undoing a leg-winning throw', () => {
    it('removes winner and allows continuation', () => {
      const turnsBefore: TurnData[] = [
        {
          id: 'turn-1',
          player_id: 'player-1',
          turn_number: 1,
          throws: [{ segment: 'D20', scored: 40, dart_index: 1 }],
        },
      ];
      const turnsAfter: TurnData[] = [
        {
          id: 'turn-1',
          player_id: 'player-1',
          turn_number: 1,
          throws: [], // Throw removed
        },
      ];

      const beforeResult = replayLeg(turnsBefore, ['player-1', 'player-2'], 40, 'double_out');
      const afterResult = replayLeg(turnsAfter, ['player-1', 'player-2'], 40, 'double_out');

      expect(beforeResult.legWinnerId).toBe('player-1');
      expect(afterResult.legWinnerId).toBeNull();
    });
  });

  describe('editing a throw to cause a bust', () => {
    it('correctly marks turn as busted after edit', () => {
      // Original: T20, S1 from 100 = 39 remaining
      // Edit second throw to T20 = bust (would go to -20)
      const throwsOriginal: ThrowData[] = [
        { segment: 'T20', scored: 60, dart_index: 1 },
        { segment: 'S1', scored: 1, dart_index: 2 },
      ];
      const throwsEdited: ThrowData[] = [
        { segment: 'T20', scored: 60, dart_index: 1 },
        { segment: 'T20', scored: 60, dart_index: 2 }, // Changed to T20
      ];

      const originalResult = replayTurn(throwsOriginal, 100, 'double_out');
      const editedResult = replayTurn(throwsEdited, 100, 'double_out');

      expect(originalResult.busted).toBe(false);
      expect(originalResult.score_after).toBe(39);
      expect(editedResult.busted).toBe(true);
      expect(editedResult.score_after).toBe(100); // Reverted
    });
  });

  describe('editing a throw to remove a bust', () => {
    it('correctly removes bust status after edit', () => {
      // Original: T20, T20 from 100 = bust
      // Edit second throw to S1 = not bust, 39 remaining
      const throwsBusted: ThrowData[] = [
        { segment: 'T20', scored: 60, dart_index: 1 },
        { segment: 'T20', scored: 60, dart_index: 2 },
      ];
      const throwsFixed: ThrowData[] = [
        { segment: 'T20', scored: 60, dart_index: 1 },
        { segment: 'S1', scored: 1, dart_index: 2 },
      ];

      const bustedResult = replayTurn(throwsBusted, 100, 'double_out');
      const fixedResult = replayTurn(throwsFixed, 100, 'double_out');

      expect(bustedResult.busted).toBe(true);
      expect(fixedResult.busted).toBe(false);
      expect(fixedResult.score_after).toBe(39);
    });
  });

  describe('editing affects subsequent turns', () => {
    it('recalculates all following turn results', () => {
      // Two turns, edit first turn to score more, second turn should now bust
      const turns: TurnData[] = [
        {
          id: 'turn-1',
          player_id: 'player-1',
          turn_number: 1,
          throws: [{ segment: 'S20', scored: 20, dart_index: 1 }], // 100 -> 80
        },
        {
          id: 'turn-2',
          player_id: 'player-1',
          turn_number: 2,
          throws: [{ segment: 'T20', scored: 60, dart_index: 1 }], // 80 -> 20, OK
        },
      ];

      const turnsEdited: TurnData[] = [
        {
          id: 'turn-1',
          player_id: 'player-1',
          turn_number: 1,
          throws: [{ segment: 'T20', scored: 60, dart_index: 1 }], // 100 -> 40 (edited)
        },
        {
          id: 'turn-2',
          player_id: 'player-1',
          turn_number: 2,
          throws: [{ segment: 'T20', scored: 60, dart_index: 1 }], // 40 -> bust!
        },
      ];

      const originalResult = replayLeg(turns, ['player-1'], 100, 'double_out');
      const editedResult = replayLeg(turnsEdited, ['player-1'], 100, 'double_out');

      expect(originalResult.turns[1].busted).toBe(false);
      expect(editedResult.turns[1].busted).toBe(true);
    });
  });
});
