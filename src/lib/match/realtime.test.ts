import { describe, expect, it } from 'vitest';

import { PendingThrowBuffer, shouldIgnoreRealtimePayload } from './realtime';

describe('shouldIgnoreRealtimePayload', () => {
  it('returns false when payload is null/undefined', () => {
    expect(shouldIgnoreRealtimePayload(undefined, new Set(['a']), new Set(['b']))).toBe(false);
    expect(shouldIgnoreRealtimePayload(null, new Set(['a']), new Set(['b']))).toBe(false);
  });

  it('ignores when leg_id is unknown and knownLegIds is non-empty', () => {
    const payload = { new: { leg_id: 'leg-2' } };
    expect(shouldIgnoreRealtimePayload(payload, new Set(['leg-1']), new Set())).toBe(true);
  });

  it('does not ignore when knownLegIds is empty (no context yet)', () => {
    const payload = { new: { leg_id: 'leg-2' } };
    expect(shouldIgnoreRealtimePayload(payload, new Set(), new Set())).toBe(false);
  });

  it('ignores when turn_id is unknown and knownTurnIds is non-empty', () => {
    const payload = { new: { turn_id: 'turn-2' } };
    expect(shouldIgnoreRealtimePayload(payload, new Set(), new Set(['turn-1']))).toBe(true);
  });

  it('does not ignore when knownTurnIds is empty (no context yet)', () => {
    const payload = { new: { turn_id: 'turn-2' } };
    expect(shouldIgnoreRealtimePayload(payload, new Set(), new Set())).toBe(false);
  });

  it('prefers leg_id filtering when both leg_id and turn_id exist', () => {
    const payload = { new: { leg_id: 'leg-x', turn_id: 'turn-2' } };
    expect(shouldIgnoreRealtimePayload(payload, new Set(['leg-1']), new Set(['turn-1']))).toBe(true);
    // If leg id is known, we should not ignore even if turn id is unknown.
    expect(shouldIgnoreRealtimePayload(payload, new Set(['leg-x']), new Set(['turn-1']))).toBe(false);
  });
});

describe('PendingThrowBuffer', () => {
  it('stores and retrieves payloads by turnId', () => {
    const buf = new PendingThrowBuffer(10);
    buf.set('t1', { foo: 1 });

    expect(buf.take('t1')).toEqual({ foo: 1 });
    expect(buf.take('t1')).toBeUndefined();
  });

  it('evicts the oldest entry when exceeding limit', () => {
    const buf = new PendingThrowBuffer(2);
    buf.set('t1', 1);
    buf.set('t2', 2);
    buf.set('t3', 3);

    expect(buf.take('t1')).toBeUndefined();
    expect(buf.take('t2')).toBe(2);
    expect(buf.take('t3')).toBe(3);
  });

  it('refreshes insertion order when setting the same key', () => {
    const buf = new PendingThrowBuffer(2);
    buf.set('t1', 1);
    buf.set('t2', 2);
    buf.set('t1', 10); // move t1 to the end
    buf.set('t3', 3); // should evict t2

    expect(buf.take('t2')).toBeUndefined();
    expect(buf.take('t1')).toBe(10);
    expect(buf.take('t3')).toBe(3);
  });
});

