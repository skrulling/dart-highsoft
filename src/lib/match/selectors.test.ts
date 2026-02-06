import { describe, expect, it } from 'vitest';
import { selectPlayerStats, getScoreForPlayer } from './selectors';
import type { Player, TurnWithThrows } from './types';

const PLAYERS: Player[] = [
  { id: 'p1', display_name: 'Player One' },
  { id: 'p2', display_name: 'Player Two' },
];

describe('selectPlayerStats', () => {
  it('uses throw sum for completed 3-dart non-bust turns when total_scored is stale', () => {
    const turns: TurnWithThrows[] = [
      {
        id: 't1',
        leg_id: 'leg-1',
        player_id: 'p1',
        turn_number: 1,
        total_scored: 0,
        busted: false,
        throws: [
          { id: 'thr-1', turn_id: 't1', dart_index: 1, segment: 'S20', scored: 20 },
          { id: 'thr-2', turn_id: 't1', dart_index: 2, segment: 'S20', scored: 20 },
          { id: 'thr-3', turn_id: 't1', dart_index: 3, segment: 'S20', scored: 20 },
        ],
      },
    ];

    const stats = selectPlayerStats(PLAYERS, turns, 'leg-1', 301);
    const score = getScoreForPlayer({
      playerId: 'p1',
      startScore: 301,
      playerStats: stats,
      localTurn: { playerId: null, darts: [] },
      turnThrowCounts: { t1: 3 },
      ongoingTurnId: null,
    });

    expect(score).toBe(241);
  });

  it('treats completed 0-score turns as 0 from throws even when total_scored is stale', () => {
    const turns: TurnWithThrows[] = [
      {
        id: 't0',
        leg_id: 'leg-1',
        player_id: 'p1',
        turn_number: 1,
        total_scored: 26,
        busted: false,
        throws: [
          { id: 'thr-0-1', turn_id: 't0', dart_index: 1, segment: 'Miss', scored: 0 },
          { id: 'thr-0-2', turn_id: 't0', dart_index: 2, segment: 'Miss', scored: 0 },
          { id: 'thr-0-3', turn_id: 't0', dart_index: 3, segment: 'Miss', scored: 0 },
        ],
      },
    ];

    const stats = selectPlayerStats(PLAYERS, turns, 'leg-1', 301);
    const score = getScoreForPlayer({
      playerId: 'p1',
      startScore: 301,
      playerStats: stats,
      localTurn: { playerId: null, darts: [] },
      turnThrowCounts: { t0: 3 },
      ongoingTurnId: null,
    });

    expect(score).toBe(301);
  });
});
