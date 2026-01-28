import { describe, expect, it } from 'vitest';
import { applyThrowChange, applyTurnChange, type SpectatorReducerState } from './spectatorRealtimeReducer';

const baseState = (): SpectatorReducerState => ({
  currentLegId: 'leg-1',
  turns: [
    {
      id: 'turn-1',
      leg_id: 'leg-1',
      player_id: 'player-1',
      turn_number: 1,
      total_scored: 0,
      busted: false,
      throws: [],
    },
  ],
  turnThrowCounts: { 'turn-1': 0 },
});

describe('spectatorRealtimeReducer', () => {
  it('inserts throws and updates counts', () => {
    const state = baseState();
    const result = applyThrowChange(
      {
        eventType: 'INSERT',
        new: { id: 'throw-1', turn_id: 'turn-1', dart_index: 1, segment: 'S20', scored: 20 },
      },
      state
    );

    expect(result.turns[0].throws).toHaveLength(1);
    expect(result.turnThrowCounts['turn-1']).toBe(1);
    expect(result.turns[0].throws[0]?.segment).toBe('S20');
  });

  it('updates existing throws by id', () => {
    const state = baseState();
    const inserted = applyThrowChange(
      { eventType: 'INSERT', new: { id: 'throw-1', turn_id: 'turn-1', dart_index: 1, segment: 'S20', scored: 20 } },
      state
    );
    const updated = applyThrowChange(
      { eventType: 'UPDATE', new: { id: 'throw-1', turn_id: 'turn-1', dart_index: 1, segment: 'T20', scored: 60 } },
      { ...inserted, currentLegId: 'leg-1' }
    );

    expect(updated.turns[0].throws[0]?.segment).toBe('T20');
    expect(updated.turns[0].throws[0]?.scored).toBe(60);
  });

  it('deletes throws and updates counts', () => {
    const state = baseState();
    const inserted = applyThrowChange(
      { eventType: 'INSERT', new: { id: 'throw-1', turn_id: 'turn-1', dart_index: 1, segment: 'S20', scored: 20 } },
      state
    );
    const deleted = applyThrowChange(
      { eventType: 'DELETE', old: { id: 'throw-1', turn_id: 'turn-1', dart_index: 1 } },
      { ...inserted, currentLegId: 'leg-1' }
    );

    expect(deleted.turns[0].throws).toHaveLength(0);
    expect(deleted.turnThrowCounts['turn-1']).toBe(0);
  });

  it('signals reconcile when throw references unknown turn', () => {
    const state = baseState();
    const result = applyThrowChange(
      { eventType: 'INSERT', new: { id: 'throw-x', turn_id: 'turn-x', dart_index: 1, scored: 10, segment: 'S10' } },
      state
    );

    expect(result.effects.needsReconcile).toBe(true);
  });

  it('inserts new turn and initializes counts', () => {
    const state = baseState();
    const result = applyTurnChange(
      {
        eventType: 'INSERT',
        new: {
          id: 'turn-2',
          leg_id: 'leg-1',
          player_id: 'player-2',
          turn_number: 2,
          total_scored: 0,
          busted: false,
        },
      },
      state
    );

    expect(result.turns).toHaveLength(2);
    expect(result.turnThrowCounts['turn-2']).toBe(0);
  });

  it('updates existing turn fields', () => {
    const state = baseState();
    const result = applyTurnChange(
      {
        eventType: 'UPDATE',
        new: { id: 'turn-1', leg_id: 'leg-1', total_scored: 60, busted: false },
      },
      state
    );

    expect(result.turns[0].total_scored).toBe(60);
  });

  it('deletes a turn and cleans up counts', () => {
    const state = baseState();
    const result = applyTurnChange(
      {
        eventType: 'DELETE',
        old: { id: 'turn-1', leg_id: 'leg-1' },
      },
      state
    );

    expect(result.turns).toHaveLength(0);
    expect(result.turnThrowCounts['turn-1']).toBeUndefined();
  });
});

